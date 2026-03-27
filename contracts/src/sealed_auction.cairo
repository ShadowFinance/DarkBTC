use starknet::ContractAddress;
use darkbtc::types::{AuctionState, BidCommitment};

#[starknet::interface]
pub trait ISealedAuction<TContractState> {
    fn create_auction(
        ref self: TContractState,
        asset_id: felt252,
        reserve_price: u256,
        commit_duration_secs: u64,
        reveal_duration_secs: u64,
    ) -> u64;
    fn commit_bid(ref self: TContractState, auction_id: u64, commitment: felt252);
    fn reveal_bid(ref self: TContractState, auction_id: u64, amount: u256, secret: felt252);
    fn advance_phase(ref self: TContractState, auction_id: u64);
    fn settle_auction(ref self: TContractState, auction_id: u64);
    fn cancel_auction(ref self: TContractState, auction_id: u64);
    fn get_auction(
        self: @TContractState, auction_id: u64,
    ) -> (AuctionState, u64, u64, ContractAddress, felt252);
    fn get_bid_count(self: @TContractState, auction_id: u64) -> u64;
    fn has_committed(
        self: @TContractState, auction_id: u64, bidder: ContractAddress,
    ) -> bool;
}

#[starknet::contract]
pub mod SealedAuction {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use darkbtc::errors::Errors;
    use darkbtc::types::{AuctionState, BidCommitment};
    use darkbtc::utils::poseidon::hash_bid_commitment;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        auction_counter: u64,
        // (state, asset_id as felt252, reserve_price_low, commit_end, reveal_end, creator_as_felt)
        // Stored as individual fields via tuple decomposition
        auction_state: Map<u64, AuctionState>,
        auction_asset_id: Map<u64, felt252>,
        auction_reserve_price: Map<u64, u256>,
        auction_commit_end: Map<u64, u64>,
        auction_reveal_end: Map<u64, u64>,
        auction_creator: Map<u64, ContractAddress>,
        bids: Map<(u64, ContractAddress), BidCommitment>,
        bid_counts: Map<u64, u64>,
        highest_bid_amount: Map<u64, u256>,
        highest_bid_bidder: Map<u64, ContractAddress>,
        auction_asset: Map<u64, ContractAddress>,
        deposit_token: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        AuctionCreated: AuctionCreated,
        BidCommitted: BidCommitted,
        BidRevealed: BidRevealed,
        AuctionSettled: AuctionSettled,
        AuctionCancelled: AuctionCancelled,
        PhaseAdvanced: PhaseAdvanced,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AuctionCreated {
        pub auction_id: u64,
        pub asset_id: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct BidCommitted {
        pub auction_id: u64,
        pub commitment: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct BidRevealed {
        pub auction_id: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AuctionSettled {
        pub auction_id: u64,
        pub winner: ContractAddress,
        pub final_price: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AuctionCancelled {
        pub auction_id: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PhaseAdvanced {
        pub auction_id: u64,
        pub new_state: AuctionState,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, deposit_token: ContractAddress,
    ) {
        self.ownable.initializer(owner);
        self.auction_counter.write(0);
        self.deposit_token.write(deposit_token);
    }

    #[abi(embed_v0)]
    impl SealedAuctionImpl of super::ISealedAuction<ContractState> {
        fn create_auction(
            ref self: ContractState,
            asset_id: felt252,
            reserve_price: u256,
            commit_duration_secs: u64,
            reveal_duration_secs: u64,
        ) -> u64 {
            self.ownable.assert_only_owner();
            let auction_id = self.auction_counter.read();
            self.auction_counter.write(auction_id + 1);

            let now = get_block_timestamp();
            let commit_end = now + commit_duration_secs;
            let reveal_end = commit_end + reveal_duration_secs;

            self.auction_state.write(auction_id, AuctionState::CommitPhase);
            self.auction_asset_id.write(auction_id, asset_id);
            self.auction_reserve_price.write(auction_id, reserve_price);
            self.auction_commit_end.write(auction_id, commit_end);
            self.auction_reveal_end.write(auction_id, reveal_end);
            self.auction_creator.write(auction_id, get_caller_address());
            self.bid_counts.write(auction_id, 0);
            self
                .highest_bid_bidder
                .write(auction_id, starknet::contract_address_const::<0>());
            self.highest_bid_amount.write(auction_id, 0_u256);

            self
                .emit(AuctionCreated { auction_id, asset_id, timestamp: get_block_timestamp() });

            auction_id
        }

        fn commit_bid(ref self: ContractState, auction_id: u64, commitment: felt252) {
            let state = self.auction_state.read(auction_id);
            assert(state == AuctionState::CommitPhase, Errors::AUCTION_NOT_ACTIVE);

            let commit_end = self.auction_commit_end.read(auction_id);
            let now = get_block_timestamp();
            assert(now < commit_end, Errors::AUCTION_NOT_ACTIVE);

            let caller = get_caller_address();
            let deposit_amount = self.auction_reserve_price.read(auction_id);

            let token = IERC20Dispatcher { contract_address: self.deposit_token.read() };
            token.transfer_from(caller, starknet::get_contract_address(), deposit_amount);

            let bid = BidCommitment {
                bidder: caller,
                commitment,
                deposit_amount,
                revealed: false,
                revealed_amount: 0_u256,
                timestamp: now,
            };
            self.bids.write((auction_id, caller), bid);

            let count = self.bid_counts.read(auction_id);
            self.bid_counts.write(auction_id, count + 1);

            self.emit(BidCommitted { auction_id, commitment });
        }

        fn reveal_bid(ref self: ContractState, auction_id: u64, amount: u256, secret: felt252) {
            let state = self.auction_state.read(auction_id);
            assert(state == AuctionState::RevealPhase, Errors::AUCTION_NOT_REVEAL);

            let caller = get_caller_address();
            let mut bid = self.bids.read((auction_id, caller));
            assert(!bid.revealed, Errors::BID_ALREADY_REVEALED);

            let computed = hash_bid_commitment(amount, secret);
            assert(computed == bid.commitment, Errors::INVALID_BID_PROOF);

            bid.revealed = true;
            bid.revealed_amount = amount;
            self.bids.write((auction_id, caller), bid);

            let reserve_price = self.auction_reserve_price.read(auction_id);
            if amount >= reserve_price {
                let highest = self.highest_bid_amount.read(auction_id);
                if amount > highest {
                    self.highest_bid_amount.write(auction_id, amount);
                    self.highest_bid_bidder.write(auction_id, caller);
                }
            }

            self.emit(BidRevealed { auction_id });
        }

        fn advance_phase(ref self: ContractState, auction_id: u64) {
            let state = self.auction_state.read(auction_id);
            let now = get_block_timestamp();

            match state {
                AuctionState::CommitPhase => {
                    let commit_end = self.auction_commit_end.read(auction_id);
                    assert(now >= commit_end, Errors::AUCTION_NOT_ACTIVE);
                    self.auction_state.write(auction_id, AuctionState::RevealPhase);
                    self
                        .emit(
                            PhaseAdvanced { auction_id, new_state: AuctionState::RevealPhase },
                        );
                },
                AuctionState::RevealPhase => {
                    let reveal_end = self.auction_reveal_end.read(auction_id);
                    assert(now >= reveal_end, Errors::AUCTION_NOT_REVEAL);
                    self.settle_auction(auction_id);
                },
                _ => { panic!("Invalid state transition"); },
            }
        }

        fn settle_auction(ref self: ContractState, auction_id: u64) {
            let state = self.auction_state.read(auction_id);
            assert(state == AuctionState::RevealPhase, Errors::AUCTION_NOT_REVEAL);
            assert(state != AuctionState::Settled, Errors::AUCTION_ALREADY_SETTLED);

            self.auction_state.write(auction_id, AuctionState::Settled);

            let winner = self.highest_bid_bidder.read(auction_id);
            let final_price = self.highest_bid_amount.read(auction_id);
            let zero_addr = starknet::contract_address_const::<0>();

            if winner != zero_addr && final_price > 0_u256 {
                // Transfer winner's deposit to the auction creator as payment
                let token = IERC20Dispatcher { contract_address: self.deposit_token.read() };
                let creator = self.auction_creator.read(auction_id);
                let deposit_amount = self.auction_reserve_price.read(auction_id);
                token.transfer(creator, deposit_amount);
            }

            self.emit(AuctionSettled { auction_id, winner, final_price });
        }

        fn cancel_auction(ref self: ContractState, auction_id: u64) {
            self.ownable.assert_only_owner();
            let state = self.auction_state.read(auction_id);
            assert(state != AuctionState::Settled, Errors::AUCTION_ALREADY_SETTLED);
            assert(state != AuctionState::Cancelled, Errors::AUCTION_ALREADY_SETTLED);

            self.auction_state.write(auction_id, AuctionState::Cancelled);

            self.emit(AuctionCancelled { auction_id });
        }

        fn get_auction(
            self: @ContractState, auction_id: u64,
        ) -> (AuctionState, u64, u64, ContractAddress, felt252) {
            let state = self.auction_state.read(auction_id);
            let commit_end = self.auction_commit_end.read(auction_id);
            let reveal_end = self.auction_reveal_end.read(auction_id);
            let creator = self.auction_creator.read(auction_id);
            let asset_id = self.auction_asset_id.read(auction_id);
            (state, commit_end, reveal_end, creator, asset_id)
        }

        fn get_bid_count(self: @ContractState, auction_id: u64) -> u64 {
            self.bid_counts.read(auction_id)
        }

        fn has_committed(
            self: @ContractState, auction_id: u64, bidder: ContractAddress,
        ) -> bool {
            let bid = self.bids.read((auction_id, bidder));
            bid.commitment != 0
        }
    }
}

use starknet::ContractAddress;
use darkbtc::types::SwapQuote;

#[starknet::interface]
pub trait IShieldedSwap<TContractState> {
    fn add_shielded_liquidity(
        ref self: TContractState,
        asset_a: ContractAddress,
        asset_b: ContractAddress,
        amount_a: u256,
        amount_b: u256,
        commitment_a: felt252,
        commitment_b: felt252,
    ) -> felt252;
    fn remove_shielded_liquidity(
        ref self: TContractState,
        lp_nullifier: felt252,
        lp_commitment: felt252,
        merkle_root: felt252,
        proof: Array<felt252>,
        indices: u32,
        min_amount_a: u256,
        min_amount_b: u256,
        out_commitment_a: felt252,
        out_commitment_b: felt252,
    );
    fn swap(
        ref self: TContractState,
        input_nullifier: felt252,
        input_commitment: felt252,
        merkle_root: felt252,
        proof: Array<felt252>,
        indices: u32,
        asset_in: ContractAddress,
        asset_out: ContractAddress,
        amount_in: u256,
        min_amount_out: u256,
        output_commitment: felt252,
        encrypted_output: felt252,
        deadline: u64,
    ) -> SwapQuote;
    fn get_reserves(
        self: @TContractState, asset_a: ContractAddress, asset_b: ContractAddress,
    ) -> (u256, u256);
    fn get_swap_quote(
        self: @TContractState,
        asset_in: ContractAddress,
        asset_out: ContractAddress,
        amount_in: u256,
    ) -> SwapQuote;
}

#[starknet::contract]
pub mod ShieldedSwap {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use darkbtc::errors::Errors;
    use darkbtc::types::SwapQuote;
    use darkbtc::note_pool::{INotePoolDispatcher, INotePoolDispatcherTrait};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        reserve_a: Map<(ContractAddress, ContractAddress), u256>,
        reserve_b: Map<(ContractAddress, ContractAddress), u256>,
        note_pool: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SwapExecuted: SwapExecuted,
        LiquidityAdded: LiquidityAdded,
        LiquidityRemoved: LiquidityRemoved,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SwapExecuted {
        pub input_commitment: felt252,
        pub output_commitment: felt252,
        pub asset_in: ContractAddress,
        pub asset_out: ContractAddress,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LiquidityAdded {
        pub commitment_a: felt252,
        pub commitment_b: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LiquidityRemoved {
        pub lp_nullifier: felt252,
        pub timestamp: u64,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, note_pool_address: ContractAddress, owner: ContractAddress,
    ) {
        self.note_pool.write(note_pool_address);
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl ShieldedSwapImpl of super::IShieldedSwap<ContractState> {
        fn add_shielded_liquidity(
            ref self: ContractState,
            asset_a: ContractAddress,
            asset_b: ContractAddress,
            amount_a: u256,
            amount_b: u256,
            commitment_a: felt252,
            commitment_b: felt252,
        ) -> felt252 {
            assert(amount_a > 0_u256, Errors::ZERO_AMOUNT);
            assert(amount_b > 0_u256, Errors::ZERO_AMOUNT);

            let caller = get_caller_address();

            // Receive tokens directly from the liquidity provider
            let token_a = IERC20Dispatcher { contract_address: asset_a };
            token_a.transfer_from(caller, starknet::get_contract_address(), amount_a);

            let token_b = IERC20Dispatcher { contract_address: asset_b };
            token_b.transfer_from(caller, starknet::get_contract_address(), amount_b);

            let cur_a = self.reserve_a.read((asset_a, asset_b));
            let cur_b = self.reserve_b.read((asset_a, asset_b));
            self.reserve_a.write((asset_a, asset_b), cur_a + amount_a);
            self.reserve_b.write((asset_a, asset_b), cur_b + amount_b);

            self
                .emit(
                    LiquidityAdded {
                        commitment_a, commitment_b, timestamp: get_block_timestamp(),
                    },
                );

            commitment_a
        }

        fn remove_shielded_liquidity(
            ref self: ContractState,
            lp_nullifier: felt252,
            lp_commitment: felt252,
            merkle_root: felt252,
            proof: Array<felt252>,
            indices: u32,
            min_amount_a: u256,
            min_amount_b: u256,
            out_commitment_a: felt252,
            out_commitment_b: felt252,
        ) {
            let note_pool = INotePoolDispatcher { contract_address: self.note_pool.read() };
            assert(note_pool.is_known_root(merkle_root), Errors::MERKLE_ROOT_UNKNOWN);

            self.emit(LiquidityRemoved { lp_nullifier, timestamp: get_block_timestamp() });
        }

        fn swap(
            ref self: ContractState,
            input_nullifier: felt252,
            input_commitment: felt252,
            merkle_root: felt252,
            proof: Array<felt252>,
            indices: u32,
            asset_in: ContractAddress,
            asset_out: ContractAddress,
            amount_in: u256,
            min_amount_out: u256,
            output_commitment: felt252,
            encrypted_output: felt252,
            deadline: u64,
        ) -> SwapQuote {
            assert(get_block_timestamp() <= deadline, Errors::DEADLINE_PASSED);
            assert(amount_in > 0_u256, Errors::ZERO_AMOUNT);

            let reserve_in = self.reserve_a.read((asset_in, asset_out));
            let reserve_out = self.reserve_b.read((asset_in, asset_out));
            assert(reserve_in > 0_u256, Errors::INSUFFICIENT_BALANCE);
            assert(reserve_out > 0_u256, Errors::INSUFFICIENT_BALANCE);

            let amount_in_with_fee = amount_in * 9970_u256;
            let amount_out = reserve_out
                * amount_in_with_fee
                / (reserve_in * 10000_u256 + amount_in_with_fee);

            assert(amount_out >= min_amount_out, Errors::SLIPPAGE_EXCEEDED);

            let price_impact_bps: u16 = {
                let price_before = reserve_out * 10000_u256 / reserve_in;
                let price_after = (reserve_out - amount_out)
                    * 10000_u256
                    / (reserve_in + amount_in);
                if price_before > price_after {
                    let diff = price_before - price_after;
                    let impact = diff * 10000_u256 / price_before;
                    if impact > 65535_u256 {
                        65535_u16
                    } else {
                        impact.try_into().unwrap()
                    }
                } else {
                    0_u16
                }
            };

            let note_pool_addr = self.note_pool.read();
            let note_pool = INotePoolDispatcher { contract_address: note_pool_addr };
            let this = starknet::get_contract_address();

            // Spend input note — NotePool sends asset_in tokens to this contract
            note_pool.withdraw(
                input_nullifier,
                merkle_root,
                proof,
                indices,
                input_commitment,
                asset_in,
                amount_in,
                this,
            );

            // Approve NotePool to pull asset_out from this contract
            let token_out = IERC20Dispatcher { contract_address: asset_out };
            token_out.approve(note_pool_addr, amount_out);

            // Mint output note — NotePool pulls asset_out from this contract
            note_pool.deposit(asset_out, amount_out, output_commitment, encrypted_output);

            // Update reserves
            self.reserve_a.write((asset_in, asset_out), reserve_in + amount_in);
            self.reserve_b.write((asset_in, asset_out), reserve_out - amount_out);

            self
                .emit(
                    SwapExecuted {
                        input_commitment,
                        output_commitment,
                        asset_in,
                        asset_out,
                        timestamp: get_block_timestamp(),
                    },
                );

            SwapQuote {
                input_amount: amount_in,
                output_amount: amount_out,
                price_impact_bps,
                fee_bps: 30_u16,
            }
        }

        fn get_reserves(
            self: @ContractState, asset_a: ContractAddress, asset_b: ContractAddress,
        ) -> (u256, u256) {
            (self.reserve_a.read((asset_a, asset_b)), self.reserve_b.read((asset_a, asset_b)))
        }

        fn get_swap_quote(
            self: @ContractState,
            asset_in: ContractAddress,
            asset_out: ContractAddress,
            amount_in: u256,
        ) -> SwapQuote {
            let reserve_in = self.reserve_a.read((asset_in, asset_out));
            let reserve_out = self.reserve_b.read((asset_in, asset_out));
            if reserve_in == 0_u256 || reserve_out == 0_u256 || amount_in == 0_u256 {
                return SwapQuote {
                    input_amount: amount_in,
                    output_amount: 0_u256,
                    price_impact_bps: 0_u16,
                    fee_bps: 30_u16,
                };
            }

            let amount_in_with_fee = amount_in * 9970_u256;
            let amount_out = reserve_out
                * amount_in_with_fee
                / (reserve_in * 10000_u256 + amount_in_with_fee);

            let price_impact_bps: u16 = {
                let price_before = reserve_out * 10000_u256 / reserve_in;
                let price_after = (reserve_out - amount_out)
                    * 10000_u256
                    / (reserve_in + amount_in);
                if price_before > price_after {
                    let diff = price_before - price_after;
                    let impact = diff * 10000_u256 / price_before;
                    if impact > 65535_u256 {
                        65535_u16
                    } else {
                        impact.try_into().unwrap()
                    }
                } else {
                    0_u16
                }
            };

            SwapQuote {
                input_amount: amount_in,
                output_amount: amount_out,
                price_impact_bps,
                fee_bps: 30_u16,
            }
        }
    }
}


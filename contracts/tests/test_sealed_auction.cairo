use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global,
};
use starknet::{ContractAddress, contract_address_const};
use darkbtc::sealed_auction::{ISealedAuctionDispatcher, ISealedAuctionDispatcherTrait};
use darkbtc::types::AuctionState;
use darkbtc::utils::poseidon::hash_bid_commitment;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

fn deploy_erc20(name: ByteArray, symbol: ByteArray, initial_supply: u256, recipient: ContractAddress) -> ContractAddress {
    let contract = declare("ERC20Upgradeable").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    name.serialize(ref calldata);
    symbol.serialize(ref calldata);
    initial_supply.serialize(ref calldata);
    recipient.serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn deploy_auction(owner: ContractAddress, token: ContractAddress) -> ContractAddress {
    let contract = declare("SealedAuction").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    owner.serialize(ref calldata);
    token.serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn setup() -> (ContractAddress, ContractAddress, ContractAddress, ContractAddress) {
    let owner: ContractAddress = contract_address_const::<0x1>();
    let bidder1: ContractAddress = contract_address_const::<0x2>();
    let bidder2: ContractAddress = contract_address_const::<0x3>();

    let initial_supply: u256 = 1000000000000_u256;
    let token = deploy_erc20("MockUSDC", "USDC", initial_supply, owner);

    let auction_contract = deploy_auction(owner, token);

    start_cheat_caller_address(token, owner);
    let token_dispatcher = IERC20Dispatcher { contract_address: token };
    token_dispatcher.transfer(bidder1, 1000000_u256);
    token_dispatcher.transfer(bidder2, 1000000_u256);
    stop_cheat_caller_address(token);

    (auction_contract, token, bidder1, bidder2)
}

#[test]
fn test_full_auction_lifecycle() {
    let (auction_contract, token, bidder1, bidder2) = setup();
    let owner: ContractAddress = contract_address_const::<0x1>();
    let auction = ISealedAuctionDispatcher { contract_address: auction_contract };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    start_cheat_block_timestamp_global(1000_u64);

    start_cheat_caller_address(auction_contract, owner);
    let auction_id = auction.create_auction('BTC_ASSET', 100_u256, 3600_u64, 3600_u64);
    stop_cheat_caller_address(auction_contract);

    let amount1: u256 = 500_u256;
    let secret1: felt252 = 111;
    let commitment1 = hash_bid_commitment(amount1, secret1);

    start_cheat_caller_address(token, bidder1);
    token_dispatcher.approve(auction_contract, 100_u256);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.commit_bid(auction_id, commitment1);
    stop_cheat_caller_address(auction_contract);

    let amount2: u256 = 300_u256;
    let secret2: felt252 = 222;
    let commitment2 = hash_bid_commitment(amount2, secret2);

    start_cheat_caller_address(token, bidder2);
    token_dispatcher.approve(auction_contract, 100_u256);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(auction_contract, bidder2);
    auction.commit_bid(auction_id, commitment2);
    stop_cheat_caller_address(auction_contract);

    assert_eq!(auction.get_bid_count(auction_id), 2_u64);

    start_cheat_block_timestamp_global(5000_u64);
    auction.advance_phase(auction_id);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.reveal_bid(auction_id, amount1, secret1);
    stop_cheat_caller_address(auction_contract);

    start_cheat_caller_address(auction_contract, bidder2);
    auction.reveal_bid(auction_id, amount2, secret2);
    stop_cheat_caller_address(auction_contract);

    start_cheat_block_timestamp_global(10000_u64);
    auction.advance_phase(auction_id);

    let (state, _, _, _, _) = auction.get_auction(auction_id);
    assert_eq!(state, AuctionState::Settled);
}

#[test]
#[should_panic(expected: ('Bid commitment mismatch',))]
fn test_reveal_wrong_secret_fails() {
    let (auction_contract, token, bidder1, _bidder2) = setup();
    let owner: ContractAddress = contract_address_const::<0x1>();
    let auction = ISealedAuctionDispatcher { contract_address: auction_contract };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    start_cheat_block_timestamp_global(1000_u64);

    start_cheat_caller_address(auction_contract, owner);
    let auction_id = auction.create_auction('BTC_ASSET', 100_u256, 3600_u64, 3600_u64);
    stop_cheat_caller_address(auction_contract);

    let amount: u256 = 500_u256;
    let secret: felt252 = 111;
    let commitment = hash_bid_commitment(amount, secret);

    start_cheat_caller_address(token, bidder1);
    token_dispatcher.approve(auction_contract, 100_u256);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.commit_bid(auction_id, commitment);
    stop_cheat_caller_address(auction_contract);

    start_cheat_block_timestamp_global(5000_u64);
    auction.advance_phase(auction_id);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.reveal_bid(auction_id, amount, 999_felt252);
    stop_cheat_caller_address(auction_contract);
}

#[test]
#[should_panic(expected: ('Bid already revealed',))]
fn test_double_reveal_fails() {
    let (auction_contract, token, bidder1, _bidder2) = setup();
    let owner: ContractAddress = contract_address_const::<0x1>();
    let auction = ISealedAuctionDispatcher { contract_address: auction_contract };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    start_cheat_block_timestamp_global(1000_u64);

    start_cheat_caller_address(auction_contract, owner);
    let auction_id = auction.create_auction('BTC_ASSET', 100_u256, 3600_u64, 3600_u64);
    stop_cheat_caller_address(auction_contract);

    let amount: u256 = 500_u256;
    let secret: felt252 = 111;
    let commitment = hash_bid_commitment(amount, secret);

    start_cheat_caller_address(token, bidder1);
    token_dispatcher.approve(auction_contract, 100_u256);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.commit_bid(auction_id, commitment);
    stop_cheat_caller_address(auction_contract);

    start_cheat_block_timestamp_global(5000_u64);
    auction.advance_phase(auction_id);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.reveal_bid(auction_id, amount, secret);
    auction.reveal_bid(auction_id, amount, secret);
    stop_cheat_caller_address(auction_contract);
}

#[test]
#[should_panic(expected: ('Auction not in commit phase',))]
fn test_commit_after_phase_fails() {
    let (auction_contract, token, bidder1, _bidder2) = setup();
    let owner: ContractAddress = contract_address_const::<0x1>();
    let auction = ISealedAuctionDispatcher { contract_address: auction_contract };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    start_cheat_block_timestamp_global(1000_u64);

    start_cheat_caller_address(auction_contract, owner);
    let auction_id = auction.create_auction('BTC_ASSET', 100_u256, 3600_u64, 3600_u64);
    stop_cheat_caller_address(auction_contract);

    start_cheat_block_timestamp_global(5000_u64);
    auction.advance_phase(auction_id);

    let amount: u256 = 500_u256;
    let secret: felt252 = 111;
    let commitment = hash_bid_commitment(amount, secret);

    start_cheat_caller_address(token, bidder1);
    token_dispatcher.approve(auction_contract, 100_u256);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(auction_contract, bidder1);
    auction.commit_bid(auction_id, commitment);
    stop_cheat_caller_address(auction_contract);
}

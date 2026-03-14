use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::{ContractAddress, contract_address_const};
use darkbtc::dark_orderbook::{IDarkOrderbookDispatcher, IDarkOrderbookDispatcherTrait};
use darkbtc::utils::poseidon::hash_nullifier;
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

fn deploy_orderbook() -> ContractAddress {
    let contract = declare("DarkOrderbook").unwrap().contract_class();
    let calldata = ArrayTrait::new();
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn setup() -> (ContractAddress, ContractAddress, ContractAddress) {
    let user: ContractAddress = contract_address_const::<0x2>();
    let initial_supply: u256 = 1000000000000_u256;
    let token = deploy_erc20("MockWBTC", "WBTC", initial_supply, user);
    let orderbook = deploy_orderbook();
    (orderbook, token, user)
}

#[test]
fn test_submit_and_fill() {
    let (orderbook, token, user) = setup();
    let ob = IDarkOrderbookDispatcher { contract_address: orderbook };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    let collateral: u256 = 1000000_u256;
    let order_commitment: felt252 = 0x1234567890abcdef;

    start_cheat_caller_address(token, user);
    token_dispatcher.approve(orderbook, collateral);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(orderbook, user);
    ob.submit_order(order_commitment, 'BTC_USDC', collateral, token);
    stop_cheat_caller_address(orderbook);

    let (filled, cancelled, _) = ob.get_order_status(order_commitment);
    assert_eq!(filled, false);
    assert_eq!(cancelled, false);

    let taker: ContractAddress = contract_address_const::<0x5>();
    let fill_proof: felt252 = 0xabcdef;
    let taker_balance_before = token_dispatcher.balance_of(taker);

    ob.fill_order(order_commitment, fill_proof, 100_u256, 50000_u256, taker);

    let (filled2, _, _) = ob.get_order_status(order_commitment);
    assert_eq!(filled2, true);
    assert!(token_dispatcher.balance_of(taker) > taker_balance_before);
}

#[test]
fn test_cancel_refunds_collateral() {
    let (orderbook, token, user) = setup();
    let ob = IDarkOrderbookDispatcher { contract_address: orderbook };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    let collateral: u256 = 1000000_u256;
    let order_commitment: felt252 = 0x1234567890abcdef;

    let user_balance_before = token_dispatcher.balance_of(user);

    start_cheat_caller_address(token, user);
    token_dispatcher.approve(orderbook, collateral);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(orderbook, user);
    ob.submit_order(order_commitment, 'BTC_USDC', collateral, token);
    stop_cheat_caller_address(orderbook);

    let balance_after_submit = token_dispatcher.balance_of(user);
    assert_eq!(balance_after_submit, user_balance_before - collateral);

    let cancel_proof: felt252 = hash_nullifier(999, order_commitment);

    start_cheat_caller_address(orderbook, user);
    ob.cancel_order(order_commitment, cancel_proof);
    stop_cheat_caller_address(orderbook);

    let (_, cancelled, _) = ob.get_order_status(order_commitment);
    assert_eq!(cancelled, true);
    assert_eq!(token_dispatcher.balance_of(user), user_balance_before);
}

#[test]
#[should_panic(expected: ('Order already filled',))]
fn test_double_fill_fails() {
    let (orderbook, token, user) = setup();
    let ob = IDarkOrderbookDispatcher { contract_address: orderbook };
    let token_dispatcher = IERC20Dispatcher { contract_address: token };

    let collateral: u256 = 1000000_u256;
    let order_commitment: felt252 = 0x1234567890abcdef;

    start_cheat_caller_address(token, user);
    token_dispatcher.approve(orderbook, collateral);
    stop_cheat_caller_address(token);

    start_cheat_caller_address(orderbook, user);
    ob.submit_order(order_commitment, 'BTC_USDC', collateral, token);
    stop_cheat_caller_address(orderbook);

    let taker: ContractAddress = contract_address_const::<0x5>();
    let fill_proof: felt252 = 0xabcdef;

    ob.fill_order(order_commitment, fill_proof, 100_u256, 50000_u256, taker);
    ob.fill_order(order_commitment, fill_proof, 100_u256, 50000_u256, taker);
}

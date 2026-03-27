use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, spy_events, EventSpyAssertionsTrait,
};
use starknet::{ContractAddress, contract_address_const};
use darkbtc::note_pool::{INotePoolDispatcher, INotePoolDispatcherTrait, NotePool};
use darkbtc::utils::poseidon::{hash_note_commitment, hash_nullifier};
use darkbtc::utils::merkle::{verify_merkle_proof, TREE_DEPTH};
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

fn deploy_note_pool(owner: ContractAddress) -> ContractAddress {
    let contract = declare("NotePool").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    owner.serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn setup() -> (ContractAddress, ContractAddress, ContractAddress) {
    let owner: ContractAddress = contract_address_const::<0x1>();
    let user: ContractAddress = contract_address_const::<0x2>();

    let initial_supply: u256 = 1000000000000_u256;
    let erc20 = deploy_erc20("MockWBTC", "WBTC", initial_supply, user);
    let note_pool = deploy_note_pool(owner);

    start_cheat_caller_address(note_pool, owner);
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    pool_dispatcher.add_supported_asset(erc20);
    stop_cheat_caller_address(note_pool);

    (note_pool, erc20, user)
}

fn build_trivial_proof() -> Array<felt252> {
    let mut proof: Array<felt252> = ArrayTrait::new();
    let mut i: u32 = 0;
    loop {
        if i >= TREE_DEPTH {
            break;
        }
        proof.append('DARKBTC_EMPTY_LEAF');
        i += 1;
    };
    proof
}

#[test]
fn test_deposit_success() {
    let (note_pool, erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    let token = IERC20Dispatcher { contract_address: erc20 };

    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let commitment = hash_note_commitment(secret, amount, erc20.into(), nonce);

    start_cheat_caller_address(erc20, user);
    token.approve(note_pool, amount);
    stop_cheat_caller_address(erc20);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(erc20, amount, commitment, 0);
    stop_cheat_caller_address(note_pool);

    assert_eq!(pool_dispatcher.get_tree_size(), 1_u64);
    assert_eq!(pool_dispatcher.get_pool_balance(erc20), amount);
}

#[test]
fn test_withdraw_success() {
    let (note_pool, erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    let token = IERC20Dispatcher { contract_address: erc20 };

    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let commitment = hash_note_commitment(secret, amount, erc20.into(), nonce);
    let nullifier = hash_nullifier(secret, commitment);

    start_cheat_caller_address(erc20, user);
    token.approve(note_pool, amount);
    stop_cheat_caller_address(erc20);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(erc20, amount, commitment, 0);
    stop_cheat_caller_address(note_pool);

    let merkle_root = pool_dispatcher.get_merkle_root();
    let proof = build_trivial_proof();

    let recipient: ContractAddress = contract_address_const::<0x3>();
    let recipient_balance_before = token.balance_of(recipient);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.withdraw(nullifier, merkle_root, proof, 0_u32, commitment, erc20, amount, recipient);
    stop_cheat_caller_address(note_pool);

    assert_eq!(pool_dispatcher.is_nullifier_spent(nullifier), true);
    assert!(token.balance_of(recipient) > recipient_balance_before);
}

#[test]
#[should_panic(expected: ('Nullifier already used',))]
fn test_double_spend_fails() {
    let (note_pool, erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    let token = IERC20Dispatcher { contract_address: erc20 };

    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let commitment = hash_note_commitment(secret, amount, erc20.into(), nonce);
    let nullifier = hash_nullifier(secret, commitment);

    start_cheat_caller_address(erc20, user);
    token.approve(note_pool, amount * 2_u256);
    stop_cheat_caller_address(erc20);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(erc20, amount, commitment, 0);
    stop_cheat_caller_address(note_pool);

    let merkle_root = pool_dispatcher.get_merkle_root();
    let proof = build_trivial_proof();
    let recipient: ContractAddress = contract_address_const::<0x3>();

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.withdraw(nullifier, merkle_root, proof.clone(), 0_u32, commitment, erc20, amount, recipient);

    let proof2 = build_trivial_proof();
    pool_dispatcher.withdraw(nullifier, merkle_root, proof2, 0_u32, commitment, erc20, amount, recipient);
    stop_cheat_caller_address(note_pool);
}

#[test]
#[should_panic(expected: ('Invalid note commitment',))]
fn test_invalid_merkle_proof_fails() {
    let (note_pool, erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    let token = IERC20Dispatcher { contract_address: erc20 };

    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let commitment = hash_note_commitment(secret, amount, erc20.into(), nonce);
    let nullifier = hash_nullifier(secret, commitment);

    start_cheat_caller_address(erc20, user);
    token.approve(note_pool, amount);
    stop_cheat_caller_address(erc20);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(erc20, amount, commitment, 0);
    stop_cheat_caller_address(note_pool);

    let merkle_root = pool_dispatcher.get_merkle_root();

    let mut bad_proof: Array<felt252> = ArrayTrait::new();
    let mut i: u32 = 0;
    loop {
        if i >= TREE_DEPTH {
            break;
        }
        bad_proof.append(9999999_felt252);
        i += 1;
    };

    let recipient: ContractAddress = contract_address_const::<0x3>();
    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.withdraw(nullifier, merkle_root, bad_proof, 0_u32, commitment, erc20, amount, recipient);
    stop_cheat_caller_address(note_pool);
}

#[test]
#[should_panic(expected: ('Unknown merkle root',))]
fn test_unknown_root_fails() {
    let (note_pool, erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    let token = IERC20Dispatcher { contract_address: erc20 };

    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let commitment = hash_note_commitment(secret, amount, erc20.into(), nonce);
    let nullifier = hash_nullifier(secret, commitment);

    start_cheat_caller_address(erc20, user);
    token.approve(note_pool, amount);
    stop_cheat_caller_address(erc20);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(erc20, amount, commitment, 0);
    stop_cheat_caller_address(note_pool);

    let fake_root: felt252 = 0xdeadbeef;
    let proof = build_trivial_proof();
    let recipient: ContractAddress = contract_address_const::<0x3>();

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.withdraw(nullifier, fake_root, proof, 0_u32, commitment, erc20, amount, recipient);
    stop_cheat_caller_address(note_pool);
}

#[test]
fn test_transfer_note_atomic() {
    let (note_pool, erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };
    let token = IERC20Dispatcher { contract_address: erc20 };

    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let old_commitment = hash_note_commitment(secret, amount, erc20.into(), nonce);
    let old_nullifier = hash_nullifier(secret, old_commitment);

    start_cheat_caller_address(erc20, user);
    token.approve(note_pool, amount);
    stop_cheat_caller_address(erc20);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(erc20, amount, old_commitment, 0);
    stop_cheat_caller_address(note_pool);

    let old_balance = pool_dispatcher.get_pool_balance(erc20);
    let merkle_root = pool_dispatcher.get_merkle_root();
    let proof = build_trivial_proof();

    let new_secret: felt252 = 99;
    let new_nonce: u64 = 1;
    let new_commitment = hash_note_commitment(new_secret, amount, erc20.into(), new_nonce);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.transfer_note(old_nullifier, old_commitment, merkle_root, proof, 0_u32, new_commitment, 0, erc20);
    stop_cheat_caller_address(note_pool);

    assert_eq!(pool_dispatcher.is_nullifier_spent(old_nullifier), true);
    assert_eq!(pool_dispatcher.get_pool_balance(erc20), old_balance);
    assert_eq!(pool_dispatcher.get_tree_size(), 2_u64);
}

#[test]
#[should_panic(expected: ('Invalid note commitment',))]
fn test_unsupported_asset_reverts() {
    let (note_pool, _erc20, user) = setup();
    let pool_dispatcher = INotePoolDispatcher { contract_address: note_pool };

    let unsupported: ContractAddress = contract_address_const::<0xdeadbeef>();
    let amount: u256 = 100000000_u256;
    let secret: felt252 = 42;
    let nonce: u64 = 0;
    let commitment = hash_note_commitment(secret, amount, unsupported.into(), nonce);

    start_cheat_caller_address(note_pool, user);
    pool_dispatcher.deposit(unsupported, amount, commitment, 0);
    stop_cheat_caller_address(note_pool);
}

use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global,
};
use starknet::{ContractAddress, contract_address_const};
use darkbtc::note_pool::{INotePoolDispatcher, INotePoolDispatcherTrait};
use darkbtc::shielded_swap::{IShieldedSwapDispatcher, IShieldedSwapDispatcherTrait};
use darkbtc::utils::poseidon::{hash_note_commitment, hash_nullifier};
use darkbtc::utils::merkle::TREE_DEPTH;
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

fn deploy_swap(note_pool: ContractAddress, owner: ContractAddress) -> ContractAddress {
    let contract = declare("ShieldedSwap").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    note_pool.serialize(ref calldata);
    owner.serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
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

fn setup() -> (ContractAddress, ContractAddress, ContractAddress, ContractAddress, ContractAddress) {
    let owner: ContractAddress = contract_address_const::<0x1>();
    let user: ContractAddress = contract_address_const::<0x2>();
    let initial_supply: u256 = 1000000000000000_u256;

    let wbtc = deploy_erc20("WBTC", "WBTC", initial_supply, user);
    let usdc = deploy_erc20("USDC", "USDC", initial_supply, user);

    let note_pool = deploy_note_pool(owner);

    // Add supported assets to note pool
    start_cheat_caller_address(note_pool, owner);
    let pool = INotePoolDispatcher { contract_address: note_pool };
    pool.add_supported_asset(wbtc);
    pool.add_supported_asset(usdc);
    stop_cheat_caller_address(note_pool);

    let swap = deploy_swap(note_pool, owner);

    // Allow ShieldedSwap to deposit into NotePool (add as supported asset caller)
    // NotePool checks asset (token), not caller, so this isn't needed for deposit
    // But for NotePool.deposit called by ShieldedSwap, we need ShieldedSwap to be approved
    // Actually NotePool.deposit checks supported_assets[asset], not caller
    // ShieldedSwap will hold usdc and approve NotePool to pull, which is fine

    (swap, note_pool, wbtc, usdc, user)
}

#[test]
fn test_swap_success() {
    let (swap, note_pool, wbtc, usdc, user) = setup();
    start_cheat_block_timestamp_global(1000_u64);

    let wbtc_liquidity: u256 = 100000000_u256;
    let usdc_liquidity: u256 = 5000000000000_u256;

    // Add liquidity directly to ShieldedSwap
    let wbtc_token = IERC20Dispatcher { contract_address: wbtc };
    let usdc_token = IERC20Dispatcher { contract_address: usdc };

    start_cheat_caller_address(wbtc, user);
    wbtc_token.approve(swap, wbtc_liquidity);
    stop_cheat_caller_address(wbtc);

    start_cheat_caller_address(usdc, user);
    usdc_token.approve(swap, usdc_liquidity);
    stop_cheat_caller_address(usdc);

    let wbtc_commitment: felt252 = hash_note_commitment(100, wbtc_liquidity, wbtc.into(), 0);
    let usdc_commitment: felt252 = hash_note_commitment(200, usdc_liquidity, usdc.into(), 0);

    start_cheat_caller_address(swap, user);
    IShieldedSwapDispatcher { contract_address: swap }
        .add_shielded_liquidity(wbtc, usdc, wbtc_liquidity, usdc_liquidity, wbtc_commitment, usdc_commitment);
    stop_cheat_caller_address(swap);

    let (reserve_wbtc, reserve_usdc) = IShieldedSwapDispatcher { contract_address: swap }
        .get_reserves(wbtc, usdc);
    assert_eq!(reserve_wbtc, wbtc_liquidity);
    assert_eq!(reserve_usdc, usdc_liquidity);

    // User deposits input note into NotePool
    let swap_amount: u256 = 1000000_u256;
    let input_secret: felt252 = 42;
    let input_nonce: u64 = 0;
    let input_commitment = hash_note_commitment(input_secret, swap_amount, wbtc.into(), input_nonce);
    let input_nullifier = hash_nullifier(input_secret, input_commitment);

    let pool = INotePoolDispatcher { contract_address: note_pool };

    start_cheat_caller_address(wbtc, user);
    wbtc_token.approve(note_pool, swap_amount);
    stop_cheat_caller_address(wbtc);

    start_cheat_caller_address(note_pool, user);
    pool.deposit(wbtc, swap_amount, input_commitment, 0);
    stop_cheat_caller_address(note_pool);

    let merkle_root = pool.get_merkle_root();
    let proof = build_trivial_proof();

    let output_secret: felt252 = 99;
    let output_commitment = hash_note_commitment(output_secret, 0_u256, usdc.into(), 999);

    let deadline: u64 = 99999999_u64;
    let min_out: u256 = 1_u256;

    // ShieldedSwap calls swap — it has NotePool withdraw and deposit internally
    // But we need the ShieldedSwap to call NotePool.withdraw (which sends wbtc to swap)
    // and then NotePool.deposit(usdc) (which pulls usdc from swap)
    // The swap contract itself makes these calls, so caller is swap
    start_cheat_caller_address(swap, user);
    let quote = IShieldedSwapDispatcher { contract_address: swap }.swap(
        input_nullifier,
        input_commitment,
        merkle_root,
        proof,
        0_u32,
        wbtc,
        usdc,
        swap_amount,
        min_out,
        output_commitment,
        0,
        deadline,
    );
    stop_cheat_caller_address(swap);

    assert!(quote.output_amount > 0_u256);

    let (new_reserve_wbtc, new_reserve_usdc) = IShieldedSwapDispatcher { contract_address: swap }
        .get_reserves(wbtc, usdc);
    assert!(new_reserve_wbtc > reserve_wbtc);
    assert!(new_reserve_usdc < reserve_usdc);
}

#[test]
#[should_panic(expected: ('Slippage tolerance exceeded',))]
fn test_slippage_exceeded_fails() {
    let (swap, note_pool, wbtc, usdc, user) = setup();
    start_cheat_block_timestamp_global(1000_u64);

    let wbtc_liquidity: u256 = 100000000_u256;
    let usdc_liquidity: u256 = 5000000000000_u256;

    let wbtc_token = IERC20Dispatcher { contract_address: wbtc };
    let usdc_token = IERC20Dispatcher { contract_address: usdc };

    start_cheat_caller_address(wbtc, user);
    wbtc_token.approve(swap, wbtc_liquidity);
    stop_cheat_caller_address(wbtc);
    start_cheat_caller_address(usdc, user);
    usdc_token.approve(swap, usdc_liquidity);
    stop_cheat_caller_address(usdc);

    let wbtc_comm: felt252 = hash_note_commitment(100, wbtc_liquidity, wbtc.into(), 0);
    let usdc_comm: felt252 = hash_note_commitment(200, usdc_liquidity, usdc.into(), 0);

    start_cheat_caller_address(swap, user);
    IShieldedSwapDispatcher { contract_address: swap }
        .add_shielded_liquidity(wbtc, usdc, wbtc_liquidity, usdc_liquidity, wbtc_comm, usdc_comm);
    stop_cheat_caller_address(swap);

    let swap_amount: u256 = 1000000_u256;
    let input_commitment = hash_note_commitment(42, swap_amount, wbtc.into(), 0);
    let input_nullifier = hash_nullifier(42, input_commitment);

    let pool = INotePoolDispatcher { contract_address: note_pool };

    start_cheat_caller_address(wbtc, user);
    wbtc_token.approve(note_pool, swap_amount);
    stop_cheat_caller_address(wbtc);
    start_cheat_caller_address(note_pool, user);
    pool.deposit(wbtc, swap_amount, input_commitment, 0);
    stop_cheat_caller_address(note_pool);

    let merkle_root = pool.get_merkle_root();
    let proof = build_trivial_proof();
    let output_commitment: felt252 = 0xaaaa;
    let huge_min_out: u256 = 999999999999999999_u256;
    let deadline: u64 = 99999999_u64;

    start_cheat_caller_address(swap, user);
    IShieldedSwapDispatcher { contract_address: swap }.swap(
        input_nullifier,
        input_commitment,
        merkle_root,
        proof,
        0_u32,
        wbtc,
        usdc,
        swap_amount,
        huge_min_out,
        output_commitment,
        0,
        deadline,
    );
    stop_cheat_caller_address(swap);
}

#[test]
#[should_panic(expected: ('Transaction deadline passed',))]
fn test_deadline_passed_fails() {
    let (swap, note_pool, wbtc, usdc, user) = setup();
    start_cheat_block_timestamp_global(10000_u64);

    let wbtc_liquidity: u256 = 100000000_u256;
    let usdc_liquidity: u256 = 5000000000000_u256;

    let wbtc_token = IERC20Dispatcher { contract_address: wbtc };
    let usdc_token = IERC20Dispatcher { contract_address: usdc };

    start_cheat_caller_address(wbtc, user);
    wbtc_token.approve(swap, wbtc_liquidity);
    stop_cheat_caller_address(wbtc);
    start_cheat_caller_address(usdc, user);
    usdc_token.approve(swap, usdc_liquidity);
    stop_cheat_caller_address(usdc);

    let wbtc_comm: felt252 = hash_note_commitment(100, wbtc_liquidity, wbtc.into(), 0);
    let usdc_comm: felt252 = hash_note_commitment(200, usdc_liquidity, usdc.into(), 0);

    start_cheat_caller_address(swap, user);
    IShieldedSwapDispatcher { contract_address: swap }
        .add_shielded_liquidity(wbtc, usdc, wbtc_liquidity, usdc_liquidity, wbtc_comm, usdc_comm);
    stop_cheat_caller_address(swap);

    let swap_amount: u256 = 1000000_u256;
    let input_commitment = hash_note_commitment(42, swap_amount, wbtc.into(), 0);
    let input_nullifier = hash_nullifier(42, input_commitment);

    let pool = INotePoolDispatcher { contract_address: note_pool };

    start_cheat_caller_address(wbtc, user);
    wbtc_token.approve(note_pool, swap_amount);
    stop_cheat_caller_address(wbtc);
    start_cheat_caller_address(note_pool, user);
    pool.deposit(wbtc, swap_amount, input_commitment, 0);
    stop_cheat_caller_address(note_pool);

    let merkle_root = pool.get_merkle_root();
    let proof = build_trivial_proof();
    let output_commitment: felt252 = 0xbbbb;
    let past_deadline: u64 = 500_u64;

    start_cheat_caller_address(swap, user);
    IShieldedSwapDispatcher { contract_address: swap }.swap(
        input_nullifier,
        input_commitment,
        merkle_root,
        proof,
        0_u32,
        wbtc,
        usdc,
        swap_amount,
        1_u256,
        output_commitment,
        0,
        past_deadline,
    );
    stop_cheat_caller_address(swap);
}


use core::poseidon::PoseidonTrait;
use core::hash::HashStateTrait;

pub fn hash_note_commitment(
    secret: felt252, amount: u256, asset_id: felt252, nonce: u64,
) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update(secret);
    state = state.update(amount.low.into());
    state = state.update(amount.high.into());
    state = state.update(asset_id);
    state = state.update(nonce.into());
    state = state.update('DARKBTC_NOTE');
    state.finalize()
}

pub fn hash_nullifier(secret: felt252, commitment: felt252) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update(secret);
    state = state.update(commitment);
    state = state.update('DARKBTC_NULLIFIER');
    state.finalize()
}

pub fn hash_bid_commitment(amount: u256, secret: felt252) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update(amount.low.into());
    state = state.update(amount.high.into());
    state = state.update(secret);
    state = state.update('DARKBTC_BID');
    state.finalize()
}

pub fn hash_order_commitment(
    side: felt252, amount: u256, price: u256, secret: felt252,
) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update(side);
    state = state.update(amount.low.into());
    state = state.update(amount.high.into());
    state = state.update(price.low.into());
    state = state.update(price.high.into());
    state = state.update(secret);
    state = state.update('DARKBTC_ORDER');
    state.finalize()
}

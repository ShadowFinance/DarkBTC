use core::poseidon::PoseidonTrait;
use core::hash::HashStateTrait;

pub const TREE_DEPTH: u32 = 20;
pub const ZERO_VALUE: felt252 = 'DARKBTC_EMPTY_LEAF';

pub fn hash_pair(left: felt252, right: felt252) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update(left);
    state = state.update(right);
    state.finalize()
}

pub fn verify_merkle_proof(
    leaf: felt252, path: Span<felt252>, indices: u32, expected_root: felt252,
) -> bool {
    let mut current = leaf;
    let mut i: u32 = 0;
    loop {
        if i >= TREE_DEPTH {
            break;
        }
        let sibling = *path.at(i);
        let bit = (indices / pow2(i)) % 2;
        if bit == 0 {
            current = hash_pair(current, sibling);
        } else {
            current = hash_pair(sibling, current);
        }
        i += 1;
    };
    current == expected_root
}

pub fn pow2(exp: u32) -> u32 {
    let mut result: u32 = 1;
    let mut i: u32 = 0;
    loop {
        if i >= exp {
            break;
        }
        result *= 2;
        i += 1;
    };
    result
}


use darkbtc::utils::poseidon::hash_nullifier;

pub fn compute_nullifier(secret: felt252, commitment: felt252) -> felt252 {
    hash_nullifier(secret, commitment)
}

pub fn verify_nullifier(secret: felt252, commitment: felt252, expected: felt252) -> bool {
    compute_nullifier(secret, commitment) == expected
}

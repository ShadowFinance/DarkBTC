pub mod Errors {
    pub const NOTE_ALREADY_SPENT: felt252 = 'Note already spent';
    pub const INVALID_COMMITMENT: felt252 = 'Invalid note commitment';
    pub const INVALID_NULLIFIER: felt252 = 'Invalid nullifier';
    pub const NULLIFIER_EXISTS: felt252 = 'Nullifier already used';
    pub const MERKLE_ROOT_UNKNOWN: felt252 = 'Unknown merkle root';
    pub const INSUFFICIENT_BALANCE: felt252 = 'Insufficient balance';
    pub const AUCTION_NOT_ACTIVE: felt252 = 'Auction not in commit phase';
    pub const AUCTION_NOT_REVEAL: felt252 = 'Auction not in reveal phase';
    pub const AUCTION_ALREADY_SETTLED: felt252 = 'Auction already settled';
    pub const BID_ALREADY_REVEALED: felt252 = 'Bid already revealed';
    pub const INVALID_BID_PROOF: felt252 = 'Bid commitment mismatch';
    pub const ORDER_ALREADY_FILLED: felt252 = 'Order already filled';
    pub const INVALID_FILL_PROOF: felt252 = 'Invalid fill proof';
    pub const UNAUTHORIZED: felt252 = 'Unauthorized';
    pub const ZERO_AMOUNT: felt252 = 'Amount must be non-zero';
    pub const SLIPPAGE_EXCEEDED: felt252 = 'Slippage tolerance exceeded';
    pub const DEADLINE_PASSED: felt252 = 'Transaction deadline passed';
}

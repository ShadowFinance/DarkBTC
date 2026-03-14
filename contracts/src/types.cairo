use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store, Clone)]
pub struct Note {
    pub commitment: felt252,
    pub asset_id: felt252,
    pub nullifier_hash: felt252,
    pub encrypted_amount: felt252,
    pub owner_pk: felt252,
    pub nonce: u64,
}

#[derive(Drop, Serde, starknet::Store, Clone)]
pub struct BidCommitment {
    pub bidder: ContractAddress,
    pub commitment: felt252,
    pub deposit_amount: u256,
    pub revealed: bool,
    pub revealed_amount: u256,
    pub timestamp: u64,
}

#[derive(Drop, Serde, starknet::Store, Clone)]
pub struct PrivateOrder {
    pub order_commitment: felt252,
    pub owner: ContractAddress,
    pub asset_id: felt252,
    pub is_filled: bool,
    pub is_cancelled: bool,
    pub fill_proof: felt252,
    pub timestamp: u64,
}

#[derive(Drop, Serde, starknet::Store, Clone)]
pub struct SwapQuote {
    pub input_amount: u256,
    pub output_amount: u256,
    pub price_impact_bps: u16,
    pub fee_bps: u16,
}

#[derive(Drop, Serde, starknet::Store, Clone, PartialEq)]
pub enum AuctionState {
    #[default]
    Pending,
    CommitPhase,
    RevealPhase,
    Settled,
    Cancelled,
}

#[derive(Drop, Serde, starknet::Store, Clone, PartialEq)]
pub enum OrderSide {
    #[default]
    Buy,
    Sell,
}

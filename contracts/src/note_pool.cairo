use starknet::ContractAddress;

#[starknet::interface]
pub trait INotePool<TContractState> {
    fn deposit(
        ref self: TContractState,
        asset: ContractAddress,
        amount: u256,
        commitment: felt252,
        encrypted_amount: felt252,
    ) -> felt252;
    fn withdraw(
        ref self: TContractState,
        nullifier: felt252,
        merkle_root: felt252,
        merkle_proof: Array<felt252>,
        merkle_indices: u32,
        commitment: felt252,
        asset: ContractAddress,
        amount: u256,
        recipient: ContractAddress,
    );
    fn transfer_note(
        ref self: TContractState,
        nullifier: felt252,
        old_commitment: felt252,
        merkle_root: felt252,
        merkle_proof: Array<felt252>,
        merkle_indices: u32,
        new_commitment: felt252,
        encrypted_amount: felt252,
        asset: ContractAddress,
    );
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_tree_size(self: @TContractState) -> u64;
    fn is_nullifier_spent(self: @TContractState, nullifier: felt252) -> bool;
    fn is_known_root(self: @TContractState, root: felt252) -> bool;
    fn get_supported_asset(self: @TContractState, asset: ContractAddress) -> bool;
    fn get_pool_balance(self: @TContractState, asset: ContractAddress) -> u256;
    fn add_supported_asset(ref self: TContractState, asset: ContractAddress);
}

#[starknet::contract]
pub mod NotePool {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use darkbtc::errors::Errors;
    use darkbtc::utils::merkle::{verify_merkle_proof, hash_pair, TREE_DEPTH, ZERO_VALUE};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        tree_nodes: Map<(u32, u64), felt252>,
        tree_size: u64,
        current_root: felt252,
        root_history: Map<felt252, bool>,
        nullifiers: Map<felt252, bool>,
        commitments: Map<felt252, bool>,
        supported_assets: Map<ContractAddress, bool>,
        pool_balances: Map<ContractAddress, u256>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        NoteDeposited: NoteDeposited,
        NoteWithdrawn: NoteWithdrawn,
        NoteTransferred: NoteTransferred,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NoteDeposited {
        pub commitment: felt252,
        pub asset: ContractAddress,
        pub leaf_index: u64,
        pub new_root: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NoteWithdrawn {
        pub nullifier: felt252,
        pub asset: ContractAddress,
        pub recipient: ContractAddress,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NoteTransferred {
        pub old_nullifier: felt252,
        pub new_commitment: felt252,
        pub asset: ContractAddress,
        pub timestamp: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
        self.tree_size.write(0);
        self.current_root.write(0);
    }

    #[abi(embed_v0)]
    impl NotePoolImpl of super::INotePool<ContractState> {
        fn deposit(
            ref self: ContractState,
            asset: ContractAddress,
            amount: u256,
            commitment: felt252,
            encrypted_amount: felt252,
        ) -> felt252 {
            assert(amount > 0_u256, Errors::ZERO_AMOUNT);
            assert(self.supported_assets.read(asset), Errors::INVALID_COMMITMENT);
            assert(!self.commitments.read(commitment), Errors::INVALID_COMMITMENT);

            let caller = get_caller_address();
            let token = IERC20Dispatcher { contract_address: asset };
            token.transfer_from(caller, starknet::get_contract_address(), amount);

            let leaf_index = self.tree_size.read();
            let new_root = self._insert_leaf(commitment, leaf_index);

            self.tree_size.write(leaf_index + 1);
            self.current_root.write(new_root);
            self.root_history.write(new_root, true);
            self.commitments.write(commitment, true);

            let current_balance = self.pool_balances.read(asset);
            self.pool_balances.write(asset, current_balance + amount);

            self
                .emit(
                    NoteDeposited {
                        commitment,
                        asset,
                        leaf_index,
                        new_root,
                        timestamp: get_block_timestamp(),
                    },
                );

            new_root
        }

        fn withdraw(
            ref self: ContractState,
            nullifier: felt252,
            merkle_root: felt252,
            merkle_proof: Array<felt252>,
            merkle_indices: u32,
            commitment: felt252,
            asset: ContractAddress,
            amount: u256,
            recipient: ContractAddress,
        ) {
            assert(!self.nullifiers.read(nullifier), Errors::NULLIFIER_EXISTS);
            assert(self.root_history.read(merkle_root), Errors::MERKLE_ROOT_UNKNOWN);
            assert(
                verify_merkle_proof(commitment, merkle_proof.span(), merkle_indices, merkle_root),
                Errors::INVALID_COMMITMENT,
            );

            self.nullifiers.write(nullifier, true);

            let current_balance = self.pool_balances.read(asset);
            assert(current_balance >= amount, Errors::INSUFFICIENT_BALANCE);
            self.pool_balances.write(asset, current_balance - amount);

            let token = IERC20Dispatcher { contract_address: asset };
            token.transfer(recipient, amount);

            self
                .emit(
                    NoteWithdrawn {
                        nullifier, asset, recipient, timestamp: get_block_timestamp(),
                    },
                );
        }

        fn transfer_note(
            ref self: ContractState,
            nullifier: felt252,
            old_commitment: felt252,
            merkle_root: felt252,
            merkle_proof: Array<felt252>,
            merkle_indices: u32,
            new_commitment: felt252,
            encrypted_amount: felt252,
            asset: ContractAddress,
        ) {
            assert(!self.nullifiers.read(nullifier), Errors::NULLIFIER_EXISTS);
            assert(self.root_history.read(merkle_root), Errors::MERKLE_ROOT_UNKNOWN);
            assert(
                verify_merkle_proof(
                    old_commitment, merkle_proof.span(), merkle_indices, merkle_root,
                ),
                Errors::INVALID_COMMITMENT,
            );
            assert(!self.commitments.read(new_commitment), Errors::INVALID_COMMITMENT);

            self.nullifiers.write(nullifier, true);

            let leaf_index = self.tree_size.read();
            let new_root = self._insert_leaf(new_commitment, leaf_index);

            self.tree_size.write(leaf_index + 1);
            self.current_root.write(new_root);
            self.root_history.write(new_root, true);
            self.commitments.write(new_commitment, true);

            self
                .emit(
                    NoteTransferred {
                        old_nullifier: nullifier,
                        new_commitment,
                        asset,
                        timestamp: get_block_timestamp(),
                    },
                );
        }

        fn get_merkle_root(self: @ContractState) -> felt252 {
            self.current_root.read()
        }

        fn get_tree_size(self: @ContractState) -> u64 {
            self.tree_size.read()
        }

        fn is_nullifier_spent(self: @ContractState, nullifier: felt252) -> bool {
            self.nullifiers.read(nullifier)
        }

        fn is_known_root(self: @ContractState, root: felt252) -> bool {
            self.root_history.read(root)
        }

        fn get_supported_asset(self: @ContractState, asset: ContractAddress) -> bool {
            self.supported_assets.read(asset)
        }

        fn get_pool_balance(self: @ContractState, asset: ContractAddress) -> u256 {
            self.pool_balances.read(asset)
        }

        fn add_supported_asset(ref self: ContractState, asset: ContractAddress) {
            self.ownable.assert_only_owner();
            self.supported_assets.write(asset, true);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _insert_leaf(ref self: ContractState, leaf: felt252, index: u64) -> felt252 {
            self.tree_nodes.write((TREE_DEPTH, index), leaf);
            let mut current = leaf;
            let mut level: u32 = TREE_DEPTH;
            let mut current_index = index;
            loop {
                if level == 0 {
                    break;
                }
                let parent_index = current_index / 2;
                let is_right = current_index % 2;
                let sibling_index = if is_right == 0 {
                    current_index + 1
                } else {
                    current_index - 1
                };
                let sibling_raw = self.tree_nodes.read((level, sibling_index));
                let sibling = if sibling_raw == 0 {
                    ZERO_VALUE
                } else {
                    sibling_raw
                };
                let new_node = if is_right == 0 {
                    hash_pair(current, sibling)
                } else {
                    hash_pair(sibling, current)
                };
                level -= 1;
                self.tree_nodes.write((level, parent_index), new_node);
                current = new_node;
                current_index = parent_index;
            };
            current
        }
    }
}


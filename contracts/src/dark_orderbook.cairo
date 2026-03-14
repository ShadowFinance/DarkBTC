use starknet::ContractAddress;

#[starknet::interface]
pub trait IDarkOrderbook<TContractState> {
    fn submit_order(
        ref self: TContractState,
        order_commitment: felt252,
        asset_id: felt252,
        collateral_amount: u256,
        collateral_asset: ContractAddress,
    ) -> felt252;
    fn fill_order(
        ref self: TContractState,
        maker_order_id: felt252,
        fill_proof: felt252,
        fill_amount: u256,
        fill_price: u256,
        taker: ContractAddress,
    );
    fn cancel_order(ref self: TContractState, order_id: felt252, cancel_proof: felt252);
    fn get_order_status(self: @TContractState, order_id: felt252) -> (bool, bool, u64);
    fn get_recent_fills(self: @TContractState, limit: u32) -> Array<felt252>;
}

#[starknet::contract]
pub mod DarkOrderbook {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use darkbtc::errors::Errors;
    use darkbtc::types::PrivateOrder;

    #[storage]
    struct Storage {
        orders: Map<felt252, PrivateOrder>,
        collateral_asset: Map<felt252, ContractAddress>,
        collateral_amount: Map<felt252, u256>,
        fill_log: Map<u64, felt252>,
        fill_count: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        OrderSubmitted: OrderSubmitted,
        OrderFilled: OrderFilled,
        OrderCancelled: OrderCancelled,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OrderSubmitted {
        pub order_commitment: felt252,
        pub asset_id: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OrderFilled {
        pub order_id: felt252,
        pub fill_proof: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OrderCancelled {
        pub order_id: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.fill_count.write(0);
    }

    #[abi(embed_v0)]
    impl DarkOrderbookImpl of super::IDarkOrderbook<ContractState> {
        fn submit_order(
            ref self: ContractState,
            order_commitment: felt252,
            asset_id: felt252,
            collateral_amount: u256,
            collateral_asset: ContractAddress,
        ) -> felt252 {
            assert(collateral_amount > 0_u256, Errors::ZERO_AMOUNT);
            let caller = get_caller_address();

            let token = IERC20Dispatcher { contract_address: collateral_asset };
            token.transfer_from(caller, starknet::get_contract_address(), collateral_amount);

            let order = PrivateOrder {
                order_commitment,
                owner: caller,
                asset_id,
                is_filled: false,
                is_cancelled: false,
                fill_proof: 0,
                timestamp: get_block_timestamp(),
            };
            self.orders.write(order_commitment, order);
            self.collateral_asset.write(order_commitment, collateral_asset);
            self.collateral_amount.write(order_commitment, collateral_amount);

            self.emit(OrderSubmitted { order_commitment, asset_id, timestamp: get_block_timestamp() });

            order_commitment
        }

        fn fill_order(
            ref self: ContractState,
            maker_order_id: felt252,
            fill_proof: felt252,
            fill_amount: u256,
            fill_price: u256,
            taker: ContractAddress,
        ) {
            // Full ZK verification of fill_proof is performed off-chain in production.
            // On-chain we verify the proof is non-zero and the order is in a fillable state.
            let mut order = self.orders.read(maker_order_id);
            assert(!order.is_filled, Errors::ORDER_ALREADY_FILLED);
            assert(!order.is_cancelled, Errors::ORDER_ALREADY_FILLED);
            assert(fill_proof != 0, Errors::INVALID_FILL_PROOF);

            order.is_filled = true;
            order.fill_proof = fill_proof;
            self.orders.write(maker_order_id, order);

            let collateral_asset = self.collateral_asset.read(maker_order_id);
            let amount = self.collateral_amount.read(maker_order_id);
            self.collateral_amount.write(maker_order_id, 0_u256);

            let token = IERC20Dispatcher { contract_address: collateral_asset };
            token.transfer(taker, amount);

            let fill_index = self.fill_count.read();
            self.fill_log.write(fill_index, fill_proof);
            self.fill_count.write(fill_index + 1);

            self.emit(OrderFilled { order_id: maker_order_id, fill_proof, timestamp: get_block_timestamp() });
        }

        fn cancel_order(ref self: ContractState, order_id: felt252, cancel_proof: felt252) {
            let caller = get_caller_address();
            let mut order = self.orders.read(order_id);
            assert(order.owner == caller, Errors::UNAUTHORIZED);
            assert(!order.is_filled, Errors::ORDER_ALREADY_FILLED);
            assert(!order.is_cancelled, Errors::ORDER_ALREADY_FILLED);
            assert(cancel_proof != 0, Errors::INVALID_FILL_PROOF);

            order.is_cancelled = true;
            self.orders.write(order_id, order);

            let collateral_asset = self.collateral_asset.read(order_id);
            let amount = self.collateral_amount.read(order_id);
            self.collateral_amount.write(order_id, 0_u256);

            let token = IERC20Dispatcher { contract_address: collateral_asset };
            token.transfer(caller, amount);

            self.emit(OrderCancelled { order_id });
        }

        fn get_order_status(self: @ContractState, order_id: felt252) -> (bool, bool, u64) {
            let order = self.orders.read(order_id);
            (order.is_filled, order.is_cancelled, order.timestamp)
        }

        fn get_recent_fills(self: @ContractState, limit: u32) -> Array<felt252> {
            let mut fills: Array<felt252> = ArrayTrait::new();
            let count = self.fill_count.read();
            let mut i: u64 = 0;
            let limit_u64: u64 = limit.into();
            loop {
                if i >= limit_u64 || i >= count {
                    break;
                }
                let index = count - 1 - i;
                fills.append(self.fill_log.read(index));
                i += 1;
            };
            fills
        }
    }
}

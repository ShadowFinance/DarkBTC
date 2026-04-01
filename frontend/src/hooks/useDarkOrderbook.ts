import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashOrderCommitment, hashNullifier, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import { isConfiguredAddress } from '../lib/starknet';
import type { HexString, OrderFill } from '../types';

interface SubmitOrderParams {
  side: 'Buy' | 'Sell';
  assetId: HexString;
  amount: bigint;
  price: bigint;
  collateralAmount: bigint;
  collateralAsset: HexString;
}

export function useSubmitOrder() {
  const { account } = useAccount();
  const { addOrder, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({
      side,
      assetId,
      amount,
      price,
      collateralAmount,
      collateralAsset,
    }: SubmitOrderParams) => {
      if (!account) throw new Error('Wallet not connected');
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.DARK_ORDERBOOK)) {
        throw new Error('Dark orderbook is not configured');
      }

      const secret = generateSecret();
      const sideVal: 0n | 1n = side === 'Buy' ? 0n : 1n;
      const orderCommitment = hashOrderCommitment(sideVal, amount, price, secret);

      const approveCall = {
        contractAddress: collateralAsset,
        entrypoint: 'approve',
        calldata: [CONTRACT_ADDRESSES.DARK_ORDERBOOK, collateralAmount.toString(), '0'],
      };

      const submitCall = {
        contractAddress: CONTRACT_ADDRESSES.DARK_ORDERBOOK,
        entrypoint: 'submit_order',
        calldata: [
          bigIntToHex(orderCommitment),
          assetId,
          collateralAmount.toString(),
          '0',
          collateralAsset,
        ],
      };

      const result = await sendAsync([approveCall, submitCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Submit Order', timestamp: Date.now() });

      addOrder({
        orderId: bigIntToHex(orderCommitment),
        side,
        assetId,
        amount,
        price,
        secret: bigIntToHex(secret),
        isFilled: false,
        isCancelled: false,
        timestamp: Date.now(),
      });

      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

export function useCancelOrder() {
  const { account } = useAccount();
  const { myOrders, markOrderCancelled, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ orderId }: { orderId: HexString }) => {
      if (!account) throw new Error('Wallet not connected');
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.DARK_ORDERBOOK)) {
        throw new Error('Dark orderbook is not configured');
      }

      const order = myOrders.find((o) => o.orderId === orderId);
      if (!order) throw new Error('Order not found');

      const cancelProof = hashNullifier(BigInt(order.secret), BigInt(orderId));

      const cancelCall = {
        contractAddress: CONTRACT_ADDRESSES.DARK_ORDERBOOK,
        entrypoint: 'cancel_order',
        calldata: [orderId, bigIntToHex(cancelProof)],
      };

      const result = await sendAsync([cancelCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Cancel Order', timestamp: Date.now() });
      markOrderCancelled(orderId);
      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

export function useRecentFills() {
  return useQuery({
    queryKey: ['recent_fills'],
    queryFn: async (): Promise<OrderFill[]> => {
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.DARK_ORDERBOOK)) {
        return [];
      }

      const response = await fetch(`${INDEXER_URL}/orderbook/fills?limit=50`);
      if (!response.ok) {
        throw new Error('Failed to load recent fills');
      }

      const fills = (await response.json()) as Array<{
        orderId: HexString;
        fillProof: HexString;
        timestamp: number;
        blockNumber?: number;
        transactionHash?: HexString;
      }>;

      return fills.map((fill) => ({
        orderId: fill.orderId,
        fillProof: fill.fillProof,
        timestamp: fill.timestamp,
        blockNumber: fill.blockNumber,
        transactionHash: fill.transactionHash,
      }));
    },
    enabled: isConfiguredAddress(CONTRACT_ADDRESSES.DARK_ORDERBOOK),
    refetchInterval: 15000,
  });
}

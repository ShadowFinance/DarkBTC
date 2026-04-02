import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashOrderCommitment, hashNullifier, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import { extractErrorMessage, isConfiguredAddress, waitForTransaction } from '../lib/starknet';
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
  const queryClient = useQueryClient();
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
      if (amount <= 0n) throw new Error('Enter a valid order size');
      if (price <= 0n) throw new Error('Enter a valid limit price');
      if (collateralAmount <= 0n) throw new Error('Collateral must be greater than zero');

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

      try {
        const result = await sendAsync([approveCall, submitCall]);
        const txHash = result.transaction_hash as HexString;
        addPendingTx({ hash: txHash, description: 'Submit order', timestamp: Date.now() });

        try {
          await waitForTransaction(txHash);
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
          await queryClient.invalidateQueries({ queryKey: ['recent_fills'] });
          await queryClient.invalidateQueries({ queryKey: ['token_balance'] });
          return result;
        } finally {
          removePendingTx(txHash);
        }
      } catch (error) {
        throw new Error(extractErrorMessage(error));
      }
    },
  });
}

export function useCancelOrder() {
  const { account } = useAccount();
  const queryClient = useQueryClient();
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
      if (order.isFilled) throw new Error('This order has already been filled');
      if (order.isCancelled) throw new Error('This order has already been cancelled');

      const cancelProof = hashNullifier(BigInt(order.secret), BigInt(orderId));

      const cancelCall = {
        contractAddress: CONTRACT_ADDRESSES.DARK_ORDERBOOK,
        entrypoint: 'cancel_order',
        calldata: [orderId, bigIntToHex(cancelProof)],
      };

      try {
        const result = await sendAsync([cancelCall]);
        const txHash = result.transaction_hash as HexString;
        addPendingTx({ hash: txHash, description: 'Cancel order', timestamp: Date.now() });

        try {
          await waitForTransaction(txHash);
          markOrderCancelled(orderId);
          await queryClient.invalidateQueries({ queryKey: ['recent_fills'] });
          await queryClient.invalidateQueries({ queryKey: ['token_balance'] });
          return result;
        } finally {
          removePendingTx(txHash);
        }
      } catch (error) {
        throw new Error(extractErrorMessage(error));
      }
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

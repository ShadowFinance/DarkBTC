import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { Contract, type Abi } from 'starknet';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { generateSecret, hashOrderCommitment, hashNullifier, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import { getProvider } from '../lib/starknet';
import type { HexString } from '../types';
import darkOrderbookAbiJson from '../abis/dark_orderbook.json';

const darkOrderbookAbi = darkOrderbookAbiJson as Abi;

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
    queryFn: async (): Promise<HexString[]> => {
      const provider = getProvider();
      const contract = new Contract(darkOrderbookAbi, CONTRACT_ADDRESSES.DARK_ORDERBOOK, provider);
      const result = (await contract.call('get_recent_fills', [50])) as bigint[];
      return result.map((f) => bigIntToHex(f));
    },
    refetchInterval: 15000,
  });
}

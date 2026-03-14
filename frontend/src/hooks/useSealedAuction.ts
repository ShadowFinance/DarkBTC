import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useContract, useSendTransaction } from '@starknet-react/core';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { generateSecret, hashBidCommitment, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import type { HexString, AuctionItem, AuctionStateType } from '../types';
import sealedAuctionAbi from '../../abis/sealed_auction.json';

export function useAuctions(stateFilter?: AuctionStateType) {
  const { contract } = useContract({
    abi: sealedAuctionAbi,
    address: CONTRACT_ADDRESSES.SEALED_AUCTION,
  });

  return useQuery({
    queryKey: ['auctions', stateFilter],
    queryFn: async (): Promise<AuctionItem[]> => {
      if (!contract) return [];

      const counter = (await contract.call('get_auction_count', [])) as bigint;
      const items: AuctionItem[] = [];

      for (let i = 0n; i < counter; i++) {
        const result = (await contract.call('get_auction', [i.toString()])) as [
          { variant: AuctionStateType },
          bigint,
          bigint,
          string,
          string,
        ];
        const [stateVariant, commitEnd, revealEnd, , assetId] = result;
        const bidCount = (await contract.call('get_bid_count', [i.toString()])) as bigint;

        const auctionState = Object.keys(stateVariant)[0] as AuctionStateType;
        if (stateFilter && auctionState !== stateFilter) continue;

        items.push({
          id: i,
          assetId: bigIntToHex(BigInt(assetId)),
          state: auctionState,
          commitEnd: Number(commitEnd),
          revealEnd: Number(revealEnd),
          bidCount,
        });
      }

      return items;
    },
    enabled: !!contract,
    refetchInterval: 10000,
  });
}

export function useCommitBid() {
  const { account } = useAccount();
  const { saveBidSecret, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});
  const { contract } = useContract({
    abi: sealedAuctionAbi,
    address: CONTRACT_ADDRESSES.SEALED_AUCTION,
  });

  return useMutation({
    mutationFn: async ({ auctionId, amount }: { auctionId: bigint; amount: bigint }) => {
      if (!account || !contract) throw new Error('Wallet not connected');

      const secret = generateSecret();
      const commitment = hashBidCommitment(amount, secret);

      const [, , , , assetId] = (await contract.call('get_auction', [auctionId.toString()])) as [
        unknown,
        bigint,
        bigint,
        string,
        string,
      ];

      const approveCall = {
        contractAddress: bigIntToHex(BigInt(assetId)),
        entrypoint: 'approve',
        calldata: [CONTRACT_ADDRESSES.SEALED_AUCTION, amount.toString(), '0'],
      };

      const commitCall = {
        contractAddress: CONTRACT_ADDRESSES.SEALED_AUCTION,
        entrypoint: 'commit_bid',
        calldata: [auctionId.toString(), bigIntToHex(commitment)],
      };

      const result = await sendAsync([approveCall, commitCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Commit Bid', timestamp: Date.now() });

      saveBidSecret({
        auctionId,
        secret: bigIntToHex(secret),
        amount,
        commitment: bigIntToHex(commitment),
      });

      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

export function useRevealBid() {
  const { account } = useAccount();
  const { getBidSecret, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ auctionId }: { auctionId: bigint }) => {
      if (!account) throw new Error('Wallet not connected');

      const bidSecret = getBidSecret(auctionId);
      if (!bidSecret) throw new Error('Bid secret not found');

      const revealCall = {
        contractAddress: CONTRACT_ADDRESSES.SEALED_AUCTION,
        entrypoint: 'reveal_bid',
        calldata: [
          auctionId.toString(),
          bidSecret.amount.toString(),
          '0',
          bidSecret.secret,
        ],
      };

      const result = await sendAsync([revealCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Reveal Bid', timestamp: Date.now() });
      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

export function useAdvancePhase() {
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ auctionId }: { auctionId: bigint }) => {
      const advanceCall = {
        contractAddress: CONTRACT_ADDRESSES.SEALED_AUCTION,
        entrypoint: 'advance_phase',
        calldata: [auctionId.toString()],
      };
      return sendAsync([advanceCall]);
    },
  });
}

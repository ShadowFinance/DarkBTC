import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { Contract, type Abi } from 'starknet';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { generateSecret, hashBidCommitment, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import { getProvider } from '../lib/starknet';
import type { HexString, AuctionItem, AuctionStateType } from '../types';
import sealedAuctionAbiJson from '../abis/sealed_auction.json';

const sealedAuctionAbi = sealedAuctionAbiJson as Abi;

export function useAuctions(stateFilter?: AuctionStateType) {
  return useQuery({
    queryKey: ['auctions', stateFilter],
    queryFn: async (): Promise<AuctionItem[]> => {
      const provider = getProvider();
      const contract = new Contract(sealedAuctionAbi, CONTRACT_ADDRESSES.SEALED_AUCTION, provider);

      const counter = BigInt((await contract.call('get_auction_count')).toString());
      const items: AuctionItem[] = [];

      for (let i = 0n; i < counter; i++) {
        const result = (await contract.call('get_auction', [i])) as [
          { variant: AuctionStateType },
          bigint,
          bigint,
          string,
          string,
        ];
        const [stateVariant, commitEnd, revealEnd, , assetId] = result;
        const bidCount = BigInt((await contract.call('get_bid_count', [i])).toString());

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
    refetchInterval: 10000,
  });
}

export function useCommitBid() {
  const { account } = useAccount();
  const { saveBidSecret, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ auctionId, amount }: { auctionId: bigint; amount: bigint }) => {
      if (!account) throw new Error('Wallet not connected');

      const provider = getProvider();
      const contract = new Contract(sealedAuctionAbi, CONTRACT_ADDRESSES.SEALED_AUCTION, provider);

      const secret = generateSecret();
      const commitment = hashBidCommitment(amount, secret);

      const auctionResult = (await contract.call('get_auction', [auctionId])) as [
        unknown,
        bigint,
        bigint,
        string,
        string,
      ];
      const assetId = auctionResult[4];

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

      const txResult = await sendAsync([approveCall, commitCall]);
      addPendingTx({ hash: txResult.transaction_hash as HexString, description: 'Commit Bid', timestamp: Date.now() });

      saveBidSecret({
        auctionId,
        secret: bigIntToHex(secret),
        amount,
        commitment: bigIntToHex(commitment),
      });

      removePendingTx(txResult.transaction_hash as HexString);
      return txResult;
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

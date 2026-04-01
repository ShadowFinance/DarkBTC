import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { AUCTION_DEPOSIT_TOKEN, CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashBidCommitment, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import type { HexString, AuctionItem, AuctionStateType } from '../types';
import { isConfiguredAddress } from '../lib/starknet';

interface IndexedAuction {
  id: string;
  assetId: HexString;
  state: AuctionStateType;
  commitEnd: number;
  revealEnd: number;
  createdAt?: number;
  reservePrice?: string;
  currentWinner?: HexString | null;
  currentBid?: string;
  bidCount: string;
}

export function useAuctions(stateFilter?: AuctionStateType) {
  return useQuery({
    queryKey: ['auctions', stateFilter],
    queryFn: async (): Promise<AuctionItem[]> => {
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.SEALED_AUCTION)) {
        return [];
      }

      const response = await fetch(`${INDEXER_URL}/auctions`);
      if (!response.ok) {
        throw new Error('Failed to load auctions');
      }

      const auctions = (await response.json()) as IndexedAuction[];
      return auctions
        .map((auction) => ({
          id: BigInt(auction.id),
          assetId: auction.assetId,
          state: auction.state,
          commitEnd: auction.commitEnd,
          revealEnd: auction.revealEnd,
          createdAt: auction.createdAt,
          reservePrice: auction.reservePrice ? BigInt(auction.reservePrice) : undefined,
          currentWinner: auction.currentWinner ?? undefined,
          currentBid: auction.currentBid ? BigInt(auction.currentBid) : undefined,
          bidCount: BigInt(auction.bidCount),
        }))
        .filter((auction) => !stateFilter || auction.state === stateFilter);
    },
    enabled: isConfiguredAddress(CONTRACT_ADDRESSES.SEALED_AUCTION),
    refetchInterval: 15000,
  });
}

export function useCommitBid() {
  const { account } = useAccount();
  const { saveBidSecret, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({
      auctionId,
      amount,
      reservePrice,
    }: {
      auctionId: bigint;
      amount: bigint;
      reservePrice: bigint;
    }) => {
      if (!account) throw new Error('Wallet not connected');
      if (!isConfiguredAddress(AUCTION_DEPOSIT_TOKEN)) {
        throw new Error('Auction deposit token is not configured');
      }

      const secret = generateSecret();
      const commitment = hashBidCommitment(amount, secret);

      const approveCall = {
        contractAddress: AUCTION_DEPOSIT_TOKEN,
        entrypoint: 'approve',
        calldata: [CONTRACT_ADDRESSES.SEALED_AUCTION, reservePrice.toString(), '0'],
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { AUCTION_DEPOSIT_TOKEN, CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashBidCommitment, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import type { HexString, AuctionItem, AuctionStateType } from '../types';
import { extractErrorMessage, isConfiguredAddress, waitForTransaction } from '../lib/starknet';

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
          currentWinner:
            auction.currentWinner && auction.currentWinner !== '0x0'
              ? auction.currentWinner
              : undefined,
          currentBid: auction.currentBid ? BigInt(auction.currentBid) : undefined,
          bidCount: BigInt(auction.bidCount),
        }))
        .filter((auction) => !stateFilter || auction.state === stateFilter)
        .sort((left, right) => {
          const priority = (state: AuctionStateType) =>
            ({
              CommitPhase: 0,
              RevealPhase: 1,
              Pending: 2,
              Settled: 3,
              Cancelled: 4,
            })[state] ?? 99;

          return (
            priority(left.state) - priority(right.state) ||
            (right.createdAt ?? right.revealEnd) - (left.createdAt ?? left.revealEnd)
          );
        });
    },
    enabled: isConfiguredAddress(CONTRACT_ADDRESSES.SEALED_AUCTION),
    refetchInterval: 15000,
  });
}

export function useCommitBid() {
  const { account } = useAccount();
  const queryClient = useQueryClient();
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
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.SEALED_AUCTION)) {
        throw new Error('Sealed auction contract is not configured');
      }
      if (!isConfiguredAddress(AUCTION_DEPOSIT_TOKEN)) {
        throw new Error('Auction deposit token is not configured');
      }
      if (amount <= 0n) throw new Error('Enter a bid amount greater than zero');
      if (amount < reservePrice) throw new Error('Bid must meet or exceed the reserve price');

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

      try {
        const txResult = await sendAsync([approveCall, commitCall]);
        const txHash = txResult.transaction_hash as HexString;
        addPendingTx({ hash: txHash, description: 'Commit bid', timestamp: Date.now() });

        try {
          await waitForTransaction(txHash);
          saveBidSecret({
            auctionId,
            secret: bigIntToHex(secret),
            amount,
            commitment: bigIntToHex(commitment),
          });
          await queryClient.invalidateQueries({ queryKey: ['auctions'] });
          await queryClient.invalidateQueries({ queryKey: ['token_balance'] });
          return txResult;
        } finally {
          removePendingTx(txHash);
        }
      } catch (error) {
        throw new Error(extractErrorMessage(error));
      }
    },
  });
}

export function useRevealBid() {
  const { account } = useAccount();
  const queryClient = useQueryClient();
  const { getBidSecret, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ auctionId }: { auctionId: bigint }) => {
      if (!account) throw new Error('Wallet not connected');
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.SEALED_AUCTION)) {
        throw new Error('Sealed auction contract is not configured');
      }

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

      try {
        const result = await sendAsync([revealCall]);
        const txHash = result.transaction_hash as HexString;
        addPendingTx({ hash: txHash, description: 'Reveal bid', timestamp: Date.now() });

        try {
          await waitForTransaction(txHash);
          await queryClient.invalidateQueries({ queryKey: ['auctions'] });
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

export function useAdvancePhase() {
  const { account } = useAccount();
  const queryClient = useQueryClient();
  const { addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ auctionId }: { auctionId: bigint }) => {
      if (!account) throw new Error('Wallet not connected');
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.SEALED_AUCTION)) {
        throw new Error('Sealed auction contract is not configured');
      }

      const advanceCall = {
        contractAddress: CONTRACT_ADDRESSES.SEALED_AUCTION,
        entrypoint: 'advance_phase',
        calldata: [auctionId.toString()],
      };

      try {
        const result = await sendAsync([advanceCall]);
        const txHash = result.transaction_hash as HexString;
        addPendingTx({ hash: txHash, description: 'Advance auction', timestamp: Date.now() });

        try {
          await waitForTransaction(txHash);
          await queryClient.invalidateQueries({ queryKey: ['auctions'] });
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

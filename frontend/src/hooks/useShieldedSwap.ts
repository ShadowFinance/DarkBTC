import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { Contract, type Abi } from 'starknet';
import { CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashNoteCommitment, hashNullifier, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import {
  extractErrorMessage,
  getProvider,
  isConfiguredAddress,
  parseU256,
  waitForTransaction,
  withTimeout,
} from '../lib/starknet';
import type { HexString, SwapQuote } from '../types';
import shieldedSwapAbiJson from '../abis/shielded_swap.json';

const shieldedSwapAbi = shieldedSwapAbiJson as Abi;

interface SwapParams {
  assetIn: HexString;
  assetOut: HexString;
  amountIn: bigint;
  expectedAmountOut: bigint;
  minAmountOut: bigint;
  deadline: bigint;
}

export function useSwapQuote(assetIn: HexString, assetOut: HexString, amountIn: bigint) {
  return useQuery({
    queryKey: ['swap_quote', assetIn, assetOut, amountIn.toString()],
    queryFn: async (): Promise<SwapQuote | null> => {
      if (amountIn === 0n) return null;
      const provider = getProvider();
      const contract = new Contract({
        abi: shieldedSwapAbi,
        address: CONTRACT_ADDRESSES.SHIELDED_SWAP,
        providerOrAccount: provider,
      });
      const result = (await withTimeout(
        contract.call('get_swap_quote', [assetIn, assetOut, { low: amountIn, high: 0n }]),
        12_000,
        'Quote request timed out. Please retry.',
      )) as {
        input_amount: { low: bigint; high: bigint };
        output_amount: { low: bigint; high: bigint };
        price_impact_bps: bigint | string | number;
        fee_bps: bigint | string | number;
      };
      return {
        inputAmount: parseU256(result.input_amount),
        outputAmount: parseU256(result.output_amount),
        priceImpactBps: Number(result.price_impact_bps),
        feeBps: Number(result.fee_bps),
        assetIn,
        assetOut,
      };
    },
    enabled:
      amountIn > 0n &&
      isConfiguredAddress(CONTRACT_ADDRESSES.SHIELDED_SWAP) &&
      isConfiguredAddress(assetIn) &&
      isConfiguredAddress(assetOut) &&
      assetIn.toLowerCase() !== assetOut.toLowerCase(),
    refetchInterval: 10000,
    retry: 1,
  });
}

export function useExecuteSwap() {
  const { account } = useAccount();
  const queryClient = useQueryClient();
  const { getUnspentNotes, markNoteSpent, addNote, addPendingTx, removePendingTx } =
    useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({
      assetIn,
      assetOut,
      amountIn,
      expectedAmountOut,
      minAmountOut,
      deadline,
    }: SwapParams) => {
      if (!account) throw new Error('Wallet not connected');
      if (!isConfiguredAddress(CONTRACT_ADDRESSES.SHIELDED_SWAP)) {
        throw new Error('Shielded swap is not configured');
      }
      if (amountIn <= 0n) throw new Error('Enter an amount greater than zero');
      if (expectedAmountOut <= 0n) throw new Error('No executable quote available');

      const unspentNotes = getUnspentNotes(assetIn);
      if (unspentNotes.length === 0) throw new Error('No unspent notes for input asset');

      const inputNote = unspentNotes.find((note) => note.amount === amountIn);
      if (!inputNote) {
        throw new Error(
          'Swaps require an exact-size shielded note. Deposit the exact amount you want to swap first.',
        );
      }

      const proofRes = await fetch(`${INDEXER_URL}/proof/${inputNote.commitment}`);
      if (!proofRes.ok) throw new Error('Failed to fetch Merkle proof');
      const proofData = (await proofRes.json()) as { proof: string[]; indices: number; root: string };

      const outputSecret = generateSecret();
      const outputNonce = BigInt(Date.now());
      const outputCommitment = hashNoteCommitment(
        outputSecret,
        expectedAmountOut,
        BigInt(assetOut),
        outputNonce,
      );
      const outputNullifier = hashNullifier(outputSecret, outputCommitment);

      const swapCall = {
        contractAddress: CONTRACT_ADDRESSES.SHIELDED_SWAP,
        entrypoint: 'swap',
        calldata: [
          inputNote.nullifier,
          inputNote.commitment,
          proofData.root,
          proofData.proof.length.toString(),
          ...proofData.proof,
          proofData.indices.toString(),
          assetIn,
          assetOut,
          amountIn.toString(),
          '0',
          minAmountOut.toString(),
          '0',
          bigIntToHex(outputCommitment),
          '0',
          deadline.toString(),
        ],
      };

      try {
        const result = await sendAsync([swapCall]);
        const txHash = result.transaction_hash as HexString;
        addPendingTx({ hash: txHash, description: 'Shielded swap', timestamp: Date.now() });

        try {
          await waitForTransaction(txHash);
          markNoteSpent(inputNote.commitment);
          addNote({
            commitment: bigIntToHex(outputCommitment),
            nullifier: bigIntToHex(outputNullifier),
            secret: bigIntToHex(outputSecret),
            assetAddress: assetOut,
            amount: expectedAmountOut,
            leafIndex: 0,
            spent: false,
            createdAt: Date.now(),
          });
          await queryClient.invalidateQueries({ queryKey: ['pool_reserves'] });
          await queryClient.invalidateQueries({ queryKey: ['swap_quote'] });
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

export function usePoolReserves(assetA: HexString, assetB: HexString) {
  return useQuery({
    queryKey: ['pool_reserves', assetA, assetB],
    queryFn: async (): Promise<[bigint, bigint]> => {
      const provider = getProvider();
      const contract = new Contract({
        abi: shieldedSwapAbi,
        address: CONTRACT_ADDRESSES.SHIELDED_SWAP,
        providerOrAccount: provider,
      });
      const result = (await contract.call('get_reserves', [assetA, assetB])) as [
        { low: bigint; high: bigint },
        { low: bigint; high: bigint },
      ];
      return [parseU256(result[0]), parseU256(result[1])];
    },
    enabled:
      isConfiguredAddress(CONTRACT_ADDRESSES.SHIELDED_SWAP) &&
      isConfiguredAddress(assetA) &&
      isConfiguredAddress(assetB),
    refetchInterval: 15000,
  });
}

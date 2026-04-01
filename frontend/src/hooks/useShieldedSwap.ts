import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { Contract, type Abi } from 'starknet';
import { CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashNoteCommitment, hashNullifier, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import { getProvider, isConfiguredAddress, parseU256 } from '../lib/starknet';
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
      const result = (await contract.call('get_swap_quote', [assetIn, assetOut, { low: amountIn, high: 0n }])) as {
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
      isConfiguredAddress(assetOut),
    refetchInterval: 10000,
  });
}

export function useExecuteSwap() {
  const { account } = useAccount();
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

      const unspentNotes = getUnspentNotes(assetIn);
      if (unspentNotes.length === 0) throw new Error('No unspent notes for input asset');

      const inputNote = unspentNotes[0];

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

      const result = await sendAsync([swapCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Swap', timestamp: Date.now() });

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

      removePendingTx(result.transaction_hash as HexString);
      return result;
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

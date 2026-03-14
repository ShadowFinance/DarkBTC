import { useQuery, useMutation } from '@tanstack/react-query';
import { useAccount, useContract, useSendTransaction } from '@starknet-react/core';
import { CONTRACT_ADDRESSES, INDEXER_URL } from '../constants/contracts';
import { generateSecret, hashNoteCommitment, hashNullifier, bigIntToHex } from '../lib/poseidon';
import { useDarkBTCStore } from '../store';
import type { HexString } from '../types';
import notePoolAbi from '../../abis/note_pool.json';

interface DepositParams {
  asset: HexString;
  amount: bigint;
  assetDecimals: number;
}

interface WithdrawParams {
  commitment: HexString;
  asset: HexString;
  amount: bigint;
  recipient: HexString;
}

export function useDeposit() {
  const { account } = useAccount();
  const { addNote, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ asset, amount, assetDecimals }: DepositParams) => {
      if (!account) throw new Error('Wallet not connected');

      const secret = generateSecret();
      const nonce = BigInt(Date.now());
      const assetId = BigInt(asset);
      const commitment = hashNoteCommitment(secret, amount, assetId, nonce);
      const nullifier = hashNullifier(secret, commitment);

      // Approve ERC-20 transfer
      const approveCall = {
        contractAddress: asset,
        entrypoint: 'approve',
        calldata: [CONTRACT_ADDRESSES.NOTE_POOL, amount.toString()],
      };

      const depositCall = {
        contractAddress: CONTRACT_ADDRESSES.NOTE_POOL,
        entrypoint: 'deposit',
        calldata: [
          asset,
          amount.toString(),
          '0', // amount high
          commitment.toString(),
          '0', // encrypted_amount
        ],
      };

      const result = await sendAsync([approveCall, depositCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Deposit', timestamp: Date.now() });

      addNote({
        commitment: bigIntToHex(commitment),
        nullifier: bigIntToHex(nullifier),
        secret: bigIntToHex(secret),
        assetAddress: asset,
        amount,
        leafIndex: 0,
        spent: false,
        createdAt: Date.now(),
      });

      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

export function useWithdraw() {
  const { account } = useAccount();
  const { markNoteSpent, notes, addPendingTx, removePendingTx } = useDarkBTCStore();
  const { sendAsync } = useSendTransaction({});

  return useMutation({
    mutationFn: async ({ commitment, asset, amount, recipient }: WithdrawParams) => {
      if (!account) throw new Error('Wallet not connected');

      const note = notes.find((n) => n.commitment === commitment);
      if (!note) throw new Error('Note not found');

      // Fetch Merkle proof from indexer
      const proofRes = await fetch(`${INDEXER_URL}/proof/${commitment}`);
      const proofData = (await proofRes.json()) as { proof: string[]; indices: number; root: string };

      const withdrawCall = {
        contractAddress: CONTRACT_ADDRESSES.NOTE_POOL,
        entrypoint: 'withdraw',
        calldata: [
          note.nullifier,
          proofData.root,
          proofData.proof.length.toString(),
          ...proofData.proof,
          proofData.indices.toString(),
          commitment,
          asset,
          amount.toString(),
          '0', // amount high
          recipient,
        ],
      };

      const result = await sendAsync([withdrawCall]);
      addPendingTx({ hash: result.transaction_hash as HexString, description: 'Withdraw', timestamp: Date.now() });
      markNoteSpent(commitment);
      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

export function usePoolBalance(asset: HexString) {
  const { contract } = useContract({ abi: notePoolAbi, address: CONTRACT_ADDRESSES.NOTE_POOL });

  return useQuery({
    queryKey: ['pool_balance', asset],
    queryFn: async (): Promise<bigint> => {
      if (!contract) return 0n;
      const result = (await contract.call('get_pool_balance', [asset])) as bigint;
      return result;
    },
    enabled: !!contract && !!asset,
    refetchInterval: 15000,
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@starknet-react/core';
import { INDEXER_URL } from '../constants/contracts';
import {
  extractErrorMessage,
  isConfiguredAddress,
} from '../lib/starknet';
import type { HexString } from '../types';

interface FaucetMintParams {
  tokenAddress: HexString;
  tokenSymbol: string;
  amount: bigint;
  recipient?: HexString;
}

export function useTokenFaucet() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tokenAddress, tokenSymbol, amount, recipient }: FaucetMintParams) => {
      const receiver = recipient ?? address;

      if (!receiver) throw new Error('Connect a wallet to use the faucet');
      if (!isConfiguredAddress(tokenAddress)) throw new Error(`${tokenSymbol} faucet is not configured`);
      if (amount <= 0n) throw new Error('Enter an amount greater than zero');

      try {
        const response = await fetch(`${INDEXER_URL}/faucet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: receiver,
            tokenAddress,
            amount: amount.toString(),
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          transactionHash?: HexString;
          ok?: boolean;
        };

        if (!response.ok || !payload.ok || !payload.transactionHash) {
          throw new Error(payload.error ?? `Failed to mint ${tokenSymbol}`);
        }

        await queryClient.invalidateQueries({ queryKey: ['token_balance'] });
        return payload;
      } catch (error) {
        throw new Error(extractErrorMessage(error));
      }
    },
  });
}

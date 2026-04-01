import { useMutation } from '@tanstack/react-query';
import { useAccount, useSendTransaction } from '@starknet-react/core';
import { useDarkBTCStore } from '../store';
import { isConfiguredAddress, toUint256Calldata } from '../lib/starknet';
import type { HexString } from '../types';

interface FaucetMintParams {
  tokenAddress: HexString;
  tokenSymbol: string;
  amount: bigint;
  recipient?: HexString;
}

export function useTokenFaucet() {
  const { address } = useAccount();
  const { sendAsync } = useSendTransaction({});
  const { addPendingTx, removePendingTx } = useDarkBTCStore();

  return useMutation({
    mutationFn: async ({ tokenAddress, tokenSymbol, amount, recipient }: FaucetMintParams) => {
      const receiver = recipient ?? address;

      if (!receiver) throw new Error('Connect a wallet to use the faucet');
      if (!isConfiguredAddress(tokenAddress)) throw new Error(`${tokenSymbol} faucet is not configured`);
      if (amount <= 0n) throw new Error('Enter an amount greater than zero');

      const mintCall = {
        contractAddress: tokenAddress,
        entrypoint: 'mint',
        calldata: [receiver, ...toUint256Calldata(amount)],
      };

      const result = await sendAsync([mintCall]);
      addPendingTx({
        hash: result.transaction_hash as HexString,
        description: `Mint ${tokenSymbol}`,
        timestamp: Date.now(),
      });
      removePendingTx(result.transaction_hash as HexString);
      return result;
    },
  });
}

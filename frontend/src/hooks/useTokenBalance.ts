import { useQuery } from '@tanstack/react-query';
import { useAccount } from '@starknet-react/core';
import { getProvider, isConfiguredAddress, parseU256FromCallResult } from '../lib/starknet';
import type { HexString } from '../types';

export function useTokenBalance(tokenAddress?: HexString | null) {
  const { address } = useAccount();

  return useQuery({
    queryKey: ['token_balance', address, tokenAddress],
    queryFn: async (): Promise<bigint> => {
      if (!address || !tokenAddress) return 0n;

      const result = await getProvider().callContract({
        contractAddress: tokenAddress,
        entrypoint: 'balanceOf',
        calldata: [address],
      });

      return parseU256FromCallResult(result as Array<bigint | string | number>);
    },
    enabled: !!address && !!tokenAddress && isConfiguredAddress(tokenAddress),
    refetchInterval: 15_000,
  });
}

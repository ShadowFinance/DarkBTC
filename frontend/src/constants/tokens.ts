import type { Token } from '../types';

export const TOKENS: Token[] = [
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    address: (import.meta.env.VITE_WBTC_ADDRESS ?? '0x0') as `0x${string}`,
    decimals: 8,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: (import.meta.env.VITE_USDC_ADDRESS ?? '0x0') as `0x${string}`,
    decimals: 6,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7' as `0x${string}`,
    decimals: 18,
  },
];

export const TOKEN_MAP: Record<string, Token> = Object.fromEntries(
  TOKENS.map((t) => [t.address.toLowerCase(), t]),
);

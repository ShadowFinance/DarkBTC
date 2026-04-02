import type { Token } from '../types';

const WBTC_DECIMALS = Number(import.meta.env.VITE_WBTC_DECIMALS ?? '18');
const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS ?? '18');

export const TOKENS: Token[] = [
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    address: (import.meta.env.VITE_WBTC_ADDRESS ?? '0x0') as `0x${string}`,
    decimals: WBTC_DECIMALS,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: (import.meta.env.VITE_USDC_ADDRESS ?? '0x0') as `0x${string}`,
    decimals: USDC_DECIMALS,
  },
];

export const TOKEN_MAP: Record<string, Token> = Object.fromEntries(
  TOKENS.map((t) => [t.address.toLowerCase(), t]),
);

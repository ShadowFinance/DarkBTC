import type { HexString } from '../types';

export const CONTRACT_ADDRESSES = {
  NOTE_POOL: (import.meta.env.VITE_NOTE_POOL_ADDRESS ?? '0x0') as HexString,
  SHIELDED_SWAP: (import.meta.env.VITE_SHIELDED_SWAP_ADDRESS ?? '0x0') as HexString,
  SEALED_AUCTION: (import.meta.env.VITE_SEALED_AUCTION_ADDRESS ?? '0x0') as HexString,
  DARK_ORDERBOOK: (import.meta.env.VITE_DARK_ORDERBOOK_ADDRESS ?? '0x0') as HexString,
} as const;

export const CHAIN_ID = (import.meta.env.VITE_CHAIN_ID ?? 'SN_SEPOLIA') as string;
export const RPC_URL = (import.meta.env.VITE_RPC_URL ?? 'https://starknet-sepolia.public.blastapi.io/rpc/v0_7') as string;
export const INDEXER_URL = (import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:3001') as string;

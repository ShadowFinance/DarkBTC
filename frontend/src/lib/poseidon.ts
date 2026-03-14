import { poseidonHashMany } from 'micro-starknet';
import type { HexString } from '../types';

const MASK128 = (1n << 128n) - 1n;

export function domain(str: string): bigint {
  const hex = Buffer.from(str, 'ascii').toString('hex');
  return BigInt('0x' + hex);
}

export function hashNoteCommitment(
  secret: bigint,
  amount: bigint,
  assetId: bigint,
  nonce: bigint,
): bigint {
  const low = amount & MASK128;
  const high = amount >> 128n;
  return poseidonHashMany([secret, low, high, assetId, nonce, domain('DARKBTC_NOTE')]);
}

export function hashNullifier(secret: bigint, commitment: bigint): bigint {
  return poseidonHashMany([secret, commitment, domain('DARKBTC_NULLIFIER')]);
}

export function hashBidCommitment(amount: bigint, secret: bigint): bigint {
  const low = amount & MASK128;
  const high = amount >> 128n;
  return poseidonHashMany([low, high, secret, domain('DARKBTC_BID')]);
}

export function hashOrderCommitment(
  side: 0n | 1n,
  amount: bigint,
  price: bigint,
  secret: bigint,
): bigint {
  const amountLow = amount & MASK128;
  const amountHigh = amount >> 128n;
  const priceLow = price & MASK128;
  const priceHigh = price >> 128n;
  return poseidonHashMany([
    side,
    amountLow,
    amountHigh,
    priceLow,
    priceHigh,
    secret,
    domain('DARKBTC_ORDER'),
  ]);
}

export function generateSecret(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

export function bigIntToHex(n: bigint): HexString {
  return `0x${n.toString(16)}` as HexString;
}

export function hexToBigInt(h: string): bigint {
  return BigInt(h.startsWith('0x') ? h : '0x' + h);
}

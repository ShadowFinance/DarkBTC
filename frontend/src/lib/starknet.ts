import { RpcProvider } from 'starknet';
import type { HexString } from '../types';

export function getProvider(): RpcProvider {
  const rpcUrl = (import.meta.env.VITE_RPC_URL as string | undefined) ?? '/rpc';
  return new RpcProvider({ nodeUrl: rpcUrl });
}

export function isConfiguredAddress(value: string | undefined | null): value is `0x${string}` {
  return !!value && /^0x[0-9a-f]+$/i.test(value) && value !== '0x0';
}

export function parseU256(
  value: bigint | string | number | { low: bigint | string | number; high: bigint | string | number },
): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  return BigInt(value.low) + (BigInt(value.high) << 128n);
}

export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function toHex(value: bigint | string | number): string {
  if (typeof value === 'bigint') return '0x' + value.toString(16);
  if (typeof value === 'number') return '0x' + value.toString(16);
  return value;
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  if (fractionStr === '') return whole.toString();
  return `${whole}.${fractionStr}`;
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!normalized || normalized === '.') return 0n;
  if (!/^\d*(\.\d*)?$/.test(normalized)) {
    throw new Error('Enter a valid amount');
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0');
}

export function toUint256Calldata(value: bigint): [string, string] {
  const lowMask = (1n << 128n) - 1n;
  return [(value & lowMask).toString(), (value >> 128n).toString()];
}

export function feltToText(value: bigint | string): string {
  const hex = typeof value === 'bigint' ? value.toString(16) : value.replace(/^0x/, '');
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const text = normalized
    .match(/.{1,2}/g)
    ?.map((pair) => String.fromCharCode(parseInt(pair, 16)))
    .join('')
    .replace(/\0/g, '')
    .trim();

  return text && /^[\x20-\x7E]+$/.test(text) ? text : '';
}

export async function waitForTransaction(hash: HexString): Promise<void> {
  await getProvider().waitForTransaction(hash);
}

export function parseU256FromCallResult(values: Array<bigint | string | number>): bigint {
  if (values.length < 2) return 0n;
  return parseU256({ low: values[0], high: values[1] });
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    const revertedMatch = message.match(/Error message:\s*(.+)$/s);
    if (revertedMatch?.[1]) {
      return revertedMatch[1].trim();
    }

    const rejectionMatch = message.match(/Requested resource not found/i);
    if (rejectionMatch) {
      return 'Wallet request was rejected.';
    }

    return message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Something went wrong while talking to Starknet.';
}

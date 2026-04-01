import { RpcProvider } from 'starknet';

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
  const [whole, fraction = ''] = value.split('.');
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

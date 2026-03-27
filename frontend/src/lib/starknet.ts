import { RpcProvider } from 'starknet';

export function getProvider(): RpcProvider {
  const rpcUrl = import.meta.env.VITE_RPC_URL as string;
  return new RpcProvider({ nodeUrl: rpcUrl });
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

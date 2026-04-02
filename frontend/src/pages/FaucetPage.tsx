import React from 'react';
import { useAccount } from '@starknet-react/core';
import { FlaskConical, Droplets, Coins, ArrowRight } from 'lucide-react';
import { TOKENS } from '../constants/tokens';
import { useTokenBalance } from '../hooks/useTokenBalance';
import {
  extractErrorMessage,
  formatTokenAmount,
  isConfiguredAddress,
  shortenAddress,
  tryParseTokenAmount,
} from '../lib/starknet';
import { useTokenFaucet } from '../hooks/useTokenFaucet';

const PRESET_AMOUNTS: Record<string, string[]> = {
  WBTC: ['0.1', '1', '10'],
  USDC: ['100', '1000', '10000'],
};

const TOKEN_ACCENTS: Record<string, string> = {
  WBTC: 'from-amber-500/25 via-orange-500/10 to-transparent border-amber-500/25 text-amber-300',
  USDC: 'from-cyan-500/25 via-sky-500/10 to-transparent border-cyan-500/25 text-cyan-300',
};

function TokenFaucetCard({
  symbol,
  name,
  address,
  decimals,
}: {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
}) {
  const [amount, setAmount] = React.useState(PRESET_AMOUNTS[symbol]?.[1] ?? '1');
  const { address: walletAddress } = useAccount();
  const { data: walletBalance } = useTokenBalance(address);
  const faucetMint = useTokenFaucet();

  const isReady = isConfiguredAddress(address) && !!walletAddress;
  const parsedAmount = tryParseTokenAmount(amount, decimals);
  const validationError = amount && parsedAmount === null
    ? `Enter a valid ${symbol} amount.`
    : null;

  async function handleMint() {
    if (!parsedAmount) return;
    await faucetMint.mutateAsync({
      tokenAddress: address,
      tokenSymbol: symbol,
      amount: parsedAmount,
    });
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 ${
        TOKEN_ACCENTS[symbol] ?? 'from-gray-800 via-gray-900 to-gray-950 border-gray-700 text-white'
      }`}
    >
      <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-white/5 blur-2xl" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/55">Testnet Faucet</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{symbol}</h2>
            <p className="mt-1 text-sm text-white/70">{name}</p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 p-2 text-white/80">
            {symbol === 'WBTC' ? <Coins size={18} /> : <Droplets size={18} />}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-xs uppercase tracking-[0.22em] text-white/50">Amount</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Enter amount"
            autoComplete="off"
            className="mt-2 w-full bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-white/20"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {(PRESET_AMOUNTS[symbol] ?? ['1']).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
              >
                {preset} {symbol}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
          <div className="flex items-center justify-between gap-3">
            <span>Destination</span>
            <span className="font-mono text-xs text-white/85">
              {walletAddress ? shortenAddress(walletAddress) : 'Connect wallet'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span>Token contract</span>
            <span className="font-mono text-xs text-white/60">{shortenAddress(address)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span>Wallet balance</span>
            <span className="font-mono text-xs text-white/85">
              {formatTokenAmount(walletBalance ?? 0n, decimals)} {symbol}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleMint()}
          disabled={!isReady || faucetMint.isPending || !parsedAmount || !!validationError}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FlaskConical size={16} />
          {faucetMint.isPending ? `Minting ${symbol}...` : `Mint ${symbol}`}
        </button>

        {validationError && (
          <p className="text-sm text-rose-300">{validationError}</p>
        )}

        {faucetMint.error && (
          <p className="text-sm text-rose-300">{extractErrorMessage(faucetMint.error)}</p>
        )}
      </div>
    </div>
  );
}

export default function FaucetPage() {
  const { address } = useAccount();
  const faucetTokens = TOKENS.filter(
    (token) => (token.symbol === 'WBTC' || token.symbol === 'USDC') && isConfiguredAddress(token.address),
  );

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-amber-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_35%),linear-gradient(135deg,_rgba(17,24,39,0.98),_rgba(3,7,18,0.96))] p-8">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,_rgba(14,165,233,0.12),_transparent_60%)]" />
          <div className="relative max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-300">
              <FlaskConical size={14} />
              Starknet Sepolia Liquidity
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                Mint WBTC and USDC on Starknet Sepolia in one click.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-gray-300">
                Use the live faucet contracts to provision wallet liquidity, shield fresh notes, and
                move straight into private swaps, auctions, and dark order entry.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-300">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Network: Starknet Sepolia
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Recipient: {address ? shortenAddress(address) : 'Connect wallet'}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr,0.6fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {faucetTokens.map((token) => (
              <TokenFaucetCard key={token.address} {...token} />
            ))}
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-gray-500">How To Use</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <p className="text-sm font-medium text-white">1. Mint Starknet liquidity</p>
                <p className="mt-1 text-sm text-gray-400">
                  Choose a preset or enter any amount. The faucet sends tokens to your connected wallet.
                </p>
              </div>
              <div className="flex items-center justify-center text-gray-600">
                <ArrowRight size={16} />
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <p className="text-sm font-medium text-white">2. Shield into the pool</p>
                <p className="mt-1 text-sm text-gray-400">
                  Head back to Swap and move those assets into the private note pool.
                </p>
              </div>
              <div className="flex items-center justify-center text-gray-600">
                <ArrowRight size={16} />
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <p className="text-sm font-medium text-white">3. Test the full flow</p>
                <p className="mt-1 text-sm text-gray-400">
                  Use fresh WBTC and USDC to move through the full DarkBTC flow without manual funding.
                </p>
              </div>
            </div>
          </div>
        </section>

        {faucetTokens.length === 0 && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            Faucet tokens are not configured yet. Set valid `VITE_WBTC_ADDRESS` and `VITE_USDC_ADDRESS`
            values after deploying the Starknet Sepolia token contracts.
          </div>
        )}
      </div>
    </div>
  );
}

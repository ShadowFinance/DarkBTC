import React from 'react';
import { ArrowUpDown, Lock, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import TokenInput from '../shared/TokenInput';
import { useSwapQuote, useExecuteSwap } from '../../hooks/useShieldedSwap';
import { useTokenBalance } from '../../hooks/useTokenBalance';
import { TOKENS } from '../../constants/tokens';
import type { Token } from '../../types';
import { useDarkBTCStore } from '../../store';
import {
  extractErrorMessage,
  formatTokenAmount,
  isConfiguredAddress,
  parseTokenAmount,
} from '../../lib/starknet';

const SLIPPAGE_PRESETS = ['0.5', '1.0', '2.0'];

export default function SwapPanel() {
  const swapTokens = TOKENS.filter((token) => isConfiguredAddress(token.address));
  const defaultInputToken = swapTokens[0] ?? TOKENS[0];
  const defaultOutputToken = swapTokens[1] ?? TOKENS[1];
  const [tokenIn, setTokenIn] = React.useState<Token>(defaultInputToken);
  const [tokenOut, setTokenOut] = React.useState<Token>(defaultOutputToken);
  const [amountIn, setAmountIn] = React.useState('');
  const [slippage, setSlippage] = React.useState('0.5');
  const [customSlippage, setCustomSlippage] = React.useState('');
  const [showConfirm, setShowConfirm] = React.useState(false);
  const { notes } = useDarkBTCStore();

  const effectiveSlippage = customSlippage || slippage;
  const amountInBigInt = amountIn
    ? parseTokenAmount(amountIn, tokenIn.decimals)
    : 0n;
  const { data: walletBalance } = useTokenBalance(tokenIn.address);

  const shieldedNotes = notes.filter(
    (note) => !note.spent && note.assetAddress.toLowerCase() === tokenIn.address.toLowerCase(),
  );
  const matchingNote = shieldedNotes.find((note) => note.amount === amountInBigInt);
  const shieldedBalance = shieldedNotes.reduce((total, note) => total + note.amount, 0n);

  const { data: quote, isLoading: quoteLoading } = useSwapQuote(
    tokenIn.address,
    tokenOut.address,
    amountInBigInt,
  );

  const {
    mutateAsync: executeSwap,
    isPending: swapPending,
    error: swapError,
  } = useExecuteSwap();

  function handleTokenInChange(nextToken: Token) {
    if (nextToken.address === tokenOut.address) {
      setTokenOut(tokenIn);
    }
    setTokenIn(nextToken);
    setAmountIn('');
  }

  function handleTokenOutChange(nextToken: Token) {
    if (nextToken.address === tokenIn.address) {
      setTokenIn(tokenOut);
    }
    setTokenOut(nextToken);
  }

  function flipTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
  }

  function priceImpactColor(bps: number): string {
    if (bps < 50) return 'text-green-400';
    if (bps < 200) return 'text-yellow-400';
    return 'text-red-400';
  }

  async function handleSwap() {
    if (!quote || amountInBigInt === 0n) return;

    const slippageNum = parseFloat(effectiveSlippage);
    if (isNaN(slippageNum) || slippageNum < 0 || slippageNum > 50) return;

    const slippageBps = Math.floor(slippageNum * 100);
    const minOut = (quote.outputAmount * BigInt(10000 - slippageBps)) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    await executeSwap({
      assetIn: tokenIn.address,
      assetOut: tokenOut.address,
      amountIn: amountInBigInt,
      expectedAmountOut: quote.outputAmount,
      minAmountOut: minOut,
      deadline,
    });

    setAmountIn('');
    setShowConfirm(false);
  }

  return (
    <div className="max-w-md mx-auto space-y-2">
      <TokenInput
        label="You Pay"
        token={tokenIn}
        amount={amountIn}
        onAmountChange={setAmountIn}
        onTokenChange={handleTokenInChange}
        tokens={swapTokens}
        disabled={swapPending}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Wallet Balance</p>
          <p className="mt-1 font-mono text-lg text-white">
            {formatTokenAmount(walletBalance ?? 0n, tokenIn.decimals)} {tokenIn.symbol}
          </p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Shielded Inventory</p>
          <p className="mt-1 font-mono text-lg text-white">
            {formatTokenAmount(shieldedBalance, tokenIn.decimals)} {tokenIn.symbol}
          </p>
        </div>
      </div>

      {shieldedNotes.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-900/40 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Spendable Notes</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {shieldedNotes.map((note) => {
              const noteLabel = `${formatTokenAmount(note.amount, tokenIn.decimals)} ${tokenIn.symbol}`;
              const isSelected = note.amount === amountInBigInt;
              return (
                <button
                  key={note.commitment}
                  type="button"
                  onClick={() => setAmountIn(formatTokenAmount(note.amount, tokenIn.decimals))}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                      : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600 hover:text-white',
                  )}
                >
                  {noteLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={flipTokens}
          className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors"
        >
          <ArrowUpDown size={16} className="text-gray-400" />
        </button>
      </div>

      <TokenInput
        label="You Receive"
        token={tokenOut}
        amount={quote ? formatTokenAmount(quote.outputAmount, tokenOut.decimals) : ''}
        onAmountChange={() => {}}
        onTokenChange={handleTokenOutChange}
        tokens={swapTokens}
        disabled
      />

      {/* Quote details */}
      {quote && (
        <div className="rounded-xl bg-gray-800/40 border border-gray-700 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Price Impact</span>
            <span className={priceImpactColor(quote.priceImpactBps)}>
              {(quote.priceImpactBps / 100).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fee</span>
            <span className="text-gray-300">{quote.feeBps / 100}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Execution Note</span>
            <span className={matchingNote ? 'text-emerald-300' : 'text-amber-300'}>
              {matchingNote ? 'Exact note ready' : 'Exact note required'}
            </span>
          </div>
        </div>
      )}

      {/* Slippage tabs */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-500">Slippage:</span>
        <div className="flex gap-1">
          {SLIPPAGE_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => { setSlippage(s); setCustomSlippage(''); }}
              className={clsx(
                'px-2.5 py-1 rounded text-xs transition-colors',
                slippage === s && !customSlippage
                  ? 'bg-amber-500 text-black font-semibold'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
              )}
            >
              {s}%
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="Custom"
          value={customSlippage}
          onChange={(e) => setCustomSlippage(e.target.value)}
          className="w-20 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 outline-none focus:border-amber-500"
        />
      </div>

      {/* Privacy note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-800/30 border border-gray-700/50 text-xs text-gray-500">
        <Lock size={12} className="mt-0.5 text-amber-500 shrink-0" />
        <span>Trade amounts and counterparties stay hidden behind opaque Starknet commitments.</span>
      </div>

      {amountInBigInt > 0n && !matchingNote && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Swaps currently spend one shielded note at a time. Shield the exact amount you want to trade, then come back to execute the swap safely.
        </div>
      )}

      {quote && quote.priceImpactBps > 500 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-xs text-red-400">
          <AlertTriangle size={12} />
          High price impact ({(quote.priceImpactBps / 100).toFixed(2)}%). Proceed with caution.
        </div>
      )}

      <button
        disabled={!quote || amountInBigInt === 0n || swapPending || quoteLoading || !matchingNote}
        onClick={() => setShowConfirm(true)}
        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {swapPending
          ? 'Swapping…'
          : quoteLoading
            ? 'Getting quote…'
            : !matchingNote && amountInBigInt > 0n
              ? 'Create Exact Note First'
              : 'Swap Privately'}
      </button>

      {swapError && (
        <p className="text-sm text-rose-300">{extractErrorMessage(swapError)}</p>
      )}

      {showConfirm && quote && (
        <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 space-y-3">
          <p className="text-sm font-semibold">Confirm Swap</p>
          <p className="text-xs text-gray-400">
            {amountIn} {tokenIn.symbol} → {formatTokenAmount(quote.outputAmount, tokenOut.decimals)} {tokenOut.symbol}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 rounded-lg bg-gray-700 text-sm hover:bg-gray-600 transition-colors">Cancel</button>
            <button onClick={handleSwap} disabled={swapPending} className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-50">
              {swapPending ? 'Signing…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

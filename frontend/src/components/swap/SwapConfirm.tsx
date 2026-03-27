import type { SwapQuote, Token } from '../../types';
import { formatTokenAmount } from '../../lib/starknet';

interface SwapConfirmProps {
  quote: SwapQuote;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export default function SwapConfirm({ quote, tokenIn, tokenOut, amountIn, onConfirm, onCancel, isPending }: SwapConfirmProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">You Pay</span>
          <span>{amountIn} {tokenIn.symbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">You Receive</span>
          <span className="text-green-400">{formatTokenAmount(quote.outputAmount, tokenOut.decimals)} {tokenOut.symbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Price Impact</span>
          <span>{(quote.priceImpactBps / 100).toFixed(2)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Protocol Fee</span>
          <span>{quote.feeBps / 100}%</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg bg-gray-700 text-sm hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {isPending ? 'Confirming…' : 'Confirm Swap'}
        </button>
      </div>
    </div>
  );
}

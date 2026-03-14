import React from 'react';
import { clsx } from 'clsx';
import type { Token } from '../../types';
import { TOKENS } from '../../constants/tokens';
import { formatTokenAmount } from '../../lib/starknet';
import { ChevronDown } from 'lucide-react';

interface TokenInputProps {
  label: string;
  token: Token | null;
  amount: string;
  onAmountChange: (value: string) => void;
  onTokenChange: (token: Token) => void;
  balance?: bigint;
  disabled?: boolean;
  usdValue?: number;
}

export default function TokenInput({
  label,
  token,
  amount,
  onAmountChange,
  onTokenChange,
  balance,
  disabled = false,
  usdValue,
}: TokenInputProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  function handleMax() {
    if (balance !== undefined && token) {
      onAmountChange(formatTokenAmount(balance, token.decimals));
    }
  }

  return (
    <div className="rounded-xl bg-gray-800/60 border border-gray-700 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        {balance !== undefined && token && (
          <button
            onClick={handleMax}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
            disabled={disabled}
          >
            Max: {formatTokenAmount(balance, token.decimals)}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-sm font-medium',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            disabled={disabled}
          >
            <span>{token?.symbol ?? 'Select'}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 w-40 rounded-lg bg-gray-800 border border-gray-700 shadow-xl overflow-hidden">
                {TOKENS.map((t) => (
                  <button
                    key={t.address}
                    onClick={() => { onTokenChange(t); setDropdownOpen(false); }}
                    className={clsx(
                      'flex flex-col w-full px-3 py-2.5 text-left hover:bg-gray-700 transition-colors',
                      token?.address === t.address && 'bg-gray-700',
                    )}
                  >
                    <span className="text-sm font-medium">{t.symbol}</span>
                    <span className="text-xs text-gray-500">{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          disabled={disabled}
          className="flex-1 bg-transparent text-right text-xl font-mono text-white placeholder-gray-600 outline-none disabled:opacity-50"
        />
      </div>

      {usdValue !== undefined && (
        <p className="text-xs text-gray-500 text-right mt-1">≈ ${usdValue.toLocaleString()}</p>
      )}
    </div>
  );
}

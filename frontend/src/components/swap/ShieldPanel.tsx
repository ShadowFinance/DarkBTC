import React from 'react';
import { Shield } from 'lucide-react';
import TokenInput from '../shared/TokenInput';
import { TOKENS } from '../../constants/tokens';
import type { Token } from '../../types';
import { useDeposit } from '../../hooks/useNotePool';
import { useDarkBTCStore } from '../../store';
import { formatTokenAmount, isConfiguredAddress, parseTokenAmount } from '../../lib/starknet';

export default function ShieldPanel() {
  const depositableTokens = TOKENS.filter((token) => isConfiguredAddress(token.address));
  const [token, setToken] = React.useState<Token>(depositableTokens[0] ?? TOKENS[0]);
  const [amount, setAmount] = React.useState('');
  const { notes } = useDarkBTCStore();
  const { mutateAsync: deposit, isPending } = useDeposit();

  const shieldedBalance = notes
    .filter((note) => !note.spent && note.assetAddress.toLowerCase() === token.address.toLowerCase())
    .reduce((total, note) => total + note.amount, 0n);

  async function handleDeposit() {
    if (!amount) return;
    await deposit({
      asset: token.address,
      amount: parseTokenAmount(amount, token.decimals),
    });
    setAmount('');
  }

  return (
    <div className="rounded-2xl bg-gray-800/40 border border-gray-700 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
          <Shield size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Shield Funds</h2>
          <p className="text-xs text-gray-500">
            Deposit into the note pool first so you can swap with private commitments.
          </p>
        </div>
      </div>

      <TokenInput
        label="Deposit Token"
        token={token}
        amount={amount}
        onAmountChange={setAmount}
        onTokenChange={setToken}
        tokens={depositableTokens}
      />

      <div className="rounded-xl bg-gray-900/50 border border-gray-700 px-4 py-3">
        <p className="text-xs text-gray-500">Available shielded balance</p>
        <p className="mt-1 font-mono text-lg text-white">
          {formatTokenAmount(shieldedBalance, token.decimals)} {token.symbol}
        </p>
      </div>

      <button
        onClick={handleDeposit}
        disabled={!amount || isPending || !depositableTokens.length}
        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Depositing…' : 'Shield Deposit'}
      </button>
    </div>
  );
}

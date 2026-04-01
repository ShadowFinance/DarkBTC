import React from 'react';
import { clsx } from 'clsx';
import { useSubmitOrder } from '../../hooks/useDarkOrderbook';
import { TOKENS } from '../../constants/tokens';
import type { Token } from '../../types';
import { isConfiguredAddress, parseTokenAmount } from '../../lib/starknet';
import TokenInput from '../shared/TokenInput';

export default function OrderPanel() {
  const assetOptions = TOKENS.filter((token) => token.symbol !== 'USDC' && isConfiguredAddress(token.address));
  const collateralToken = TOKENS.find((token) => token.symbol === 'USDC') ?? TOKENS[1];
  const [side, setSide] = React.useState<'Buy' | 'Sell'>('Buy');
  const [assetToken, setAssetToken] = React.useState<Token>(assetOptions[0] ?? TOKENS[0]);
  const [amount, setAmount] = React.useState('');
  const [price, setPrice] = React.useState('');

  const { mutateAsync: submitOrder, isPending } = useSubmitOrder();

  const collateralAmount =
    amount && price
      ? parseTokenAmount(amount, assetToken.decimals) *
        parseTokenAmount(price, collateralToken.decimals) /
        10n ** BigInt(collateralToken.decimals)
      : 0n;

  async function handleSubmit() {
    if (!amount || !price) return;

    await submitOrder({
      side,
      assetId: assetToken.address,
      amount: parseTokenAmount(amount, assetToken.decimals),
      price: parseTokenAmount(price, collateralToken.decimals),
      collateralAmount,
      collateralAsset: collateralToken.address,
    });

    setAmount('');
    setPrice('');
  }

  return (
    <div className="space-y-4">
      {/* Side toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        {(['Buy', 'Sell'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={clsx(
              'flex-1 py-2.5 text-sm font-semibold transition-colors',
              side === s
                ? s === 'Buy'
                  ? 'bg-green-600 text-white'
                  : 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Asset selector */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Asset</label>
        <TokenInput
          label="Asset"
          token={assetToken}
          amount={amount}
          onAmountChange={setAmount}
          onTokenChange={setAssetToken}
          tokens={assetOptions}
        />
      </div>

      {/* Price input */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Limit Price ({collateralToken.symbol})</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="50000.00"
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono outline-none focus:border-amber-500"
        />
      </div>

      {/* Collateral preview */}
      {collateralAmount > 0n && (
        <div className="text-xs text-gray-500">
          Required collateral:{' '}
          <span className="text-white font-mono">
            {(Number(collateralAmount) / 10 ** collateralToken.decimals).toFixed(2)} {collateralToken.symbol}
          </span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!amount || !price || isPending || !assetOptions.length}
        className={clsx(
          'w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          side === 'Buy' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white',
        )}
      >
        {isPending ? 'Submitting…' : `Submit ${side} Order`}
      </button>
    </div>
  );
}

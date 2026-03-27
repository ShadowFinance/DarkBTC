import SwapPanel from '../components/swap/SwapPanel';

export default function SwapPage() {
  return (
    <div className="p-6">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Private Swap</h1>
          <p className="text-sm text-gray-500 mt-1">
            Trade BTC and stablecoins privately. No amounts or counterparties are revealed on-chain.
          </p>
        </div>
        <SwapPanel />
      </div>
    </div>
  );
}

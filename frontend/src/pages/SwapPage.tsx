import SwapPanel from '../components/swap/SwapPanel';
import ShieldPanel from '../components/swap/ShieldPanel';

export default function SwapPage() {
  return (
    <div className="p-6 pb-28 sm:pb-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Private Swap</h1>
          <p className="text-sm text-gray-500 mt-1">
            Trade BTC and stablecoins privately. No amounts or counterparties are revealed on-chain.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <SwapPanel />
          <ShieldPanel />
        </div>
      </div>
    </div>
  );
}

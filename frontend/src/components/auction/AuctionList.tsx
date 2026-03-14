import { useAuctions } from '../../hooks/useSealedAuction';
import AuctionCard from './AuctionCard';
import type { AuctionStateType } from '../../types';

const FILTER_TABS: { label: string; value: AuctionStateType | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Commit', value: 'CommitPhase' },
  { label: 'Reveal', value: 'RevealPhase' },
  { label: 'Settled', value: 'Settled' },
];

import React from 'react';

export default function AuctionList() {
  const [filter, setFilter] = React.useState<AuctionStateType | undefined>(undefined);
  const { data: auctions, isLoading, isError } = useAuctions(filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === tab.value
                ? 'bg-amber-500 text-black font-semibold'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-12 text-gray-500">Loading auctions…</div>
      )}

      {isError && (
        <div className="text-center py-12 text-red-400">Failed to load auctions</div>
      )}

      {auctions && auctions.length === 0 && (
        <div className="text-center py-12 text-gray-500">No auctions found</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {auctions?.map((auction) => (
          <AuctionCard key={auction.id.toString()} auction={auction} />
        ))}
      </div>
    </div>
  );
}

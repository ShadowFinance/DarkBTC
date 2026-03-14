import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { AuctionItem } from '../../types';
import StatusBadge from '../shared/StatusBadge';
import { useDarkBTCStore } from '../../store';
import BidModal from './BidModal';

interface AuctionCardProps {
  auction: AuctionItem;
}

function useCountdown(targetTimestamp: number) {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const interval = setInterval(forceUpdate, 1000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now() / 1000;
  const diff = targetTimestamp - now;
  if (diff <= 0) return 'Ended';

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function AuctionCard({ auction }: AuctionCardProps) {
  const [bidModalOpen, setBidModalOpen] = React.useState(false);
  const { getBidSecret } = useDarkBTCStore();
  const hasCommitted = !!getBidSecret(auction.id);

  const activeTarget =
    auction.state === 'CommitPhase' ? auction.commitEnd : auction.revealEnd;
  const countdown = useCountdown(activeTarget);

  const canBid = auction.state === 'CommitPhase';
  const canReveal = auction.state === 'RevealPhase' && hasCommitted;

  return (
    <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-5 space-y-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-sm text-gray-400 truncate max-w-[120px]">
            {auction.assetId.slice(0, 8)}…
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {auction.bidCount.toString()} bid{auction.bidCount !== 1n ? 's' : ''}
          </p>
        </div>
        <StatusBadge status={auction.state} />
      </div>

      {(auction.state === 'CommitPhase' || auction.state === 'RevealPhase') && (
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-0.5">
            {auction.state === 'CommitPhase' ? 'Commit closes in' : 'Reveal closes in'}
          </p>
          <p className="font-mono text-2xl text-amber-400">{countdown}</p>
        </div>
      )}

      {auction.state === 'Settled' && (
        <p className="text-xs text-gray-500">
          Settled {formatDistanceToNow(auction.revealEnd * 1000, { addSuffix: true })}
        </p>
      )}

      {(canBid || canReveal) && (
        <button
          onClick={() => setBidModalOpen(true)}
          className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors"
        >
          {canReveal ? 'Reveal Bid' : 'Place Bid'}
        </button>
      )}

      {bidModalOpen && (
        <BidModal
          auction={auction}
          open={bidModalOpen}
          onClose={() => setBidModalOpen(false)}
        />
      )}
    </div>
  );
}

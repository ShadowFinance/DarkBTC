import React from 'react';
import { Copy, Check, ShieldAlert } from 'lucide-react';
import Modal from '../shared/Modal';
import { useCommitBid, useRevealBid } from '../../hooks/useSealedAuction';
import { useDarkBTCStore } from '../../store';
import type { AuctionItem } from '../../types';
import { parseTokenAmount } from '../../lib/starknet';

interface BidModalProps {
  auction: AuctionItem;
  open: boolean;
  onClose: () => void;
}

export default function BidModal({ auction, open, onClose }: BidModalProps) {
  const [amount, setAmount] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const { getBidSecret } = useDarkBTCStore();
  const bidSecret = getBidSecret(auction.id);
  const isRevealPhase = auction.state === 'RevealPhase';

  const { mutateAsync: commitBid, isPending: committing } = useCommitBid();
  const { mutateAsync: revealBid, isPending: revealing } = useRevealBid();

  async function handleCommit() {
    if (!amount) return;
    const amountBigInt = parseTokenAmount(amount, 8);
    await commitBid({ auctionId: auction.id, amount: amountBigInt });
    onClose();
  }

  async function handleReveal() {
    await revealBid({ auctionId: auction.id });
    onClose();
  }

  function copySecret() {
    if (bidSecret) {
      navigator.clipboard.writeText(bidSecret.secret).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRevealPhase ? 'Reveal Bid' : 'Place Sealed Bid'}
    >
      {isRevealPhase && bidSecret ? (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
            <p className="text-xs text-gray-500 mb-1">Your bid amount</p>
            <p className="font-mono text-lg text-white">
              {(Number(bidSecret.amount) / 1e8).toFixed(8)} BTC
            </p>
          </div>

          <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Secret</p>
              <button onClick={copySecret} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="font-mono text-xs text-gray-300 break-all">{bidSecret.secret}</p>
          </div>

          <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
            <p className="text-xs text-gray-500 mb-1">Commitment</p>
            <p className="font-mono text-xs text-gray-300 break-all">{bidSecret.commitment}</p>
          </div>

          <button
            onClick={handleReveal}
            disabled={revealing}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors disabled:opacity-50"
          >
            {revealing ? 'Revealing…' : 'Reveal Bid On-Chain'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Bid Amount (BTC)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.001"
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-400">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <span>
              A secret will be generated and saved locally. You must keep it to reveal your bid. Never share it.
            </span>
          </div>

          <button
            onClick={handleCommit}
            disabled={!amount || committing}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors disabled:opacity-50"
          >
            {committing ? 'Submitting…' : 'Submit Sealed Bid'}
          </button>
        </div>
      )}
    </Modal>
  );
}

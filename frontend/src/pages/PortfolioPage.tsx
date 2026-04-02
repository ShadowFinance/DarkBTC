import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts';
import { useDarkBTCStore } from '../store';
import { useCancelOrder } from '../hooks/useDarkOrderbook';
import StatusBadge from '../components/shared/StatusBadge';
import { TOKENS } from '../constants/tokens';
import { format } from 'date-fns';
import { extractErrorMessage, formatTokenAmount } from '../lib/starknet';

export default function PortfolioPage() {
  const { notes, myOrders } = useDarkBTCStore();
  const [revealedNotes, setRevealedNotes] = React.useState<Set<string>>(new Set());
  const {
    mutateAsync: cancelOrder,
    isPending: cancelling,
    error: cancelError,
  } = useCancelOrder();

  function toggleReveal(commitment: string) {
    setRevealedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(commitment)) next.delete(commitment);
      else next.add(commitment);
      return next;
    });
  }

  // Compute total shielded value per asset
  const shieldedByAsset: Record<string, bigint> = {};
  for (const note of notes) {
    if (!note.spent) {
      shieldedByAsset[note.assetAddress] =
        (shieldedByAsset[note.assetAddress] ?? 0n) + note.amount;
    }
  }

  // Privacy gauge data
  const totalNotes = notes.length;
  const spentNotes = notes.filter((n) => n.spent).length;
  const privacyScore = totalNotes > 0 ? Math.round(((totalNotes - spentNotes) / totalNotes) * 100) : 0;
  const gaugeData = [{ name: 'Privacy', value: privacyScore, fill: '#f59e0b' }];

  const unfilledOrders = myOrders.filter((o) => !o.isFilled && !o.isCancelled);

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          <p className="text-sm text-gray-500 mt-1">Your shielded assets and private orders.</p>
        </div>

        {/* Section 1: Shielded Notes */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Shielded Notes</h2>
          <div className="rounded-xl bg-gray-800/40 border border-gray-700 overflow-hidden">
            {notes.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-sm">No shielded notes</div>
            )}
            {notes.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left px-4 py-2">Asset</th>
                    <th className="text-left px-4 py-2">Amount</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {notes.map((note) => {
                    const token = TOKENS.find((t) => t.address.toLowerCase() === note.assetAddress.toLowerCase());
                    const isRevealed = revealedNotes.has(note.commitment);
                    return (
                      <tr key={note.commitment} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{token?.symbol ?? 'Unknown'}</td>
                        <td className="px-4 py-3 font-mono">
                          <div className="flex items-center gap-2">
                            <span>{isRevealed ? formatTokenAmount(note.amount, token?.decimals ?? 18) : '••••••'}</span>
                            <button
                              onClick={() => toggleReveal(note.commitment)}
                              className="text-gray-500 hover:text-gray-300 transition-colors"
                            >
                              {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={note.spent ? 'cancelled' : 'active'} />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {format(note.createdAt, 'MM/dd/yy HH:mm')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {cancelError && (
            <div className="border-t border-gray-800 px-4 py-3 text-sm text-rose-300">
              {extractErrorMessage(cancelError)}
            </div>
          )}
        </section>

        {/* Section 2: My Orders */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">My Orders</h2>
          <div className="rounded-xl bg-gray-800/40 border border-gray-700 overflow-hidden">
            {myOrders.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-sm">No orders placed</div>
            )}
            {myOrders.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left px-4 py-2">Side</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Order ID</th>
                    <th className="text-right px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {myOrders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={order.side === 'Buy' ? 'text-green-400' : 'text-red-400'}>
                          {order.side}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.isFilled ? 'filled' : order.isCancelled ? 'cancelled' : 'open'} />
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-400">
                        {order.orderId.slice(0, 10)}…
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!order.isFilled && !order.isCancelled && (
                          <button
                            onClick={() => cancelOrder({ orderId: order.orderId })}
                            disabled={cancelling}
                            className="px-2 py-1 rounded bg-red-900/40 text-red-400 hover:bg-red-900/70 text-xs transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Section 3: Shielded value by asset */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Total Shielded Value</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TOKENS.map((token) => {
              const value = shieldedByAsset[token.address] ?? 0n;
              return (
                <div key={token.address} className="rounded-xl bg-gray-800/40 border border-gray-700 p-4">
                  <p className="text-xs text-gray-500">{token.name}</p>
                  <p className="text-2xl font-mono font-bold mt-1">
                    {value > 0n ? formatTokenAmount(value, token.decimals) : '0'}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{token.symbol}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 4: Privacy gauge */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Privacy Score</h2>
          <div className="rounded-xl bg-gray-800/40 border border-gray-700 p-6">
            <div className="flex items-center gap-6">
              <div style={{ width: 160, height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="90%"
                    startAngle={90}
                    endAngle={-270}
                    data={gaugeData}
                  >
                    <RadialBar dataKey="value" cornerRadius={6} />
                    <Legend />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-4xl font-mono font-bold text-amber-400">{privacyScore}%</p>
                <p className="text-sm text-gray-500 mt-1">
                  {unfilledOrders.length} active orders · {notes.filter((n) => !n.spent).length} unspent notes
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

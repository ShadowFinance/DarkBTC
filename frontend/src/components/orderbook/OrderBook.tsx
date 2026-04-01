import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useRecentFills } from '../../hooks/useDarkOrderbook';

export default function OrderBook() {
  const { data: fills, isLoading } = useRecentFills();

  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const chartData = Array.from({ length: 24 }, (_, index) => ({
    hour: format(start + index * 60 * 60 * 1000, 'HH:mm'),
    fills: 0,
  }));

  for (const fill of fills ?? []) {
    const timestampMs = fill.timestamp > 1_000_000_000_000 ? fill.timestamp : fill.timestamp * 1000;
    if (timestampMs < start || timestampMs > now) continue;
    const bucketIndex = Math.min(23, Math.floor((timestampMs - start) / (60 * 60 * 1000)));
    chartData[bucketIndex].fills += 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">
          Dark Orderbook — order depths are private.
        </h2>
        <span className="text-xs text-gray-600">{fills?.length ?? 0} recent fills</span>
      </div>

      {/* Fills per hour chart */}
      <div className="rounded-xl bg-gray-800/40 border border-gray-700 p-4">
        <p className="text-xs text-gray-500 mb-3">Fills (last 24h)</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#6b7280' }} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Bar dataKey="fills" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent fills table */}
      <div className="rounded-xl bg-gray-800/40 border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-xs font-medium text-gray-400">Recent Fills</p>
        </div>

        {isLoading && <div className="py-8 text-center text-gray-500 text-sm">Loading…</div>}

        {!isLoading && (!fills || fills.length === 0) && (
          <div className="py-8 text-center text-gray-500 text-sm">No fills yet</div>
        )}

        {fills && fills.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left px-4 py-2">Order</th>
                <th className="text-left px-4 py-2">Fill Proof Hash</th>
                <th className="text-right px-4 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {fills.map((fill) => {
                const timestampMs = fill.timestamp > 1_000_000_000_000 ? fill.timestamp : fill.timestamp * 1000;
                return (
                  <tr key={`${fill.orderId}-${fill.fillProof}`} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-gray-400">
                      {fill.orderId.slice(0, 10)}…{fill.orderId.slice(-4)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-300">
                      {fill.fillProof.slice(0, 10)}…{fill.fillProof.slice(-6)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">
                      {format(timestampMs, 'MMM dd HH:mm:ss')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

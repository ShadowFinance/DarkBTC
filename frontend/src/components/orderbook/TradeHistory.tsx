import { format } from 'date-fns';
import { useDarkBTCStore } from '../../store';
import { useCancelOrder } from '../../hooks/useDarkOrderbook';
import StatusBadge from '../shared/StatusBadge';
import { TOKEN_MAP } from '../../constants/tokens';
import { extractErrorMessage, formatTokenAmount } from '../../lib/starknet';

export default function TradeHistory() {
  const { myOrders } = useDarkBTCStore();
  const {
    mutateAsync: cancelOrder,
    isPending,
    error,
  } = useCancelOrder();

  const sortedOrders = [...myOrders].sort((left, right) => right.timestamp - left.timestamp);
  const openOrders = sortedOrders.filter((order) => !order.isFilled && !order.isCancelled);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-700 bg-gray-800/40">
        <div className="border-b border-gray-700 px-4 py-3">
          <p className="text-sm font-medium text-gray-300">Open Orders</p>
          <p className="mt-1 text-xs text-gray-500">
            Unfilled orders stay visible here until they are filled or cancelled.
          </p>
        </div>

        {openOrders.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">No open orders right now</div>
        )}

        {openOrders.length > 0 && (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {openOrders.map((order) => {
              const assetToken = TOKEN_MAP[order.assetId.toLowerCase()];

              return (
                <div
                  key={order.orderId}
                  className="rounded-xl border border-gray-700 bg-gray-900/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {assetToken?.symbol ?? 'Asset'} {order.side}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {format(order.timestamp, 'MMM dd, HH:mm')}
                      </p>
                    </div>
                    <StatusBadge status="open" />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">Amount</p>
                      <p className="mt-1 font-mono text-sm text-white">
                        {formatTokenAmount(order.amount, assetToken?.decimals ?? 18)}{' '}
                        {assetToken?.symbol ?? ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">
                        Limit Price
                      </p>
                      <p className="mt-1 font-mono text-sm text-white">
                        {formatTokenAmount(order.price, 18)} USDC
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-[11px] text-gray-500">
                      {order.orderId}
                    </p>
                    <button
                      onClick={() => cancelOrder({ orderId: order.orderId })}
                      disabled={isPending}
                      className="shrink-0 rounded bg-red-900/40 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/70 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/40">
        <div className="border-b border-gray-700 px-4 py-3">
          <p className="text-sm font-medium text-gray-300">Recent Order Activity</p>
          <p className="mt-1 text-xs text-gray-500">
            Your newest local order submissions appear first.
          </p>
        </div>

        {sortedOrders.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">No orders placed yet</div>
        )}

        {sortedOrders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-500">
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-left">Asset</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Price</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedOrders.map((order) => {
                  const assetToken = TOKEN_MAP[order.assetId.toLowerCase()];

                  return (
                    <tr key={order.orderId} className="transition-colors hover:bg-gray-800/30">
                      <td className="px-4 py-2.5">
                        <span className={order.side === 'Buy' ? 'text-green-400' : 'text-red-400'}>
                          {order.side}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-300">
                        {assetToken?.symbol ?? 'Unknown'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-300">
                        {formatTokenAmount(order.amount, assetToken?.decimals ?? 18)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-300">
                        {formatTokenAmount(order.price, 18)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          status={order.isFilled ? 'filled' : order.isCancelled ? 'cancelled' : 'open'}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">
                        {format(order.timestamp, 'MM/dd HH:mm')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div className="border-t border-gray-800 px-4 py-3 text-sm text-rose-300">
            {extractErrorMessage(error)}
          </div>
        )}
      </div>
    </div>
  );
}

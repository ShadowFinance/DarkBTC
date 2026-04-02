import { format } from 'date-fns';
import { useDarkBTCStore } from '../../store';
import { useCancelOrder } from '../../hooks/useDarkOrderbook';
import StatusBadge from '../shared/StatusBadge';
import { extractErrorMessage } from '../../lib/starknet';

export default function TradeHistory() {
  const { myOrders } = useDarkBTCStore();
  const {
    mutateAsync: cancelOrder,
    isPending,
    error,
  } = useCancelOrder();

  return (
    <div className="rounded-xl bg-gray-800/40 border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700">
        <p className="text-sm font-medium text-gray-300">My Orders</p>
      </div>

      {myOrders.length === 0 && (
        <div className="py-8 text-center text-gray-500 text-sm">No orders placed yet</div>
      )}

      {myOrders.length > 0 && (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left px-4 py-2">Side</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Commitment</th>
                <th className="text-right px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {myOrders.map((order) => (
                <tr key={order.orderId} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={order.side === 'Buy' ? 'text-green-400' : 'text-red-400'}>
                      {order.side}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge
                      status={order.isFilled ? 'filled' : order.isCancelled ? 'cancelled' : 'open'}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-400">
                    {order.orderId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {format(order.timestamp, 'MM/dd HH:mm')}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!order.isFilled && !order.isCancelled && (
                      <button
                        onClick={() => cancelOrder({ orderId: order.orderId })}
                        disabled={isPending}
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
          {error && (
            <div className="border-t border-gray-800 px-4 py-3 text-sm text-rose-300">
              {extractErrorMessage(error)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

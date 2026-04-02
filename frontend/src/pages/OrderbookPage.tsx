import OrderPanel from '../components/orderbook/OrderPanel';
import OrderBook from '../components/orderbook/OrderBook';
import TradeHistory from '../components/orderbook/TradeHistory';

export default function OrderbookPage() {
  return (
    <div className="p-6 pb-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Dark Orderbook</h1>
          <p className="text-sm text-gray-500 mt-1">
            Private CLOB — order intent is never revealed until fill.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-1">
            <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">Place Order</h2>
              <OrderPanel />
            </div>
          </div>
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <OrderBook />
            <TradeHistory />
          </div>
        </div>
      </div>
    </div>
  );
}

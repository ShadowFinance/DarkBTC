import AuctionList from '../components/auction/AuctionList';

export default function AuctionPage() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Sealed-Bid Auctions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Commit-reveal auctions with ZK bid hashes. Losing bids stay hidden forever.
          </p>
        </div>
        <AuctionList />
      </div>
    </div>
  );
}

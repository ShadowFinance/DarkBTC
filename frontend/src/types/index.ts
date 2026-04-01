export type HexString = `0x${string}`;

export interface ShieldedNote {
  commitment: HexString;
  nullifier: HexString;
  secret: HexString;
  assetAddress: HexString;
  amount: bigint;
  leafIndex: number;
  merkleProof?: HexString[];
  merkleIndices?: number;
  spent: boolean;
  createdAt: number;
}

export interface AuctionItem {
  id: bigint;
  assetId: HexString;
  state: AuctionStateType;
  commitEnd: number;
  revealEnd: number;
  createdAt?: number;
  reservePrice?: bigint;
  currentWinner?: HexString;
  currentBid?: bigint;
  bidCount: bigint;
}

export type AuctionStateType = 'Pending' | 'CommitPhase' | 'RevealPhase' | 'Settled' | 'Cancelled';

export interface PrivateOrder {
  orderId: HexString;
  side: 'Buy' | 'Sell';
  assetId: HexString;
  amount: bigint;
  price: bigint;
  secret: HexString;
  isFilled: boolean;
  isCancelled: boolean;
  timestamp: number;
}

export interface SwapQuote {
  inputAmount: bigint;
  outputAmount: bigint;
  priceImpactBps: number;
  feeBps: number;
  assetIn: HexString;
  assetOut: HexString;
}

export interface Token {
  symbol: string;
  name: string;
  address: HexString;
  decimals: number;
}

export interface PendingTx {
  hash: HexString;
  description: string;
  timestamp: number;
}

export interface BidSecret {
  auctionId: bigint;
  secret: HexString;
  amount: bigint;
  commitment: HexString;
}

export interface OrderFill {
  orderId: HexString;
  fillProof: HexString;
  timestamp: number;
  blockNumber?: number;
  transactionHash?: HexString;
}

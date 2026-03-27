import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShieldedNote, PrivateOrder, PendingTx, BidSecret, HexString } from '../types';

interface DarkBTCState {
  // Persisted
  notes: ShieldedNote[];
  myOrders: PrivateOrder[];
  bidSecrets: BidSecret[];

  // Session
  pendingTxs: PendingTx[];
  activeTab: string;

  // Note actions
  addNote: (note: ShieldedNote) => void;
  markNoteSpent: (commitment: HexString) => void;
  getUnspentNotes: (assetAddress: HexString) => ShieldedNote[];

  // Order actions
  addOrder: (order: PrivateOrder) => void;
  markOrderFilled: (orderId: HexString) => void;
  markOrderCancelled: (orderId: HexString) => void;

  // Bid secret actions
  saveBidSecret: (bid: BidSecret) => void;
  getBidSecret: (auctionId: bigint) => BidSecret | undefined;

  // Tx actions
  addPendingTx: (tx: PendingTx) => void;
  removePendingTx: (hash: HexString) => void;

  // UI actions
  setActiveTab: (tab: string) => void;
}

export const useDarkBTCStore = create<DarkBTCState>()(
  persist(
    (set, get) => ({
      notes: [],
      myOrders: [],
      bidSecrets: [],
      pendingTxs: [],
      activeTab: '/',

      addNote: (note) =>
        set((state) => ({ notes: [...state.notes, note] })),

      markNoteSpent: (commitment) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.commitment === commitment ? { ...n, spent: true } : n,
          ),
        })),

      getUnspentNotes: (assetAddress) =>
        get().notes.filter(
          (n) => !n.spent && n.assetAddress.toLowerCase() === assetAddress.toLowerCase(),
        ),

      addOrder: (order) =>
        set((state) => ({ myOrders: [...state.myOrders, order] })),

      markOrderFilled: (orderId) =>
        set((state) => ({
          myOrders: state.myOrders.map((o) =>
            o.orderId === orderId ? { ...o, isFilled: true } : o,
          ),
        })),

      markOrderCancelled: (orderId) =>
        set((state) => ({
          myOrders: state.myOrders.map((o) =>
            o.orderId === orderId ? { ...o, isCancelled: true } : o,
          ),
        })),

      saveBidSecret: (bid) =>
        set((state) => ({
          bidSecrets: [
            ...state.bidSecrets.filter((b) => b.auctionId !== bid.auctionId),
            bid,
          ],
        })),

      getBidSecret: (auctionId) =>
        get().bidSecrets.find((b) => b.auctionId === auctionId),

      addPendingTx: (tx) =>
        set((state) => ({ pendingTxs: [...state.pendingTxs, tx] })),

      removePendingTx: (hash) =>
        set((state) => ({
          pendingTxs: state.pendingTxs.filter((t) => t.hash !== hash),
        })),

      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: 'darkbtc-storage',
      partialize: (state) => ({
        notes: state.notes,
        myOrders: state.myOrders,
        bidSecrets: state.bidSecrets,
      }),
    },
  ),
);

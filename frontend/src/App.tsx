import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StarknetConfig, jsonRpcProvider } from '@starknet-react/core';
import { sepolia } from '@starknet-react/chains';
import Layout from './components/layout/Layout';
import SwapPage from './pages/SwapPage';
import AuctionPage from './pages/AuctionPage';
import OrderbookPage from './pages/OrderbookPage';
import PortfolioPage from './pages/PortfolioPage';
import FaucetPage from './pages/FaucetPage';
import { RPC_URL } from './constants/contracts';
import { walletConnectors } from './lib/wallet';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

const rpcProvider = jsonRpcProvider({ rpc: () => ({ nodeUrl: RPC_URL }) });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StarknetConfig
        autoConnect
        chains={[sepolia]}
        connectors={walletConnectors}
        provider={rpcProvider}
      >
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<SwapPage />} />
              <Route path="/auction" element={<AuctionPage />} />
              <Route path="/orderbook" element={<OrderbookPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/faucet" element={<FaucetPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StarknetConfig>
    </QueryClientProvider>
  );
}

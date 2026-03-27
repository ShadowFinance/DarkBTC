import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StarknetConfig, jsonRpcProvider } from '@starknet-react/core';
import { sepolia } from '@starknet-react/chains';
import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import Layout from './components/layout/Layout';
import SwapPage from './pages/SwapPage';
import AuctionPage from './pages/AuctionPage';
import OrderbookPage from './pages/OrderbookPage';
import PortfolioPage from './pages/PortfolioPage';
import { RPC_URL } from './constants/contracts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

const connectors = [
  new InjectedConnector({ options: { id: 'argentX' } }),
  new InjectedConnector({ options: { id: 'braavos' } }),
  new WebWalletConnector({ url: 'https://web.argent.xyz' }),
];

const rpcProvider = jsonRpcProvider({ rpc: () => ({ nodeUrl: RPC_URL }) });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StarknetConfig chains={[sepolia]} connectors={connectors} provider={rpcProvider}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<SwapPage />} />
              <Route path="/auction" element={<AuctionPage />} />
              <Route path="/orderbook" element={<OrderbookPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StarknetConfig>
    </QueryClientProvider>
  );
}

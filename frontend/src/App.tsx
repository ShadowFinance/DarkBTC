import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StarknetProvider } from '@starknet-react/core';
import { mainnet, sepolia } from '@starknet-react/chains';
import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import Layout from './components/layout/Layout';
import SwapPage from './pages/SwapPage';
import AuctionPage from './pages/AuctionPage';
import OrderbookPage from './pages/OrderbookPage';
import PortfolioPage from './pages/PortfolioPage';
import { RPC_URL } from './constants/contracts';
import { RpcProvider } from 'starknet';

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

function provider() {
  return new RpcProvider({ nodeUrl: RPC_URL });
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StarknetProvider chains={[sepolia, mainnet]} connectors={connectors} provider={provider}>
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
      </StarknetProvider>
    </QueryClientProvider>
  );
}

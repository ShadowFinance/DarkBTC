import React from 'react';
import { useAccount, useDisconnect } from '@starknet-react/core';
import { connect } from 'starknetkit';
import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import { Wallet, ChevronDown, LogOut, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { shortenAddress } from '../../lib/starknet';
import { CHAIN_ID } from '../../constants/contracts';

const connectors = [
  new InjectedConnector({ options: { id: 'argentX' } }),
  new InjectedConnector({ options: { id: 'braavos' } }),
  new WebWalletConnector({ url: 'https://web.argent.xyz' }),
];

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [showMenu, setShowMenu] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      await connect({
        modalMode: 'alwaysAsk',
        connectors,
      });
    } catch {
      // user dismissed
    } finally {
      setConnecting(false);
    }
  }

  if (!isConnected || !address) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-50"
      >
        <Wallet size={14} />
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
      >
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="font-mono text-gray-200">{shortenAddress(address)}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{CHAIN_ID}</span>
        <ChevronDown size={14} className={clsx('text-gray-400 transition-transform', showMenu && 'rotate-180')} />
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg bg-gray-800 border border-gray-700 shadow-xl overflow-hidden">
            <a
              href={`https://sepolia.starkscan.co/contract/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <ExternalLink size={14} />
              View on Starkscan
            </a>
            <button
              onClick={() => { disconnect(); setShowMenu(false); }}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}

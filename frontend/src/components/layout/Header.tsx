import { Menu, Clock } from 'lucide-react';
import ConnectButton from '../wallet/ConnectButton';
import { useDarkBTCStore } from '../../store';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { pendingTxs } = useDarkBTCStore();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
      <button
        className="lg:hidden p-1 rounded text-gray-400 hover:text-white"
        onClick={onMenuClick}
      >
        <Menu size={20} />
      </button>

      <div className="hidden lg:flex items-center gap-2">
        <span className="text-sm text-gray-500">Privacy-preserving Bitcoin trading on Starknet</span>
      </div>

      <div className="flex items-center gap-3">
        {pendingTxs.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            <Clock size={12} className="animate-pulse" />
            <span>{pendingTxs.length} pending</span>
          </div>
        )}
        <ConnectButton />
      </div>
    </header>
  );
}

import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ArrowLeftRight, Gavel, BookOpen, LayoutDashboard, FlaskConical, X } from 'lucide-react';
import { clsx } from 'clsx';
import Header from './Header';

const navItems = [
  { to: '/', label: 'Swap', icon: ArrowLeftRight },
  { to: '/auction', label: 'Auction', icon: Gavel },
  { to: '/orderbook', label: 'Orderbook', icon: BookOpen },
  { to: '/portfolio', label: 'Portfolio', icon: LayoutDashboard },
  { to: '/faucet', label: 'Faucet', icon: FlaskConical },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-gray-900 text-white overflow-x-hidden lg:h-screen lg:overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed lg:relative z-30 flex flex-col w-64 h-full bg-gray-950 border-r border-gray-800 transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <span className="text-lg font-bold text-amber-400 font-mono">⛓ DarkBTC</span>
          <button
            className="lg:hidden p-1 rounded text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50',
                )
              }
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">Starknet Sepolia</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { clsx } from 'clsx';

type StatusVariant = 'pending' | 'active' | 'reveal' | 'settled' | 'cancelled' | 'filled' | 'open';

interface StatusBadgeProps {
  status: StatusVariant | string;
  className?: string;
}

const VARIANT_STYLES: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-400',
  active: 'bg-green-900/50 text-green-400 border border-green-700/50',
  CommitPhase: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
  reveal: 'bg-amber-900/50 text-amber-400 border border-amber-700/50',
  RevealPhase: 'bg-amber-900/50 text-amber-400 border border-amber-700/50',
  settled: 'bg-purple-900/50 text-purple-400 border border-purple-700/50',
  Settled: 'bg-purple-900/50 text-purple-400 border border-purple-700/50',
  cancelled: 'bg-red-900/50 text-red-400 border border-red-700/50',
  Cancelled: 'bg-red-900/50 text-red-400 border border-red-700/50',
  filled: 'bg-green-900/50 text-green-400 border border-green-700/50',
  open: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = VARIANT_STYLES[status] ?? 'bg-gray-700 text-gray-400';
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        style,
        className,
      )}
    >
      {status}
    </span>
  );
}

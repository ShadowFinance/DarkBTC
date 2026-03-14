import React from 'react';
import { clsx } from 'clsx';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  className?: string;
}

export default function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <span
      className={clsx('relative inline-flex items-center', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children ?? <HelpCircle size={14} className="text-gray-500 cursor-help" />}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-xs px-2.5 py-1.5 rounded-lg bg-gray-700 text-xs text-gray-200 shadow-xl border border-gray-600 whitespace-normal pointer-events-none">
          {content}
        </span>
      )}
    </span>
  );
}

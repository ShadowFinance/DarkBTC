import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (rect && (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/70 rounded-2xl bg-gray-900 border border-gray-700 text-white shadow-2xl p-0 w-full max-w-md animate-fade-in"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}

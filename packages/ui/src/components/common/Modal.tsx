/**
 * Modal — simple modal overlay.
 *
 * Centered card with title bar. Click backdrop or press Escape to close.
 */

import React, { useEffect, useCallback } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="waggle-modal-backdrop fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="waggle-modal-card bg-card border border-border rounded-lg min-w-[320px] max-w-[90vw] max-h-[80vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="waggle-modal-header flex items-center justify-between px-4 py-3 border-b border-border"
        >
          <h2 className="m-0 text-base text-foreground">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border-none text-muted-foreground cursor-pointer text-lg"
          >
            {'\u00D7'}
          </button>
        </div>
        <div
          className="waggle-modal-body p-4 overflow-auto text-foreground"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

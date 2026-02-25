/**
 * Dialog — Simple modal dialog component.
 * Adapted from drift-ui-template's dialog.tsx.
 * Uses CSS transitions instead of Radix for zero-dependency usage.
 */
import React from 'react';

/* ── Dialog Root ── */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      {/* Content wrapper */}
      <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-auto mx-4">
        {children}
      </div>
    </div>
  );
};

/* ── Dialog Content ── */

interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogContent: React.FC<DialogContentProps> = ({ className, children }) => (
  <div className={`bg-drift-panel border border-drift-border-lt rounded-xl shadow-2xl p-6 ${className ?? ''}`}>
    {children}
  </div>
);

/* ── Dialog Header ── */

export const DialogHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-4">{children}</div>
);

/* ── Dialog Title ── */

export const DialogTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h2 className={`text-base font-bold text-txt-0 ${className ?? ''}`}>{children}</h2>
);

/* ── Dialog Description ── */

export const DialogDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[12px] text-txt-2 mt-2 leading-relaxed">{children}</div>
);

/* ── Dialog Footer ── */

export const DialogFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex justify-end gap-2.5 mt-6">{children}</div>
);

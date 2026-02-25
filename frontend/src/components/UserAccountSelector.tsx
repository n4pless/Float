/**
 * UserAccountSelector — Dropdown in the header for switching sub-accounts.
 *
 * Adapted from drift-ui-template's UserAccountSelector component.
 * Shows the active account name + balance in a dropdown trigger,
 * with a list of all sub-accounts to switch between.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { User, ChevronDown, CheckCircle } from 'lucide-react';
import { useDriftStore } from '../stores/useDriftStore';

interface Props {
  onSwitchAccount: (subAccountId: number) => void;
}

export const UserAccountSelector: React.FC<Props> = ({ onSwitchAccount }) => {
  const { connected } = useWallet();
  const subAccounts = useDriftStore((s) => s.subAccounts);
  const activeSubAccountId = useDriftStore((s) => s.activeSubAccountId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!connected || subAccounts.length === 0) return null;

  const activeAccount = subAccounts.find((a) => a.subAccountId === activeSubAccountId) ?? subAccounts[0];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-drift-surface border border-drift-border hover:border-drift-border-lt transition-all"
      >
        <User className="w-3.5 h-3.5 text-accent" />
        <div className="flex flex-col items-start">
          <span className="text-[11px] font-semibold text-txt-0 leading-tight">
            {activeAccount?.name || `Account #${activeAccount?.subAccountId ?? 0}`}
          </span>
          <span className="text-[9px] text-txt-3 leading-tight">
            ${activeAccount?.totalCollateral.toFixed(2) ?? '0.00'}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 text-txt-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl shadow-2xl bg-drift-surface border border-drift-border-lt z-50 py-1.5">
          <div className="px-3 py-2 text-[10px] font-semibold text-txt-3 uppercase tracking-wider">
            Select User Account
          </div>
          <div className="h-px bg-drift-border mx-1.5" />
          {subAccounts.map((account) => {
            const isActive = account.subAccountId === activeSubAccountId;
            return (
              <button
                key={account.subAccountId}
                onClick={() => {
                  if (!isActive) onSwitchAccount(account.subAccountId);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-drift-input transition-colors ${
                  isActive ? 'bg-accent/5' : ''
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-drift-bg flex items-center justify-center">
                    <User className="w-3 h-3 text-txt-3" />
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-semibold text-txt-0">
                      {account.name || `Account #${account.subAccountId}`}
                    </p>
                    <p className="text-[9px] text-txt-3">
                      ID: {account.subAccountId} · ${account.totalCollateral.toFixed(2)}
                    </p>
                  </div>
                </div>
                {isActive && <CheckCircle className="w-3.5 h-3.5 text-bull" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

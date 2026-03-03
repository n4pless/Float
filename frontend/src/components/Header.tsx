import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Settings, ExternalLink, Droplets, Menu, X } from 'lucide-react';
import { UserAccountSelector } from './UserAccountSelector';

export type Page = 'trade' | 'user' | 'learn' | 'insurance' | 'positions';

interface HeaderProps {
  currentPage?: Page;
  onNavigate?: (page: Page) => void;
  onSwitchAccount?: (subAccountId: number) => void;
}

const NAV: { id: Page; label: string }[] = [
  { id: 'trade', label: 'Trade' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'user', label: 'Account' },
  { id: 'learn', label: 'Learn' },
  { id: 'positions', label: 'Positions' },
];

export const Header: React.FC<HeaderProps> = ({
  currentPage = 'trade',
  onNavigate,
  onSwitchAccount,
}) => {
  const { publicKey, connected } = useWallet();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* Close mobile menu on page change */
  useEffect(() => { setMobileMenuOpen(false); }, [currentPage]);

  return (
    <header className="relative h-11 flex items-center justify-between px-4 shrink-0 bg-drift-panel border-b border-drift-border z-40">
      {/* Left: Hamburger + Logo + Nav */}
      <div className="flex items-center gap-3 sm:gap-6 min-w-0">
        {/* Mobile hamburger button */}
        <button
          className="sm:hidden p-1 -ml-1 rounded text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          {mobileMenuOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-accent to-purple flex items-center justify-center">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4L12 22L22 4" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-[13px] text-txt-0 tracking-tight hidden sm:inline">Value</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-0">
          {NAV.map(n => (
            <button key={n.id}
              onClick={() => onNavigate?.(n.id)}
              className={`relative px-3 py-3 text-[12px] font-medium transition-colors ${
                currentPage === n.id
                  ? 'text-txt-0'
                  : 'text-txt-2 hover:text-txt-1'
              }`}>
              {n.label}
              {currentPage === n.id && (
                <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-txt-0 rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Right: Network + Faucet + Settings + Wallet */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-drift-surface border border-drift-border">
          <div className="w-1.5 h-1.5 rounded-full bg-bull" />
          <span className="text-[10px] text-txt-2 font-medium">Devnet</span>
        </div>

        <a
          href="https://faucet.solana.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium text-accent bg-accent/8 hover:bg-accent/12 transition-colors"
        >
          <Droplets className="w-3 h-3" />
          <span className="hidden sm:inline">Faucet</span>
        </a>

        {/* Settings dropdown — desktop only */}
        <div className="relative hidden sm:block">
          <button onClick={() => setShowSettings(!showSettings)}
            onBlur={() => setTimeout(() => setShowSettings(false), 150)}
            className="p-1.5 rounded hover:bg-drift-surface transition-colors text-txt-2 hover:text-txt-1">
            <Settings className="w-3.5 h-3.5" />
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1 w-48 py-1 rounded-md bg-drift-surface border border-drift-border z-50">
              <div className="px-3 py-1.5 text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Settings</div>
              <button className="w-full text-left px-3 py-2 text-[11px] text-txt-1 hover:bg-drift-active transition-colors flex items-center gap-2">
                <ExternalLink className="w-3 h-3 text-txt-3" />
                RPC Endpoint
              </button>
              <button className="w-full text-left px-3 py-2 text-[11px] text-txt-1 hover:bg-drift-active transition-colors flex items-center gap-2">
                <Settings className="w-3 h-3 text-txt-3" />
                Priority Fees
              </button>
            </div>
          )}
        </div>

        {/* SubAccount selector — desktop only */}
        {onSwitchAccount && (
          <div className="hidden sm:block">
            <UserAccountSelector onSwitchAccount={onSwitchAccount} />
          </div>
        )}

        <WalletMultiButton />
      </div>

      {/* ── Mobile menu dropdown ── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div className="sm:hidden fixed inset-0 top-11 bg-black/40 z-40" onClick={() => setMobileMenuOpen(false)} />

          {/* Menu panel */}
          <div className="sm:hidden absolute top-full left-0 right-0 bg-drift-panel border-b border-drift-border z-50">
            <div className="px-4 py-3 space-y-3">
              {/* Network status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-bull" />
                  <span className="text-[11px] text-txt-1 font-medium">Solana Devnet</span>
                </div>
                {connected && publicKey && (
                  <span className="text-[10px] text-txt-3 font-mono">
                    {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                  </span>
                )}
              </div>

              <div className="border-t border-drift-border" />

              {/* Faucet */}
              <a
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-1 text-[12px] text-accent font-medium"
              >
                <Droplets className="w-3.5 h-3.5" />
                Get Devnet SOL (Faucet)
                <ExternalLink className="w-3 h-3 ml-auto text-txt-3" />
              </a>

              <div className="border-t border-drift-border" />

              {/* Settings */}
              <div className="space-y-0.5">
                <div className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider mb-1">Settings</div>
                <button className="w-full text-left py-2 text-[12px] text-txt-1 hover:text-txt-0 flex items-center gap-2 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5 text-txt-3" />
                  RPC Endpoint
                </button>
                <button className="w-full text-left py-2 text-[12px] text-txt-1 hover:text-txt-0 flex items-center gap-2 transition-colors">
                  <Settings className="w-3.5 h-3.5 text-txt-3" />
                  Priority Fees
                </button>
              </div>

              {/* SubAccount selector */}
              {onSwitchAccount && (
                <>
                  <div className="border-t border-drift-border" />
                  <div>
                    <div className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider mb-2">Sub-Account</div>
                    <UserAccountSelector onSwitchAccount={onSwitchAccount} />
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
};

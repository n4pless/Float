import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Settings, ExternalLink, Droplets } from 'lucide-react';
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

  return (
    <header className="h-11 flex items-center justify-between px-4 shrink-0 bg-drift-panel border-b border-drift-border">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-accent to-purple flex items-center justify-center">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4L12 22L22 4" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-[13px] text-txt-0 tracking-tight hidden sm:inline">Value</span>
        </div>

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

        {onSwitchAccount && (
          <div className="hidden sm:block">
            <UserAccountSelector onSwitchAccount={onSwitchAccount} />
          </div>
        )}

        <WalletMultiButton />
      </div>
    </header>
  );
};

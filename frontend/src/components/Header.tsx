import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TrendingUp, Settings, ExternalLink, User, BookOpen, Droplets, Sparkles, Shield, Activity } from 'lucide-react';
import { UserAccountSelector } from './UserAccountSelector';

export type Page = 'trade' | 'user' | 'learn' | 'insurance' | 'positions';

interface HeaderProps {
  currentPage?: Page;
  onNavigate?: (page: Page) => void;
  onSwitchAccount?: (subAccountId: number) => void;
}

const NAV = [
  { id: 'trade' as const, label: 'Trade', icon: TrendingUp },
  { id: 'insurance' as const, label: 'Insurance', icon: Shield },
  { id: 'user' as const, label: 'User', icon: User },
  { id: 'learn' as const, label: 'Learn', icon: BookOpen },
  { id: 'positions' as const, label: 'Positions', icon: Activity },
];

export const Header: React.FC<HeaderProps> = ({
  currentPage = 'trade',
  onNavigate,
  onSwitchAccount,
}) => {
  const { publicKey, connected } = useWallet();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-6 shrink-0 glass border-b border-drift-border">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-2 sm:gap-8 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* "V" logo mark */}
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center shadow-lg shadow-accent/20">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4L12 22L22 4" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-semibold text-[14px] sm:text-[15px] text-txt-0 tracking-tight">Value</span>
        </div>

        <nav className="hidden sm:flex items-center gap-0.5">
          {NAV.map(n => (
            <button key={n.id}
              onClick={() => onNavigate?.(n.id)}
              className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-150 ${
                currentPage === n.id
                  ? 'bg-drift-surface text-txt-0'
                  : 'text-txt-2 hover:text-txt-1 hover:bg-[rgba(255,255,255,0.04)]'
              }`}>
              {n.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right: Network + Settings + Wallet */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Network badge — hidden on tiny screens */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-drift-surface border border-drift-border">
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          <span className="text-[11px] text-txt-1 font-medium">Devnet</span>
        </div>

        {/* Faucet link */}
        <a
          href="https://faucet.solana.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/15 transition-all duration-150"
        >
          <Droplets className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold hidden sm:inline">Faucet</span>
        </a>

        {/* Settings — hidden on mobile */}
        <div className="relative hidden sm:block">
          <button onClick={() => setShowSettings(!showSettings)}
            onBlur={() => setTimeout(() => setShowSettings(false), 150)}
            className="p-2 rounded-lg hover:bg-drift-surface transition-all duration-150 text-txt-2 hover:text-txt-0">
            <Settings className="w-4 h-4" />
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-xl shadow-2xl bg-drift-surface border border-drift-border-lt z-50">
              <div className="px-3 py-2 text-[11px] text-txt-3 font-semibold uppercase tracking-widest">Settings</div>
              <button className="w-full text-left px-3 py-2.5 text-[12px] text-txt-1 hover:bg-drift-input transition-colors duration-150 flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-txt-3" />
                RPC Endpoint
              </button>
              <button className="w-full text-left px-3 py-2.5 text-[12px] text-txt-1 hover:bg-drift-input transition-colors duration-150 flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-txt-3" />
                Priority Fees
              </button>
            </div>
          )}
        </div>

        {/* User Account Selector — hidden on mobile */}
        {onSwitchAccount && (
          <div className="hidden sm:block">
            <UserAccountSelector onSwitchAccount={onSwitchAccount} />
          </div>
        )}

        {/* Wallet connect / address button */}
        <WalletMultiButton />
      </div>
    </header>
  );
};

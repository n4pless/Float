import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TrendingUp, BarChart3, Wallet, Settings, ChevronDown, ExternalLink, User } from 'lucide-react';
import { UserAccountSelector } from './UserAccountSelector';

interface HeaderProps {
  currentPage?: 'trade' | 'user';
  onNavigate?: (page: 'trade' | 'user') => void;
  onSwitchAccount?: (subAccountId: number) => void;
}

const NAV = [
  { id: 'trade' as const, label: 'Trade', icon: TrendingUp },
  { id: 'user' as const, label: 'User', icon: User },
];

export const Header: React.FC<HeaderProps> = ({
  currentPage = 'trade',
  onNavigate,
  onSwitchAccount,
}) => {
  const { publicKey, connected } = useWallet();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="h-14 flex items-center justify-between px-3 sm:px-6 shrink-0 glass border-b border-drift-border">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-2 sm:gap-8 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-drift-surface border border-drift-border flex items-center justify-center">
            <span className="text-txt-2 font-bold text-xs">F</span>
          </div>
          <span className="font-semibold text-[15px] text-txt-0 tracking-tight">Float</span>
        </div>

        <nav className="flex items-center gap-0.5">
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
      <div className="flex items-center gap-2 shrink-0">
        {/* Network badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-drift-surface border border-drift-border">
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          <span className="text-[11px] text-txt-1 font-medium">Devnet</span>
        </div>

        {/* Settings */}
        <div className="relative">
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

        {/* User Account Selector */}
        {onSwitchAccount && (
          <UserAccountSelector onSwitchAccount={onSwitchAccount} />
        )}

        {/* Connected address */}
        {connected && publicKey && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-drift-surface border border-drift-border">
            <Wallet className="w-3.5 h-3.5 text-txt-2" />
            <span className="text-[11px] font-mono text-txt-1">
              {publicKey.toString().slice(0, 4)}…{publicKey.toString().slice(-4)}
            </span>
          </div>
        )}

        <WalletMultiButton />
      </div>
    </header>
  );
};

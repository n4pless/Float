import React, { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TrendingUp, Settings, ExternalLink, User, FileText, Droplets, Loader2 } from 'lucide-react';
import { UserAccountSelector } from './UserAccountSelector';
import { toast } from 'sonner';

export type Page = 'trade' | 'user' | 'docs';

interface HeaderProps {
  currentPage?: Page;
  onNavigate?: (page: Page) => void;
  onSwitchAccount?: (subAccountId: number) => void;
}

const NAV = [
  { id: 'trade' as const, label: 'Trade', icon: TrendingUp },
  { id: 'user' as const, label: 'User', icon: User },
  { id: 'docs' as const, label: 'Docs', icon: FileText },
];

export const Header: React.FC<HeaderProps> = ({
  currentPage = 'trade',
  onNavigate,
  onSwitchAccount,
}) => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [showSettings, setShowSettings] = useState(false);
  const [showFaucet, setShowFaucet] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState<'sol' | 'usdc' | null>(null);

  const handleAirdropSol = useCallback(async () => {
    if (!publicKey) return;
    setFaucetLoading('sol');
    try {
      const sig = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      toast.success('Received 2 SOL!');
    } catch (e: any) {
      const msg = e.message?.includes('airdrop') ? 'Devnet airdrop limit reached — try again later' : e.message;
      toast.error(`SOL airdrop failed: ${msg}`);
    } finally {
      setFaucetLoading(null);
    }
  }, [publicKey, connection]);

  const handleMintUsdc = useCallback(async () => {
    if (!publicKey) return;
    setFaucetLoading('usdc');
    try {
      const res = await fetch('/api/mint-usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: publicKey.toString(), amount: 10000 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(`Received ${data.amount?.toLocaleString() ?? '10,000'} USDC!`);
    } catch (e: any) {
      toast.error(`USDC mint failed: ${e.message}`);
    } finally {
      setFaucetLoading(null);
    }
  }, [publicKey]);

  return (
    <header className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-6 shrink-0 glass border-b border-drift-border">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-2 sm:gap-8 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="12 6 42 46" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M25 25 L52 10 L52 18 L25 33Z" stroke="currentColor" strokeWidth="0.7" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06"/>
            <path d="M25 25 L16 20 L16 44 L25 49Z" stroke="currentColor" strokeWidth="0.7" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06"/>
            <path d="M25 37 L43 27 L43 35 L25 45Z" stroke="currentColor" strokeWidth="0.7" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06"/>
          </svg>
          <span className="font-semibold text-[14px] sm:text-[15px] text-txt-0 tracking-tight">Float</span>
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

        {/* Faucet dropdown */}
        {connected && (
          <div className="relative">
            <button
              onClick={() => setShowFaucet(!showFaucet)}
              onBlur={() => setTimeout(() => setShowFaucet(false), 150)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/15 transition-all duration-150"
            >
              <Droplets className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold hidden sm:inline">Faucet</span>
            </button>
            {showFaucet && (
              <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl shadow-2xl bg-drift-surface border border-drift-border-lt z-50 overflow-hidden">
                <div className="px-3 py-2 text-[11px] text-txt-3 font-semibold uppercase tracking-widest border-b border-drift-border">
                  Devnet Faucet
                </div>
                <button
                  onClick={handleAirdropSol}
                  disabled={faucetLoading === 'sol'}
                  className="w-full text-left px-3 py-3 text-[12px] text-txt-1 hover:bg-drift-input transition-colors duration-150 flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-purple/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-purple">S</span>
                    </div>
                    <div>
                      <div className="font-medium text-txt-0">Request 2 SOL</div>
                      <div className="text-[10px] text-txt-3">For transaction fees</div>
                    </div>
                  </div>
                  {faucetLoading === 'sol' && <Loader2 className="w-3.5 h-3.5 animate-spin text-txt-2" />}
                </button>
                <button
                  onClick={handleMintUsdc}
                  disabled={faucetLoading === 'usdc'}
                  className="w-full text-left px-3 py-3 text-[12px] text-txt-1 hover:bg-drift-input transition-colors duration-150 flex items-center justify-between gap-2 disabled:opacity-50 border-t border-drift-border/50"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-blue-400">$</span>
                    </div>
                    <div>
                      <div className="font-medium text-txt-0">Mint 10,000 USDC</div>
                      <div className="text-[10px] text-txt-3">Test collateral</div>
                    </div>
                  </div>
                  {faucetLoading === 'usdc' && <Loader2 className="w-3.5 h-3.5 animate-spin text-txt-2" />}
                </button>
              </div>
            )}
          </div>
        )}

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

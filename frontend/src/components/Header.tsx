import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Settings, ExternalLink, Droplets, Menu, X, Search, Globe, Zap, Check } from 'lucide-react';
import { UserAccountSelector } from './UserAccountSelector';
import { AssetIcon } from './icons/AssetIcon';
import DRIFT_CONFIG from '../config';
import { useDriftStore } from '../stores/useDriftStore';

export type Page = 'home' | 'trade' | 'user' | 'learn' | 'insurance' | 'positions' | 'prediction';

interface HeaderProps {
  currentPage?: Page;
  onNavigate?: (page: Page) => void;
  onSwitchAccount?: (subAccountId: number) => void;
}

const NAV: { id: Page; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'trade', label: 'Futures' },
  { id: 'insurance', label: 'Vault' },
  { id: 'user', label: 'Account' },
  { id: 'positions', label: 'Positions' },
  { id: 'learn', label: 'More' },
];

export const Header: React.FC<HeaderProps> = ({
  currentPage = 'trade',
  onNavigate,
  onSwitchAccount,
}) => {
  const { publicKey, connected } = useWallet();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const setSelectedMarket = useDriftStore((s) => s.setSelectedMarket);
  const selectedMarket = useDriftStore((s) => s.selectedMarket);

  // Settings modal state
  const [showRpcModal, setShowRpcModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [customRpc, setCustomRpc] = useState(DRIFT_CONFIG.rpc);
  const [priorityFee, setPriorityFee] = useState('1000');

  // Filtered markets for search
  const allMarkets = Object.entries(DRIFT_CONFIG.markets);
  const filteredMarkets = searchQuery.trim()
    ? allMarkets.filter(([, m]) =>
        m.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.baseAsset.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.pair.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allMarkets;

  // Keyboard shortcut: "/" to open search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Close search on click outside
  useEffect(() => {
    if (!searchOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchOpen]);

  const selectMarket = useCallback((idx: number) => {
    setSelectedMarket(idx);
    setSearchOpen(false);
    setSearchQuery('');
    if (currentPage !== 'trade') onNavigate?.('trade');
  }, [setSelectedMarket, currentPage, onNavigate]);

  useEffect(() => { setMobileMenuOpen(false); }, [currentPage]);

  return (
    <header className="relative h-12 flex items-center justify-between px-4 shrink-0 bg-drift-panel border-b border-drift-border z-40">
      {/* Left: Hamburger + Logo + Nav */}
      <div className="flex items-center gap-6 min-w-0">
        <button
          className="sm:hidden p-1 -ml-1 text-txt-1 hover:text-txt-0 transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          {mobileMenuOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <img src="/float-logo-v2.svg" alt="Float" className="w-6 h-6 rounded-md" />
          <span className="font-semibold text-[16px] text-txt-0 hidden sm:inline">Float</span>
        </div>

        {/* Desktop nav — 14px medium, 24px spacing */}
        <nav className="hidden sm:flex items-center gap-0">
          {NAV.map(n => (
            <button key={n.id}
              onClick={() => onNavigate?.(n.id)}
              className={`relative px-3 py-3.5 text-[14px] font-medium transition-colors duration-150 ${
                currentPage === n.id
                  ? 'text-txt-0'
                  : 'text-txt-1 hover:text-txt-0'
              }`}>
              {n.label}
              {currentPage === n.id && (
                <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-txt-0 rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: Search bar (desktop) */}
      <div className="hidden md:flex items-center" ref={searchContainerRef}>
        <div className="relative">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full w-[200px] xl:w-[240px] transition-colors cursor-text ${
              searchOpen ? 'bg-drift-active ring-1 ring-accent/40' : 'bg-drift-surface hover:bg-drift-active'
            }`}
            onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
          >
            <Search className="w-3.5 h-3.5 text-txt-3 shrink-0" />
            {searchOpen ? (
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets..."
                className="bg-transparent text-[13px] text-txt-0 outline-none w-full placeholder:text-txt-3"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredMarkets.length > 0) {
                    selectMarket(+filteredMarkets[0][0]);
                  }
                }}
              />
            ) : (
              <span className="text-[13px] text-txt-3">Search markets</span>
            )}
            {!searchOpen && (
              <span className="ml-auto text-[11px] text-txt-3 border border-drift-border rounded px-1.5 py-0.5 leading-none">/</span>
            )}
          </div>

          {/* Search results dropdown */}
          {searchOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-drift-surface border border-drift-border rounded-md shadow-lg overflow-hidden">
              {filteredMarkets.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-txt-3">No markets found</div>
              ) : (
                <>
                  <div className="px-3 py-1.5 text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Perpetuals</div>
                  {filteredMarkets.map(([idx, m]) => (
                    <button
                      key={idx}
                      onClick={() => selectMarket(+idx)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-[12px] hover:bg-drift-active transition-colors ${
                        +idx === selectedMarket ? 'bg-drift-active/60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <AssetIcon asset={m.baseAsset} size={18} />
                        <span className="text-txt-0 font-medium">{m.symbol}</span>
                        <span className="text-txt-3 text-[11px]">{m.pair}</span>
                      </div>
                      {+idx === selectedMarket && <Check className="w-3.5 h-3.5 text-accent" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Network + Faucet + Settings + Wallet */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-drift-surface border border-drift-border">
          <div className="w-1.5 h-1.5 rounded-full bg-bull" />
          <span className="text-[11px] text-txt-1 font-medium">Devnet</span>
        </div>

        <a
          href="https://faucet.solana.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium text-accent bg-accent/8 hover:bg-accent/12 transition-colors"
        >
          <Droplets className="w-3 h-3" />
          <span className="hidden sm:inline">Faucet</span>
        </a>

        <div className="relative hidden sm:block">
          <button onClick={() => setShowSettings(!showSettings)}
            onBlur={() => setTimeout(() => setShowSettings(false), 150)}
            className="p-1.5 rounded hover:bg-drift-surface transition-colors text-txt-1 hover:text-txt-0">
            <Settings className="w-4 h-4" />
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1 w-48 py-1 rounded-md bg-drift-surface border border-drift-border z-50">
              <div className="px-3 py-1.5 text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Settings</div>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowRpcModal(true); setShowSettings(false); }}
                className="w-full text-left px-3 py-2 text-[11px] text-txt-1 hover:bg-drift-active transition-colors flex items-center gap-2"
              >
                <Globe className="w-3 h-3 text-txt-3" />
                RPC Endpoint
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowFeeModal(true); setShowSettings(false); }}
                className="w-full text-left px-3 py-2 text-[11px] text-txt-1 hover:bg-drift-active transition-colors flex items-center gap-2"
              >
                <Zap className="w-3 h-3 text-txt-3" />
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
                <button
                  onClick={() => { setShowRpcModal(true); setMobileMenuOpen(false); }}
                  className="w-full text-left py-2 text-[12px] text-txt-1 hover:text-txt-0 flex items-center gap-2 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5 text-txt-3" />
                  RPC Endpoint
                </button>
                <button
                  onClick={() => { setShowFeeModal(true); setMobileMenuOpen(false); }}
                  className="w-full text-left py-2 text-[12px] text-txt-1 hover:text-txt-0 flex items-center gap-2 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 text-txt-3" />
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
      {/* ── RPC Endpoint Modal ── */}
      {showRpcModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={() => setShowRpcModal(false)}>
          <div className="bg-drift-panel border border-drift-border rounded-lg p-5 w-[380px] max-w-[90vw] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-txt-0">RPC Endpoint</h3>
              <button onClick={() => setShowRpcModal(false)} className="text-txt-3 hover:text-txt-0 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-txt-2 mb-3">Custom Solana RPC URL. Changes apply on next page reload.</p>
            <input
              type="text"
              value={customRpc}
              onChange={(e) => setCustomRpc(e.target.value)}
              placeholder="https://api.devnet.solana.com"
              className="w-full px-3 py-2 bg-drift-surface border border-drift-border rounded text-[12px] text-txt-0 font-mono outline-none focus:border-accent/50 transition-colors"
            />
            <div className="flex items-center gap-2 mt-2">
              {[
                { label: 'Devnet', url: 'https://api.devnet.solana.com' },
                { label: 'Helius', url: DRIFT_CONFIG.rpc },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setCustomRpc(preset.url)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    customRpc === preset.url ? 'bg-accent/20 text-accent' : 'bg-drift-surface text-txt-2 hover:text-txt-0'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowRpcModal(false)} className="px-3 py-1.5 rounded text-[11px] text-txt-2 hover:text-txt-0 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  try { localStorage.setItem('value_custom_rpc', customRpc); } catch {}
                  setShowRpcModal(false);
                  window.location.reload();
                }}
                className="px-3 py-1.5 rounded bg-accent text-white text-[11px] font-medium hover:bg-accent/80 transition-colors"
              >
                Save & Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Priority Fee Modal ── */}
      {showFeeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={() => setShowFeeModal(false)}>
          <div className="bg-drift-panel border border-drift-border rounded-lg p-5 w-[380px] max-w-[90vw] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-txt-0">Priority Fees</h3>
              <button onClick={() => setShowFeeModal(false)} className="text-txt-3 hover:text-txt-0 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-txt-2 mb-3">Max priority fee in micro-lamports. Higher fees = faster transaction inclusion.</p>
            <div className="space-y-2">
              {[
                { label: 'Low', value: '100', desc: 'Economy' },
                { label: 'Medium', value: '1000', desc: 'Standard' },
                { label: 'High', value: '10000', desc: 'Fast' },
                { label: 'Turbo', value: '100000', desc: 'Highest priority' },
              ].map((tier) => (
                <button
                  key={tier.value}
                  onClick={() => setPriorityFee(tier.value)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded border transition-colors ${
                    priorityFee === tier.value
                      ? 'border-accent bg-accent/10 text-txt-0'
                      : 'border-drift-border bg-drift-surface text-txt-1 hover:border-txt-3'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{tier.label}</span>
                    <span className="text-[10px] text-txt-3">{tier.desc}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-txt-2">{Number(tier.value).toLocaleString()} μL</span>
                    {priorityFee === tier.value && <Check className="w-3.5 h-3.5 text-accent" />}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-[10px] text-txt-3 uppercase tracking-wider font-medium">Custom (micro-lamports)</label>
              <input
                type="number"
                value={priorityFee}
                onChange={(e) => setPriorityFee(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-drift-surface border border-drift-border rounded text-[12px] text-txt-0 font-mono outline-none focus:border-accent/50 transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowFeeModal(false)} className="px-3 py-1.5 rounded text-[11px] text-txt-2 hover:text-txt-0 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  try { localStorage.setItem('value_priority_fee', priorityFee); } catch {}
                  setShowFeeModal(false);
                }}
                className="px-3 py-1.5 rounded bg-accent text-white text-[11px] font-medium hover:bg-accent/80 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

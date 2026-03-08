/**
 * UserManagement — Account dashboard v2.
 *
 * 1. Summary bar with radial SVG health gauge
 * 2. Compact wallet card with copy address + faucet dropdown
 * 3. Tabbed Deposit / Withdraw with Max button + confirmation step
 * 4. Sub-account cards with mini health bars + collapsible create form
 * 5. Activity log placeholder to fill vertical space
 * 6. Fully responsive (2×3 stats grid, stacked cards on mobile)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Loader2, Copy, Check, ChevronDown, Plus, DollarSign, Shield, Activity, TrendingUp, Wallet, Layers, Clock } from 'lucide-react';
import { SubAccount, useDriftStore } from '../stores/useDriftStore';
import { useUserManagement } from '../hooks/useUserManagement';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/Dialog';

interface Props {
  forceRefresh: () => Promise<void>;
  onBack: () => void;
  trading?: {
    createAccount: (depositAmount: number) => Promise<string>;
    deposit: (amount: number, spotMarketIndex?: number) => Promise<string>;
    withdraw: (amount: number, spotMarketIndex?: number) => Promise<string>;
  };
  /** When true, hide the internal page header (used when embedded inside PortfolioPage) */
  embedded?: boolean;
}

/* ── Health Bar (matches Portfolio HealthBar pattern) ── */
const HealthBar: React.FC<{ health: number }> = ({ health }) => {
  const color = health >= 70 ? 'bg-bull' : health >= 40 ? 'bg-accent' : 'bg-bear';
  const text = health >= 70 ? 'Healthy' : health >= 40 ? 'Moderate' : 'At Risk';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-drift-surface overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, health)}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-txt-1 shrink-0">{health.toFixed(0)}% — {text}</span>
    </div>
  );
};

/* ── StatCard (matches Portfolio pattern) ── */
const StatCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}> = ({ icon: Icon, label, value, sub, color = 'text-txt-0' }) => (
  <div className="border border-drift-border/60 bg-drift-panel/80 rounded-xl p-4 flex flex-col gap-1.5 hover:border-drift-border transition-colors">
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-txt-2 font-semibold uppercase tracking-wider">{label}</span>
      <div className="w-6 h-6 rounded-lg bg-drift-surface/60 flex items-center justify-center">
        <Icon className="w-3 h-3 text-txt-3" />
      </div>
    </div>
    <div className={`text-[20px] font-bold font-mono tracking-tight ${color}`}>{value}</div>
    {sub && <div className="text-[10px] text-txt-3 font-medium">{sub}</div>}
  </div>
);

/* ── Page header ── */
const PageHeader: React.FC<{ onBack: () => void; pubkey?: string }> = ({ onBack, pubkey }) => (
  <div className="flex items-center gap-3 px-4 border-b border-drift-border bg-drift-bg shrink-0" style={{ height: 48 }}>
    <button onClick={onBack} className="text-txt-1 hover:text-txt-0 text-[13px] font-medium transition-colors">
      &larr; Back
    </button>
    <div className="w-px h-4 bg-drift-border" />
    <span className="text-[14px] font-semibold text-txt-0">Account</span>
    <div className="flex-1" />
    {pubkey && <span className="text-[10px] text-txt-1 font-mono">{pubkey}</span>}
    <span className="text-[10px] text-txt-2 font-semibold">DEVNET</span>
  </div>
);

/* ═══════════════════════════════════════════════ */
/*  Main UserManagement component                  */
/* ═══════════════════════════════════════════════ */
export const UserManagement: React.FC<Props> = ({ forceRefresh, onBack, trading, embedded }) => {
  const {
    connected,
    publicKey,
    subAccounts,
    activeSubAccountId,
    isDeleting,
    showDeleteDialog,
    selectedSubAccountForDeletion,
    status,
    handleCreateAndDeposit,
    handleDeleteUser,
    openDeleteDialog,
    handleSetActiveSubAccount,
    setShowDeleteDialog,
  } = useUserManagement(forceRefresh);

  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);
  const accountState = useDriftStore((s) => s.accountState);
  const solBalance = useDriftStore((s) => s.solBalance);
  const usdcBalance = useDriftStore((s) => s.usdcBalance);
  const accountSpotBalances = useDriftStore((s) => s.accountSpotBalances);

  const pubkeyStr = publicKey?.toBase58() ?? null;
  const shortPubkey = pubkeyStr ? `${pubkeyStr.slice(0, 4)}...${pubkeyStr.slice(-4)}` : '';

  /* -- Local state -- */
  const [amount, setAmount] = useState('1000');
  const [accountName, setAccountName] = useState('Main Account');
  const [loading, setLoading] = useState<string | null>(null);
  const [faucetMsg, setFaucetMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [claimsUsed, setClaimsUsed] = useState(0);

  /* Tabbed deposit/withdraw */
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [confirmStep, setConfirmStep] = useState(false);
  const [selectedToken, setSelectedToken] = useState<'USDC' | 'SOL'>('USDC');

  /* Faucet dropdown */
  const [faucetOpen, setFaucetOpen] = useState(false);
  const faucetRef = useRef<HTMLDivElement>(null);

  /* Copy address */
  const [copied, setCopied] = useState(false);

  /* Collapsible create sub-account */
  const [showCreateSub, setShowCreateSub] = useState(false);

  /* Activity log (placeholder entries) */
  const [activityLog] = useState<{ ts: number; text: string; type: 'ok' | 'err' }[]>([]);

  /* Close faucet dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (faucetRef.current && !faucetRef.current.contains(e.target as Node)) setFaucetOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* -- Faucet status -- */
  useEffect(() => {
    if (!pubkeyStr) return;
    fetch(`/api/faucet-status?publicKey=${pubkeyStr}`)
      .then(r => r.json())
      .then(d => setClaimsUsed(d.claimsUsed ?? 0))
      .catch(() => {});
  }, [pubkeyStr]);

  /* -- Copy address -- */
  const handleCopy = useCallback(() => {
    if (!pubkeyStr) return;
    navigator.clipboard.writeText(pubkeyStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [pubkeyStr]);

  /* -- Faucet: SOL -- */
  const handleAirdropSol = useCallback(async () => {
    if (!pubkeyStr) return;
    setLoading('sol');
    setFaucetMsg(null);
    try {
      const res = await fetch('/api/airdrop-sol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkeyStr, amount: 2 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFaucetMsg({ type: 'ok', text: `+${data.amount} SOL` });
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message });
    } finally { setLoading(null); setFaucetOpen(false); }
  }, [pubkeyStr]);

  /* -- Faucet: USDC -- */
  const handleMintUsdc = useCallback(async () => {
    if (!pubkeyStr) return;
    setLoading('usdc');
    setFaucetMsg(null);
    try {
      const res = await fetch('/api/mint-usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkeyStr }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setClaimsUsed(data.claimsUsed ?? 0);
      setFaucetMsg({ type: 'ok', text: `+${data.amount.toLocaleString()} USDC` });
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message });
    } finally { setLoading(null); setFaucetOpen(false); }
  }, [pubkeyStr]);

  /* -- Deposit -- */
  const handleDeposit = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !trading) return;
    setLoading('deposit');
    setFaucetMsg(null);
    const marketIndex = selectedToken === 'SOL' ? 1 : 0;
    try {
      await trading.deposit(amt, marketIndex);
      setFaucetMsg({ type: 'ok', text: `Deposited ${amt} ${selectedToken}` });
      setConfirmStep(false);
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message || 'Deposit failed' });
    } finally { setLoading(null); }
  }, [amount, trading, selectedToken]);

  /* -- Withdraw -- */
  const handleWithdraw = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !trading) return;
    setLoading('withdraw');
    setFaucetMsg(null);
    const marketIndex = selectedToken === 'SOL' ? 1 : 0;
    try {
      await trading.withdraw(amt, marketIndex);
      setFaucetMsg({ type: 'ok', text: `Withdrew ${amt} ${selectedToken}` });
      setConfirmStep(false);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('InsufficientCollateral') || msg.includes('0x1773')) {
        const free = accountState?.freeCollateral ?? 0;
        setFaucetMsg({ type: 'err', text: `Insufficient collateral. Free: $${free.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` });
      } else {
        setFaucetMsg({ type: 'err', text: msg });
      }
    } finally { setLoading(null); }
  }, [amount, trading, accountState, selectedToken]);

  /* -- Create account -- */
  const handleCreate = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;
    setLoading('create');
    try {
      await handleCreateAndDeposit({ name: accountName.trim() || 'Main Account', depositAmount: amt });
    } catch {} finally { setLoading(null); }
  }, [amount, accountName, handleCreateAndDeposit]);

  /* Max button handler */
  const handleMax = useCallback(() => {
    if (activeTab === 'deposit') {
      if (selectedToken === 'SOL') {
        // Reserve 0.05 SOL for fees
        const maxSol = Math.max(0, (solBalance ?? 0) - 0.05);
        setAmount(String(Math.floor(maxSol * 10000) / 10000));
      } else {
        setAmount(String(usdcBalance ?? 0));
      }
    } else {
      if (selectedToken === 'SOL') {
        const solSpot = accountSpotBalances.find(b => b.marketIndex === 1);
        setAmount(String(Math.max(0, solSpot?.netBalance ?? 0)));
      } else {
        setAmount(String(accountState?.freeCollateral ?? 0));
      }
    }
  }, [activeTab, selectedToken, usdcBalance, solBalance, accountState, accountSpotBalances]);

  const health = accountState?.health ?? 100;
  const equity = accountState?.totalCollateral ?? 0;
  const freeCollateral = accountState?.freeCollateral ?? 0;
  const leverage = accountState?.leverage ?? 0;
  const unrealizedPnl = accountState?.unrealizedPnl ?? 0;
  const pnlPct = equity > 0 ? (unrealizedPnl / equity) * 100 : 0;

  /* ═══════ Not connected ═══════ */
  if (!connected) {
    return (
      <div className={embedded ? 'px-4 sm:px-6 py-5 space-y-5' : 'flex-1 min-h-0 flex flex-col bg-drift-bg'}>
        {!embedded && <PageHeader onBack={onBack} />}
        <div className={embedded ? '' : 'flex-1 flex items-center justify-center'}>
          <div className="text-center space-y-4 max-w-xs mx-auto py-12">
            <p className="text-[13px] font-semibold text-txt-0">Connect Wallet</p>
            <p className="text-[11px] text-txt-3 leading-relaxed">
              Connect your Solana wallet to create an account and start trading.
            </p>
            <WalletMultiButton className="!mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  /* ═══════ Connected ═══════ */

  const content = (
    <>
      {/* Status toast */}
      {(status.type || faucetMsg) && (
        <div className={`px-3 py-2 text-[11px] rounded-xl ${
          (faucetMsg?.type ?? status.type) === 'ok' || (faucetMsg?.type ?? status.type) === 'success'
            ? 'bg-bull/8 text-bull border border-bull/15' : 'bg-bear/8 text-bear border border-bear/15'
        }`}>
          {faucetMsg?.text ?? status.message}
        </div>
      )}

      {/* 1. STAT CARDS */}
      {isUserInitialized && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={DollarSign}
            label="Equity"
            value={`$${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="Total account value"
          />
          <StatCard
            icon={Shield}
            label="Free Collateral"
            value={`$${freeCollateral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="Available for trading"
          />
          <StatCard
            icon={Activity}
            label="Leverage"
            value={`${leverage.toFixed(2)}\u00d7`}
            sub="Current exposure"
          />
          <StatCard
            icon={TrendingUp}
            label="Unrealized P&L"
            value={`${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% on equity`}
            color={unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}
          />
        </div>
      )}

      {/* 2. HEALTH BAR */}
      {isUserInitialized && accountState && (
        <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-txt-2 font-semibold uppercase tracking-wider">Account Health</span>
            <div className="flex items-center gap-3 text-[11px] text-txt-3">
              <span>Margin: ${(accountState.maintenanceMargin ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>Free: ${freeCollateral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <HealthBar health={health} />
        </div>
      )}

      {/* 3. WALLET */}
      <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-drift-border/40">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-txt-2" />
            <h3 className="text-[13px] font-bold text-txt-0">Wallet</h3>
          </div>
          <div className="relative" ref={faucetRef}>
            <button onClick={() => setFaucetOpen(!faucetOpen)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg text-txt-1 hover:bg-drift-surface/60 transition-colors">
              Faucet <ChevronDown className="w-3 h-3" />
            </button>
            {faucetOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-drift-surface border border-drift-border rounded-lg py-1 min-w-[140px]">
                <button onClick={handleAirdropSol} disabled={loading === 'sol'}
                  className="w-full text-left px-3 py-2 text-[11px] text-txt-0 hover:bg-drift-active transition-colors disabled:opacity-40">
                  {loading === 'sol' ? 'Sending\u2026' : 'Airdrop +2 SOL'}
                </button>
                <button onClick={handleMintUsdc} disabled={loading === 'usdc' || claimsUsed >= 2}
                  className="w-full text-left px-3 py-2 text-[11px] text-txt-0 hover:bg-drift-active transition-colors disabled:opacity-40">
                  {loading === 'usdc' ? 'Minting\u2026' : claimsUsed >= 2 ? 'USDC Max Claimed' : `Mint +1K USDC (${2 - claimsUsed} left)`}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="divide-y divide-drift-border/30">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                <span className="text-[12px] font-bold text-txt-1">\u25ce</span>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-txt-0">SOL</div>
                <div className="text-[10px] text-txt-3">Wallet Balance</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-mono font-bold text-txt-0">
                {solBalance != null ? solBalance.toFixed(4) : '\u2014'} SOL
              </div>
              <div className="text-[10px] text-txt-3">Native token</div>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-txt-1" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-txt-0">USDC</div>
                <div className="text-[10px] text-txt-3">Wallet Balance</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-mono font-bold text-txt-0">
                {usdcBalance != null ? usdcBalance.toLocaleString() : '\u2014'} USDC
              </div>
              <div className="text-[10px] text-txt-3">Stablecoin</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-drift-border/40">
          <p className="text-[10px] text-txt-3 font-mono truncate flex-1">{pubkeyStr}</p>
          <button onClick={handleCopy}
            className="p-1 text-txt-3 hover:text-txt-0 transition-colors" title="Copy address">
            {copied ? <Check className="w-3.5 h-3.5 text-bull" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 4. DEPOSIT / WITHDRAW */}
      <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
        {isUserInitialized ? (
          <>
            <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-txt-2" />
              <h3 className="text-[13px] font-bold text-txt-0">Deposit & Withdraw</h3>
            </div>
            <div className="flex border-b border-drift-border/40">
              <button onClick={() => { setActiveTab('deposit'); setConfirmStep(false); }}
                className={`flex-1 py-2.5 text-[12px] font-semibold text-center transition-colors ${
                  activeTab === 'deposit' ? 'text-txt-0 border-b-2 border-txt-0' : 'text-txt-3 hover:text-txt-1'
                }`}>Deposit</button>
              <button onClick={() => { setActiveTab('withdraw'); setConfirmStep(false); }}
                className={`flex-1 py-2.5 text-[12px] font-semibold text-center transition-colors ${
                  activeTab === 'withdraw' ? 'text-txt-0 border-b-2 border-txt-0' : 'text-txt-3 hover:text-txt-1'
                }`}>Withdraw</button>
            </div>
            <div className="p-4 space-y-3">
              {/* Token selector */}
              <div className="flex items-center gap-1.5 p-0.5 bg-drift-surface rounded-lg">
                {(['USDC', 'SOL'] as const).map((tok) => (
                  <button
                    key={tok}
                    onClick={() => { setSelectedToken(tok); setConfirmStep(false); setAmount(''); }}
                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md text-center transition-colors ${
                      selectedToken === tok
                        ? 'bg-drift-panel text-txt-0 shadow-sm'
                        : 'text-txt-3 hover:text-txt-1'
                    }`}
                  >{tok}</button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-txt-1">
                  {activeTab === 'deposit'
                    ? `Wallet ${selectedToken}`
                    : selectedToken === 'SOL'
                      ? 'Account SOL Balance'
                      : 'Free Collateral'
                  }
                </span>
                <span className="text-[11px] text-txt-0 font-mono tabular-nums font-semibold">
                  {activeTab === 'deposit'
                    ? selectedToken === 'SOL'
                      ? `${(solBalance ?? 0).toFixed(4)} SOL`
                      : `${(usdcBalance ?? 0).toLocaleString()} USDC`
                    : selectedToken === 'SOL'
                      ? `${(accountSpotBalances.find(b => b.marketIndex === 1)?.netBalance ?? 0).toFixed(4)} SOL`
                      : `$${freeCollateral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                </span>
              </div>
              <div className="flex items-center h-10 bg-drift-input border border-drift-border rounded-lg focus-within:border-txt-3/40 transition-colors">
                <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setConfirmStep(false); }}
                  placeholder="0.00" step="any" min="0"
                  className="flex-1 h-full px-3 bg-transparent text-[13px] text-txt-0 font-mono tabular-nums outline-none" />
                <button onClick={handleMax}
                  className="px-2.5 py-1 mr-1.5 text-[10px] font-bold rounded bg-drift-surface text-txt-1 hover:text-txt-0 hover:bg-drift-elevated transition-colors">
                  MAX
                </button>
                <span className="text-[11px] text-txt-1 pr-3 font-medium">{selectedToken}</span>
              </div>
              {!confirmStep ? (
                <button onClick={() => {
                  const amt = parseFloat(amount) || 0;
                  if (amt <= 0) return;
                  setConfirmStep(true);
                }}
                  disabled={!(parseFloat(amount) > 0)}
                  className="w-full h-10 text-[12px] font-semibold rounded-lg bg-drift-surface text-txt-0 hover:bg-drift-elevated border border-drift-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  {activeTab === 'deposit' ? 'Review Deposit' : 'Review Withdrawal'}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-drift-input border border-drift-border/40 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-txt-3">{activeTab === 'deposit' ? 'Deposit' : 'Withdraw'}</span>
                      <span className="text-[13px] font-semibold text-txt-0 font-mono tabular-nums">{parseFloat(amount).toLocaleString()} {selectedToken}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirmStep(false)}
                      className="h-10 text-[11px] font-semibold rounded-lg border border-drift-border text-txt-1 hover:bg-drift-surface transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
                      disabled={!!loading}
                      className={`h-10 text-[12px] font-semibold rounded-lg transition-colors disabled:opacity-30 flex items-center justify-center gap-1.5 ${
                        activeTab === 'deposit'
                          ? 'bg-bull text-white hover:brightness-110'
                          : 'bg-bear text-white hover:brightness-110'
                      }`}>
                      {loading === 'deposit' || loading === 'withdraw' ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing&hellip;</>
                      ) : (
                        `Confirm ${activeTab === 'deposit' ? 'Deposit' : 'Withdrawal'}`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-txt-2" />
              <h3 className="text-[13px] font-bold text-txt-0">Create Account</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-txt-3">Account Name</label>
                <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                  placeholder="Main Account"
                  className="w-full h-9 px-3 rounded-lg bg-drift-input border border-drift-border text-[12px] text-txt-0 placeholder:text-txt-3/40 outline-none focus:border-txt-3/40 transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-txt-3">Deposit Amount (USDC)</label>
                <div className="flex items-center h-9 bg-drift-input border border-drift-border rounded-lg focus-within:border-txt-3/40 transition-colors">
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="1000" step="any" min="0"
                    className="flex-1 h-full px-3 bg-transparent text-[12px] text-txt-0 tabular-nums outline-none" />
                  <button onClick={() => setAmount(String(usdcBalance ?? 0))}
                    className="px-2 py-0.5 mr-1 text-[10px] font-bold rounded bg-drift-surface text-txt-1 hover:text-txt-0 hover:bg-drift-elevated transition-colors">
                    MAX
                  </button>
                  <span className="text-[10px] text-txt-3 pr-3">USDC</span>
                </div>
              </div>
              {(solBalance ?? 0) < 0.01 && (
                <p className="text-[10px] text-bear">Need SOL for fees &mdash; use Faucet dropdown above</p>
              )}
              {(usdcBalance ?? 0) <= 0 && (solBalance ?? 0) >= 0.01 && (
                <p className="text-[10px] text-bear">Need USDC &mdash; use Faucet dropdown above</p>
              )}
              <button onClick={handleCreate}
                disabled={!!loading || (solBalance ?? 0) < 0.01 || (usdcBalance ?? 0) <= 0 || !(parseFloat(amount) > 0)}
                className="w-full h-10 text-[12px] font-semibold rounded-lg bg-bull text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                {loading === 'create' ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating&hellip;</>
                ) : (
                  `Create & Deposit ${amount || '0'} USDC`
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 5. SUB-ACCOUNTS */}
      {isUserInitialized && (
        <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-drift-border/40">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-txt-2" />
              <h3 className="text-[13px] font-bold text-txt-0">Sub-Accounts ({subAccounts.length})</h3>
            </div>
            <button onClick={() => setShowCreateSub(!showCreateSub)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg text-txt-1 hover:text-txt-0 hover:bg-drift-surface/60 transition-colors">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          <div className="divide-y divide-drift-border/30">
            {subAccounts.map((acct) => {
              const isActive = acct.subAccountId === activeSubAccountId;
              const canDelete = acct.openPositions === 0 && acct.spotBalances <= 1;
              const acctPnl = acct.unrealizedPnl ?? 0;
              return (
                <div key={acct.subAccountId} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                      <span className="text-[11px] font-bold text-txt-1">#{acct.subAccountId}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-txt-0">{acct.name}</span>
                        {isActive && (
                          <span className="px-1.5 py-px text-[9px] font-bold rounded-full bg-drift-surface text-txt-0 border border-drift-border">Active</span>
                        )}
                      </div>
                      <div className="text-[10px] text-txt-3">
                        {acct.openPositions} position{acct.openPositions !== 1 ? 's' : ''} &middot;{' '}
                        <span className={acctPnl >= 0 ? 'text-bull' : 'text-bear'}>
                          {acctPnl >= 0 ? '+' : ''}{acctPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[13px] font-mono font-bold text-txt-0">
                        ${acct.totalCollateral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-txt-3">Collateral</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!isActive && (
                        <button onClick={() => handleSetActiveSubAccount(acct.subAccountId)}
                          className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-drift-surface text-txt-1 hover:text-txt-0 hover:bg-drift-elevated transition-colors">
                          Switch
                        </button>
                      )}
                      <button onClick={() => canDelete && openDeleteDialog(acct.subAccountId)}
                        disabled={!canDelete}
                        className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
                          canDelete ? 'bg-bear/10 text-bear hover:bg-bear/18' : 'text-txt-3 opacity-25 cursor-not-allowed'
                        }`}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {showCreateSub && (
            <div className="border-t border-drift-border p-4 space-y-2 bg-drift-bg/40">
              <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                placeholder="Account name"
                className="w-full h-8 px-3 rounded-lg bg-drift-input border border-drift-border text-[11px] text-txt-0 placeholder:text-txt-3/40 outline-none focus:border-txt-3/40 transition-colors" />
              <div className="flex items-center gap-2">
                <div className="flex items-center flex-1 h-8 bg-drift-input border border-drift-border rounded-lg focus-within:border-txt-3/40 transition-colors">
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="1000" min="0"
                    className="flex-1 h-full px-3 bg-transparent text-[11px] text-txt-0 tabular-nums outline-none" />
                  <span className="text-[10px] text-txt-3 pr-3">USDC</span>
                </div>
                <button onClick={() => { handleCreate(); setShowCreateSub(false); }}
                  disabled={!!loading || !(parseFloat(amount) > 0)}
                  className="h-8 px-4 text-[11px] font-semibold rounded-lg bg-bull text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                  {loading === 'create' ? 'Creating\u2026' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. ACTIVITY */}
      <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
        <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
          <Clock className="w-4 h-4 text-txt-2" />
          <h3 className="text-[13px] font-bold text-txt-0">Activity</h3>
        </div>
        {activityLog.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[11px] text-txt-3">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-drift-border/30">
            {activityLog.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-[11px] text-txt-1">{entry.text}</span>
                <span className="text-[10px] text-txt-3 tabular-nums">{new Date(entry.ts).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No account placeholder */}
      {!isUserInitialized && (
        <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 px-4 py-8 text-center">
          <p className="text-[11px] text-txt-3">Create an account to see your summary, sub-accounts, and activity</p>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="px-4 sm:px-6 py-5 space-y-5">
        {content}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-drift-bg">
      {<PageHeader onBack={onBack} pubkey={shortPubkey} />}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">
          {content}
        </div>
      </div>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-bear">Delete Sub-Account</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Delete <strong>sub-account #{selectedSubAccountForDeletion}</strong>?
            Ensure all positions are closed and collateral is withdrawn.
          </DialogDescription>
          <DialogFooter>
            <button onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}
              className="px-4 py-2 text-[11px] font-semibold rounded-lg border border-drift-border text-txt-1 hover:bg-drift-surface transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => selectedSubAccountForDeletion !== null && handleDeleteUser(selectedSubAccountForDeletion)}
              disabled={isDeleting}
              className="px-4 py-2 text-[11px] font-semibold rounded-lg bg-bear text-white hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1.5">
              {isDeleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting&hellip;</> : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};


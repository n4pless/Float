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
import { ArrowLeft, Loader2, Copy, Check, ChevronDown, ChevronUp, Plus } from 'lucide-react';
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
    deposit: (amount: number) => Promise<string>;
    withdraw: (amount: number) => Promise<string>;
  };
}

/* ── Section header ── */
const SectionLabel: React.FC<{ label: string; right?: React.ReactNode }> = ({ label, right }) => (
  <div className="flex items-center justify-between px-4 py-2.5 border-b border-drift-border bg-drift-panel">
    <span className="text-[14px] font-semibold text-txt-1 uppercase tracking-wider">{label}</span>
    {right}
  </div>
);

/* ── SVG Radial Health Gauge ── */
const HealthGauge: React.FC<{ value: number; size?: number }> = ({ value, size = 72 }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circ - (pct / 100) * circ;
  const color = pct > 50 ? '#24b47e' : pct > 20 ? '#efa411' : '#f84960';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-bold tabular-nums text-txt-0 leading-none">{pct.toFixed(0)}</span>
        <span className="text-[9px] text-txt-3 mt-0.5">HEALTH</span>
      </div>
    </div>
  );
};

/* ── Page header ── */
const PageHeader: React.FC<{ onBack: () => void; pubkey?: string }> = ({ onBack, pubkey }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-drift-border bg-drift-bg shrink-0">
    <button onClick={onBack} className="p-1 rounded text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-colors">
      <ArrowLeft className="w-4 h-4" />
    </button>
    <span className="text-[13px] font-semibold text-txt-0">Account</span>
    <div className="flex-1" />
    {pubkey && <span className="text-[10px] text-txt-3 font-mono">{pubkey}</span>}
    <span className="text-[10px] text-purple font-semibold">DEVNET</span>
  </div>
);

/* ═══════════════════════════════════════════════ */
/*  Main UserManagement component                  */
/* ═══════════════════════════════════════════════ */
export const UserManagement: React.FC<Props> = ({ forceRefresh, onBack, trading }) => {
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
    try {
      await trading.deposit(amt);
      setFaucetMsg({ type: 'ok', text: `Deposited ${amt} USDC` });
      setConfirmStep(false);
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message || 'Deposit failed' });
    } finally { setLoading(null); }
  }, [amount, trading]);

  /* -- Withdraw -- */
  const handleWithdraw = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !trading) return;
    setLoading('withdraw');
    setFaucetMsg(null);
    try {
      await trading.withdraw(amt);
      setFaucetMsg({ type: 'ok', text: `Withdrew ${amt} USDC` });
      setConfirmStep(false);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('InsufficientCollateral') || msg.includes('0x1773')) {
        const free = accountState?.freeCollateral ?? 0;
        setFaucetMsg({ type: 'err', text: `Insufficient collateral. Free: $${free.toFixed(2)}` });
      } else {
        setFaucetMsg({ type: 'err', text: msg });
      }
    } finally { setLoading(null); }
  }, [amount, trading, accountState]);

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
      setAmount(String(usdcBalance ?? 0));
    } else {
      setAmount(String(accountState?.freeCollateral ?? 0));
    }
  }, [activeTab, usdcBalance, accountState]);

  const health = accountState?.health ?? 100;
  const equity = accountState?.totalCollateral ?? 0;
  const freeCollateral = accountState?.freeCollateral ?? 0;
  const leverage = accountState?.leverage ?? 0;
  const unrealizedPnl = accountState?.unrealizedPnl ?? 0;
  const pnlPct = equity > 0 ? (unrealizedPnl / equity) * 100 : 0;

  /* ═══════ Not connected ═══════ */
  if (!connected) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-drift-bg">
        <PageHeader onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-xs">
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
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-drift-bg">
      <PageHeader onBack={onBack} pubkey={shortPubkey} />

      {/* Status toast */}
      {(status.type || faucetMsg) && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded text-[11px] ${
          (faucetMsg?.type ?? status.type) === 'ok' || (faucetMsg?.type ?? status.type) === 'success'
            ? 'bg-bull/8 text-bull' : 'bg-bear/8 text-bear'
        }`}>
          {faucetMsg?.text ?? status.message}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-5xl mx-auto px-4 py-5 space-y-4">

          {/* ─── 1. SUMMARY BAR ─── */}
          {isUserInitialized && (
            <div className="rounded border border-drift-border bg-drift-panel overflow-hidden">
              <div className="flex flex-col sm:flex-row items-stretch">
                {/* Stats grid — 2×3 on mobile, row on desktop */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 divide-drift-border">
                  {/* Equity */}
                  <div className="px-4 py-4 border-b sm:border-b-0 sm:border-r border-drift-border">
                    <span className="text-[11px] text-txt-3 uppercase tracking-wide block mb-1">Equity</span>
                    <span className="text-[22px] font-bold tabular-nums text-txt-0 leading-none">${equity.toFixed(2)}</span>
                  </div>
                  {/* Free Collateral */}
                  <div className="px-4 py-4 border-b sm:border-b-0 sm:border-r border-drift-border">
                    <span className="text-[11px] text-txt-3 uppercase tracking-wide block mb-1">Free Collateral</span>
                    <span className="text-[22px] font-bold tabular-nums text-accent leading-none">${freeCollateral.toFixed(2)}</span>
                  </div>
                  {/* Leverage */}
                  <div className="px-4 py-4 border-b sm:border-b-0 sm:border-r border-drift-border">
                    <span className="text-[11px] text-txt-3 uppercase tracking-wide block mb-1">Leverage</span>
                    <span className="text-[22px] font-bold tabular-nums text-txt-0 leading-none">{leverage.toFixed(2)}&times;</span>
                  </div>
                  {/* Unrealized P&L */}
                  <div className="px-4 py-4 border-b sm:border-b-0 border-drift-border">
                    <span className="text-[11px] text-txt-3 uppercase tracking-wide block mb-1">Unrealized P&L</span>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[22px] font-bold tabular-nums leading-none ${unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                      </span>
                      <span className={`text-[12px] tabular-nums ${unrealizedPnl >= 0 ? 'text-bull/70' : 'text-bear/70'}`}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                {/* Health gauge */}
                <div className="flex items-center justify-center px-5 py-4 border-t sm:border-t-0 sm:border-l border-drift-border bg-drift-bg/40">
                  <HealthGauge value={health} size={72} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Main grid: wallet + deposit left, sub-accounts right ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* ══ LEFT COLUMN ══ */}
            <div className="space-y-4">

              {/* ─── 2. WALLET CARD ─── */}
              <div className="rounded border border-drift-border overflow-hidden">
                <SectionLabel label="Wallet"
                  right={
                    <div className="relative" ref={faucetRef}>
                      <button onClick={() => setFaucetOpen(!faucetOpen)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded text-purple hover:bg-purple/8 transition-colors">
                        Faucet <ChevronDown className="w-3 h-3" />
                      </button>
                      {faucetOpen && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-drift-surface border border-drift-border rounded py-1 min-w-[140px]">
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
                  }
                />
                <div className="divide-y divide-drift-border">
                  {/* SOL row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-purple/10 flex items-center justify-center text-[12px] font-bold text-purple">◎</span>
                      <div>
                        <span className="text-[14px] text-txt-0 font-semibold tabular-nums block leading-tight">
                          {solBalance != null ? solBalance.toFixed(4) : '\u2014'}
                        </span>
                        <span className="text-[10px] text-txt-3">SOL</span>
                      </div>
                    </div>
                  </div>
                  {/* USDC row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-bull/10 flex items-center justify-center text-[12px] font-bold text-bull">$</span>
                      <div>
                        <span className="text-[14px] text-txt-0 font-semibold tabular-nums block leading-tight">
                          {usdcBalance != null ? usdcBalance.toLocaleString() : '\u2014'}
                        </span>
                        <span className="text-[10px] text-txt-3">USDC</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Address + copy */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-drift-border">
                  <p className="text-[10px] text-txt-3 font-mono truncate flex-1">{pubkeyStr}</p>
                  <button onClick={handleCopy}
                    className="p-1 rounded text-txt-3 hover:text-txt-0 hover:bg-drift-surface transition-colors"
                    title="Copy address">
                    {copied ? <Check className="w-3.5 h-3.5 text-bull" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* ─── 3. DEPOSIT & WITHDRAW (Tabbed) ─── */}
              <div className="rounded border border-drift-border overflow-hidden">
                {isUserInitialized ? (
                  <>
                    {/* Tabs */}
                    <div className="flex border-b border-drift-border bg-drift-panel">
                      <button onClick={() => { setActiveTab('deposit'); setConfirmStep(false); }}
                        className={`flex-1 py-2.5 text-[13px] font-semibold text-center transition-colors ${
                          activeTab === 'deposit'
                            ? 'text-bull border-b-2 border-bull'
                            : 'text-txt-3 hover:text-txt-1'
                        }`}>
                        Deposit
                      </button>
                      <button onClick={() => { setActiveTab('withdraw'); setConfirmStep(false); }}
                        className={`flex-1 py-2.5 text-[13px] font-semibold text-center transition-colors ${
                          activeTab === 'withdraw'
                            ? 'text-bear border-b-2 border-bear'
                            : 'text-txt-3 hover:text-txt-1'
                        }`}>
                        Withdraw
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Balance hint */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-txt-3">
                          {activeTab === 'deposit' ? 'Wallet USDC' : 'Free Collateral'}
                        </span>
                        <span className="text-[11px] text-txt-1 tabular-nums font-semibold">
                          {activeTab === 'deposit'
                            ? `${(usdcBalance ?? 0).toLocaleString()} USDC`
                            : `$${freeCollateral.toFixed(2)}`
                          }
                        </span>
                      </div>
                      {/* Amount input with Max */}
                      <div className="flex items-center h-10 rounded bg-drift-bg border border-drift-border focus-within:border-txt-3/40 transition-colors">
                        <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setConfirmStep(false); }}
                          placeholder="0.00" step="any" min="0"
                          className="flex-1 h-full px-3 bg-transparent text-[13px] text-txt-0 tabular-nums outline-none" />
                        <button onClick={handleMax}
                          className="px-2.5 py-1 mr-1.5 text-[10px] font-bold rounded bg-accent/10 text-accent hover:bg-accent/18 transition-colors">
                          MAX
                        </button>
                        <span className="text-[11px] text-txt-3 pr-3 font-medium">USDC</span>
                      </div>

                      {/* Confirmation step */}
                      {!confirmStep ? (
                        <button onClick={() => {
                          const amt = parseFloat(amount) || 0;
                          if (amt <= 0) return;
                          setConfirmStep(true);
                        }}
                          disabled={!(parseFloat(amount) > 0)}
                          className={`w-full h-10 rounded text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            activeTab === 'deposit'
                              ? 'bg-bull/10 text-bull hover:bg-bull/18'
                              : 'bg-bear/10 text-bear hover:bg-bear/18'
                          }`}>
                          {activeTab === 'deposit' ? 'Review Deposit' : 'Review Withdrawal'}
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <div className="rounded bg-drift-bg border border-drift-border px-3 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-txt-3">{activeTab === 'deposit' ? 'Deposit' : 'Withdraw'}</span>
                              <span className="text-[13px] font-semibold text-txt-0 tabular-nums">{parseFloat(amount).toLocaleString()} USDC</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setConfirmStep(false)}
                              className="h-10 rounded text-[11px] font-semibold border border-drift-border text-txt-1 hover:bg-drift-surface transition-colors">
                              Cancel
                            </button>
                            <button
                              onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
                              disabled={!!loading}
                              className={`h-10 rounded text-[12px] font-semibold transition-colors disabled:opacity-30 flex items-center justify-center gap-1.5 ${
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
                  /* Create Account form */
                  <>
                    <SectionLabel label="Create Account" />
                    <div className="p-4 space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-txt-3">Account Name</label>
                        <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                          placeholder="Main Account"
                          className="w-full h-9 px-3 rounded bg-drift-bg border border-drift-border text-[12px] text-txt-0 placeholder:text-txt-3/40 outline-none focus:border-txt-3/40 transition-colors" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-txt-3">Deposit Amount (USDC)</label>
                        <div className="flex items-center h-9 rounded bg-drift-bg border border-drift-border focus-within:border-txt-3/40 transition-colors">
                          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                            placeholder="1000" step="any" min="0"
                            className="flex-1 h-full px-3 bg-transparent text-[12px] text-txt-0 tabular-nums outline-none" />
                          <button onClick={() => setAmount(String(usdcBalance ?? 0))}
                            className="px-2 py-0.5 mr-1 text-[10px] font-bold rounded bg-accent/10 text-accent hover:bg-accent/18 transition-colors">
                            MAX
                          </button>
                          <span className="text-[10px] text-txt-3 pr-3">USDC</span>
                        </div>
                      </div>
                      {(solBalance ?? 0) < 0.01 && (
                        <p className="text-[10px] text-bear">Need SOL for fees — use Faucet dropdown above</p>
                      )}
                      {(usdcBalance ?? 0) <= 0 && (solBalance ?? 0) >= 0.01 && (
                        <p className="text-[10px] text-bear">Need USDC — use Faucet dropdown above</p>
                      )}
                      <button onClick={handleCreate}
                        disabled={!!loading || (solBalance ?? 0) < 0.01 || (usdcBalance ?? 0) <= 0 || !(parseFloat(amount) > 0)}
                        className="w-full h-10 rounded text-[12px] font-semibold bg-accent text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
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
            </div>

            {/* ══ RIGHT COLUMN ══ */}
            <div className="space-y-4">

              {/* ─── 4. SUB-ACCOUNTS ─── */}
              {isUserInitialized && (
                <div className="rounded border border-drift-border overflow-hidden">
                  <SectionLabel label={`Sub-Accounts (${subAccounts.length})`}
                    right={
                      <button onClick={() => setShowCreateSub(!showCreateSub)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded text-accent hover:bg-accent/8 transition-colors">
                        <Plus className="w-3 h-3" /> New
                      </button>
                    }
                  />

                  {/* Sub-account cards */}
                  <div className="divide-y divide-drift-border">
                    {subAccounts.map((acct) => {
                      const isActive = acct.subAccountId === activeSubAccountId;
                      const canDelete = acct.openPositions === 0 && acct.spotBalances <= 1;
                      const acctHealth = 100; // sub-accounts don't expose individual health, use 100 as default
                      const acctPnl = acct.unrealizedPnl ?? 0;
                      return (
                        <div key={acct.subAccountId}
                          className={`px-4 py-3.5 transition-colors ${isActive ? 'bg-drift-bg/60' : 'hover:bg-drift-bg/30'}`}>
                          {/* Top: name + badge */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] font-semibold text-txt-0 truncate">{acct.name}</span>
                              <span className="text-[10px] text-txt-3">#{acct.subAccountId}</span>
                              {isActive && (
                                <span className="px-1.5 py-px text-[9px] font-bold bg-accent text-white rounded shrink-0">Active</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isActive && (
                                <button onClick={() => handleSetActiveSubAccount(acct.subAccountId)}
                                  className="px-2.5 py-1 text-[10px] font-semibold rounded bg-accent/10 text-accent hover:bg-accent/18 transition-colors">
                                  Switch
                                </button>
                              )}
                              <button onClick={() => canDelete && openDeleteDialog(acct.subAccountId)}
                                disabled={!canDelete}
                                className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                                  canDelete ? 'bg-bear/10 text-bear hover:bg-bear/18' : 'text-txt-3 opacity-25 cursor-not-allowed'
                                }`}>
                                Delete
                              </button>
                            </div>
                          </div>
                          {/* Stats row */}
                          <div className="flex items-center gap-4 mb-2">
                            <div>
                              <span className="text-[20px] font-bold tabular-nums text-txt-0 leading-none">
                                ${acct.totalCollateral.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="text-txt-3 tabular-nums">{acct.openPositions} position{acct.openPositions !== 1 ? 's' : ''}</span>
                              <span className={`tabular-nums font-semibold ${acctPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                                {acctPnl >= 0 ? '+' : ''}{acctPnl.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {/* Mini health bar */}
                          <div className="h-1 rounded-full bg-drift-surface overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${acctHealth}%`,
                                background: acctHealth > 50 ? '#24b47e' : acctHealth > 20 ? '#efa411' : '#f84960',
                              }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Collapsible create sub-account form */}
                  {showCreateSub && (
                    <div className="border-t border-drift-border p-4 space-y-2 bg-drift-bg/40">
                      <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                        placeholder="Account name"
                        className="w-full h-8 px-3 rounded bg-drift-bg border border-drift-border text-[11px] text-txt-0 placeholder:text-txt-3/40 outline-none focus:border-txt-3/40 transition-colors" />
                      <div className="flex items-center gap-2">
                        <div className="flex items-center flex-1 h-8 rounded bg-drift-bg border border-drift-border focus-within:border-txt-3/40 transition-colors">
                          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                            placeholder="1000" min="0"
                            className="flex-1 h-full px-3 bg-transparent text-[11px] text-txt-0 tabular-nums outline-none" />
                          <span className="text-[10px] text-txt-3 pr-3">USDC</span>
                        </div>
                        <button onClick={() => { handleCreate(); setShowCreateSub(false); }}
                          disabled={!!loading || !(parseFloat(amount) > 0)}
                          className="h-8 px-4 rounded text-[11px] font-semibold bg-accent text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                          {loading === 'create' ? 'Creating\u2026' : 'Create'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── 5. ACTIVITY LOG (fills vertical space) ─── */}
              <div className="rounded border border-drift-border overflow-hidden flex-1">
                <SectionLabel label="Activity" />
                <div className="min-h-[160px] flex flex-col">
                  {activityLog.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-8">
                      <p className="text-[11px] text-txt-3">No recent activity</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-drift-border">
                      {activityLog.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-[11px] text-txt-1">{entry.text}</span>
                          <span className="text-[10px] text-txt-3 tabular-nums">
                            {new Date(entry.ts).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ─── No account placeholder (full width, below grid) ─── */}
          {!isUserInitialized && (
            <div className="rounded border border-drift-border bg-drift-panel px-4 py-8 text-center">
              <p className="text-[11px] text-txt-3">Create an account to see your summary, sub-accounts, and activity</p>
            </div>
          )}

        </div>
      </div>

      {/* ── Delete Dialog ── */}
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
              className="px-4 py-2 rounded text-[11px] font-semibold border border-drift-border text-txt-1 hover:bg-drift-surface transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => selectedSubAccountForDeletion !== null && handleDeleteUser(selectedSubAccountForDeletion)}
              disabled={isDeleting}
              className="px-4 py-2 rounded text-[11px] font-semibold bg-bear text-white hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1.5">
              {isDeleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting&hellip;</> : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

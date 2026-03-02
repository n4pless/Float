import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  TrendingUp,
  Users,
  Percent,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  XCircle,
  CheckCircle2,
  Info,
  Loader2,
  AlertTriangle,
  Wallet,
  CircleDollarSign,
  Activity,
  ChevronRight,
  Unlock,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  useDriftStore,
  selectClient,
  selectIsSubscribed,
  selectInsuranceFundStats,
  selectUserIfStake,
  selectUsdcBalance,
} from '../stores/useDriftStore';

/* ─── Props ─── */
interface InsuranceFundPageProps {
  onBack: () => void;
}

/* ─── USDC Token Badge ─── */
const UsdcBadge: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'sm' }) => {
  const px = size === 'sm' ? 16 : 22;
  return (
    <svg width={px} height={px} viewBox="0 0 32 32" fill="none" className="shrink-0">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path d="M20.2 18.5c0-2.1-1.3-2.8-3.8-3.1-1.8-.3-2.2-.7-2.2-1.5s.6-1.3 1.8-1.3c1.1 0 1.6.4 1.9 1.2.1.1.2.2.3.2h1.1c.2 0 .3-.1.3-.3-.2-1.2-1-2.1-2.3-2.4v-1.4c0-.2-.1-.3-.3-.3h-1c-.2 0-.3.1-.3.3v1.3c-1.6.3-2.6 1.3-2.6 2.6 0 2 1.2 2.7 3.7 3 1.7.3 2.3.7 2.3 1.6 0 .9-.8 1.5-1.9 1.5-1.5 0-2-.6-2.2-1.3-.1-.1-.2-.2-.3-.2h-1.1c-.2 0-.3.1-.3.3.3 1.4 1.1 2.2 2.7 2.5v1.4c0 .2.1.3.3.3h1c.2 0 .3-.1.3-.3v-1.4c1.6-.3 2.6-1.3 2.6-2.7z" fill="white"/>
    </svg>
  );
};

/* ─── Helpers ─── */
function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatUsd(n);
}
function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-drift-surface/60 ${className}`} />
);

const PresetBtn: React.FC<{ label: string; onClick: () => void; active?: boolean }> = ({ label, onClick, active }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide border transition-all duration-200 ${
      active ? 'bg-accent/20 border-accent/40 text-accent shadow-sm shadow-accent/10'
        : 'bg-drift-surface/30 border-drift-border text-txt-3 hover:text-txt-1 hover:border-drift-border-lt hover:bg-drift-surface/50'
    }`}>{label}</button>
);

/* ─── Pool Share Ring ─── */
const PoolShareRing: React.FC<{ pct: number }> = ({ pct }) => {
  const r = 40, c = 2 * Math.PI * r, offset = c - (pct / 100) * c;
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="6"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-1000" />
        <defs><linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4c94ff" /><stop offset="100%" stopColor="#9b7dff" />
        </linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-txt-0">{pct > 0 ? pct.toFixed(1) : '0'}%</span>
        <span className="text-[9px] text-txt-3 uppercase tracking-wider">Share</span>
      </div>
    </div>
  );
};

/* ═══════════ Main Page ═══════════ */
export const InsuranceFundPage: React.FC<InsuranceFundPageProps> = ({ onBack }) => {
  const { connected } = useWallet();
  const client = useDriftStore(selectClient);
  const isSubscribed = useDriftStore(selectIsSubscribed);
  const fundStats = useDriftStore(selectInsuranceFundStats);
  const userStake = useDriftStore(selectUserIfStake);
  const usdcBalance = useDriftStore(selectUsdcBalance);

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchIfData = useCallback(async () => {
    if (!client || !isSubscribed) return;
    try {
      const stats = await client.getInsuranceFundStats(0);
      useDriftStore.getState().setInsuranceFundStats(stats);
      if (connected) {
        const stake = await client.getUserIfStake(0);
        useDriftStore.getState().setUserIfStake(stake);
      }
    } catch (err) { console.error('[if] fetch error', err); }
  }, [client, isSubscribed, connected]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true); await fetchIfData(); setTimeout(() => setIsRefreshing(false), 600);
  }, [fetchIfData]);

  useEffect(() => {
    fetchIfData();
    refreshTimer.current = setInterval(fetchIfData, 5000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchIfData]);

  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t); } }, [success]);

  /* Actions */
  const handleStake = async () => {
    if (!client || !stakeAmount) return;
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid USDC amount'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try { const tx = await client.stakeInInsuranceFund(amount, 0); setSuccess(`Staked ${amount} USDC — tx: ${tx.slice(0, 12)}…`); setStakeAmount(''); await fetchIfData(); }
    catch (err: any) { setError(err?.message || 'Stake failed'); } finally { setLoading(false); }
  };

  const handleRequestUnstake = async () => {
    if (!client || !unstakeAmount) return;
    const amount = parseFloat(unstakeAmount);
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid USDC amount'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try { const tx = await client.requestUnstakeInsuranceFund(amount, 0); setSuccess(`Unstake requested — tx: ${tx.slice(0, 12)}…`); setUnstakeAmount(''); await fetchIfData(); }
    catch (err: any) { setError(err?.message || 'Unstake request failed'); } finally { setLoading(false); }
  };

  const handleCompleteUnstake = async () => {
    if (!client) return;
    setLoading(true); setError(null); setSuccess(null);
    try { const tx = await client.completeUnstakeInsuranceFund(0); setSuccess(`Unstake complete — tx: ${tx.slice(0, 12)}…`); await fetchIfData(); }
    catch (err: any) { setError(err?.message || 'Unstake completion failed'); } finally { setLoading(false); }
  };

  const handleCancelUnstake = async () => {
    if (!client) return;
    setLoading(true); setError(null); setSuccess(null);
    try { const tx = await client.cancelUnstakeInsuranceFund(0); setSuccess(`Unstake cancelled — tx: ${tx.slice(0, 12)}…`); await fetchIfData(); }
    catch (err: any) { setError(err?.message || 'Cancel failed'); } finally { setLoading(false); }
  };

  /* Derived */
  const dataLoaded = !!fundStats;
  const stakerSharePct = fundStats ? (fundStats.totalFactor > 0 ? ((fundStats.userFactor / fundStats.totalFactor) * 100).toFixed(0) : '0') : '—';
  const ifFeePct = fundStats ? ((fundStats.totalFactor / 10000) * 100).toFixed(1) : '—';
  const hasPendingWithdraw = userStake?.isInitialized && userStake.lastWithdrawRequestShares !== '0' && userStake.lastWithdrawRequestTs > 0;
  const walletUsdc = usdcBalance != null ? usdcBalance : 0;
  const userSharePct = (() => {
    if (!fundStats || !userStake?.isInitialized) return 0;
    const total = Number(fundStats.totalShares), user = Number(userStake.ifShares);
    return total > 0 ? Math.min((user / total) * 100, 100) : 0;
  })();
  const handleStakePreset = (pct: number) => { if (walletUsdc > 0) setStakeAmount((walletUsdc * pct).toFixed(2)); };
  const handleUnstakePreset = (pct: number) => {
    if (userStake?.isInitialized && userStake.stakeValue > 0) setUnstakeAmount((userStake.stakeValue * pct).toFixed(2));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto bg-drift-bg">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 py-3 bg-drift-bg/80 backdrop-blur-xl border-b border-drift-border">
        <button onClick={onBack} className="p-1.5 rounded-lg text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20"><Shield className="w-4 h-4 text-accent" /></div>
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-bull animate-pulse" />
          </div>
          <h1 className="text-sm sm:text-base font-bold text-txt-0">Insurance Fund</h1>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-drift-surface/40 border border-drift-border">
          <UsdcBadge /><span className="text-[10px] text-accent font-semibold">USDC</span>
        </div>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bull/8 border border-bull/15">
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          <span className="text-[10px] text-bull font-bold uppercase tracking-wide">Live</span>
        </div>
        <button onClick={handleRefresh} className={`p-1.5 rounded-lg text-txt-3 hover:text-txt-0 hover:bg-drift-surface transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ══════ Hero ══════ */}
        <div className="relative rounded-2xl overflow-hidden animate-fadeInUp">
          <div className="absolute inset-0 mesh-gradient" />
          <div className="absolute inset-0 noise-overlay" />
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-accent/5 blur-[80px] -translate-y-1/3 translate-x-1/4 animate-pulseGlow" />
          <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full bg-purple/5 blur-[60px] translate-y-1/3 -translate-x-1/4 animate-pulseGlow" style={{ animationDelay: '1s' }} />
          <div className="relative z-10 p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row items-start gap-6">
              <div className="flex items-start gap-5 flex-1">
                <div className="relative shrink-0 animate-float">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-accent/15 to-purple/10 border border-accent/10 shadow-2xl shadow-accent/5">
                    <ShieldCheck className="w-10 h-10 text-accent" />
                  </div>
                </div>
                <div className="space-y-3 pt-1">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-txt-0 tracking-tight">Insurance Fund</h2>
                    <p className="text-sm text-txt-2 mt-2 leading-relaxed max-w-xl">
                      Protect the exchange from socialized losses. Stake USDC to earn a share of protocol revenue while backstopping the system.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { icon: ShieldCheck, label: 'Backstop Protection', cls: 'text-bull bg-bull/8 border-bull/15' },
                      { icon: Sparkles, label: 'Earn Revenue Share', cls: 'text-accent bg-accent/8 border-accent/15' },
                      { icon: Unlock, label: 'Instant Withdrawal', cls: 'text-purple bg-purple/8 border-purple/15' },
                    ].map(t => (
                      <div key={t.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold ${t.cls} transition-transform hover:scale-[1.02]`}>
                        <t.icon className="w-3 h-3" />{t.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="hidden lg:flex flex-col items-end gap-2 shrink-0 min-w-[180px] animate-slideInRight">
                <span className="text-[10px] text-txt-3 uppercase tracking-widest font-medium">Vault Total</span>
                {dataLoaded ? (
                  <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-bull to-bull/70 tracking-tight">{formatUsd(fundStats!.vaultBalance)}</span>
                ) : <Skeleton className="h-9 w-36" />}
                <span className="text-[11px] text-txt-3 font-medium">{ifFeePct}% of protocol fees</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════ Stats Grid ══════ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: CircleDollarSign, label: 'Vault Balance', value: fundStats ? formatCompact(fundStats.vaultBalance) : '—', sub: 'Total USDC deposited', color: 'text-bull', glow: 'from-bull/20 to-bull/5' },
            { icon: Users, label: 'Total Shares', value: fundStats ? Number(fundStats.totalShares).toLocaleString() : '—', sub: `Your: ${fundStats ? Number(fundStats.userShares).toLocaleString() : '—'}`, color: 'text-accent', glow: 'from-accent/20 to-accent/5' },
            { icon: Percent, label: 'Fee Allocation', value: `${ifFeePct}%`, sub: `${stakerSharePct}% to stakers`, color: 'text-purple', glow: 'from-purple/20 to-purple/5' },
            { icon: Unlock, label: 'Withdrawal', value: 'Instant', sub: fundStats ? `Settles ${formatDuration(fundStats.revenueSettlePeriod)}` : '—', color: 'text-bull', glow: 'from-bull/20 to-bull/5' },
            { icon: BarChart3, label: 'Fees Collected', value: fundStats ? formatCompact(fundStats.totalFeesCollected) : '—', sub: 'From trading activity', color: 'text-accent', glow: 'from-accent/20 to-accent/5' },
          ].map((s, i) => (
            <div key={s.label} className={`group glass-card rounded-xl p-4 flex flex-col gap-2.5 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-lg animate-fadeInUp stagger-${i + 1}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-txt-3 font-medium uppercase tracking-wider">{s.label}</span>
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${s.glow} ${s.color}`}><s.icon className="w-3.5 h-3.5" /></div>
              </div>
              {!dataLoaded ? <Skeleton className="h-7 w-20" /> : <div className={`text-xl font-bold tracking-tight ${s.color}`}>{s.value}</div>}
              <div className="text-[10px] text-txt-3 leading-snug">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ══════ Main Content ══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Stake/Unstake */}
          <div className="lg:col-span-7 space-y-4 animate-fadeInUp stagger-2">
            {/* Tabs */}
            <div className="flex rounded-xl bg-drift-panel/60 border border-drift-border p-1 gap-1 backdrop-blur-sm">
              {(['stake', 'unstake'] as const).map(tab => {
                const act = activeTab === tab, isS = tab === 'stake';
                return (
                  <button key={tab} onClick={() => { setActiveTab(tab); setError(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-lg transition-all duration-300 ${
                      act ? (isS ? 'bg-gradient-to-r from-bull/15 to-bull/5 text-bull shadow-lg shadow-bull/5 border border-bull/15' : 'bg-gradient-to-r from-bear/15 to-bear/5 text-bear shadow-lg shadow-bear/5 border border-bear/15')
                        : 'text-txt-3 hover:text-txt-1 hover:bg-drift-surface/30 border border-transparent'}`}>
                    {isS ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                    {isS ? 'Stake' : 'Unstake'}
                  </button>
                );
              })}
            </div>

            {/* Stake form */}
            {activeTab === 'stake' && (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="p-6 space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-semibold text-txt-1">Deposit Amount</label>
                      {connected && (
                        <span className="text-[11px] text-txt-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-drift-surface/40">
                          <Wallet className="w-3 h-3" /><span className="text-txt-2 font-medium">{formatUsd(walletUsdc)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 p-1.5 rounded-xl bg-drift-bg/80 border border-drift-border focus-within:border-accent/40 focus-within:shadow-lg focus-within:shadow-accent/5 transition-all duration-300">
                      <div className="flex items-center gap-2 pl-3"><UsdcBadge size="md" /><span className="text-xs font-bold text-txt-1">USDC</span></div>
                      <input type="number" step="0.01" min="0" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} placeholder="0.00"
                        className="flex-1 px-2 py-2.5 bg-transparent text-right text-txt-0 text-xl font-bold placeholder:text-txt-3/30 focus:outline-none" />
                    </div>
                    {connected && walletUsdc > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                          <PresetBtn key={x.l} label={x.l} onClick={() => handleStakePreset(x.p)} active={stakeAmount === (walletUsdc * x.p).toFixed(2)} />
                        ))}
                      </div>
                    )}
                  </div>
                  {!connected ? (
                    <div className="flex flex-col items-center gap-4 py-6 rounded-xl bg-drift-surface/20 border border-dashed border-drift-border/50">
                      <div className="p-3 rounded-full bg-drift-surface/30"><Wallet className="w-6 h-6 text-txt-3" /></div>
                      <p className="text-xs text-txt-2">Connect your wallet to stake</p><WalletMultiButton />
                    </div>
                  ) : (
                    <button onClick={handleStake} disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-bull to-bull/80 text-white text-sm font-bold hover:shadow-xl hover:shadow-bull/20 hover:translate-y-[-1px] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                      {loading ? 'Staking…' : 'Stake USDC'}
                    </button>
                  )}
                </div>
                <div className="px-6 py-3.5 bg-drift-surface/10 border-t border-drift-border/30 flex items-start gap-2.5 text-[11px] text-txt-3">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent/60" />
                  <span>USDC deposited into the Insurance Fund vault. You'll receive shares proportional to the fund's total value.</span>
                </div>
              </div>
            )}

            {/* Unstake form */}
            {activeTab === 'unstake' && (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="p-6 space-y-5">
                  {hasPendingWithdraw && (
                    <div className="rounded-xl p-5 border bg-gradient-to-r from-bull/8 to-bull/3 border-bull/20">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="p-1.5 rounded-full bg-bull/15 animate-pulse"><CheckCircle2 className="w-4 h-4 text-bull" /></div>
                        <span className="text-sm font-bold text-bull">Unstake Ready!</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-txt-1 mb-4">
                        <span className="flex items-center gap-2"><UsdcBadge /><span className="font-bold text-base text-txt-0">{formatUsd(userStake!.lastWithdrawRequestValue)}</span></span>
                        <span className="font-mono text-bull font-bold text-[11px] uppercase tracking-wide">Ready</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCompleteUnstake} disabled={loading}
                          className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-bull to-bull/80 text-white text-sm font-bold hover:shadow-lg hover:shadow-bull/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Complete Withdrawal
                        </button>
                        <button onClick={handleCancelUnstake} disabled={loading}
                          className="px-4 py-2.5 rounded-lg border border-drift-border text-txt-2 text-sm font-medium hover:bg-drift-surface/50 hover:text-txt-0 transition-all flex items-center gap-2">
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {!hasPendingWithdraw && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-semibold text-txt-1">Withdraw Amount</label>
                          {userStake?.isInitialized && (
                            <span className="text-[11px] text-txt-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-drift-surface/40">
                              <Shield className="w-3 h-3" /><span className="text-txt-2 font-medium">{formatUsd(userStake.stakeValue)}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-drift-bg/80 border border-drift-border focus-within:border-bear/40 focus-within:shadow-lg focus-within:shadow-bear/5 transition-all duration-300">
                          <div className="flex items-center gap-2 pl-3"><UsdcBadge size="md" /><span className="text-xs font-bold text-txt-1">USDC</span></div>
                          <input type="number" step="0.01" min="0" value={unstakeAmount} onChange={e => setUnstakeAmount(e.target.value)} placeholder="0.00"
                            className="flex-1 px-2 py-2.5 bg-transparent text-right text-txt-0 text-xl font-bold placeholder:text-txt-3/30 focus:outline-none" />
                        </div>
                        {userStake?.isInitialized && userStake.stakeValue > 0 && (
                          <div className="flex items-center gap-2 mt-3">
                            {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                              <PresetBtn key={x.l} label={x.l} onClick={() => handleUnstakePreset(x.p)} active={unstakeAmount === (userStake.stakeValue * x.p).toFixed(2)} />
                            ))}
                          </div>
                        )}
                      </div>
                      {!connected ? (
                        <div className="flex flex-col items-center gap-4 py-6 rounded-xl bg-drift-surface/20 border border-dashed border-drift-border/50">
                          <Wallet className="w-6 h-6 text-txt-3" /><p className="text-xs text-txt-2">Connect your wallet to unstake</p><WalletMultiButton />
                        </div>
                      ) : (
                        <button onClick={handleRequestUnstake} disabled={loading || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !userStake?.isInitialized}
                          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-bear to-bear/80 text-white text-sm font-bold hover:shadow-xl hover:shadow-bear/20 hover:translate-y-[-1px] disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2">
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
                          {loading ? 'Processing…' : 'Withdraw'}
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="px-6 py-3.5 bg-drift-surface/10 border-t border-drift-border/30 flex items-start gap-2.5 text-[11px] text-txt-3">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow/60" /><span>Withdrawals are instant — no lock-up period.</span>
                </div>
              </div>
            )}

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-2.5 p-4 rounded-xl bg-bear/8 border border-bear/15 text-bear text-sm animate-scaleIn">
                <AlertTriangle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="p-1 hover:bg-bear/10 rounded-lg transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2.5 p-4 rounded-xl bg-bull/8 border border-bull/15 text-bull text-sm animate-scaleIn">
                <CheckCircle2 className="w-4 h-4 shrink-0" /><span className="flex-1">{success}</span>
              </div>
            )}
          </div>

          {/* Right: Position + Info */}
          <div className="lg:col-span-5 space-y-4 animate-fadeInUp stagger-3">
            {/* Your Position */}
            <div className="glass-card glow-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-drift-border/30">
                <h3 className="text-sm font-bold text-txt-0 flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5"><Wallet className="w-3.5 h-3.5 text-accent" /></div>
                  Your Position
                </h3>
                {userStake?.isInitialized && <span className="text-[10px] px-2.5 py-1 rounded-full bg-bull/10 text-bull font-bold border border-bull/15">Active</span>}
              </div>
              <div className="p-5">
                {!connected ? (
                  <div className="text-center py-10">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-drift-surface/60 to-drift-surface/20 border border-drift-border/30 flex items-center justify-center mx-auto mb-5">
                      <Shield className="w-8 h-8 text-txt-3/30" />
                    </div>
                    <p className="text-sm font-semibold text-txt-1 mb-2">Connect Wallet</p>
                    <p className="text-xs text-txt-3 mb-5">View your stake and earnings</p>
                    <WalletMultiButton />
                  </div>
                ) : !userStake?.isInitialized ? (
                  <div className="text-center py-10">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/10 to-purple/10 border border-accent/10 flex items-center justify-center mx-auto mb-5 animate-float">
                      <Sparkles className="w-8 h-8 text-accent/40" />
                    </div>
                    <p className="text-sm font-semibold text-txt-1 mb-2">No Active Stake</p>
                    <p className="text-xs text-txt-3 mb-4">Deposit USDC to start earning yield</p>
                    <button onClick={() => setActiveTab('stake')}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent/15 to-accent/5 text-accent text-xs font-bold border border-accent/15 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/10 transition-all">
                      Get Started <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="text-center py-3">
                      <div className="text-[10px] text-txt-3 uppercase tracking-widest font-medium mb-2">Staked Value</div>
                      <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-bull to-bull/70 tracking-tight">{formatUsd(userStake.stakeValue)}</div>
                      <div className={`text-sm font-bold mt-2 flex items-center justify-center gap-1.5 ${userStake.stakeValue - userStake.costBasis >= 0 ? 'text-bull' : 'text-bear'}`}>
                        <TrendingUp className="w-3.5 h-3.5" />{formatUsd(userStake.stakeValue - userStake.costBasis)} P&L
                      </div>
                    </div>
                    <PoolShareRing pct={userSharePct} />
                    <div className="rounded-xl bg-drift-bg/30 border border-drift-border/20 divide-y divide-drift-border/20">
                      {[
                        { label: 'Your Shares', value: Number(userStake.ifShares).toLocaleString(), mono: true },
                        { label: 'Cost Basis', value: formatUsd(userStake.costBasis) },
                        ...(hasPendingWithdraw ? [{ label: 'Pending Unstake', value: formatUsd(userStake.lastWithdrawRequestValue), color: 'text-yellow' as const }] : []),
                      ].map(row => (
                        <div key={row.label} className="flex justify-between items-center px-4 py-3">
                          <span className="text-[11px] text-txt-3">{row.label}</span>
                          <span className={`text-xs font-semibold ${'color' in row ? row.color : 'text-txt-0'} ${'mono' in row ? 'font-mono' : ''}`}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* How It Works */}
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-drift-border/30">
                <h3 className="text-sm font-bold text-txt-0 flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple/20 to-purple/5"><Info className="w-3.5 h-3.5 text-purple" /></div>
                  How It Works
                </h3>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { step: 1, title: 'Stake USDC', desc: 'Deposit from your wallet into the vault', icon: ArrowDownToLine, color: 'from-accent to-accent/80' },
                  { step: 2, title: 'Earn Protocol Revenue', desc: `${ifFeePct}% of fees flow to the fund`, icon: Sparkles, color: 'from-bull to-bull/80' },
                  { step: 3, title: 'Withdraw Anytime', desc: 'No lock-up — instant withdrawals', icon: Unlock, color: 'from-purple to-purple/80' },
                ].map(({ title, desc, icon: Icon, color }) => (
                  <div key={title} className="flex gap-4 items-start group">
                    <div className={`shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="pt-0.5"><div className="text-xs font-bold text-txt-0">{title}</div><div className="text-[11px] text-txt-3 mt-0.5">{desc}</div></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk */}
            <div className="rounded-xl bg-bear/4 border border-bear/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-bear/80"><AlertTriangle className="w-3.5 h-3.5" />Risk Disclosure</div>
              <p className="text-[11px] text-txt-3 leading-relaxed">Stakers take on the risk of covering bankrupt accounts. If losses exceed the fund, you may lose part of your deposit.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

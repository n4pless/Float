import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  TrendingUp,
  DollarSign,
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
  Zap,
  CircleDollarSign,
  Activity,
  ChevronRight,
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
import type { InsuranceFundStats, UserIfStake } from '../sdk/drift-client-wrapper';

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

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ─── Skeleton Loader ─── */
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-drift-surface/80 ${className}`} />
);

/* ─── Enhanced Stat Card ─── */
const StatCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
  accent?: string; // tailwind bg class for the glow accent
}> = ({ icon: Icon, label, value, sub, color = 'text-accent', loading: isLoading, accent }) => (
  <div className="group relative rounded-xl border border-drift-border bg-drift-panel/80 hover:border-drift-border-lt p-4 flex flex-col gap-2 transition-all duration-200 overflow-hidden">
    {/* subtle top glow bar */}
    {accent && (
      <div className={`absolute top-0 left-3 right-3 h-[2px] rounded-b-full ${accent} opacity-40 group-hover:opacity-70 transition-opacity`} />
    )}
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-txt-3 font-medium uppercase tracking-wider">{label}</span>
      <div className={`p-1.5 rounded-lg bg-drift-surface/60 ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
    </div>
    {isLoading ? (
      <Skeleton className="h-6 w-24" />
    ) : (
      <div className={`text-xl font-bold tracking-tight ${color}`}>{value}</div>
    )}
    {sub && <div className="text-[10px] text-txt-3 leading-snug">{sub}</div>}
  </div>
);

/* ─── Preset Amount Button ─── */
const PresetBtn: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ label, onClick, active }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide border transition-all duration-150 ${
      active
        ? 'bg-accent/15 border-accent/30 text-accent'
        : 'bg-drift-surface/40 border-drift-border text-txt-3 hover:text-txt-1 hover:border-drift-border-lt'
    }`}
  >
    {label}
  </button>
);

/* ─── Pool Share Bar ─── */
const PoolShareBar: React.FC<{ userShares: string; totalShares: string }> = ({ userShares, totalShares }) => {
  const user = Number(userShares);
  const total = Number(totalShares);
  const pct = total > 0 ? Math.min((user / total) * 100, 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-txt-3">Your Pool Share</span>
        <span className="text-accent font-bold">{pct > 0 ? `${pct.toFixed(2)}%` : '—'}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-drift-surface/80 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-purple transition-all duration-700"
          style={{ width: `${Math.max(pct, 0)}%` }}
        />
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

  /* ── Fetch IF data ── */
  const fetchIfData = useCallback(async () => {
    if (!client || !isSubscribed) return;
    try {
      const stats = await client.getInsuranceFundStats(0);
      useDriftStore.getState().setInsuranceFundStats(stats);

      if (connected) {
        const stake = await client.getUserIfStake(0);
        useDriftStore.getState().setUserIfStake(stake);
      }
    } catch (err) {
      console.error('[if] fetch error', err);
    }
  }, [client, isSubscribed, connected]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchIfData();
    setTimeout(() => setIsRefreshing(false), 600);
  }, [fetchIfData]);

  useEffect(() => {
    fetchIfData();
    refreshTimer.current = setInterval(fetchIfData, 5000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [fetchIfData]);

  // Auto-dismiss success after 5s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  /* ── Actions ── */
  const handleStake = async () => {
    if (!client || !stakeAmount) return;
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Enter a valid USDC amount');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await client.stakeInInsuranceFund(amount, 0);
      setSuccess(`Staked ${amount} USDC — tx: ${tx.slice(0, 12)}…`);
      setStakeAmount('');
      await fetchIfData();
    } catch (err: any) {
      setError(err?.message || 'Stake failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestUnstake = async () => {
    if (!client || !unstakeAmount) return;
    const amount = parseFloat(unstakeAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Enter a valid USDC amount');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await client.requestUnstakeInsuranceFund(amount, 0);
      setSuccess(`Unstake requested — tx: ${tx.slice(0, 12)}…`);
      setUnstakeAmount('');
      await fetchIfData();
    } catch (err: any) {
      setError(err?.message || 'Unstake request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteUnstake = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await client.completeUnstakeInsuranceFund(0);
      setSuccess(`Unstake complete — tx: ${tx.slice(0, 12)}…`);
      await fetchIfData();
    } catch (err: any) {
      setError(err?.message || 'Unstake completion failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelUnstake = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await client.cancelUnstakeInsuranceFund(0);
      setSuccess(`Unstake request cancelled — tx: ${tx.slice(0, 12)}…`);
      await fetchIfData();
    } catch (err: any) {
      setError(err?.message || 'Cancel failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── Derived values ── */
  const dataLoaded = !!fundStats;
  const stakerSharePct = fundStats
    ? fundStats.totalFactor > 0
      ? ((fundStats.userFactor / fundStats.totalFactor) * 100).toFixed(0)
      : '0'
    : '—';
  const ifFeePct = fundStats ? ((fundStats.totalFactor / 10000) * 100).toFixed(1) : '—';
  const hasPendingWithdraw =
    userStake?.isInitialized &&
    userStake.lastWithdrawRequestShares !== '0' &&
    userStake.lastWithdrawRequestTs > 0;
  const walletUsdc = usdcBalance != null ? usdcBalance : 0;

  /* Stake preset amounts */
  const handleStakePreset = (pct: number) => {
    if (walletUsdc > 0) setStakeAmount((walletUsdc * pct).toFixed(2));
  };
  const handleUnstakePreset = (pct: number) => {
    if (userStake?.isInitialized && userStake.stakeValue > 0)
      setUnstakeAmount((userStake.stakeValue * pct).toFixed(2));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto bg-drift-bg">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 bg-drift-bg/90 backdrop-blur-xl border-b border-drift-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="relative">
          <Shield className="w-5 h-5 text-accent" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-bull animate-pulse" />
        </div>
        <h1 className="text-sm sm:text-base font-bold text-txt-0">Insurance Fund</h1>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/8 border border-accent/15">
          <UsdcBadge size="sm" />
          <span className="text-[10px] text-accent font-semibold">USDC</span>
        </div>
        <div className="flex-1" />

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-drift-surface/60">
          <Activity className="w-3 h-3 text-bull" />
          <span className="text-[10px] text-txt-3 font-medium">Live</span>
        </div>

        <button
          onClick={handleRefresh}
          className={`p-1.5 rounded-lg text-txt-3 hover:text-txt-0 hover:bg-drift-surface transition-all ${
            isRefreshing ? 'animate-spin' : ''
          }`}
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-full px-4 sm:px-6 py-5 space-y-5">
        {/* ══════ Hero ══════ */}
        <div className="relative rounded-2xl overflow-hidden border border-accent/15">
          {/* Animated gradient BG */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/8 via-drift-panel to-purple/8" />
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-accent/5 blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-purple/5 blur-3xl translate-y-1/2 -translate-x-1/4" />

          <div className="relative flex flex-col sm:flex-row items-start gap-5 p-5 sm:p-7">
            {/* Shield illustration */}
            <div className="relative shrink-0">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/15 shadow-lg shadow-accent/5">
                <ShieldCheck className="w-10 h-10 text-accent" />
              </div>
              {/* decorative ring */}
              <div className="absolute -inset-2 rounded-3xl border border-accent/10 opacity-60" />
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <h2 className="text-xl font-bold text-txt-0 tracking-tight">Insurance Fund</h2>
                <p className="text-sm text-txt-2 mt-1.5 leading-relaxed max-w-xl">
                  Protect the exchange from socialized losses. When a trader goes bankrupt, the
                  Insurance Fund covers the deficit — preventing ADL of profitable traders.
                  Stake USDC to earn a share of protocol revenue.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {[
                  { icon: ShieldCheck, label: 'Backstop Protection', color: 'text-bull', bg: 'bg-bull/8 border-bull/15' },
                  { icon: Zap, label: 'Earn Protocol Revenue', color: 'text-accent', bg: 'bg-accent/8 border-accent/15' },
                  { icon: CheckCircle2, label: 'Instant Withdrawal', color: 'text-bull', bg: 'bg-bull/8 border-bull/15' },
                ].map(tag => (
                  <div key={tag.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${tag.color} ${tag.bg}`}>
                    <tag.icon className="w-3 h-3" />
                    {tag.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick vault total (desktop) */}
            <div className="hidden lg:flex flex-col items-end gap-1 shrink-0 min-w-[140px]">
              <span className="text-[10px] text-txt-3 uppercase tracking-wider font-medium">Vault Total</span>
              {dataLoaded ? (
                <span className="text-2xl font-bold text-bull tracking-tight">
                  {formatUsd(fundStats!.vaultBalance)}
                </span>
              ) : (
                <Skeleton className="h-8 w-28" />
              )}
              <span className="text-[10px] text-txt-3">{ifFeePct}% of fees → fund</span>
            </div>
          </div>
        </div>

        {/* ══════ Stats Grid ══════ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            icon={CircleDollarSign}
            label="Vault Balance"
            value={fundStats ? formatUsd(fundStats.vaultBalance) : '—'}
            sub="Total USDC deposited"
            color="text-bull"
            accent="bg-bull"
            loading={!dataLoaded}
          />
          <StatCard
            icon={Users}
            label="Total Shares"
            value={fundStats ? Number(fundStats.totalShares).toLocaleString() : '—'}
            sub={`User: ${fundStats ? Number(fundStats.userShares).toLocaleString() : '—'}`}
            color="text-accent"
            accent="bg-accent"
            loading={!dataLoaded}
          />
          <StatCard
            icon={Percent}
            label="Fee Allocation"
            value={`${ifFeePct}%`}
            sub={`${stakerSharePct}% to stakers`}
            color="text-purple"
            accent="bg-purple"
            loading={!dataLoaded}
          />
          <StatCard
            icon={CheckCircle2}
            label="Withdrawals"
            value="Instant"
            sub={`Revenue settles every ${fundStats ? formatDuration(fundStats.revenueSettlePeriod) : '—'}`}
            color="text-bull"
            accent="bg-bull"
            loading={!dataLoaded}
          />
          <StatCard
            icon={Activity}
            label="Total Fees"
            value={fundStats ? `$${fundStats.totalFeesCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            sub="Collected from trading"
            color="text-accent"
            accent="bg-accent"
            loading={!dataLoaded}
          />
        </div>

        {/* ══════ Main Content ══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ── Left: Stake / Unstake (7 cols) ── */}
          <div className="lg:col-span-7 space-y-4">
            {/* Tab bar */}
            <div className="flex rounded-xl bg-drift-panel border border-drift-border p-1 gap-1">
              {(['stake', 'unstake'] as const).map(tab => {
                const isActive = activeTab === tab;
                const isStake = tab === 'stake';
                return (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setError(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                      isActive
                        ? isStake
                          ? 'bg-bull/12 text-bull shadow-sm shadow-bull/10'
                          : 'bg-bear/12 text-bear shadow-sm shadow-bear/10'
                        : 'text-txt-3 hover:text-txt-1 hover:bg-drift-surface/40'
                    }`}
                  >
                    {isStake ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                    {isStake ? 'Stake' : 'Unstake'}
                  </button>
                );
              })}
            </div>

            {/* ── Stake Form ── */}
            {activeTab === 'stake' && (
              <div className="rounded-xl bg-drift-panel border border-drift-border overflow-hidden">
                <div className="p-5 space-y-4">
                  {/* Amount input */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-txt-2">Deposit Amount</label>
                      {connected && (
                        <span className="text-[10px] text-txt-3 flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          Wallet: <span className="text-txt-1 font-medium">{formatUsd(walletUsdc)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 p-1 rounded-xl bg-drift-bg border border-drift-border focus-within:border-accent/40 transition-all">
                      <div className="flex items-center gap-2 pl-3">
                        <UsdcBadge size="md" />
                        <span className="text-xs font-bold text-txt-1">USDC</span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 px-2 py-2.5 bg-transparent text-right text-txt-0 text-lg font-bold placeholder:text-txt-3/40 focus:outline-none"
                      />
                    </div>
                    {/* Preset buttons */}
                    {connected && walletUsdc > 0 && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {[
                          { label: '25%', pct: 0.25 },
                          { label: '50%', pct: 0.5 },
                          { label: '75%', pct: 0.75 },
                          { label: 'MAX', pct: 1 },
                        ].map(p => (
                          <PresetBtn
                            key={p.label}
                            label={p.label}
                            onClick={() => handleStakePreset(p.pct)}
                            active={stakeAmount === (walletUsdc * p.pct).toFixed(2)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  {!connected ? (
                    <div className="flex flex-col items-center gap-3 py-3 rounded-xl bg-drift-surface/30 border border-dashed border-drift-border">
                      <Wallet className="w-6 h-6 text-txt-3" />
                      <p className="text-xs text-txt-2">Connect your wallet to stake</p>
                      <WalletMultiButton />
                    </div>
                  ) : (
                    <button
                      onClick={handleStake}
                      disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-bull to-bull/80 text-white text-sm font-bold
                                 hover:shadow-lg hover:shadow-bull/20 disabled:opacity-40 disabled:cursor-not-allowed
                                 disabled:hover:shadow-none active:scale-[0.99] transition-all duration-200
                                 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowDownToLine className="w-4 h-4" />
                      )}
                      {loading ? 'Staking…' : 'Stake USDC'}
                    </button>
                  )}
                </div>

                {/* Info footer */}
                <div className="px-5 py-3 bg-drift-surface/20 border-t border-drift-border/50 flex items-start gap-2.5 text-[11px] text-txt-3">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent/70" />
                  <span>
                    USDC will be deposited from your wallet into the Insurance Fund vault.
                    You'll receive shares proportional to the fund's total value. Withdrawals are instant — no lock-up period.
                  </span>
                </div>
              </div>
            )}

            {/* ── Unstake Form ── */}
            {activeTab === 'unstake' && (
              <div className="rounded-xl bg-drift-panel border border-drift-border overflow-hidden">
                <div className="p-5 space-y-4">
                  {/* Pending withdraw banner */}
                  {hasPendingWithdraw && (
                    <div className="rounded-xl p-4 border bg-gradient-to-r from-bull/8 to-bull/3 border-bull/20">
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="p-1 rounded-full bg-bull/15">
                          <CheckCircle2 className="w-4 h-4 text-bull" />
                        </div>
                        <span className="text-sm font-bold text-bull">
                          Unstake Ready!
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-txt-1 mb-3">
                        <span className="flex items-center gap-1.5">
                          <UsdcBadge />
                          {formatUsd(userStake!.lastWithdrawRequestValue)}
                        </span>
                        <span className="font-mono text-bull font-bold">Ready to withdraw</span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCompleteUnstake}
                          disabled={loading}
                          className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-bull to-bull/80 text-white text-sm font-bold
                                     hover:shadow-lg hover:shadow-bull/20 disabled:opacity-40 transition-all
                                     flex items-center justify-center gap-2"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Complete Withdrawal
                        </button>
                        <button
                          onClick={handleCancelUnstake}
                          disabled={loading}
                          className="px-4 py-2.5 rounded-lg border border-drift-border text-txt-2 text-sm font-medium
                                     hover:bg-drift-surface/50 hover:text-txt-0 transition-all flex items-center gap-2"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Request new unstake */}
                  {!hasPendingWithdraw && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-txt-2">Withdraw Amount</label>
                          {userStake?.isInitialized && (
                            <span className="text-[10px] text-txt-3 flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              Staked: <span className="text-txt-1 font-medium">{formatUsd(userStake.stakeValue)}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 p-1 rounded-xl bg-drift-bg border border-drift-border focus-within:border-bear/40 transition-all">
                          <div className="flex items-center gap-2 pl-3">
                            <UsdcBadge size="md" />
                            <span className="text-xs font-bold text-txt-1">USDC</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={unstakeAmount}
                            onChange={(e) => setUnstakeAmount(e.target.value)}
                            placeholder="0.00"
                            className="flex-1 px-2 py-2.5 bg-transparent text-right text-txt-0 text-lg font-bold placeholder:text-txt-3/40 focus:outline-none"
                          />
                        </div>
                        {userStake?.isInitialized && userStake.stakeValue > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            {[
                              { label: '25%', pct: 0.25 },
                              { label: '50%', pct: 0.5 },
                              { label: '75%', pct: 0.75 },
                              { label: 'MAX', pct: 1 },
                            ].map(p => (
                              <PresetBtn
                                key={p.label}
                                label={p.label}
                                onClick={() => handleUnstakePreset(p.pct)}
                                active={unstakeAmount === (userStake.stakeValue * p.pct).toFixed(2)}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {!connected ? (
                        <div className="flex flex-col items-center gap-3 py-3 rounded-xl bg-drift-surface/30 border border-dashed border-drift-border">
                          <Wallet className="w-6 h-6 text-txt-3" />
                          <p className="text-xs text-txt-2">Connect your wallet to unstake</p>
                          <WalletMultiButton />
                        </div>
                      ) : (
                        <button
                          onClick={handleRequestUnstake}
                          disabled={loading || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !userStake?.isInitialized}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-bear to-bear/80 text-white text-sm font-bold
                                     hover:shadow-lg hover:shadow-bear/20 disabled:opacity-40 disabled:cursor-not-allowed
                                     disabled:hover:shadow-none active:scale-[0.99] transition-all duration-200
                                     flex items-center justify-center gap-2"
                        >
                          {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowUpFromLine className="w-4 h-4" />
                          )}
                          {loading ? 'Processing…' : 'Withdraw'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Info footer */}
                <div className="px-5 py-3 bg-drift-surface/20 border-t border-drift-border/50 flex items-start gap-2.5 text-[11px] text-txt-3">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow/70" />
                  <span>
                    Withdrawals are instant — no lock-up period. Request unstake, then
                    complete the withdrawal immediately.
                  </span>
                </div>
              </div>
            )}

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-bear/8 border border-bear/15 text-bear text-sm animate-in slide-in-from-top-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="p-0.5 hover:bg-bear/10 rounded transition-colors">
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-bull/8 border border-bull/15 text-bull text-sm animate-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="flex-1">{success}</span>
              </div>
            )}
          </div>

          {/* ── Right: Position + Info (5 cols) ── */}
          <div className="lg:col-span-5 space-y-4">

            {/* Your Position */}
            <div className="rounded-xl bg-drift-panel border border-drift-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-drift-border/50">
                <h3 className="text-sm font-bold text-txt-0 flex items-center gap-2">
                  <div className="p-1 rounded-md bg-accent/10">
                    <Wallet className="w-3.5 h-3.5 text-accent" />
                  </div>
                  Your Position
                </h3>
                {userStake?.isInitialized && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-bull/10 text-bull font-semibold">Active</span>
                )}
              </div>

              <div className="p-5">
                {!connected ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-drift-surface/50 border border-drift-border flex items-center justify-center mx-auto mb-4">
                      <Shield className="w-7 h-7 text-txt-3/50" />
                    </div>
                    <p className="text-sm text-txt-2 mb-1">Connect Wallet</p>
                    <p className="text-xs text-txt-3 mb-4">View your stake and earnings</p>
                    <WalletMultiButton />
                  </div>
                ) : !userStake?.isInitialized ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-2xl bg-drift-surface/50 border border-drift-border flex items-center justify-center mx-auto mb-4">
                      <ArrowDownToLine className="w-7 h-7 text-txt-3/50" />
                    </div>
                    <p className="text-sm text-txt-2 mb-1">No Active Stake</p>
                    <p className="text-xs text-txt-3 mb-3">Deposit USDC to start earning yield</p>
                    <button
                      onClick={() => setActiveTab('stake')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/15 transition-all"
                    >
                      Get Started <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Big value */}
                    <div className="text-center py-2">
                      <div className="text-[10px] text-txt-3 uppercase tracking-wider font-medium mb-1">Staked Value</div>
                      <div className="text-3xl font-bold text-bull tracking-tight">{formatUsd(userStake.stakeValue)}</div>
                      <div className={`text-xs font-semibold mt-1 flex items-center justify-center gap-1 ${
                        userStake.stakeValue - userStake.costBasis >= 0 ? 'text-bull' : 'text-bear'
                      }`}>
                        <TrendingUp className="w-3 h-3" />
                        {formatUsd(userStake.stakeValue - userStake.costBasis)} P&L
                      </div>
                    </div>

                    {/* Pool share bar */}
                    {fundStats && (
                      <PoolShareBar
                        userShares={userStake.ifShares}
                        totalShares={fundStats.totalShares}
                      />
                    )}

                    {/* Detail rows */}
                    <div className="rounded-lg bg-drift-bg/50 border border-drift-border/30 divide-y divide-drift-border/30">
                      {[
                        { label: 'Your Shares', value: Number(userStake.ifShares).toLocaleString(), mono: true },
                        { label: 'Cost Basis', value: formatUsd(userStake.costBasis) },
                        ...(hasPendingWithdraw
                          ? [{ label: 'Pending Unstake', value: formatUsd(userStake.lastWithdrawRequestValue), color: 'text-yellow' }]
                          : []),
                      ].map(row => (
                        <div key={row.label} className="flex justify-between items-center px-3 py-2.5">
                          <span className="text-[11px] text-txt-3">{row.label}</span>
                          <span className={`text-xs font-semibold ${'color' in row ? row.color : 'text-txt-0'} ${
                            'mono' in row ? 'font-mono' : ''
                          }`}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* How It Works */}
            <div className="rounded-xl bg-drift-panel border border-drift-border overflow-hidden">
              <div className="px-5 py-3.5 border-b border-drift-border/50">
                <h3 className="text-sm font-bold text-txt-0 flex items-center gap-2">
                  <div className="p-1 rounded-md bg-accent/10">
                    <Info className="w-3.5 h-3.5 text-accent" />
                  </div>
                  How It Works
                </h3>
              </div>
              <div className="p-5">
                <ol className="space-y-3">
                  {[
                    { step: 1, title: 'Stake USDC', desc: 'Deposit from your wallet into the vault', color: 'from-accent to-accent' },
                    { step: 2, title: 'Earn Yield', desc: `${ifFeePct}% of fees → fund (${stakerSharePct}% to stakers)`, color: 'from-bull to-bull' },
                    { step: 3, title: 'Withdraw Anytime', desc: 'No lock-up — instant withdrawals', color: 'from-bull to-bull' },
                  ].map(({ step, title, desc, color }) => (
                    <li key={step} className="flex gap-3 items-start">
                      <div className={`shrink-0 w-6 h-6 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-[10px] font-bold text-white shadow-sm`}>
                        {step}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-txt-0 leading-tight">{title}</div>
                        <div className="text-[11px] text-txt-3 mt-0.5">{desc}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Risk */}
            <div className="rounded-xl bg-bear/4 border border-bear/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-bear/80">
                <AlertTriangle className="w-3.5 h-3.5" />
                Risk Disclosure
              </div>
              <p className="text-[11px] text-txt-3 leading-relaxed">
                Stakers take on the risk of covering bankrupt accounts. If losses exceed the fund,
                you may lose part of your deposit. Withdrawals are available instantly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

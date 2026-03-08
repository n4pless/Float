import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  Shield,
  TrendingUp,
  Zap,
  Wallet,
  PieChart,
  CheckCircle2,
  DollarSign,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Percent,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
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
  /** When true, hide the internal header bar (used when embedded inside PortfolioPage) */
  embedded?: boolean;
}

/* ─── Helpers ─── */
function formatUsdPlain(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatCompact(n: number): string {
  return formatUsdPlain(n);
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
  <div className={`animate-pulse bg-drift-surface/60 ${className}`} />
);

/* ─── SVG Arc Gauge for pool share ─── */
const ArcGauge: React.FC<{ pct: number; size?: number }> = ({ pct, size = 80 }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const val = Math.max(0, Math.min(100, pct));
  const offset = circ - (val / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#5c8ae6" strokeWidth={5}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[16px] font-bold tabular-nums text-txt-0 leading-none">{val.toFixed(1)}</span>
        <span className="text-[8px] text-txt-3 mt-0.5">%</span>
      </div>
    </div>
  );
};

/* ─── Mini Donut for fee allocation ─── */
const MiniDonut: React.FC<{ pct: number }> = ({ pct }) => {
  const r = 8, circ = 2 * Math.PI * r, off = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={22} height={22} className="-rotate-90 inline-block mr-1.5 align-middle">
      <circle cx={11} cy={11} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
      <circle cx={11} cy={11} r={r} fill="none" stroke="#5c8ae6" strokeWidth={3}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
    </svg>
  );
};

/* ─── Pill toggle buttons ─── */
const PillBtn: React.FC<{ label: string; onClick: () => void; active?: boolean }> = ({ label, onClick, active }) => (
  <button type="button" onClick={onClick}
    className={`px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
      active ? 'bg-drift-elevated text-txt-0 border border-drift-border' : 'bg-drift-surface text-txt-2 hover:text-txt-0 hover:bg-drift-elevated'
    }`} style={{ borderRadius: 6 }}>{label}</button>
);

/* ═══════════ Main Page ═══════════ */
export const InsuranceFundPage: React.FC<InsuranceFundPageProps> = ({ onBack, embedded }) => {
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
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showStakeInfo, setShowStakeInfo] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Auto-collapse "How It Works" if user has active stake */
  useEffect(() => {
    if (userStake?.isInitialized) setShowHowItWorks(false);
    else setShowHowItWorks(true);
  }, [userStake?.isInitialized]);

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
  const ifFeePctNum = fundStats ? (fundStats.totalFactor / 10000) * 100 : 0;
  const hasPendingWithdraw = userStake?.isInitialized && userStake.lastWithdrawRequestShares !== '0' && userStake.lastWithdrawRequestTs > 0;
  const walletUsdc = usdcBalance != null ? usdcBalance : 0;
  const userSharePct = (() => {
    if (!fundStats || !userStake?.isInitialized) return 0;
    const total = Number(fundStats.totalShares), user = Number(userStake.ifShares);
    return total > 0 ? Math.min((user / total) * 100, 100) : 0;
  })();
  const pnlDollar = userStake?.isInitialized ? userStake.stakeValue - userStake.costBasis : 0;
  const pnlPct = userStake?.isInitialized && userStake.costBasis > 0 ? (pnlDollar / userStake.costBasis) * 100 : 0;

  const handleStakePreset = (pct: number) => { if (walletUsdc > 0) setStakeAmount((walletUsdc * pct).toFixed(2)); };
  const handleUnstakePreset = (pct: number) => {
    if (userStake?.isInitialized && userStake.stakeValue > 0) setUnstakeAmount((userStake.stakeValue * pct).toFixed(2));
  };

  /* Shares preview */
  const stakePreviewShares = (() => {
    const amt = parseFloat(stakeAmount);
    if (!fundStats || isNaN(amt) || amt <= 0) return null;
    const totalShares = Number(fundStats.totalShares);
    const vb = fundStats.vaultBalance;
    if (vb <= 0) return totalShares > 0 ? '—' : amt.toFixed(0);
    return ((amt / vb) * totalShares).toFixed(0);
  })();

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto bg-drift-bg">
      {/* ── Header ── */}
      {!embedded && (
        <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 bg-drift-bg border-b border-drift-border" style={{ height: 48 }}>
          <button onClick={onBack} className="text-txt-1 hover:text-txt-0 text-[13px] font-medium transition-colors">&larr; Back</button>
          <div className="w-px h-4 bg-drift-border" />
          <h1 className="text-[14px] font-semibold text-txt-0">Vault</h1>
          <span className="text-[10px] font-bold text-txt-2 px-2 py-0.5 border border-drift-border bg-drift-surface" style={{ borderRadius: 4 }}>USDC</span>
          <div className="flex-1" />
          <span className="hidden sm:inline text-[10px] text-bull font-medium">● Live</span>
          <button onClick={handleRefresh} className={`text-[11px] text-txt-1 hover:text-txt-0 transition-colors ${isRefreshing ? 'opacity-50' : ''}`}>
            Refresh
          </button>
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* ╔══════════════════════════════════════════╗
            ║  1. HERO SECTION — gradient card          ║
            ╚══════════════════════════════════════════╝ */}
        <div className="border border-drift-border bg-drift-panel overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8">
              <div className="flex-1 space-y-3">
                <h2 className="text-[12px] font-semibold text-txt-1 uppercase tracking-widest">Insurance Fund</h2>
                {dataLoaded ? (
                  <div className="text-[40px] sm:text-[48px] font-bold tracking-tight leading-none font-mono tabular-nums text-txt-0">
                    ${fundStats!.vaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                ) : <Skeleton className="h-14 w-64" />}
                <p className="text-[13px] text-txt-1 leading-relaxed max-w-lg">
                  Stake USDC to earn <span className="text-txt-0 font-semibold">{ifFeePct}%</span> of protocol revenue while backstopping the exchange against socialized losses.
                </p>
              </div>
            </div>
            {/* Icon chips */}
            <div className="flex flex-wrap items-center gap-2.5 mt-5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-drift-elevated border border-drift-border" style={{ borderRadius: 4 }}>
                <Shield className="w-3.5 h-3.5 text-txt-2" />
                <span className="text-[11px] font-medium text-txt-0">Backstop Protection</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-drift-elevated border border-drift-border" style={{ borderRadius: 4 }}>
                <TrendingUp className="w-3.5 h-3.5 text-txt-2" />
                <span className="text-[11px] font-medium text-txt-0">Revenue Share</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-drift-elevated border border-drift-border" style={{ borderRadius: 4 }}>
                <Zap className="w-3.5 h-3.5 text-txt-2" />
                <span className="text-[11px] font-medium text-txt-0">Instant Withdrawal</span>
              </div>
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════╗
            ║  2. VAULT STATS ROW                       ║
            ╚══════════════════════════════════════════╝ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Primary: Vault Balance */}
          <div className="border border-drift-border bg-drift-panel p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-txt-2" />
              <span className="text-[11px] text-txt-1 uppercase tracking-wide font-semibold">Vault Balance</span>
            </div>
            {!dataLoaded ? <Skeleton className="h-7 w-20" /> : (
              <span className="text-[22px] font-bold font-mono tabular-nums text-txt-0 leading-none">{formatCompact(fundStats!.vaultBalance)}</span>
            )}
            <span className="text-[10px] text-txt-1">Total USDC deposited</span>
          </div>
          {/* Secondary: Total Shares */}
          <div className="border border-drift-border bg-drift-panel/60 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-txt-1" />
              <span className="text-[10px] text-txt-1 uppercase tracking-wide">Total Shares</span>
            </div>
            {!dataLoaded ? <Skeleton className="h-5 w-16" /> : (
              <span className="text-[15px] font-semibold font-mono tabular-nums text-txt-0 leading-none">{Number(fundStats!.totalShares).toLocaleString()}</span>
            )}
            <span className="text-[10px] font-mono text-txt-1">Yours: {fundStats ? Number(fundStats.userShares).toLocaleString() : '—'}</span>
          </div>
          {/* Secondary: Fee Allocation with mini donut */}
          <div className="border border-drift-border bg-drift-panel/60 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-txt-1" />
              <span className="text-[10px] text-txt-1 uppercase tracking-wide">Fee Allocation</span>
            </div>
            {!dataLoaded ? <Skeleton className="h-5 w-16" /> : (
              <span className="text-[15px] font-semibold font-mono tabular-nums text-txt-0 leading-none">
                <MiniDonut pct={ifFeePctNum} />{ifFeePct}%
              </span>
            )}
            <span className="text-[10px] font-mono text-txt-1">{stakerSharePct}% to stakers</span>
          </div>
          {/* Secondary: Withdrawal with checkmark */}
          <div className="border border-drift-border bg-drift-panel/60 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <ArrowUpFromLine className="w-3.5 h-3.5 text-txt-1" />
              <span className="text-[10px] text-txt-1 uppercase tracking-wide">Withdrawal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold text-txt-1 leading-none">Instant</span>
              <CheckCircle2 className="w-4 h-4 text-bull" />
            </div>
            <span className="text-[10px] text-txt-1">{fundStats ? `Settles ${formatDuration(fundStats.revenueSettlePeriod)}` : '—'}</span>
          </div>
          {/* Primary: Fees Collected */}
          <div className="border border-drift-border bg-drift-panel p-4 flex flex-col gap-2 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-txt-2" />
              <span className="text-[11px] text-txt-1 uppercase tracking-wide font-semibold">Fees Collected</span>
            </div>
            {!dataLoaded ? <Skeleton className="h-7 w-20" /> : (
              <span className="text-[22px] font-bold font-mono tabular-nums text-txt-0 leading-none">{formatCompact(fundStats!.totalFeesCollected)}</span>
            )}
            <span className="text-[10px] text-txt-1">From trading activity</span>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════╗
            ║  MAIN 2-COLUMN LAYOUT                     ║
            ║  Left 60%: Stake/Unstake                   ║
            ║  Right 40%: Position + How It Works        ║
            ╚══════════════════════════════════════════╝ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* ── LEFT COLUMN: Stake/Unstake (60%) ── */}
          <div className="lg:col-span-3 space-y-4 order-2 lg:order-1">

            {/* 3. STAKE/UNSTAKE UNIFIED CARD */}
            <div className="border border-drift-border bg-drift-panel overflow-hidden">
              {/* Tabs at top of card */}
              <div className="flex border-b border-drift-border">
                {(['stake', 'unstake'] as const).map(tab => {
                  const act = activeTab === tab;
                  const isS = tab === 'stake';
                  return (
                    <button key={tab} onClick={() => { setActiveTab(tab); setError(null); }}
                      className={`flex-1 py-3 text-[13px] font-semibold text-center transition-colors ${
                        act ? (isS ? 'text-txt-0 border-b-2 border-txt-0' : 'text-txt-0 border-b-2 border-txt-0')
                          : 'text-txt-3 hover:text-txt-1'
                      }`}>
                      <span className="flex items-center justify-center gap-1.5">
                        {isS ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                        {isS ? 'Stake' : 'Unstake'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Stake form */}
              {activeTab === 'stake' && (
                <div className="p-6 space-y-4">
                  {/* Wallet balance prominent */}
                  {connected && (
                    <div className="bg-drift-input border border-drift-border px-4 py-3 flex items-center justify-between">
                      <span className="text-[11px] text-txt-1 uppercase tracking-wide">Wallet Balance</span>
                      <span className="text-[18px] font-bold font-mono tabular-nums text-txt-0">{formatUsdPlain(walletUsdc)}</span>
                    </div>
                  )}
                  {/* Amount input */}
                  <div>
                    <label className="text-[11px] text-txt-3 uppercase tracking-wide mb-2 block">Deposit Amount</label>
                    <div className="flex items-center h-12 bg-drift-input border border-drift-border focus-within:border-txt-3/40 transition-colors" style={{ borderRadius: 4 }}>
                      <span className="pl-4 text-[12px] font-semibold text-txt-1">USDC</span>
                      <input type="number" step="0.01" min="0" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} placeholder="0.00"
                        className="flex-1 px-3 h-full bg-transparent text-right text-txt-0 text-[18px] font-semibold font-mono tabular-nums placeholder:text-txt-3/30 focus:outline-none" />
                    </div>
                  </div>
                  {/* Pill toggles */}
                  {connected && walletUsdc > 0 && (
                    <div className="flex items-center gap-2">
                      {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                        <PillBtn key={x.l} label={x.l} onClick={() => handleStakePreset(x.p)} active={stakeAmount === (walletUsdc * x.p).toFixed(2)} />
                      ))}
                    </div>
                  )}
                  {/* Live shares preview */}
                  {stakePreviewShares && (
                    <div className="text-[11px] text-txt-3 flex items-center gap-1.5">
                      <Layers className="w-3 h-3" />
                      You will receive approximately <span className="text-txt-1 font-semibold">{Number(stakePreviewShares).toLocaleString()} shares</span>
                    </div>
                  )}
                  {/* Action */}
                  {!connected ? (
                    <div className="flex flex-col items-center gap-3 py-8 bg-drift-input border border-dashed border-drift-border">
                      <p className="text-[12px] text-txt-1">Connect your wallet to stake</p><WalletMultiButton />
                    </div>
                  ) : (
                    <button onClick={handleStake} disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                      className="w-full py-3.5 bg-bull text-white text-[13px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:opacity-80 transition-opacity flex items-center justify-center gap-2" style={{ borderRadius: 6 }}>
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {loading ? 'Staking…' : `Stake ${stakeAmount && parseFloat(stakeAmount) > 0 ? `${parseFloat(stakeAmount).toLocaleString()} USDC` : 'USDC'}`}
                    </button>
                  )}
                  {/* Collapsible info tooltip */}
                  <button onClick={() => setShowStakeInfo(!showStakeInfo)} className="flex items-center gap-1 text-[11px] text-txt-3 hover:text-txt-1 transition-colors">
                    <Info className="w-3 h-3" />
                    How staking works
                    {showStakeInfo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showStakeInfo && (
                    <div className="text-[11px] text-txt-1 leading-relaxed bg-drift-input border border-drift-border px-4 py-3">
                      USDC deposited into the Insurance Fund vault. You'll receive shares proportional to the fund's total value.
                      Your share of protocol fees accrues automatically.
                    </div>
                  )}
                </div>
              )}

              {/* Unstake form */}
              {activeTab === 'unstake' && (
                <div className="p-6 space-y-4">
                  {hasPendingWithdraw && (
                    <div className="p-4 border border-bull/20 bg-bull/5 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-bull" />
                        <span className="text-[13px] font-semibold text-bull">Unstake Ready</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[20px] font-bold text-txt-0 font-mono tabular-nums">{formatUsdPlain(userStake!.lastWithdrawRequestValue)}</span>
                        <span className="text-bull font-semibold text-[11px] uppercase">Ready</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCompleteUnstake} disabled={loading}
                          className="flex-1 py-3 bg-bull text-white text-[13px] font-semibold disabled:opacity-40 transition-opacity flex items-center justify-center gap-2" style={{ borderRadius: 6 }}>
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Complete Withdrawal
                        </button>
                        <button onClick={handleCancelUnstake} disabled={loading}
                          className="px-4 py-3 border border-drift-border text-txt-1 text-[12px] font-medium hover:text-txt-0 transition-colors" style={{ borderRadius: 6 }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {!hasPendingWithdraw && (
                    <>
                      {/* Staked balance prominent */}
                      {userStake?.isInitialized && (
                        <div className="bg-drift-input border border-drift-border px-4 py-3 flex items-center justify-between">
                          <span className="text-[11px] text-txt-1 uppercase tracking-wide">Staked Value</span>
                          <span className="text-[18px] font-bold font-mono tabular-nums text-txt-0">{formatUsdPlain(userStake.stakeValue)}</span>
                        </div>
                      )}
                      <div>
                        <label className="text-[11px] text-txt-3 uppercase tracking-wide mb-2 block">Withdraw Amount</label>
                        <div className="flex items-center h-12 bg-drift-input border border-drift-border focus-within:border-txt-3/40 transition-colors" style={{ borderRadius: 4 }}>
                          <span className="pl-4 text-[12px] font-semibold text-txt-1">USDC</span>
                          <input type="number" step="0.01" min="0" value={unstakeAmount} onChange={e => setUnstakeAmount(e.target.value)} placeholder="0.00"
                            className="flex-1 px-3 h-full bg-transparent text-right text-txt-0 text-[18px] font-semibold font-mono tabular-nums placeholder:text-txt-3/30 focus:outline-none" />
                        </div>
                      </div>
                      {/* Pill toggles */}
                      {userStake?.isInitialized && userStake.stakeValue > 0 && (
                        <div className="flex items-center gap-2">
                          {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                            <PillBtn key={x.l} label={x.l} onClick={() => handleUnstakePreset(x.p)} active={unstakeAmount === (userStake.stakeValue * x.p).toFixed(2)} />
                          ))}
                        </div>
                      )}
                      {!connected ? (
                        <div className="flex flex-col items-center gap-3 py-8 bg-drift-input border border-dashed border-drift-border">
                          <p className="text-[12px] text-txt-1">Connect your wallet to unstake</p><WalletMultiButton />
                        </div>
                      ) : (
                        <button onClick={handleRequestUnstake} disabled={loading || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !userStake?.isInitialized}
                          className="w-full py-3.5 bg-bear text-white text-[13px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:opacity-80 transition-opacity flex items-center justify-center gap-2" style={{ borderRadius: 6 }}>
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                          {loading ? 'Processing…' : `Withdraw ${unstakeAmount && parseFloat(unstakeAmount) > 0 ? `${parseFloat(unstakeAmount).toLocaleString()} USDC` : ''}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-2 p-4 border border-bear/15 bg-bear/8 text-bear text-[12px]">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-bear/60 hover:text-bear text-xs transition-colors">✕</button>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-4 border border-bull/15 bg-bull/8 text-bull text-[12px]">
                <span className="flex-1">{success}</span>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Position + How It Works (40%) ── */}
          <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">

            {/* 4. YOUR POSITION — prominent card */}
            <div className="border border-drift-border bg-drift-panel overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-drift-border">
                <h3 className="text-[13px] font-semibold text-txt-0 uppercase tracking-wide">Your Position</h3>
                {userStake?.isInitialized && (
                  <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 border border-drift-border text-txt-1 font-semibold bg-drift-surface" style={{ borderRadius: 12 }}>
                    <span className="w-2 h-2 rounded-full bg-bull" />
                    Active
                  </span>
                )}
              </div>
              <div className="p-6">
                {!connected ? (
                  <div className="text-center py-10">
                    <p className="text-[13px] font-medium text-txt-1 mb-1.5">Connect Wallet</p>
                    <p className="text-[11px] text-txt-3 mb-4">View your stake and earnings</p>
                    <WalletMultiButton />
                  </div>
                ) : !userStake?.isInitialized ? (
                  <div className="text-center py-10">
                    <p className="text-[13px] font-medium text-txt-1 mb-1.5">No Active Stake</p>
                    <p className="text-[11px] text-txt-3 mb-3">Deposit USDC to start earning yield</p>
                    <button onClick={() => setActiveTab('stake')}
                      className="text-[12px] text-txt-1 font-semibold hover:text-txt-0 hover:underline transition-colors">
                      Get Started &rarr;
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Hero staked value */}
                    <div className="text-center">
                      <div className="text-[10px] text-txt-3 uppercase tracking-wider mb-2">Staked Value</div>
                      <div className="text-[36px] font-bold font-mono tracking-tight leading-none tabular-nums">
                        <span className="text-txt-0">${userStake.stakeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {/* P&L with $ and % */}
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <span className={`text-[14px] font-semibold font-mono tabular-nums ${pnlDollar >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {pnlDollar >= 0 ? '+' : ''}{formatUsdPlain(pnlDollar)}
                        </span>
                        <span className={`text-[12px] font-mono tabular-nums ${pnlDollar >= 0 ? 'text-bull/70' : 'text-bear/70'}`}>
                          ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    {/* Arc gauge for pool share */}
                    <div className="flex flex-col items-center gap-1">
                      <ArcGauge pct={userSharePct} size={80} />
                      <span className="text-[10px] text-txt-3 uppercase tracking-wide">Pool Share</span>
                    </div>

                    {/* Two-column detail row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-drift-input border border-drift-border px-3.5 py-3 text-center">
                        <div className="text-[10px] text-txt-1 mb-1">Your Shares</div>
                        <div className="text-[14px] font-semibold text-txt-0 tabular-nums font-mono">{Number(userStake.ifShares).toLocaleString()}</div>
                      </div>
                      <div className="bg-drift-input border border-drift-border px-3.5 py-3 text-center">
                        <div className="text-[10px] text-txt-1 mb-1">Cost Basis</div>
                        <div className="text-[14px] font-semibold text-txt-0 tabular-nums font-mono">{formatUsdPlain(userStake.costBasis)}</div>
                      </div>
                    </div>

                    {/* Pending unstake */}
                    {hasPendingWithdraw && (
                    <div className="bg-drift-surface border border-drift-border px-3.5 py-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-txt-1">Pending Unstake</span>
                      <span className="text-[12px] font-semibold font-mono text-txt-0 tabular-nums">{formatUsdPlain(userStake.lastWithdrawRequestValue)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 5. HOW IT WORKS — collapsible stepper */}
            <div className="border border-drift-border bg-drift-panel overflow-hidden">
              <button onClick={() => setShowHowItWorks(!showHowItWorks)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-drift-surface/20 transition-colors">
                <h3 className="text-[14px] font-semibold text-txt-0 uppercase tracking-wide">How It Works</h3>
                {showHowItWorks ? <ChevronUp className="w-4 h-4 text-txt-3" /> : <ChevronDown className="w-4 h-4 text-txt-3" />}
              </button>
              {showHowItWorks && (
                <div className="px-6 pb-6 pt-2">
                  <div className="relative">
                    {[
                      { icon: <Wallet className="w-4 h-4 text-txt-2" />, title: 'Stake USDC', desc: 'Deposit from your wallet into the vault' },
                      { icon: <Percent className="w-4 h-4 text-txt-2" />, title: 'Earn Protocol Revenue', desc: `${ifFeePct}% of fees flow to the fund` },
                      { icon: <ArrowUpFromLine className="w-4 h-4 text-txt-2" />, title: 'Withdraw Anytime', desc: 'No lock-up — instant withdrawals' },
                    ].map((s, i) => (
                      <div key={i} className="flex gap-3 items-start relative">
                        {/* Connecting line */}
                        {i < 2 && (
                          <div className="absolute left-[15px] top-[32px] w-px h-[calc(100%-8px)] bg-drift-border" />
                        )}
                        <div className="shrink-0 w-[30px] h-[30px] rounded-full bg-drift-surface border border-drift-border flex items-center justify-center z-10">
                          {s.icon}
                        </div>
                        <div className="pt-1 pb-4">
                          <div className="text-[12px] font-semibold text-txt-0">{s.title}</div>
                          <div className="text-[11px] text-txt-3 mt-0.5">{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 6. RISK DISCLOSURE — amber warning card */}
            <div className="border border-drift-border bg-drift-panel p-5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-txt-2 shrink-0" />
                <span className="text-[13px] font-semibold text-txt-1">Risk Disclosure</span>
              </div>
              <p className="text-[12px] text-txt-2 leading-relaxed">
                Stakers take on the risk of covering bankrupt accounts. If liquidation losses exceed the fund, you may lose part of your deposit.
                Only stake what you can afford to risk.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

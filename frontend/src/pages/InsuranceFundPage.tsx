import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Shield,
  TrendingUp,
  Clock,
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
} from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  useDriftStore,
  selectClient,
  selectIsSubscribed,
  selectInsuranceFundStats,
  selectUserIfStake,
} from '../stores/useDriftStore';
import type { InsuranceFundStats, UserIfStake } from '../sdk/drift-client-wrapper';

/* ─── Props ─── */
interface InsuranceFundPageProps {
  onBack: () => void;
}

/* ─── Helpers ─── */
function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
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

function formatCountdown(targetTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = targetTs - now;
  if (remaining <= 0) return 'Ready';
  return formatDuration(remaining);
}

/* ─── Stat Card ─── */
const StatCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}> = ({ icon: Icon, label, value, sub, color = 'text-accent' }) => (
  <div className="bg-drift-surface/60 rounded-xl border border-drift-border p-4 flex flex-col gap-1.5">
    <div className="flex items-center gap-2 text-txt-2 text-xs font-medium">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      {label}
    </div>
    <div className={`text-lg font-bold ${color}`}>{value}</div>
    {sub && <div className="text-[10px] text-txt-3">{sub}</div>}
  </div>
);

/* ─── Main Page ─── */
export const InsuranceFundPage: React.FC<InsuranceFundPageProps> = ({ onBack }) => {
  const { connected } = useWallet();
  const client = useDriftStore(selectClient);
  const isSubscribed = useDriftStore(selectIsSubscribed);
  const fundStats = useDriftStore(selectInsuranceFundStats);
  const userStake = useDriftStore(selectUserIfStake);

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake');
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

  useEffect(() => {
    fetchIfData();
    refreshTimer.current = setInterval(fetchIfData, 5000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [fetchIfData]);

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
      setSuccess(`Unstake requested — ${formatDuration(fundStats?.unstakingPeriod || 0)} cooldown — tx: ${tx.slice(0, 12)}…`);
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
  const cooldownEnd =
    hasPendingWithdraw && fundStats
      ? userStake!.lastWithdrawRequestTs + fundStats.unstakingPeriod
      : 0;
  const cooldownReady = cooldownEnd > 0 && cooldownEnd <= Math.floor(Date.now() / 1000);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto bg-drift-bg">
      {/* ── Header bar ── */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 bg-drift-bg/80 backdrop-blur-xl border-b border-drift-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Shield className="w-5 h-5 text-accent" />
        <h1 className="text-base font-bold text-txt-0">Insurance Fund</h1>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
          USDC Market
        </span>
        <div className="flex-1" />
        <button
          onClick={fetchIfData}
          className="p-1.5 rounded-lg text-txt-3 hover:text-txt-0 hover:bg-drift-surface transition-all"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Hero / Explainer ── */}
        <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-drift-surface/50 to-purple/10 border border-accent/20 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-accent/15 text-accent shrink-0">
              <Shield className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-txt-0">What is the Insurance Fund?</h2>
              <p className="text-sm text-txt-1 leading-relaxed max-w-2xl">
                The Insurance Fund is a safety net that protects the exchange from socialized losses.
                When a trader's account goes bankrupt (negative equity), the Insurance Fund covers the
                deficit — preventing Auto-Deleveraging (ADL) of profitable traders. A portion of
                trading fees flows into the fund, and stakers earn yield from those fees.
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-bull">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Protects against socialized losses
                </div>
                <div className="flex items-center gap-1.5 text-xs text-accent">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Earn yield on staked USDC
                </div>
                <div className="flex items-center gap-1.5 text-xs text-yellow">
                  <Clock className="w-3.5 h-3.5" />
                  {fundStats ? formatDuration(fundStats.unstakingPeriod) : '—'} unstaking period
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Fund Stats Grid ── */}
        <div>
          <h3 className="text-sm font-semibold text-txt-1 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-accent" />
            Fund Overview
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              icon={DollarSign}
              label="Vault Balance"
              value={fundStats ? formatUsd(fundStats.vaultBalance) : '—'}
              sub="Total USDC in vault"
              color="text-bull"
            />
            <StatCard
              icon={Users}
              label="Total Shares"
              value={fundStats ? Number(fundStats.totalShares).toLocaleString() : '—'}
              sub={`User shares: ${fundStats ? Number(fundStats.userShares).toLocaleString() : '—'}`}
            />
            <StatCard
              icon={Percent}
              label="Fee Allocation"
              value={`${ifFeePct}%`}
              sub={`${stakerSharePct}% goes to stakers`}
              color="text-purple"
            />
            <StatCard
              icon={Clock}
              label="Unstaking Period"
              value={fundStats ? formatDuration(fundStats.unstakingPeriod) : '—'}
              sub={`Settle every ${fundStats ? formatDuration(fundStats.revenueSettlePeriod) : '—'}`}
              color="text-yellow"
            />
            <StatCard
              icon={TrendingUp}
              label="Revenue Pool"
              value={fundStats ? fundStats.revenuePoolBalance : '—'}
              sub="Pending settlement"
              color="text-accent"
            />
          </div>
        </div>

        {/* ── Main Content: Stake Panel + User Position ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Stake / Unstake panel (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Tab bar */}
            <div className="flex rounded-xl bg-drift-surface/50 border border-drift-border p-1">
              <button
                onClick={() => setActiveTab('stake')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === 'stake'
                    ? 'bg-bull/15 text-bull border border-bull/20'
                    : 'text-txt-2 hover:text-txt-1'
                }`}
              >
                <ArrowDownToLine className="w-4 h-4" />
                Stake
              </button>
              <button
                onClick={() => setActiveTab('unstake')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === 'unstake'
                    ? 'bg-bear/15 text-bear border border-bear/20'
                    : 'text-txt-2 hover:text-txt-1'
                }`}
              >
                <ArrowUpFromLine className="w-4 h-4" />
                Unstake
              </button>
            </div>

            {/* Stake form */}
            {activeTab === 'stake' && (
              <div className="rounded-xl bg-drift-surface/50 border border-drift-border p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-txt-2 mb-1.5">
                    Stake Amount (USDC)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2.5 rounded-lg bg-drift-input border border-drift-border text-txt-0 text-sm placeholder:text-txt-3 focus:outline-none focus:border-accent/50 transition-all"
                    />
                    <button
                      onClick={handleStake}
                      disabled={loading || !connected || !stakeAmount}
                      className="px-5 py-2.5 rounded-lg bg-bull text-white text-sm font-bold
                                 hover:bg-bull/90 disabled:opacity-40 disabled:cursor-not-allowed
                                 transition-all flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                      Stake
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[11px] text-txt-3 bg-drift-input/50 rounded-lg p-3">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
                  <span>
                    Stake USDC into the Insurance Fund to earn a share of protocol revenue.
                    Your USDC will be deposited from your wallet's associated token account.
                    Unstaking requires a {fundStats ? formatDuration(fundStats.unstakingPeriod) : '—'} cooldown period.
                  </span>
                </div>

                {!connected && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-sm text-txt-2">Connect your wallet to stake</p>
                    <WalletMultiButton />
                  </div>
                )}
              </div>
            )}

            {/* Unstake form */}
            {activeTab === 'unstake' && (
              <div className="rounded-xl bg-drift-surface/50 border border-drift-border p-5 space-y-4">
                {/* Pending withdraw info */}
                {hasPendingWithdraw && (
                  <div className={`rounded-lg p-3 border ${cooldownReady ? 'bg-bull/5 border-bull/20' : 'bg-yellow/5 border-yellow/20'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {cooldownReady ? (
                        <CheckCircle2 className="w-4 h-4 text-bull" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow animate-pulse" />
                      )}
                      <span className={`text-sm font-semibold ${cooldownReady ? 'text-bull' : 'text-yellow'}`}>
                        {cooldownReady ? 'Unstake Ready!' : 'Cooldown In Progress'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-txt-1">
                      <span>Value: {formatUsd(userStake!.lastWithdrawRequestValue)}</span>
                      <span>{cooldownReady ? 'Complete unstake below' : `${formatCountdown(cooldownEnd)} remaining`}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {cooldownReady && (
                        <button
                          onClick={handleCompleteUnstake}
                          disabled={loading}
                          className="flex-1 px-4 py-2 rounded-lg bg-bull text-white text-sm font-bold
                                     hover:bg-bull/90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Complete Unstake
                        </button>
                      )}
                      <button
                        onClick={handleCancelUnstake}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg border border-drift-border text-txt-1 text-sm font-medium
                                   hover:bg-drift-surface transition-all flex items-center gap-2"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Request new unstake */}
                {!hasPendingWithdraw && (
                  <div>
                    <label className="block text-xs font-medium text-txt-2 mb-1.5">
                      Unstake Amount (USDC)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 px-3 py-2.5 rounded-lg bg-drift-input border border-drift-border text-txt-0 text-sm placeholder:text-txt-3 focus:outline-none focus:border-bear/50 transition-all"
                      />
                      <button
                        onClick={handleRequestUnstake}
                        disabled={loading || !connected || !unstakeAmount || !userStake?.isInitialized}
                        className="px-5 py-2.5 rounded-lg bg-bear text-white text-sm font-bold
                                   hover:bg-bear/90 disabled:opacity-40 disabled:cursor-not-allowed
                                   transition-all flex items-center gap-2"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
                        Request Unstake
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 text-[11px] text-txt-3 bg-drift-input/50 rounded-lg p-3">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow" />
                  <span>
                    Unstaking is a two-step process: first request unstake (starts a{' '}
                    {fundStats ? formatDuration(fundStats.unstakingPeriod) : '—'} cooldown), then
                    complete the withdrawal after the cooldown ends. You can cancel anytime during the cooldown.
                  </span>
                </div>

                {!connected && (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className="text-sm text-txt-2">Connect your wallet to unstake</p>
                    <WalletMultiButton />
                  </div>
                )}
              </div>
            )}

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-bear/10 border border-bear/20 text-bear text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-bull/10 border border-bull/20 text-bull text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {success}
              </div>
            )}
          </div>

          {/* Right: User Position (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl bg-drift-surface/50 border border-drift-border p-5 space-y-4">
              <h3 className="text-sm font-semibold text-txt-0 flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                Your Position
              </h3>

              {!connected ? (
                <div className="text-center py-6">
                  <Shield className="w-10 h-10 text-txt-3 mx-auto mb-3" />
                  <p className="text-sm text-txt-2 mb-3">Connect wallet to view your stake</p>
                  <WalletMultiButton />
                </div>
              ) : !userStake?.isInitialized ? (
                <div className="text-center py-6">
                  <Shield className="w-10 h-10 text-txt-3 mx-auto mb-3" />
                  <p className="text-sm text-txt-2">No active stake</p>
                  <p className="text-xs text-txt-3 mt-1">Stake USDC to start earning</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-drift-border/50">
                    <span className="text-xs text-txt-2">Staked Value</span>
                    <span className="text-sm font-bold text-bull">{formatUsd(userStake.stakeValue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-drift-border/50">
                    <span className="text-xs text-txt-2">Your Shares</span>
                    <span className="text-sm font-mono text-txt-0">{Number(userStake.ifShares).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-drift-border/50">
                    <span className="text-xs text-txt-2">Cost Basis</span>
                    <span className="text-sm text-txt-1">{formatUsd(userStake.costBasis)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-drift-border/50">
                    <span className="text-xs text-txt-2">P&L</span>
                    <span className={`text-sm font-bold ${userStake.stakeValue - userStake.costBasis >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {formatUsd(userStake.stakeValue - userStake.costBasis)}
                    </span>
                  </div>
                  {hasPendingWithdraw && (
                    <div className="flex justify-between items-center py-2 border-b border-drift-border/50">
                      <span className="text-xs text-yellow">Pending Unstake</span>
                      <span className="text-sm font-bold text-yellow">{formatUsd(userStake.lastWithdrawRequestValue)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* How It Works */}
            <div className="rounded-xl bg-drift-surface/50 border border-drift-border p-5 space-y-3">
              <h3 className="text-sm font-semibold text-txt-0 flex items-center gap-2">
                <Info className="w-4 h-4 text-accent" />
                How It Works
              </h3>
              <ol className="space-y-2.5 text-xs text-txt-1">
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold">1</span>
                  <span><strong className="text-txt-0">Stake USDC</strong> — deposit funds from your wallet into the Insurance Fund vault</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold">2</span>
                  <span><strong className="text-txt-0">Earn Yield</strong> — {ifFeePct}% of protocol fees flow to the fund ({stakerSharePct}% of that to stakers)</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold">3</span>
                  <span><strong className="text-txt-0">Request Unstake</strong> — begins a {fundStats ? formatDuration(fundStats.unstakingPeriod) : '—'} cooldown</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold">4</span>
                  <span><strong className="text-txt-0">Complete Unstake</strong> — withdraw your USDC after cooldown ends</span>
                </li>
              </ol>
            </div>

            {/* Risk Disclosure */}
            <div className="rounded-xl bg-bear/5 border border-bear/15 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-bear">
                <AlertTriangle className="w-3.5 h-3.5" />
                Risk Disclosure
              </div>
              <p className="text-[11px] text-txt-2 leading-relaxed">
                Insurance Fund stakers take on the risk of covering bankrupt accounts. If losses
                exceed the fund balance, stakers may lose a portion of their deposit. The unstaking
                cooldown prevents bank runs during volatile markets.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

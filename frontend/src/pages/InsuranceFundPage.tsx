import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  Shield,
  TrendingUp,
  Wallet,
  PieChart,
  CheckCircle2,
  DollarSign,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
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
  <div className={`animate-pulse bg-drift-surface/60 rounded-lg ${className}`} />
);

/* ─── StatCard (matches Portfolio pattern) ─── */
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

/* ─── Pill toggle buttons ─── */
const PillBtn: React.FC<{ label: string; onClick: () => void; active?: boolean }> = ({ label, onClick, active }) => (
  <button type="button" onClick={onClick}
    className={`px-3.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
      active ? 'bg-drift-elevated text-txt-0 border border-drift-border' : 'bg-drift-surface text-txt-2 hover:text-txt-0 hover:bg-drift-elevated'
    }`}>{label}</button>
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
  const ifFeePct = fundStats ? ((fundStats.totalFactor / 10000) * 100).toFixed(1) : '—';
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
          <span className="text-[10px] font-bold text-txt-2 px-2 py-0.5 rounded border border-drift-border bg-drift-surface">USDC</span>
          <div className="flex-1" />
          <span className="hidden sm:inline text-[10px] text-bull font-medium">● Live</span>
          <button onClick={handleRefresh} className={`text-[11px] text-txt-1 hover:text-txt-0 transition-colors ${isRefreshing ? 'opacity-50' : ''}`}>
            Refresh
          </button>
        </div>
      )}

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* 1. STAT CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Shield}
            label="Vault Balance"
            value={dataLoaded ? formatUsdPlain(fundStats!.vaultBalance) : '—'}
            sub="Total USDC deposited"
          />
          <StatCard
            icon={DollarSign}
            label="Fees Collected"
            value={dataLoaded ? formatUsdPlain(fundStats!.totalFeesCollected) : '—'}
            sub="From trading activity"
          />
          <StatCard
            icon={Wallet}
            label="Your Stake"
            value={userStake?.isInitialized ? formatUsdPlain(userStake.stakeValue) : '$0.00'}
            sub={userStake?.isInitialized ? `${Number(userStake.ifShares).toLocaleString()} shares` : 'Not staking'}
            color={userStake?.isInitialized ? 'text-txt-0' : 'text-txt-2'}
          />
          <StatCard
            icon={PieChart}
            label="Pool Share"
            value={userStake?.isInitialized ? `${userSharePct.toFixed(1)}%` : '0%'}
            sub={`Fee allocation: ${ifFeePct}%`}
          />
        </div>

        {/* 2. YOUR POSITION */}
        {connected && userStake?.isInitialized && (
          <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-drift-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-txt-2" />
                <h3 className="text-[13px] font-bold text-txt-0">Your Position</h3>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-drift-border text-txt-1 font-semibold bg-drift-surface">
                <span className="w-2 h-2 rounded-full bg-bull" />
                Active
              </span>
            </div>
            <div className="divide-y divide-drift-border/30">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-txt-1" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-txt-0">Staked Value</div>
                    <div className="text-[10px] text-txt-3">Cost basis: {formatUsdPlain(userStake.costBasis)}</div>
                  </div>
                </div>
                <div className="text-[13px] font-mono font-bold text-txt-0">{formatUsdPlain(userStake.stakeValue)}</div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-txt-1" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-txt-0">Unrealized P&L</div>
                    <div className="text-[10px] text-txt-3">{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</div>
                  </div>
                </div>
                <div className={`text-[13px] font-mono font-bold ${pnlDollar >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {pnlDollar >= 0 ? '+' : ''}{formatUsdPlain(pnlDollar)}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                    <Layers className="w-4 h-4 text-txt-1" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-txt-0">Your Shares</div>
                    <div className="text-[10px] text-txt-3">of {Number(fundStats!.totalShares).toLocaleString()} total</div>
                  </div>
                </div>
                <div className="text-[13px] font-mono font-bold text-txt-0">{Number(userStake.ifShares).toLocaleString()}</div>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-txt-2 font-semibold uppercase tracking-wider">Pool Share</span>
                  <span className="text-[11px] font-bold font-mono text-txt-0">{userSharePct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-drift-surface overflow-hidden">
                  <div className="h-full rounded-full bg-txt-1/40 transition-all duration-700" style={{ width: `${Math.min(userSharePct, 100)}%` }} />
                </div>
              </div>
              {hasPendingWithdraw && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                      <ArrowUpFromLine className="w-4 h-4 text-txt-1" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-txt-0">Pending Unstake</div>
                      <div className="text-[10px] text-txt-3">Awaiting completion</div>
                    </div>
                  </div>
                  <div className="text-[13px] font-mono font-bold text-txt-0">{formatUsdPlain(userStake.lastWithdrawRequestValue)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {!connected && (
          <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 p-6 text-center">
            <p className="text-[13px] font-medium text-txt-1 mb-1.5">Connect Wallet</p>
            <p className="text-[11px] text-txt-3 mb-4">Connect your wallet to stake and view your position</p>
            <WalletMultiButton />
          </div>
        )}

        {connected && !userStake?.isInitialized && (
          <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 p-6 text-center">
            <p className="text-[13px] font-medium text-txt-1 mb-1.5">No Active Stake</p>
            <p className="text-[11px] text-txt-3">Deposit USDC below to start earning yield</p>
          </div>
        )}

        {/* 3. STAKE / UNSTAKE */}
        <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-txt-2" />
            <h3 className="text-[13px] font-bold text-txt-0">Stake / Unstake</h3>
          </div>
          <div className="flex border-b border-drift-border/40">
            {(['stake', 'unstake'] as const).map(tab => {
              const act = activeTab === tab;
              const isS = tab === 'stake';
              return (
                <button key={tab} onClick={() => { setActiveTab(tab); setError(null); }}
                  className={`flex-1 py-2.5 text-[12px] font-semibold text-center transition-colors ${
                    act ? 'text-txt-0 border-b-2 border-txt-0' : 'text-txt-3 hover:text-txt-1'
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
            <div className="p-4 space-y-3">
              {connected && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-txt-1 uppercase tracking-wide">Wallet Balance</span>
                  <span className="text-[11px] font-bold font-mono tabular-nums text-txt-0">{formatUsdPlain(walletUsdc)}</span>
                </div>
              )}
              <div>
                <label className="text-[10px] text-txt-3 uppercase tracking-wide mb-1.5 block">Deposit Amount</label>
                <div className="flex items-center h-10 bg-drift-input border border-drift-border rounded-lg focus-within:border-txt-3/40 transition-colors">
                  <span className="pl-3 text-[11px] font-semibold text-txt-1">USDC</span>
                  <input type="number" step="0.01" min="0" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} placeholder="0.00"
                    className="flex-1 px-3 h-full bg-transparent text-right text-txt-0 text-[14px] font-semibold font-mono tabular-nums placeholder:text-txt-3/30 focus:outline-none" />
                </div>
              </div>
              {connected && walletUsdc > 0 && (
                <div className="flex items-center gap-2">
                  {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                    <PillBtn key={x.l} label={x.l} onClick={() => handleStakePreset(x.p)} active={stakeAmount === (walletUsdc * x.p).toFixed(2)} />
                  ))}
                </div>
              )}
              {stakePreviewShares && (
                <div className="text-[10px] text-txt-3 flex items-center gap-1.5">
                  <Layers className="w-3 h-3" />
                  &asymp; <span className="text-txt-1 font-semibold">{Number(stakePreviewShares).toLocaleString()} shares</span>
                </div>
              )}
              {!connected ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-[11px] text-txt-3">Connect wallet to stake</p>
                  <WalletMultiButton />
                </div>
              ) : (
                <button onClick={handleStake} disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                  className="w-full py-3 bg-bull text-white text-[12px] font-semibold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:opacity-80 transition-opacity flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Staking\u2026' : `Stake ${stakeAmount && parseFloat(stakeAmount) > 0 ? `${parseFloat(stakeAmount).toLocaleString()} USDC` : 'USDC'}`}
                </button>
              )}
            </div>
          )}

          {/* Unstake form */}
          {activeTab === 'unstake' && (
            <div className="p-4 space-y-3">
              {hasPendingWithdraw && (
                <div className="p-3 border border-bull/20 bg-bull/5 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-bull" />
                    <span className="text-[12px] font-semibold text-bull">Unstake Ready</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold text-txt-0 font-mono tabular-nums">{formatUsdPlain(userStake!.lastWithdrawRequestValue)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCompleteUnstake} disabled={loading}
                      className="flex-1 py-2.5 bg-bull text-white text-[12px] font-semibold rounded-lg disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />} Complete Withdrawal
                    </button>
                    <button onClick={handleCancelUnstake} disabled={loading}
                      className="px-3 py-2.5 border border-drift-border rounded-lg text-txt-1 text-[11px] font-medium hover:text-txt-0 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!hasPendingWithdraw && (
                <>
                  {userStake?.isInitialized && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-txt-1 uppercase tracking-wide">Staked Value</span>
                      <span className="text-[11px] font-bold font-mono tabular-nums text-txt-0">{formatUsdPlain(userStake.stakeValue)}</span>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-txt-3 uppercase tracking-wide mb-1.5 block">Withdraw Amount</label>
                    <div className="flex items-center h-10 bg-drift-input border border-drift-border rounded-lg focus-within:border-txt-3/40 transition-colors">
                      <span className="pl-3 text-[11px] font-semibold text-txt-1">USDC</span>
                      <input type="number" step="0.01" min="0" value={unstakeAmount} onChange={e => setUnstakeAmount(e.target.value)} placeholder="0.00"
                        className="flex-1 px-3 h-full bg-transparent text-right text-txt-0 text-[14px] font-semibold font-mono tabular-nums placeholder:text-txt-3/30 focus:outline-none" />
                    </div>
                  </div>
                  {userStake?.isInitialized && userStake.stakeValue > 0 && (
                    <div className="flex items-center gap-2">
                      {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                        <PillBtn key={x.l} label={x.l} onClick={() => handleUnstakePreset(x.p)} active={unstakeAmount === (userStake.stakeValue * x.p).toFixed(2)} />
                      ))}
                    </div>
                  )}
                  {!connected ? (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <p className="text-[11px] text-txt-3">Connect wallet to unstake</p>
                      <WalletMultiButton />
                    </div>
                  ) : (
                    <button onClick={handleRequestUnstake} disabled={loading || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !userStake?.isInitialized}
                      className="w-full py-3 bg-bear text-white text-[12px] font-semibold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:opacity-80 transition-opacity flex items-center justify-center gap-2">
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {loading ? 'Processing\u2026' : `Withdraw ${unstakeAmount && parseFloat(unstakeAmount) > 0 ? `${parseFloat(unstakeAmount).toLocaleString()} USDC` : ''}`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Status messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 border border-bear/15 bg-bear/8 text-bear text-[11px] rounded-xl">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-bear/60 hover:text-bear text-xs transition-colors">&times;</button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 border border-bull/15 bg-bull/8 text-bull text-[11px] rounded-xl">
            <span className="flex-1">{success}</span>
          </div>
        )}

        {/* 4. INFO */}
        <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
            <Info className="w-4 h-4 text-txt-2" />
            <h3 className="text-[13px] font-bold text-txt-0">How It Works</h3>
          </div>
          <div className="grid grid-cols-3 gap-px bg-drift-border/30">
            {[
              { label: 'Stake', desc: 'Deposit USDC into the vault' },
              { label: 'Earn', desc: `${ifFeePct}% of protocol fees` },
              { label: 'Withdraw', desc: 'Instant \u2014 no lock-up' },
            ].map(s => (
              <div key={s.label} className="px-4 py-3 bg-drift-panel/80">
                <div className="text-[10px] text-txt-3 font-medium uppercase tracking-wider">{s.label}</div>
                <div className="text-[12px] font-semibold text-txt-1 mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-drift-border/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-txt-3 shrink-0 mt-0.5" />
              <p className="text-[10px] text-txt-3 leading-relaxed">
                Stakers backstop bankrupt accounts. If losses exceed the fund, you may lose part of your deposit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

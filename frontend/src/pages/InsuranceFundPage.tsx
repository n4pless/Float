import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
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

/* ─── Helpers ─── */
function formatUsdGreen(n: number) {
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <><span className="text-bull">$</span><span className="text-txt-0">{formatted}</span></>;
}
function formatCompactGreen(n: number) {
  if (n >= 1_000_000) return <><span className="text-bull">$</span><span className="text-txt-0">{(n / 1_000_000).toFixed(2)}M</span></>;
  if (n >= 1_000) return <><span className="text-bull">$</span><span className="text-txt-0">{(n / 1_000).toFixed(1)}K</span></>;
  return formatUsdGreen(n);
}
function formatUsdPlain(n: number): string {
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

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-drift-surface/60 ${className}`} />
);

const PresetBtn: React.FC<{ label: string; onClick: () => void; active?: boolean }> = ({ label, onClick, active }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded text-[11px] font-semibold border transition-colors ${
      active ? 'bg-accent/10 border-accent/30 text-accent'
        : 'bg-transparent border-drift-border text-txt-3 hover:text-txt-1 hover:border-drift-border-lt'
    }`}>{label}</button>
);

/* ─── Pool Share Bar ─── */
const PoolShareBar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-[11px]">
      <span className="text-txt-3">Pool Share</span>
      <span className="text-txt-0 font-semibold">{pct > 0 ? pct.toFixed(2) : '0'}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-drift-surface/60 overflow-hidden">
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  </div>
);

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
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 py-3 bg-drift-bg border-b border-drift-border">
        <button onClick={onBack} className="text-txt-2 hover:text-txt-0 text-sm transition-colors">&larr; Back</button>
        <div className="w-px h-4 bg-drift-border" />
        <h1 className="text-sm font-semibold text-txt-0">Insurance Fund</h1>
        <span className="text-[10px] font-medium text-accent px-2 py-0.5 rounded border border-accent/20 bg-accent/5">USDC</span>
        <div className="flex-1" />
        <span className="hidden sm:inline text-[10px] text-bull font-medium">● Live</span>
        <button onClick={handleRefresh} className={`text-[11px] text-txt-3 hover:text-txt-0 transition-colors ${isRefreshing ? 'opacity-50' : ''}`}>
          Refresh
        </button>
      </div>

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ══════ Overview Banner ══════ */}
        <div className="rounded-lg border border-drift-border bg-drift-panel/40 p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 space-y-2">
              <h2 className="text-lg font-semibold text-txt-0">Insurance Fund</h2>
              <p className="text-xs text-txt-2 leading-relaxed max-w-xl">
                Protect the exchange from socialized losses. Stake USDC to earn a share of protocol revenue while backstopping the system.
              </p>
              <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-txt-2">
                <span>· Backstop Protection</span>
                <span>· Revenue Share</span>
                <span>· Instant Withdrawal</span>
              </div>
            </div>
            <div className="lg:text-right shrink-0">
              <div className="text-[10px] text-txt-3 uppercase tracking-wider mb-1">Vault Total</div>
              {dataLoaded ? (
                <div className="text-2xl font-bold tracking-tight">
                  <span className="text-bull">$</span>
                  <span className="text-txt-0">{fundStats!.vaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ) : <Skeleton className="h-8 w-32" />}
              <div className="text-[11px] text-txt-3 mt-0.5">{ifFeePct}% of protocol fees</div>
            </div>
          </div>
        </div>

        {/* ══════ Stats Row ══════ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Vault Balance', value: fundStats ? formatCompactGreen(fundStats.vaultBalance) : '—', sub: 'Total USDC deposited' },
            { label: 'Total Shares', value: fundStats ? <span className="text-txt-0">{Number(fundStats.totalShares).toLocaleString()}</span> : '—', sub: `Yours: ${fundStats ? Number(fundStats.userShares).toLocaleString() : '—'}` },
            { label: 'Fee Allocation', value: <span className="text-txt-0">{ifFeePct}%</span>, sub: `${stakerSharePct}% to stakers` },
            { label: 'Withdrawal', value: <span className="text-txt-0">Instant</span>, sub: fundStats ? `Settles ${formatDuration(fundStats.revenueSettlePeriod)}` : '—' },
            { label: 'Fees Collected', value: fundStats ? formatCompactGreen(fundStats.totalFeesCollected) : '—', sub: 'From trading activity' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-drift-border bg-drift-panel/30 p-3.5 flex flex-col gap-1.5">
              <span className="text-[10px] text-txt-3 uppercase tracking-wider">{s.label}</span>
              {!dataLoaded ? <Skeleton className="h-6 w-16" /> : <div className="text-lg font-semibold">{s.value}</div>}
              <div className="text-[10px] text-txt-3">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ══════ Main Content ══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Stake/Unstake */}
          <div className="lg:col-span-7 space-y-4">
            {/* Tabs */}
            <div className="flex rounded-lg border border-drift-border bg-drift-panel/40 p-1 gap-1">
              {(['stake', 'unstake'] as const).map(tab => {
                const act = activeTab === tab;
                const isS = tab === 'stake';
                return (
                  <button key={tab} onClick={() => { setActiveTab(tab); setError(null); }}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded transition-colors ${
                      act ? (isS ? 'bg-bull/10 text-bull border border-bull/15' : 'bg-bear/10 text-bear border border-bear/15')
                        : 'text-txt-3 hover:text-txt-1 border border-transparent'}`}>
                    {isS ? 'Stake' : 'Unstake'}
                  </button>
                );
              })}
            </div>

            {/* Stake form */}
            {activeTab === 'stake' && (
              <div className="rounded-lg border border-drift-border bg-drift-panel/30 overflow-hidden">
                <div className="p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-txt-1">Deposit Amount</label>
                      {connected && (
                        <span className="text-[11px] text-txt-3">
                          Wallet: <span className="text-txt-2 font-medium">{formatUsdPlain(walletUsdc)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 p-1 rounded-lg bg-drift-bg border border-drift-border focus-within:border-accent/40 transition-colors">
                      <span className="pl-3 text-xs font-semibold text-txt-2">USDC</span>
                      <input type="number" step="0.01" min="0" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} placeholder="0.00"
                        className="flex-1 px-2 py-2.5 bg-transparent text-right text-txt-0 text-lg font-semibold placeholder:text-txt-3/30 focus:outline-none" />
                    </div>
                    {connected && walletUsdc > 0 && (
                      <div className="flex items-center gap-2 mt-2.5">
                        {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                          <PresetBtn key={x.l} label={x.l} onClick={() => handleStakePreset(x.p)} active={stakeAmount === (walletUsdc * x.p).toFixed(2)} />
                        ))}
                      </div>
                    )}
                  </div>
                  {!connected ? (
                    <div className="flex flex-col items-center gap-3 py-6 rounded-lg bg-drift-surface/10 border border-dashed border-drift-border/50">
                      <p className="text-xs text-txt-2">Connect your wallet to stake</p><WalletMultiButton />
                    </div>
                  ) : (
                    <button onClick={handleStake} disabled={loading || !stakeAmount || parseFloat(stakeAmount) <= 0}
                      className="w-full py-3 rounded-lg bg-bull text-white text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:opacity-80 transition-opacity flex items-center justify-center gap-2">
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {loading ? 'Staking…' : 'Stake USDC'}
                    </button>
                  )}
                </div>
                <div className="px-5 py-3 bg-drift-surface/5 border-t border-drift-border/30 text-[11px] text-txt-3">
                  USDC deposited into the Insurance Fund vault. You'll receive shares proportional to the fund's total value.
                </div>
              </div>
            )}

            {/* Unstake form */}
            {activeTab === 'unstake' && (
              <div className="rounded-lg border border-drift-border bg-drift-panel/30 overflow-hidden">
                <div className="p-5 space-y-4">
                  {hasPendingWithdraw && (
                    <div className="rounded-lg p-4 border border-bull/20 bg-bull/5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-bull">✓ Unstake Ready</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-txt-1 mb-3">
                        <span className="font-semibold text-base text-txt-0">{formatUsdPlain(userStake!.lastWithdrawRequestValue)}</span>
                        <span className="text-bull font-semibold text-[11px] uppercase">Ready</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCompleteUnstake} disabled={loading}
                          className="flex-1 py-2.5 rounded-lg bg-bull text-white text-sm font-semibold disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Complete Withdrawal
                        </button>
                        <button onClick={handleCancelUnstake} disabled={loading}
                          className="px-4 py-2.5 rounded-lg border border-drift-border text-txt-2 text-sm font-medium hover:text-txt-0 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {!hasPendingWithdraw && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-txt-1">Withdraw Amount</label>
                          {userStake?.isInitialized && (
                            <span className="text-[11px] text-txt-3">
                              Staked: <span className="text-txt-2 font-medium">{formatUsdPlain(userStake.stakeValue)}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 p-1 rounded-lg bg-drift-bg border border-drift-border focus-within:border-bear/40 transition-colors">
                          <span className="pl-3 text-xs font-semibold text-txt-2">USDC</span>
                          <input type="number" step="0.01" min="0" value={unstakeAmount} onChange={e => setUnstakeAmount(e.target.value)} placeholder="0.00"
                            className="flex-1 px-2 py-2.5 bg-transparent text-right text-txt-0 text-lg font-semibold placeholder:text-txt-3/30 focus:outline-none" />
                        </div>
                        {userStake?.isInitialized && userStake.stakeValue > 0 && (
                          <div className="flex items-center gap-2 mt-2.5">
                            {[{ l: '25%', p: 0.25 }, { l: '50%', p: 0.5 }, { l: '75%', p: 0.75 }, { l: 'MAX', p: 1 }].map(x => (
                              <PresetBtn key={x.l} label={x.l} onClick={() => handleUnstakePreset(x.p)} active={unstakeAmount === (userStake.stakeValue * x.p).toFixed(2)} />
                            ))}
                          </div>
                        )}
                      </div>
                      {!connected ? (
                        <div className="flex flex-col items-center gap-3 py-6 rounded-lg bg-drift-surface/10 border border-dashed border-drift-border/50">
                          <p className="text-xs text-txt-2">Connect your wallet to unstake</p><WalletMultiButton />
                        </div>
                      ) : (
                        <button onClick={handleRequestUnstake} disabled={loading || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || !userStake?.isInitialized}
                          className="w-full py-3 rounded-lg bg-bear text-white text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:opacity-80 transition-opacity flex items-center justify-center gap-2">
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                          {loading ? 'Processing…' : 'Withdraw'}
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="px-5 py-3 bg-drift-surface/5 border-t border-drift-border/30 text-[11px] text-txt-3">
                  Withdrawals are instant — no lock-up period.
                </div>
              </div>
            )}

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-2 p-3.5 rounded-lg bg-bear/8 border border-bear/15 text-bear text-sm">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-bear/60 hover:text-bear text-xs transition-colors">✕</button>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3.5 rounded-lg bg-bull/8 border border-bull/15 text-bull text-sm">
                <span className="flex-1">{success}</span>
              </div>
            )}
          </div>

          {/* Right: Position + Info */}
          <div className="lg:col-span-5 space-y-4">
            {/* Your Position */}
            <div className="rounded-lg border border-drift-border bg-drift-panel/30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-drift-border/30">
                <h3 className="text-sm font-semibold text-txt-0">Your Position</h3>
                {userStake?.isInitialized && <span className="text-[10px] px-2 py-0.5 rounded border border-bull/20 text-bull font-semibold bg-bull/5">Active</span>}
              </div>
              <div className="p-4">
                {!connected ? (
                  <div className="text-center py-8">
                    <p className="text-sm font-medium text-txt-1 mb-1.5">Connect Wallet</p>
                    <p className="text-xs text-txt-3 mb-4">View your stake and earnings</p>
                    <WalletMultiButton />
                  </div>
                ) : !userStake?.isInitialized ? (
                  <div className="text-center py-8">
                    <p className="text-sm font-medium text-txt-1 mb-1.5">No Active Stake</p>
                    <p className="text-xs text-txt-3 mb-3">Deposit USDC to start earning yield</p>
                    <button onClick={() => setActiveTab('stake')}
                      className="text-xs text-accent font-medium hover:underline transition-colors">
                      Get Started &rarr;
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center py-2">
                      <div className="text-[10px] text-txt-3 uppercase tracking-wider mb-1.5">Staked Value</div>
                      <div className="text-3xl font-bold tracking-tight">
                        <span className="text-bull">$</span>
                        <span className="text-txt-0">{userStake.stakeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className={`text-sm font-semibold mt-1.5 ${userStake.stakeValue - userStake.costBasis >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {userStake.stakeValue - userStake.costBasis >= 0 ? '+' : ''}{formatUsdPlain(userStake.stakeValue - userStake.costBasis)} P&L
                      </div>
                    </div>
                    <PoolShareBar pct={userSharePct} />
                    <div className="rounded-lg border border-drift-border/20 divide-y divide-drift-border/20">
                      {[
                        { label: 'Your Shares', value: Number(userStake.ifShares).toLocaleString(), mono: true },
                        { label: 'Cost Basis', value: formatUsdPlain(userStake.costBasis) },
                        ...(hasPendingWithdraw ? [{ label: 'Pending Unstake', value: formatUsdPlain(userStake.lastWithdrawRequestValue), highlight: true }] : []),
                      ].map(row => (
                        <div key={row.label} className="flex justify-between items-center px-3.5 py-2.5">
                          <span className="text-[11px] text-txt-3">{row.label}</span>
                          <span className={`text-xs font-medium ${'highlight' in row ? 'text-yellow' : 'text-txt-0'} ${'mono' in row ? 'font-mono' : ''}`}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* How It Works */}
            <div className="rounded-lg border border-drift-border bg-drift-panel/30 overflow-hidden">
              <div className="px-4 py-3.5 border-b border-drift-border/30">
                <h3 className="text-sm font-semibold text-txt-0">How It Works</h3>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { step: '1', title: 'Stake USDC', desc: 'Deposit from your wallet into the vault' },
                  { step: '2', title: 'Earn Protocol Revenue', desc: `${ifFeePct}% of fees flow to the fund` },
                  { step: '3', title: 'Withdraw Anytime', desc: 'No lock-up — instant withdrawals' },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-3 items-start">
                    <span className="shrink-0 w-6 h-6 rounded bg-drift-surface/50 border border-drift-border flex items-center justify-center text-[11px] font-bold text-txt-1">{step}</span>
                    <div className="pt-0.5">
                      <div className="text-xs font-medium text-txt-0">{title}</div>
                      <div className="text-[11px] text-txt-3 mt-0.5">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk */}
            <div className="rounded-lg border border-bear/10 bg-bear/3 p-4 space-y-1.5">
              <div className="text-xs font-semibold text-bear/80">⚠ Risk Disclosure</div>
              <p className="text-[11px] text-txt-3 leading-relaxed">Stakers take on the risk of covering bankrupt accounts. If losses exceed the fund, you may lose part of your deposit.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

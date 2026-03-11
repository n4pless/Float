/**
 * PortfolioPage — Unified dashboard: Overview, Positions, History,
 * Vault (Insurance Fund), and Account management in one place.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, TrendingUp, Activity, Shield, Wallet,
  BarChart3, Clock, DollarSign, Target, ExternalLink,
  Layers, Award, PieChart, ArrowUpRight, ArrowDownRight,
  User,
} from 'lucide-react';
import {
  useDriftStore,
  selectAccountState,
  selectPositions,
  selectOpenOrders,
  selectRecentTrades,
  selectOraclePrice,
  selectMarkPrice,
  selectFundingRate,
  selectSolBalance,
  selectUsdcBalance,
  selectSubAccounts,
  selectUserIfStake,
  type RecentTrade,
} from '../stores/useDriftStore';
// Prediction store removed — predictions now at predictions.floatdevelopment.online
import type { UserPosition } from '../sdk/drift-client-wrapper';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { InsuranceFundPage } from './InsuranceFundPage';
import { UserManagement } from '../components/UserManagement';

/* ─── Helpers ─── */

function formatUsd(n: number, decimals = 2): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatSol(n: number): string {
  if (n >= 1000) return n.toFixed(1);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '—';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const pnlColor = (v: number) => v > 0 ? 'text-bull' : v < 0 ? 'text-bear' : 'text-txt-2';

/* ═══════════════════════════════════════════════════════ */
/*  StatCard                                               */
/* ═══════════════════════════════════════════════════════ */
const StatCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  delay?: number;
}> = ({ icon: Icon, label, value, sub, color = 'text-txt-0' }) => (
  <div
    className="border border-drift-border/60 bg-drift-panel/80 rounded-xl p-4 flex flex-col gap-1.5 hover:border-drift-border transition-colors"
  >
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

/* ═══════════════════════════════════════════════════════ */
/*  Mini Equity Chart (canvas)                             */
/* ═══════════════════════════════════════════════════════ */
const EquityChart: React.FC<{ data: { ts: number; value: number }[] }> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const values = data.map(d => d.value);
    const min = Math.min(...values) * 0.998;
    const max = Math.max(...values) * 1.002;
    const range = max - min || 1;

    const isUp = values[values.length - 1] >= values[0];
    const lineColor = isUp ? '#31D0AA' : '#ED4B9E';
    const fillColor = isUp ? 'rgba(49,208,170,0.08)' : 'rgba(237,75,158,0.08)';

    // Fill
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * (h - 8) - 4;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // End dot
    const lastX = w;
    const lastY = h - ((values[values.length - 1] - min) / range) * (h - 8) - 4;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }, [data]);

  if (data.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[11px] text-txt-3">
        Not enough data for chart
      </div>
    );
  }

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

/* ═══════════════════════════════════════════════════════ */
/*  Health Bar                                             */
/* ═══════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════ */
/*  Position Row                                           */
/* ═══════════════════════════════════════════════════════ */
const PositionRow: React.FC<{ pos: UserPosition; oraclePrice: number }> = ({ pos, oraclePrice }) => {
  const isLong = pos.direction === 'LONG';
  const pnlPct = pos.entryPrice > 0 ? (pos.unrealizedPnl / (Math.abs(pos.baseAssetAmount) * pos.entryPrice)) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-drift-surface/40 transition-colors border-b border-drift-border/30 last:border-0">
      {/* Direction */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isLong ? 'bg-bull/10' : 'bg-bear/10'}`}>
        {isLong ? <ArrowUpRight className="w-4 h-4 text-bull" /> : <ArrowDownRight className="w-4 h-4 text-bear" />}
      </div>

      {/* Market + Direction */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-txt-0">SOL-PERP</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
            {pos.direction}
          </span>
          <span className="text-[10px] text-txt-3">{pos.leverage.toFixed(1)}x</span>
        </div>
        <div className="text-[11px] text-txt-3 mt-0.5">
          {formatSol(Math.abs(pos.baseAssetAmount))} SOL · Entry {formatUsd(pos.entryPrice)}
        </div>
      </div>

      {/* Mark Price */}
      <div className="text-right hidden sm:block">
        <div className="text-[11px] text-txt-3">Mark</div>
        <div className="text-[13px] font-mono font-semibold text-txt-0">{formatUsd(pos.markPrice)}</div>
      </div>

      {/* Liq Price */}
      <div className="text-right hidden md:block">
        <div className="text-[11px] text-txt-3">Liq</div>
        <div className="text-[13px] font-mono font-semibold text-txt-2">{pos.liquidationPrice > 0 ? formatUsd(pos.liquidationPrice) : '—'}</div>
      </div>

      {/* PnL */}
      <div className="text-right min-w-[80px]">
        <div className={`text-[13px] font-mono font-bold ${pnlColor(pos.unrealizedPnl)}`}>
          {pos.unrealizedPnl >= 0 ? '+' : ''}{formatUsd(pos.unrealizedPnl)}
        </div>
        <div className={`text-[10px] font-semibold ${pnlColor(pnlPct)}`}>
          {formatPct(pnlPct)}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ */
/*  Trade History Row                                      */
/* ═══════════════════════════════════════════════════════ */
const TradeRow: React.FC<{ trade: RecentTrade; walletKey?: string }> = ({ trade, walletKey }) => {
  const isMaker = trade.maker === walletKey;
  const isTaker = trade.taker === walletKey;
  const role = isMaker ? 'Maker' : isTaker ? 'Taker' : '';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-drift-surface/30 transition-colors border-b border-drift-border/20 last:border-0">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${trade.side === 'buy' ? 'bg-bull/10' : 'bg-bear/10'}`}>
        {trade.side === 'buy'
          ? <ArrowUpRight className="w-3 h-3 text-bull" />
          : <ArrowDownRight className="w-3 h-3 text-bear" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-bold ${trade.side === 'buy' ? 'text-bull' : 'text-bear'}`}>
            {trade.side.toUpperCase()}
          </span>
          <span className="text-[11px] text-txt-2">{trade.size.toFixed(4)} SOL</span>
          {role && <span className="text-[9px] px-1.5 py-0.5 rounded bg-drift-surface text-txt-3 font-medium">{role}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[12px] font-mono font-semibold text-txt-0">{formatUsd(trade.price)}</div>
        <div className="text-[10px] text-txt-3">{timeAgo(trade.ts)}</div>
      </div>
      {trade.txSig && (
        <a
          href={`https://explorer.solana.com/tx/${trade.txSig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-txt-3 hover:text-accent transition-colors shrink-0"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════ */
/*  Tab types                                              */
/* ═══════════════════════════════════════════════════════ */
type Tab = 'overview' | 'positions' | 'history' | 'vault' | 'account';

const TABS: { key: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'overview', label: 'Overview', icon: PieChart },
  { key: 'positions', label: 'Positions', icon: Layers },
  { key: 'history', label: 'Trades', icon: Clock },
  { key: 'vault', label: 'Vault', icon: Shield },
  { key: 'account', label: 'Account', icon: User },
];

/* ═══════════════════════════════════════════════════════ */
/*  Main Page                                              */
/* ═══════════════════════════════════════════════════════ */
interface PortfolioPageProps {
  onBack: () => void;
  forceRefresh?: () => Promise<void>;
  trading?: {
    createAccount: (depositAmount: number) => Promise<string>;
    deposit: (amount: number, spotMarketIndex?: number) => Promise<string>;
    withdraw: (amount: number, spotMarketIndex?: number) => Promise<string>;
  };
}

export const PortfolioPage: React.FC<PortfolioPageProps> = ({ onBack, forceRefresh, trading }) => {
  const { publicKey, connected } = useWallet();
  const accountState = useDriftStore(selectAccountState);
  const positions = useDriftStore(selectPositions);
  const openOrders = useDriftStore(selectOpenOrders);
  const trades = useDriftStore(selectRecentTrades);
  const oraclePrice = useDriftStore(selectOraclePrice);
  const markPrice = useDriftStore(selectMarkPrice);
  const fundingRate = useDriftStore(selectFundingRate);
  const solBalance = useDriftStore(selectSolBalance);
  const usdcBalance = useDriftStore(selectUsdcBalance);
  const subAccounts = useDriftStore(selectSubAccounts);
  const priceHistory = useDriftStore(s => s.priceHistory);
  const ifStake = useDriftStore(selectUserIfStake);
  const isUserInitialized = useDriftStore(s => s.isUserInitialized);

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Build equity history from price snapshots + current collateral
  const equityHistory = useMemo(() => {
    if (!accountState || priceHistory.length === 0) return [];
    const basePosition = positions.find(p => p.marketIndex === 0);
    const baseAmt = basePosition ? basePosition.baseAssetAmount : 0;
    const costBasis = basePosition ? Math.abs(basePosition.quoteEntryAmount) : 0;
    const isLong = basePosition?.direction === 'LONG';

    return priceHistory.map(snap => {
      const pnl = baseAmt !== 0
        ? (isLong ? 1 : -1) * Math.abs(baseAmt) * snap.price - (isLong ? costBasis : -costBasis)
        : 0;
      const equity = (accountState.totalCollateral - accountState.unrealizedPnl) + pnl;
      return { ts: snap.ts, value: Math.max(0, equity) };
    });
  }, [priceHistory, accountState, positions]);

  // My trades (where I'm taker or maker)
  const myTrades = useMemo(() => {
    if (!publicKey) return [];
    const walletStr = publicKey.toBase58();
    return trades.filter(t => t.taker === walletStr || t.maker === walletStr);
  }, [trades, publicKey]);

  // Total realized PnL from trades
  const { totalFees, tradeCount } = useMemo(() => {
    let fees = 0;
    myTrades.forEach(t => {
      const walletStr = publicKey?.toBase58() || '';
      if (t.taker === walletStr && t.takerFee) fees += t.takerFee;
      if (t.maker === walletStr && t.makerFee) fees += t.makerFee;
    });
    return { totalFees: fees, tradeCount: myTrades.length };
  }, [myTrades, publicKey]);

  // Total notional
  const totalNotional = useMemo(() =>
    positions.reduce((s, p) => s + Math.abs(p.baseAssetAmount) * p.markPrice, 0),
  [positions]);

  // Total unrealized PnL
  const totalUnrealizedPnl = useMemo(() =>
    positions.reduce((s, p) => s + p.unrealizedPnl, 0),
  [positions]);

  // Wallet equity
  const walletSolUsd = (solBalance ?? 0) * oraclePrice;

  // IF stake value
  const ifStakeUsd = ifStake?.stakeValue ?? 0;

  // Total portfolio value
  const totalPortfolioValue = (accountState?.totalCollateral ?? 0) + walletSolUsd + ifStakeUsd;

  // Dummy forceRefresh if not provided
  const safeForceRefresh = forceRefresh ?? (async () => {});

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-drift-bg px-4">
        <div className="w-16 h-16 rounded-2xl bg-drift-surface flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-txt-2" />
        </div>
        <h2 className="text-xl font-bold text-txt-0 mb-2">Connect Wallet</h2>
        <p className="text-[13px] text-txt-2 text-center max-w-sm mb-5">
          Connect your wallet to view your portfolio dashboard, manage your account, and interact with the vault.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-auto custom-scrollbar">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-drift-border bg-drift-panel/50">
        <div className="flex items-center gap-3">
          {/* Back button only on mobile (Header handles nav on desktop) */}
          <button onClick={onBack} className="sm:hidden p-1.5 rounded-lg hover:bg-drift-surface transition-colors text-txt-2 hover:text-txt-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-[16px] font-bold text-txt-0 flex items-center gap-2">
              Portfolio
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-drift-surface text-txt-2 font-semibold">Live</span>
            </h1>
            <span className="text-[11px] text-txt-3 font-mono">{shortAddr(publicKey?.toBase58() || '')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-drift-surface border border-drift-border/50">
            <div className="w-1.5 h-1.5 rounded-full bg-bull" />
            <span className="text-[10px] text-txt-2 font-medium">Devnet</span>
          </div>
        </div>
      </div>

      {/* ── Tab selector ── */}
      <div className="shrink-0 flex items-center gap-0.5 px-4 sm:px-6 border-b border-drift-border/40 bg-drift-panel/30 overflow-x-auto scrollbar-hide">
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          // Dynamic count badges
          let badge: string | null = null;
          if (tab.key === 'positions' && positions.length > 0) badge = String(positions.length);
          if (tab.key === 'history' && myTrades.length > 0) badge = String(myTrades.length);

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[12px] font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                active
                  ? 'text-txt-0 border-txt-0'
                  : 'text-txt-3 border-transparent hover:text-txt-1'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  active ? 'bg-drift-surface text-txt-0' : 'bg-drift-surface text-txt-3'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0">

        {/* ═══ OVERVIEW TAB ═══ */}
        {activeTab === 'overview' && (
          <div className="px-4 sm:px-6 py-5 space-y-5">
            {/* Top Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={DollarSign}
                label="Total Portfolio"
                value={formatUsd(totalPortfolioValue)}
                sub={accountState ? `${formatUsd(accountState.totalCollateral)} in margin` : undefined}
                color="text-txt-0"
                delay={0}
              />
              <StatCard
                icon={TrendingUp}
                label="Unrealized P&L"
                value={`${totalUnrealizedPnl >= 0 ? '+' : ''}${formatUsd(totalUnrealizedPnl)}`}
                sub={totalNotional > 0 ? `${formatPct((totalUnrealizedPnl / totalNotional) * 100)} on notional` : undefined}
                color={pnlColor(totalUnrealizedPnl)}
                delay={50}
              />
              <StatCard
                icon={Shield}
                label="Account Health"
                value={`${(accountState?.health ?? 100).toFixed(0)}%`}
                sub={accountState ? `Leverage: ${accountState.leverage.toFixed(2)}x` : 'No account'}
                color="text-txt-0"
                delay={100}
              />
              <StatCard
                icon={Activity}
                label="Open Positions"
                value={`${positions.length}`}
                sub={`${openOrders.length} open orders`}
                color="text-txt-0"
                delay={150}
              />
            </div>

            {/* Health Bar */}
            {accountState && isUserInitialized && (
              <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-txt-2 font-semibold uppercase tracking-wider">Account Health</span>
                  <div className="flex items-center gap-3 text-[11px] text-txt-3">
                    <span>Margin: {formatUsd(accountState.maintenanceMargin)}</span>
                    <span>Free: {formatUsd(accountState.freeCollateral)}</span>
                  </div>
                </div>
                <HealthBar health={accountState.health} />
              </div>
            )}

            {/* Equity Chart */}
            <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-drift-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-txt-2" />
                  <h3 className="text-[13px] font-bold text-txt-0">Equity Curve</h3>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-txt-3">
                  <span>{equityHistory.length} data points</span>
                  {equityHistory.length >= 2 && (
                    <span className={pnlColor(equityHistory[equityHistory.length - 1].value - equityHistory[0].value)}>
                      {formatPct(((equityHistory[equityHistory.length - 1].value - equityHistory[0].value) / (equityHistory[0].value || 1)) * 100)} session
                    </span>
                  )}
                </div>
              </div>
              <div className="h-[160px] sm:h-[200px] p-2">
                <EquityChart data={equityHistory} />
              </div>
            </div>

            {/* Balances */}
            <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-txt-2" />
                <h3 className="text-[13px] font-bold text-txt-0">Balances</h3>
              </div>
              <div className="divide-y divide-drift-border/30">
                {/* Wallet SOL */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                      <span className="text-[12px] font-bold text-txt-1">◎</span>
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-txt-0">SOL</div>
                      <div className="text-[10px] text-txt-3">Wallet Balance</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-mono font-bold text-txt-0">{(solBalance ?? 0).toFixed(4)} SOL</div>
                    <div className="text-[10px] text-txt-3">{formatUsd(walletSolUsd)}</div>
                  </div>
                </div>

                {/* USDC in margin */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-txt-1" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-txt-0">USDC</div>
                      <div className="text-[10px] text-txt-3">Margin Account</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-mono font-bold text-txt-0">{formatUsd(accountState?.totalCollateral ?? 0)}</div>
                    <div className="text-[10px] text-txt-3">Free: {formatUsd(accountState?.freeCollateral ?? 0)}</div>
                  </div>
                </div>

                {/* IF Stake */}
                {ifStake && ifStake.stakeValue > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-drift-surface/30 transition-colors" onClick={() => setActiveTab('vault')}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-drift-surface flex items-center justify-center">
                        <Shield className="w-4 h-4 text-txt-1" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-txt-0">Insurance Fund</div>
                        <div className="text-[10px] text-txt-3">Vault Stake · Click to manage →</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-mono font-bold text-txt-0">{formatUsd(ifStake.stakeValue)}</div>
                      <div className="text-[10px] text-txt-3">{ifStake.ifShares.toLocaleString()} shares</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Position Summary */}
            {positions.length > 0 && (
              <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-drift-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-txt-2" />
                    <h3 className="text-[13px] font-bold text-txt-0">Active Positions</h3>
                  </div>
                  <button onClick={() => setActiveTab('positions')} className="text-[11px] text-txt-2 hover:text-txt-0 hover:underline">
                    View all →
                  </button>
                </div>
                {positions.slice(0, 3).map((pos, i) => (
                  <PositionRow key={i} pos={pos} oraclePrice={oraclePrice} />
                ))}
              </div>
            )}

            {/* Prediction Market Summary — removed, now at predictions.floatdevelopment.online */}

            {/* Trading Stats */}
            <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-drift-border/40 flex items-center gap-2">
                <Award className="w-4 h-4 text-txt-2" />
                <h3 className="text-[13px] font-bold text-txt-0">Trading Stats</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-drift-border/30">
                {[
                  { label: 'Total Trades', value: tradeCount.toString(), color: 'text-txt-0' },
                  { label: 'Fees Paid', value: formatUsd(totalFees), color: 'text-txt-1' },
                  { label: 'Funding Rate', value: `${(fundingRate * 100).toFixed(4)}%`, color: fundingRate >= 0 ? 'text-bull' : 'text-bear' },
                  { label: 'Sub-Accounts', value: Math.max(1, subAccounts.length).toString(), color: 'text-txt-0' },
                ].map(item => (
                  <div key={item.label} className="px-4 py-3 bg-drift-panel/80">
                    <div className="text-[10px] text-txt-3 font-medium uppercase tracking-wider">{item.label}</div>
                    <div className={`text-[15px] font-bold font-mono mt-1 ${item.color}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ POSITIONS TAB ═══ */}
        {activeTab === 'positions' && (
          <div className="px-4 sm:px-6 py-5">
            <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
              {positions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Layers className="w-10 h-10 text-txt-3 mb-3" />
                  <p className="text-[14px] font-semibold text-txt-1">No open positions</p>
                  <p className="text-[12px] text-txt-3 mt-1">Open a trade to see it here</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-drift-border/40 text-[10px] text-txt-3 font-semibold uppercase tracking-wider">
                    <div className="w-8" />
                    <div className="flex-1">Market</div>
                    <div className="text-right hidden sm:block w-[80px]">Mark</div>
                    <div className="text-right hidden md:block w-[80px]">Liq Price</div>
                    <div className="text-right min-w-[80px]">P&L</div>
                  </div>
                  {positions.map((pos, i) => (
                    <PositionRow key={i} pos={pos} oraclePrice={oraclePrice} />
                  ))}
                  {/* Totals */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-drift-border/40 bg-drift-surface/30">
                    <span className="text-[11px] text-txt-2 font-semibold">Total Notional: {formatUsd(totalNotional)}</span>
                    <span className={`text-[13px] font-bold font-mono ${pnlColor(totalUnrealizedPnl)}`}>
                      {totalUnrealizedPnl >= 0 ? '+' : ''}{formatUsd(totalUnrealizedPnl)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === 'history' && (
          <div className="px-4 sm:px-6 py-5">
            <div className="border border-drift-border/60 rounded-xl bg-drift-panel/80 overflow-hidden">
              {myTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="w-10 h-10 text-txt-3 mb-3" />
                  <p className="text-[14px] font-semibold text-txt-1">No trade history</p>
                  <p className="text-[12px] text-txt-3 mt-1">Your fills will appear here</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-drift-border/40">
                    <span className="text-[11px] text-txt-2 font-semibold uppercase tracking-wider">Recent Fills</span>
                    <span className="text-[10px] text-txt-3">{myTrades.length} trades this session</span>
                  </div>
                  {myTrades.slice(0, 50).map((trade, i) => (
                    <TradeRow key={i} trade={trade} walletKey={publicKey?.toBase58()} />
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ VAULT TAB ═══ */}
        {activeTab === 'vault' && (
          <InsuranceFundPage
            onBack={() => setActiveTab('overview')}
            embedded
          />
        )}

        {/* ═══ ACCOUNT TAB ═══ */}
        {activeTab === 'account' && (
          <UserManagement
            forceRefresh={safeForceRefresh}
            onBack={() => setActiveTab('overview')}
            trading={trading}
            embedded
          />
        )}
      </div>

      {/* Spacer for mobile nav */}
      <div className="h-16 sm:hidden" />
    </div>
  );
};

export default PortfolioPage;

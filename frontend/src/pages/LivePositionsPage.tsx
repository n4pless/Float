import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  RefreshCw,
  Eye,
  BarChart3,
  Filter,
  ArrowUpDown,
  Circle,
  Wallet,
  Loader2,
  Sparkles,
  Shield,
} from 'lucide-react';
import {
  useDriftStore,
  selectClient,
  selectOraclePrice,
} from '../stores/useDriftStore';
import { BOT_WALLETS } from '../sdk/drift-client-wrapper';
import { BASE_PRECISION, PRICE_PRECISION, getTokenAmount, SpotBalanceType, QUOTE_PRECISION } from '@drift-labs/sdk';

/* ─── Props ─── */
interface LivePositionsPageProps {
  onBack: () => void;
}

/* ─── Position row data ─── */
interface PositionRow {
  wallet: string;
  label: string;
  isBot: boolean;
  marketIndex: number;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  baseAmount: number;
  notionalUsd: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  openOrders: number;
  totalCollateral: number;
  freeCollateral: number;
  lastActive: number;
}

/* ─── Helpers ─── */
function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatBase(n: number): string {
  if (n >= 1000) return n.toFixed(1);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

/* ─── Sort types ─── */
type SortKey = 'wallet' | 'direction' | 'size' | 'notional' | 'entry' | 'pnl' | 'leverage' | 'orders' | 'collateral';

/* ═══════════════════════════════════════════════ */
/*  StatCard — premium metric card                 */
/* ═══════════════════════════════════════════════ */
const StatCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  color?: string;
  glow?: string;
  delay?: number;
}> = ({ icon: Icon, label, value, color = 'text-txt-0', delay = 0 }) => (
  <div
    className="border border-drift-border bg-drift-panel p-3.5 flex flex-col gap-1.5 animate-fadeInUp"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-txt-1 font-medium uppercase tracking-wider">{label}</span>
      <div className={`${color}`}><Icon className="w-3 h-3" /></div>
    </div>
    <div className={`text-lg font-bold font-mono tracking-tight ${color}`}>{value}</div>
  </div>
);

/* ═══════════════════════════════════════════════ */
/*  Main Page Component                            */
/* ═══════════════════════════════════════════════ */
export const LivePositionsPage: React.FC<LivePositionsPageProps> = ({ onBack }) => {
  const client = useDriftStore(selectClient);
  const oraclePrice = useDriftStore(selectOraclePrice);

  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [filter, setFilter] = useState<'all' | 'long' | 'short' | 'flat'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('notional');
  const [sortAsc, setSortAsc] = useState(false);
  const [showFlat, setShowFlat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const tickRef = useRef(0);

  /* ── Refresh positions from cached user accounts ── */
  useEffect(() => {
    function refresh() {
      if (!client) return;
      const cached = client.getCachedUserAccounts?.();
      if (!cached || cached.length === 0) return;

      const price = useDriftStore.getState().oraclePrice || oraclePrice;
      const basePrecision = 1_000_000_000;
      const quotePrecision = 1_000_000;

      let usdcSpotMarket: any = null;
      try { usdcSpotMarket = client.getDriftClient().getSpotMarketAccount(0); } catch {}

      const rows: PositionRow[] = [];

      for (const ua of cached) {
        const acct = ua.account as any;
        const authority = acct.authority?.toBase58?.() ?? '';
        const label = BOT_WALLETS[authority] || shortAddr(authority);
        const isBot = !!BOT_WALLETS[authority];

        let totalCollateral = 0;
        try {
          const spotPositions = acct.spotPositions ?? [];
          for (const sp of spotPositions) {
            if (sp.scaledBalance && !sp.scaledBalance.isZero()) {
              const mktIdx = sp.marketIndex;
              let spotMarket: any = null;
              try { spotMarket = client.getDriftClient().getSpotMarketAccount(mktIdx); } catch {}
              if (spotMarket) {
                const balType = sp.balanceType && ('borrow' in sp.balanceType) ? SpotBalanceType.BORROW : SpotBalanceType.DEPOSIT;
                const tokenAmountBN = getTokenAmount(sp.scaledBalance, spotMarket, balType);
                const tokenAmt = tokenAmountBN.toNumber() / Math.pow(10, spotMarket.decimals);
                let usdValue = tokenAmt;
                if (mktIdx !== 0) {
                  try {
                    const oracle = client.getDriftClient().getOracleDataForSpotMarket(mktIdx);
                    const px = oracle ? oracle.price.toNumber() / PRICE_PRECISION.toNumber() : 0;
                    usdValue = tokenAmt * px;
                  } catch { usdValue = 0; }
                }
                if (balType === SpotBalanceType.BORROW) totalCollateral -= usdValue;
                else totalCollateral += usdValue;
              } else {
                if (mktIdx === 0) { totalCollateral += sp.scaledBalance.toNumber() / quotePrecision; }
              }
            }
          }
        } catch {}

        const perpPositions = acct.perpPositions ?? [];
        let hasNonZeroPosition = false;
        for (const pos of perpPositions) {
          const baseAmt = pos.baseAssetAmount;
          if (!baseAmt) continue;
          const rawBase = typeof baseAmt.toNumber === 'function' ? baseAmt.toNumber() : Number(baseAmt);
          const baseNum = rawBase / basePrecision;
          const quoteEntry = pos.quoteEntryAmount;
          const quoteEntryNum = quoteEntry ? (typeof quoteEntry.toNumber === 'function' ? quoteEntry.toNumber() : Number(quoteEntry)) / quotePrecision : 0;
          const quoteAsset = pos.quoteAssetAmount ?? pos.quoteEntryAmount;
          const quoteAssetNum = quoteAsset ? (typeof quoteAsset.toNumber === 'function' ? quoteAsset.toNumber() : Number(quoteAsset)) / quotePrecision : 0;
          const direction: 'LONG' | 'SHORT' | 'FLAT' = rawBase > 0 ? 'LONG' : rawBase < 0 ? 'SHORT' : 'FLAT';
          const absBase = Math.abs(baseNum);
          const entryPrice = absBase > 0 ? Math.abs(quoteEntryNum / baseNum) : 0;
          const notionalUsd = absBase * (price || 0);
          const unrealizedPnl = baseNum * (price || 0) + quoteAssetNum;
          const leverage = totalCollateral > 0 ? notionalUsd / totalCollateral : 0;
          if (rawBase !== 0) hasNonZeroPosition = true;
          const orders = acct.orders ?? [];
          const openOrders = orders.filter((o: any) => { if (!o || !o.status) return false; return typeof o.status === 'object' ? 'open' in o.status : false; }).length;
          if (rawBase === 0 && openOrders === 0) continue;
          rows.push({ wallet: authority, label, isBot, marketIndex: pos.marketIndex ?? 0, direction, baseAmount: absBase, notionalUsd, entryPrice, markPrice: price, unrealizedPnl, leverage, openOrders, totalCollateral, freeCollateral: 0, lastActive: 0 });
        }
        if (!hasNonZeroPosition) {
          const orders = acct.orders ?? [];
          const openOrders = orders.filter((o: any) => { if (!o || !o.status) return false; return typeof o.status === 'object' ? 'open' in o.status : false; }).length;
          if (openOrders > 0) {
            rows.push({ wallet: authority, label, isBot, marketIndex: 0, direction: 'FLAT', baseAmount: 0, notionalUsd: 0, entryPrice: 0, markPrice: price, unrealizedPnl: 0, leverage: 0, openOrders, totalCollateral, freeCollateral: 0, lastActive: 0 });
          }
        }
      }
      setPositions(rows);
      setLastRefresh(Date.now());
      setIsLoading(false);
      tickRef.current += 1;
    }
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [client, oraclePrice]);

  /* ── Filtered + sorted ── */
  const displayPositions = useMemo(() => {
    let filtered = positions;
    if (filter === 'long') filtered = filtered.filter(p => p.direction === 'LONG');
    else if (filter === 'short') filtered = filtered.filter(p => p.direction === 'SHORT');
    else if (filter === 'flat') filtered = filtered.filter(p => p.direction === 'FLAT');
    else if (!showFlat) filtered = filtered.filter(p => p.direction !== 'FLAT');
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'wallet': cmp = a.label.localeCompare(b.label); break;
        case 'direction': cmp = a.direction.localeCompare(b.direction); break;
        case 'size': cmp = a.baseAmount - b.baseAmount; break;
        case 'notional': cmp = a.notionalUsd - b.notionalUsd; break;
        case 'entry': cmp = a.entryPrice - b.entryPrice; break;
        case 'pnl': cmp = a.unrealizedPnl - b.unrealizedPnl; break;
        case 'leverage': cmp = a.leverage - b.leverage; break;
        case 'orders': cmp = a.openOrders - b.openOrders; break;
        case 'collateral': cmp = a.totalCollateral - b.totalCollateral; break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [positions, filter, showFlat, sortKey, sortAsc]);

  /* ── Aggregate stats ── */
  const stats = useMemo(() => {
    const active = positions.filter(p => p.direction !== 'FLAT');
    const longs = active.filter(p => p.direction === 'LONG');
    const shorts = active.filter(p => p.direction === 'SHORT');
    const totalNotional = active.reduce((s, p) => s + p.notionalUsd, 0);
    const totalPnl = active.reduce((s, p) => s + p.unrealizedPnl, 0);
    const totalLongNotional = longs.reduce((s, p) => s + p.notionalUsd, 0);
    const totalShortNotional = shorts.reduce((s, p) => s + p.notionalUsd, 0);
    const uniqueWallets = new Set(positions.map(p => p.wallet)).size;
    return { totalPositions: active.length, longs: longs.length, shorts: shorts.length, totalNotional, totalPnl, totalLongNotional, totalShortNotional, uniqueWallets };
  }, [positions]);

  /* ── Sort handler ── */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };
  const SortHeader: React.FC<{ label: string; sortId: SortKey; className?: string }> = ({ label, sortId, className = '' }) => (
    <th className={`px-3 text-left text-[11px] font-medium text-txt-1 uppercase tracking-wide cursor-pointer select-none hover:text-txt-0 transition-colors group ${className}`}
      style={{ height: 32 }}
      onClick={() => handleSort(sortId)}>
      <span className="flex items-center gap-1">{label}
        <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === sortId ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-40'}`} />
      </span>
    </th>
  );

  /* ── Long/Short ratio bar ── */
  const longPct = stats.longs + stats.shorts > 0 ? (stats.longs / (stats.longs + stats.shorts)) * 100 : 50;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-hidden">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 bg-drift-bg border-b border-drift-border" style={{ height: 48 }}>
        <button onClick={onBack} className="text-txt-1 hover:text-txt-0 text-[13px] font-medium transition-colors">&larr; Back</button>
        <div className="w-px h-4 bg-drift-border" />
        <h1 className="text-[14px] font-semibold text-txt-0">Positions</h1>
        <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 border border-bull/20 text-bull font-bold bg-bull/5" style={{ borderRadius: 12 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          Live
        </span>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-2 text-[11px] text-txt-1">
          <span className="font-mono text-txt-0">${oraclePrice.toFixed(2)}</span>
          <span className="text-txt-1/40">SOL</span>
        </div>
        <div className="flex items-center gap-1.5 text-txt-1 text-[11px]">
          <RefreshCw className={`w-3 h-3 ${tickRef.current % 2 === 0 ? '' : 'animate-spin'}`} style={{ animationDuration: '0.5s' }} />
          <span className="text-[10px]">2s</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 py-5 space-y-5">

          {/* ══════ Hero Stats ══════ */}
          <div className="border border-drift-border bg-drift-panel overflow-hidden animate-fadeInUp">
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
                  <span className="text-[10px] text-txt-1 uppercase tracking-widest font-medium">Total Open Interest</span>
                  <span className="text-2xl sm:text-3xl font-bold font-mono text-accent tracking-tight">{formatUsd(stats.totalNotional)}</span>
                  <span className="text-[11px] font-mono text-txt-1">{stats.totalPositions} active position(s)</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-txt-1 uppercase tracking-widest font-medium">Unrealized P&L</span>
                  <span className={`text-xl font-bold font-mono tracking-tight ${stats.totalPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {stats.totalPnl >= 0 ? '+' : ''}{formatUsd(stats.totalPnl)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-txt-1 uppercase tracking-widest font-medium">Long / Short Ratio</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold font-mono text-bull">{stats.longs}L</span>
                    <div className="flex-1 h-2 rounded-full bg-drift-surface/60 overflow-hidden">
                      <div className="h-full rounded-full bg-bull transition-all duration-500" style={{ width: `${longPct}%` }} />
                    </div>
                    <span className="text-sm font-bold font-mono text-bear">{stats.shorts}S</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-txt-1 uppercase tracking-widest font-medium">Wallets</span>
                  <span className="text-xl font-bold font-mono text-txt-0">{stats.uniqueWallets}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ══════ Stat Cards Grid ══════ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Users} label="Wallets" value={String(stats.uniqueWallets)} color="text-accent" glow="from-accent/20 to-accent/5" delay={50} />
            <StatCard icon={Activity} label="Positions" value={String(stats.totalPositions)} color="text-purple" glow="from-purple/20 to-purple/5" delay={100} />
            <StatCard icon={TrendingUp} label="Longs" value={String(stats.longs)} color="text-bull" glow="from-bull/20 to-bull/5" delay={150} />
            <StatCard icon={TrendingDown} label="Shorts" value={String(stats.shorts)} color="text-bear" glow="from-bear/20 to-bear/5" delay={200} />
            <StatCard icon={BarChart3} label="Long OI" value={formatUsd(stats.totalLongNotional)} color="text-bull" glow="from-bull/20 to-bull/5" delay={250} />
            <StatCard icon={BarChart3} label="Short OI" value={formatUsd(stats.totalShortNotional)} color="text-bear" glow="from-bear/20 to-bear/5" delay={300} />
          </div>

          {/* ══════ Filters ══════ */}
          <div className="border border-drift-border bg-drift-panel px-4 py-3 flex items-center gap-3 flex-wrap animate-fadeInUp" style={{ animationDelay: '150ms' }}>
            <Filter className="w-3.5 h-3.5 text-txt-1" />
            <div className="flex items-center gap-1.5 bg-drift-input p-1" style={{ borderRadius: 4 }}>
              {(['all', 'long', 'short', 'flat'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
                    filter === f
                      ? f === 'long' ? 'bg-bull/15 text-bull border border-bull/20'
                      : f === 'short' ? 'bg-bear/15 text-bear border border-bear/20'
                      : f === 'flat' ? 'bg-drift-elevated text-txt-0 border border-drift-border'
                      : 'bg-accent/15 text-accent border border-accent/20'
                      : 'text-txt-1 hover:text-txt-0 border border-transparent'
                  }`} style={{ borderRadius: 4 }}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-txt-1">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-txt-0 transition-colors">
                <input type="checkbox" checked={showFlat} onChange={e => setShowFlat(e.target.checked)}
                  className="w-3.5 h-3.5 border-drift-border bg-drift-surface accent-accent" />
                Show idle
              </label>
              <div className="w-px h-4 bg-drift-border" />
              <span className="font-medium font-mono text-txt-0">{displayPositions.length} showing</span>
            </div>
          </div>

          {/* ══════ Table ══════ */}
          <div className="border border-drift-border bg-drift-panel overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-txt-0">Loading positions...</p>
                    <p className="text-[11px] text-txt-1 mt-1">Fetching on-chain data</p>
                  </div>
                </div>
              </div>
            ) : displayPositions.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <Eye className="w-8 h-8 text-txt-1/30" />
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-txt-0">No active positions</p>
                    <p className="text-[11px] text-txt-1 mt-1">Positions will appear here in real-time</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-drift-surface/20 border-b border-drift-border">
                      <SortHeader label="Wallet" sortId="wallet" />
                      <SortHeader label="Side" sortId="direction" />
                      <SortHeader label="Size (SOL)" sortId="size" />
                      <SortHeader label="Notional" sortId="notional" />
                      <SortHeader label="Entry" sortId="entry" />
                      <th className="px-3 text-left text-[11px] font-medium text-txt-1 uppercase tracking-wide" style={{ height: 32 }}>Mark</th>
                      <SortHeader label="uPnL" sortId="pnl" />
                      <SortHeader label="Leverage" sortId="leverage" />
                      <SortHeader label="Orders" sortId="orders" />
                      <SortHeader label="Collateral" sortId="collateral" className="hidden lg:table-cell" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-drift-border/30">
                    {displayPositions.map((p, i) => {
                      const pnlPct = p.notionalUsd > 0 ? (p.unrealizedPnl / p.notionalUsd) * 100 : 0;
                      return (
                        <tr key={`${p.wallet}-${p.marketIndex}-${i}`}
                          className="hover:bg-drift-surface/20 transition-colors" style={{ height: 36 }}>
                          {/* Wallet */}
                          <td className="px-3">
                            <div className="flex items-center gap-2.5">
                              {p.isBot ? (
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-drift-surface border border-drift-border">
                                  <Sparkles className="w-3 h-3 text-purple" />
                                </span>
                              ) : (
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-drift-surface border border-drift-border">
                                  <Wallet className="w-3 h-3 text-accent" />
                                </span>
                              )}
                              <div className="flex flex-col">
                                <span className={`font-semibold ${p.isBot ? 'text-purple' : 'text-txt-0'}`}>{p.label}</span>
                                {p.isBot && <span className="text-[10px] text-txt-3 font-mono">{shortAddr(p.wallet)}</span>}
                              </div>
                            </div>
                          </td>

                          {/* Direction */}
                          <td className="px-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold ${
                              p.direction === 'LONG' ? 'bg-bull/10 text-bull'
                                : p.direction === 'SHORT' ? 'bg-bear/10 text-bear'
                                : 'bg-drift-surface/40 text-txt-1'
                            }`} style={{ borderRadius: 4 }}>
                              {p.direction === 'LONG' ? <TrendingUp className="w-3 h-3" /> : p.direction === 'SHORT' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              {p.direction}
                            </span>
                          </td>

                          {/* Size */}
                          <td className="px-3 font-mono text-txt-0 font-medium">{p.baseAmount > 0 ? formatBase(p.baseAmount) : '—'}</td>

                          {/* Notional */}
                          <td className="px-3 font-mono text-txt-1">{p.notionalUsd > 0 ? formatUsd(p.notionalUsd) : '—'}</td>

                          {/* Entry */}
                          <td className="px-3 font-mono text-txt-1">{p.entryPrice > 0 ? `$${p.entryPrice.toFixed(2)}` : '—'}</td>

                          {/* Mark */}
                          <td className="px-3 font-mono text-txt-1">{p.markPrice > 0 ? `$${p.markPrice.toFixed(2)}` : '—'}</td>

                          {/* PnL */}
                          <td className="px-3">
                            {p.direction !== 'FLAT' ? (
                              <div className="flex flex-col">
                                <span className={`font-mono font-bold ${p.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                                  {p.unrealizedPnl >= 0 ? '+' : ''}{formatUsd(p.unrealizedPnl)}
                                </span>
                                <span className={`text-[10px] font-mono ${pnlPct >= 0 ? 'text-bull/60' : 'text-bear/60'}`}>
                                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                </span>
                              </div>
                            ) : <span className="text-txt-3">—</span>}
                          </td>

                          {/* Leverage */}
                          <td className="px-3">
                            {p.leverage > 0 ? (
                              <span className={`inline-flex items-center px-2 py-0.5 font-mono font-bold text-[11px] ${
                                p.leverage >= 5 ? 'text-bear bg-bear/8'
                                  : p.leverage >= 3 ? 'text-yellow bg-yellow/8'
                                  : 'text-txt-0 bg-drift-surface/30'
                              }`} style={{ borderRadius: 4 }}>
                                {p.leverage.toFixed(1)}x
                              </span>
                            ) : <span className="text-txt-3">—</span>}
                          </td>

                          {/* Orders */}
                          <td className="px-3">
                            {p.openOrders > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-accent/10 text-accent font-bold font-mono text-[11px]" style={{ borderRadius: 4 }}>
                                {p.openOrders}
                              </span>
                            ) : <span className="text-txt-3/40">0</span>}
                          </td>

                          {/* Collateral */}
                          <td className="px-3 font-mono text-txt-1 hidden lg:table-cell">
                            {p.totalCollateral > 0 ? formatUsd(p.totalCollateral) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-drift-border px-4 sm:px-6 py-2.5 flex items-center justify-between bg-drift-bg">
        <span className="text-[11px] text-txt-1">{positions.length} account(s) · {stats.totalPositions} active</span>
        <span className="text-[11px] text-txt-1 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          <span>Auto-refresh 2s</span>
          <span className="text-txt-1/30">·</span>
          <span className="font-mono text-txt-0">Oracle ${oraclePrice.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
};

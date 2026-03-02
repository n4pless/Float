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
  label: string;          // bot name or truncated wallet
  isBot: boolean;
  marketIndex: number;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  baseAmount: number;     // SOL
  notionalUsd: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  openOrders: number;
  totalCollateral: number;
  freeCollateral: number;
  lastActive: number;     // slot or 0
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

/* ─── Page component ─── */
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
      const basePrecision = 1_000_000_000; // 1e9
      const quotePrecision = 1_000_000;    // 1e6

      // Get the USDC spot market for proper balance conversion
      let usdcSpotMarket: any = null;
      try {
        usdcSpotMarket = client.getDriftClient().getSpotMarketAccount(0);
      } catch { /* fallback to raw */ }

      const rows: PositionRow[] = [];

      for (const ua of cached) {
        const acct = ua.account as any;
        const authority = acct.authority?.toBase58?.() ?? '';
        const label = BOT_WALLETS[authority] || shortAddr(authority);
        const isBot = !!BOT_WALLETS[authority];

        // Parse collateral using SDK's getTokenAmount for accurate interest-adjusted values
        let totalCollateral = 0;
        try {
          const spotPositions = acct.spotPositions ?? [];
          for (const sp of spotPositions) {
            if (sp.scaledBalance && !sp.scaledBalance.isZero()) {
              const mktIdx = sp.marketIndex;
              let spotMarket: any = null;
              try { spotMarket = client.getDriftClient().getSpotMarketAccount(mktIdx); } catch {}

              if (spotMarket) {
                const balType = sp.balanceType && ('borrow' in sp.balanceType)
                  ? SpotBalanceType.BORROW
                  : SpotBalanceType.DEPOSIT;
                const tokenAmountBN = getTokenAmount(sp.scaledBalance, spotMarket, balType);
                const tokenAmt = tokenAmountBN.toNumber() / Math.pow(10, spotMarket.decimals);

                // Convert non-USDC assets to USD using oracle
                let usdValue = tokenAmt;
                if (mktIdx !== 0) {
                  try {
                    const oracle = client.getDriftClient().getOracleDataForSpotMarket(mktIdx);
                    const px = oracle ? oracle.price.toNumber() / PRICE_PRECISION.toNumber() : 0;
                    usdValue = tokenAmt * px;
                  } catch { usdValue = 0; }
                }

                if (balType === SpotBalanceType.BORROW) {
                  totalCollateral -= usdValue;
                } else {
                  totalCollateral += usdValue;
                }
              } else {
                // Fallback: raw scaledBalance / QUOTE_PRECISION for USDC only
                if (mktIdx === 0) {
                  const num = sp.scaledBalance.toNumber() / quotePrecision;
                  totalCollateral += num;
                }
              }
            }
          }
        } catch { /* fallback */ }

        // Parse perp positions
        const perpPositions = acct.perpPositions ?? [];
        let hasNonZeroPosition = false;

        for (const pos of perpPositions) {
          const baseAmt = pos.baseAssetAmount;
          if (!baseAmt) continue;
          const rawBase = typeof baseAmt.toNumber === 'function' ? baseAmt.toNumber() : Number(baseAmt);
          const baseNum = rawBase / basePrecision;

          const quoteEntry = pos.quoteEntryAmount;
          const quoteEntryNum = quoteEntry
            ? (typeof quoteEntry.toNumber === 'function' ? quoteEntry.toNumber() : Number(quoteEntry)) / quotePrecision
            : 0;

          const quoteAsset = pos.quoteAssetAmount ?? pos.quoteEntryAmount;
          const quoteAssetNum = quoteAsset
            ? (typeof quoteAsset.toNumber === 'function' ? quoteAsset.toNumber() : Number(quoteAsset)) / quotePrecision
            : 0;

          const direction: 'LONG' | 'SHORT' | 'FLAT' = rawBase > 0 ? 'LONG' : rawBase < 0 ? 'SHORT' : 'FLAT';
          const absBase = Math.abs(baseNum);
          const entryPrice = absBase > 0 ? Math.abs(quoteEntryNum / baseNum) : 0;
          const notionalUsd = absBase * (price || 0);
          const unrealizedPnl = baseNum * (price || 0) + quoteAssetNum;
          const leverage = totalCollateral > 0 ? notionalUsd / totalCollateral : 0;

          if (rawBase !== 0) hasNonZeroPosition = true;

          // Count open orders
          const orders = acct.orders ?? [];
          const openOrders = orders.filter((o: any) => {
            if (!o || !o.status) return false;
            return typeof o.status === 'object' ? 'open' in o.status : false;
          }).length;

          if (rawBase === 0 && openOrders === 0) continue; // skip completely inactive

          rows.push({
            wallet: authority,
            label,
            isBot,
            marketIndex: pos.marketIndex ?? 0,
            direction,
            baseAmount: absBase,
            notionalUsd,
            entryPrice,
            markPrice: price,
            unrealizedPnl,
            leverage,
            openOrders,
            totalCollateral,
            freeCollateral: 0,
            lastActive: 0,
          });
        }

        // If user has no positions but has open orders, show them
        if (!hasNonZeroPosition) {
          const orders = acct.orders ?? [];
          const openOrders = orders.filter((o: any) => {
            if (!o || !o.status) return false;
            return typeof o.status === 'object' ? 'open' in o.status : false;
          }).length;

          if (openOrders > 0) {
            rows.push({
              wallet: authority,
              label,
              isBot,
              marketIndex: 0,
              direction: 'FLAT',
              baseAmount: 0,
              notionalUsd: 0,
              entryPrice: 0,
              markPrice: price,
              unrealizedPnl: 0,
              leverage: 0,
              openOrders,
              totalCollateral,
              freeCollateral: 0,
              lastActive: 0,
            });
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

  /* ── Filtered + sorted positions ── */
  const displayPositions = useMemo(() => {
    let filtered = positions;

    // Direction filter
    if (filter === 'long') filtered = filtered.filter(p => p.direction === 'LONG');
    else if (filter === 'short') filtered = filtered.filter(p => p.direction === 'SHORT');
    else if (filter === 'flat') filtered = filtered.filter(p => p.direction === 'FLAT');
    else if (!showFlat) filtered = filtered.filter(p => p.direction !== 'FLAT');

    // Sort
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
    return {
      totalPositions: active.length,
      longs: longs.length,
      shorts: shorts.length,
      totalNotional,
      totalPnl,
      totalLongNotional,
      totalShortNotional,
      uniqueWallets,
    };
  }, [positions]);

  /* ── Sort handler ── */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader: React.FC<{ label: string; sortId: SortKey; className?: string }> = ({ label, sortId, className = '' }) => (
    <th
      className={`px-3 py-2.5 text-left text-[11px] font-semibold text-txt-2 uppercase tracking-wider cursor-pointer select-none hover:text-txt-0 transition-colors group ${className}`}
      onClick={() => handleSort(sortId)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === sortId ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-50'}`} />
      </span>
    </th>
  );

  const timeSinceRefresh = Math.floor((Date.now() - lastRefresh) / 1000);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-drift-border px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-drift-surface text-txt-2 hover:text-txt-0 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" />
              <h1 className="text-[16px] font-bold text-txt-0">Live Positions</h1>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bull/10 border border-bull/20">
              <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              <span className="text-[10px] font-bold text-bull uppercase tracking-wide">Live</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-txt-3 text-[11px]">
              <RefreshCw className={`w-3 h-3 ${tickRef.current % 2 === 0 ? '' : 'animate-spin'}`} style={{ animationDuration: '0.5s' }} />
              <span>2s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="shrink-0 border-b border-drift-border px-4 sm:px-6 py-3 bg-drift-panel/30">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatPill icon={Users} label="Wallets" value={String(stats.uniqueWallets)} />
          <StatPill icon={Activity} label="Positions" value={String(stats.totalPositions)} />
          <StatPill icon={TrendingUp} label="Longs" value={String(stats.longs)} color="text-bull" />
          <StatPill icon={TrendingDown} label="Shorts" value={String(stats.shorts)} color="text-bear" />
          <StatPill icon={BarChart3} label="Long OI" value={formatUsd(stats.totalLongNotional)} color="text-bull" />
          <StatPill icon={BarChart3} label="Short OI" value={formatUsd(stats.totalShortNotional)} color="text-bear" />
          <StatPill
            icon={Eye}
            label="Total PnL"
            value={`${stats.totalPnl >= 0 ? '+' : ''}${formatUsd(stats.totalPnl)}`}
            color={stats.totalPnl >= 0 ? 'text-bull' : 'text-bear'}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-drift-border px-4 sm:px-6 py-2 flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-txt-3" />
        {(['all', 'long', 'short', 'flat'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              filter === f
                ? f === 'long' ? 'bg-bull/15 text-bull border border-bull/30'
                : f === 'short' ? 'bg-bear/15 text-bear border border-bear/30'
                : f === 'flat' ? 'bg-txt-3/15 text-txt-2 border border-txt-3/30'
                : 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-drift-surface text-txt-3 border border-transparent hover:text-txt-1'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-txt-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showFlat}
              onChange={e => setShowFlat(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-drift-border bg-drift-surface accent-accent"
            />
            Show idle wallets
          </label>
          <span className="text-txt-3/50">|</span>
          <span>{displayPositions.length} showing</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-accent animate-spin" />
              <p className="text-txt-2 text-sm">Loading positions...</p>
            </div>
          </div>
        ) : displayPositions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-txt-3">
              <Eye className="w-10 h-10 opacity-30" />
              <p className="text-sm">No active positions found</p>
              <p className="text-xs opacity-60">Positions will appear here in real-time</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-drift-panel/95 backdrop-blur-sm border-b border-drift-border z-10">
              <tr>
                <SortHeader label="Wallet" sortId="wallet" />
                <SortHeader label="Side" sortId="direction" />
                <SortHeader label="Size (SOL)" sortId="size" />
                <SortHeader label="Notional" sortId="notional" />
                <SortHeader label="Entry" sortId="entry" />
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-txt-2 uppercase tracking-wider">Mark</th>
                <SortHeader label="uPnL" sortId="pnl" />
                <SortHeader label="Leverage" sortId="leverage" />
                <SortHeader label="Orders" sortId="orders" />
                <SortHeader label="Collateral" sortId="collateral" className="hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-drift-border/40">
              {displayPositions.map((p, i) => {
                const pnlPct = p.notionalUsd > 0 ? (p.unrealizedPnl / p.notionalUsd) * 100 : 0;
                return (
                  <tr
                    key={`${p.wallet}-${p.marketIndex}-${i}`}
                    className="hover:bg-drift-surface/40 transition-colors"
                  >
                    {/* Wallet */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {p.isBot ? (
                          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-purple/10 border border-purple/20">
                            <Circle className="w-2.5 h-2.5 text-purple fill-purple" />
                          </span>
                        ) : (
                          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-accent/10 border border-accent/20">
                            <Wallet className="w-2.5 h-2.5 text-accent" />
                          </span>
                        )}
                        <div className="flex flex-col">
                          <span className={`font-semibold ${p.isBot ? 'text-purple' : 'text-txt-0'}`}>
                            {p.label}
                          </span>
                          {p.isBot && (
                            <span className="text-[10px] text-txt-3 font-mono">{shortAddr(p.wallet)}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Direction */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        p.direction === 'LONG'
                          ? 'bg-bull/10 text-bull border border-bull/20'
                          : p.direction === 'SHORT'
                          ? 'bg-bear/10 text-bear border border-bear/20'
                          : 'bg-txt-3/10 text-txt-3 border border-txt-3/20'
                      }`}>
                        {p.direction === 'LONG' ? <TrendingUp className="w-3 h-3" /> :
                         p.direction === 'SHORT' ? <TrendingDown className="w-3 h-3" /> :
                         <Minus className="w-3 h-3" />}
                        {p.direction}
                      </span>
                    </td>

                    {/* Size */}
                    <td className="px-3 py-2.5 font-mono text-txt-0 font-medium">
                      {p.baseAmount > 0 ? formatBase(p.baseAmount) : '—'}
                    </td>

                    {/* Notional */}
                    <td className="px-3 py-2.5 font-mono text-txt-1">
                      {p.notionalUsd > 0 ? formatUsd(p.notionalUsd) : '—'}
                    </td>

                    {/* Entry */}
                    <td className="px-3 py-2.5 font-mono text-txt-1">
                      {p.entryPrice > 0 ? `$${p.entryPrice.toFixed(2)}` : '—'}
                    </td>

                    {/* Mark */}
                    <td className="px-3 py-2.5 font-mono text-txt-2">
                      {p.markPrice > 0 ? `$${p.markPrice.toFixed(2)}` : '—'}
                    </td>

                    {/* PnL */}
                    <td className="px-3 py-2.5">
                      {p.direction !== 'FLAT' ? (
                        <div className="flex flex-col">
                          <span className={`font-mono font-bold ${
                            p.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'
                          }`}>
                            {p.unrealizedPnl >= 0 ? '+' : ''}{formatUsd(p.unrealizedPnl)}
                          </span>
                          <span className={`text-[10px] font-mono ${
                            pnlPct >= 0 ? 'text-bull/70' : 'text-bear/70'
                          }`}>
                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-txt-3">—</span>
                      )}
                    </td>

                    {/* Leverage */}
                    <td className="px-3 py-2.5">
                      {p.leverage > 0 ? (
                        <span className={`font-mono font-semibold ${
                          p.leverage >= 5 ? 'text-bear' : p.leverage >= 3 ? 'text-yellow-400' : 'text-txt-1'
                        }`}>
                          {p.leverage.toFixed(1)}x
                        </span>
                      ) : (
                        <span className="text-txt-3">—</span>
                      )}
                    </td>

                    {/* Orders */}
                    <td className="px-3 py-2.5">
                      {p.openOrders > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-md bg-accent/10 text-accent font-bold text-[11px] border border-accent/20">
                          {p.openOrders}
                        </span>
                      ) : (
                        <span className="text-txt-3">0</span>
                      )}
                    </td>

                    {/* Collateral (hidden on small) */}
                    <td className="px-3 py-2.5 font-mono text-txt-2 hidden lg:table-cell">
                      {p.totalCollateral > 0 ? formatUsd(p.totalCollateral) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-drift-border px-4 sm:px-6 py-2 flex items-center justify-between bg-drift-panel/30">
        <span className="text-[11px] text-txt-3">
          {positions.length} account(s) · {stats.totalPositions} active position(s)
        </span>
        <span className="text-[11px] text-txt-3 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
          Auto-refreshing every 2s · Oracle: ${oraclePrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

/* ─── Stat Pill ─── */
const StatPill: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  color?: string;
}> = ({ icon: Icon, label, value, color = 'text-txt-0' }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-drift-surface/50 border border-drift-border/30">
    <Icon className="w-3.5 h-3.5 text-txt-3 shrink-0" />
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] text-txt-3 font-medium">{label}</span>
      <span className={`text-[13px] font-bold ${color} truncate`}>{value}</span>
    </div>
  </div>
);

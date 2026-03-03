import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDriftStore } from '../stores/useDriftStore';
import type { L2Orderbook, OrderbookLevel } from '../sdk/drift-client-wrapper';

const ROW_H = 19; // px per row
const PRICE_PRECISION = 1_000_000;   // 1e6
const BASE_PRECISION  = 1_000_000_000; // 1e9

/** Fetch L2 from the DLOB server (proxied via /dlob/) */
async function fetchDlobL2(marketIndex: number): Promise<L2Orderbook | null> {
  try {
    const resp = await fetch(
      `/dlob/l2?marketIndex=${marketIndex}&marketType=perp&depth=20&includeVamm=false`,
    );
    if (!resp.ok) return null;
    const data = await resp.json();

    const convert = (
      levels: { price: string; size: string }[],
    ): OrderbookLevel[] => {
      let cumUsd = 0;
      return levels.map((l) => {
        const price = Number(l.price) / PRICE_PRECISION;
        const size = Number(l.size) / BASE_PRECISION;
        const sizeUsd = price * size;
        cumUsd += sizeUsd;
        return { price, size, sizeUsd, total: cumUsd, isMine: false };
      });
    };

    return {
      asks: convert(data.asks ?? []),
      bids: convert(data.bids ?? []),
      slot: data.slot ?? 0,
    };
  } catch {
    return null;
  }
}

interface Props {
  onPriceClick?: (price: number) => void;
}

export const OrderBook: React.FC<Props> = ({ onPriceClick }) => {
  const [mode, setMode] = useState<'both' | 'bids' | 'asks'>('both');
  const [l2, setL2] = useState<L2Orderbook>({ asks: [], bids: [], slot: 0 });
  const [visibleRows, setVisibleRows] = useState(12);

  const containerRef = useRef<HTMLDivElement>(null);
  const client = useDriftStore((s) => s.client);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);
  const selectedMarket = useDriftStore((s) => s.selectedMarket);
  const lastPriceChange = useDriftStore((s) => s.lastPriceChange);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);

  // Measure container and compute how many rows fit per side
  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    // Subtract header(~30) + col headers(~22) + spread(~30) = ~82px overhead
    const available = h - 82;
    const perSide = mode === 'both'
      ? Math.max(4, Math.floor(available / 2 / ROW_H))
      : Math.max(6, Math.floor(available / ROW_H));
    setVisibleRows(perSide);
  }, [mode]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Poll orderbook: primary = DLOB server, fallback = on-chain GPA
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        // Primary: DLOB server (works without wallet connection)
        const dlob = await fetchDlobL2(selectedMarket);
        if (!cancelled && dlob && (dlob.asks.length > 0 || dlob.bids.length > 0)) {
          setL2(dlob);
          return;
        }
        // Fallback: client-side GPA aggregation (needs subscription)
        if (!cancelled && client && isSubscribed) {
          const book = client.getOrdersL2(selectedMarket);
          setL2(book);
        }
      } catch { /* swallow */ }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [client, isSubscribed, selectedMarket]);

  const asks = l2.asks;
  const bids = l2.bids;
  const hasData = asks.length > 0 || bids.length > 0;
  const maxTotal = Math.max(
    asks.length > 0 ? asks[asks.length - 1].total : 0,
    bids.length > 0 ? bids[bids.length - 1].total : 0,
    1,
  );

  // Spread = best ask - best bid
  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = oraclePrice > 0 ? (spread / oraclePrice) * 100 : 0;

  const dec = 2;

  // Asks are sorted ascending (lowest first) — display reversed so lowest is at bottom near spread
  const visAsks = mode === 'bids' ? [] : asks.slice(0, visibleRows).reverse();
  const visBids = mode === 'asks' ? [] : bids.slice(0, visibleRows);

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtSize = (v: number) => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-drift-border">
        <span className="text-[11px] font-medium text-txt-0">Book</span>
        <div className="flex items-center gap-0.5">
          {(['both','bids','asks'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`w-5 h-4 flex items-center justify-center rounded-sm transition-colors ${mode === m ? 'bg-drift-active' : 'hover:bg-drift-surface'}`} title={m}>
              {m === 'both' && <svg width="10" height="10"><rect y="0" width="10" height="4" fill="#f84960" rx="1" opacity=".7"/><rect y="6" width="10" height="4" fill="#24b47e" rx="1" opacity=".7"/></svg>}
              {m === 'bids' && <svg width="10" height="10"><rect width="10" height="10" fill="#24b47e" rx="1" opacity=".7"/></svg>}
              {m === 'asks' && <svg width="10" height="10"><rect width="10" height="10" fill="#f84960" rx="1" opacity=".7"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] text-txt-3 font-medium">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks */}
      <div className="overflow-hidden flex flex-col justify-end shrink-0" style={{ height: visibleRows * ROW_H }}>
        {!hasData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-txt-3 animate-pulse">Loading orderbook…</span>
          </div>
        ) : (
          visAsks.map((l, i) => (
            <Row key={`a${i}`} level={l} maxTotal={maxTotal}
              dec={dec} fmt={fmt} fmtSize={fmtSize} side="ask" onClick={onPriceClick} />
          ))
        )}
      </div>

      {/* Spread / Mark Price */}
      <div className="px-3 py-1.5 flex items-center justify-between shrink-0 border-y border-drift-border">
        <span className={`text-[13px] font-semibold tabular-nums ${oraclePrice > 0 ? (lastPriceChange >= 0 ? 'text-bull' : 'text-bear') : 'text-txt-2'}`}>
          {oraclePrice > 0 ? oraclePrice.toFixed(dec) : '—'}
        </span>
        {spread > 0 && (
          <span className="text-[10px] tabular-nums text-txt-3">
            {spread.toFixed(dec)} ({spreadPct.toFixed(3)}%)
          </span>
        )}
      </div>

      {/* Bids */}
      <div className="overflow-hidden shrink-0" style={{ height: visibleRows * ROW_H }}>
        {!hasData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-txt-3">No resting buy orders</span>
          </div>
        ) : (
          visBids.map((l, i) => (
            <Row key={`b${i}`} level={l} maxTotal={maxTotal}
              dec={dec} fmt={fmt} fmtSize={fmtSize} side="bid" onClick={onPriceClick} />
          ))
        )}
      </div>
    </div>
  );
};

/* ── Row sub-component ───────────────────────── */

const Row: React.FC<{
  level: OrderbookLevel; maxTotal: number;
  dec: number; fmt: (v: number) => string; fmtSize: (v: number) => string;
  side: 'ask' | 'bid'; onClick?: (p: number) => void;
}> = ({ level, maxTotal, dec, fmt, fmtSize, side, onClick }) => {
  const color = side === 'ask' ? 'text-bear' : 'text-bull';
  const barColor = side === 'ask' ? 'rgba(248,73,96,.06)' : 'rgba(36,180,126,.06)';
  const mineHighlight = level.isMine ? 'bg-accent/5' : '';
  return (
    <div
      className={`grid grid-cols-3 px-3 py-px text-[11px] relative cursor-pointer hover:bg-drift-surface transition-colors ${mineHighlight}`}
      style={{ height: 19 }}
      onClick={() => onClick?.(level.price)}
      title={level.isMine ? 'Your order' : undefined}
    >
      <div className="absolute inset-y-0 right-0" style={{ width: `${(level.total / maxTotal) * 100}%`, background: barColor }} />
      <span className={`relative z-10 tabular-nums font-medium ${color}`}>
        {level.isMine && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1 align-middle" />}
        {level.price.toFixed(dec)}
      </span>
      <span className="relative z-10 text-right tabular-nums text-txt-1">{fmtSize(level.size)}</span>
      <span className="relative z-10 text-right tabular-nums text-txt-2">{fmt(level.total)}</span>
    </div>
  );
};

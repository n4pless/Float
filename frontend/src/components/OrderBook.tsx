import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDriftStore } from '../stores/useDriftStore';
import type { L2Orderbook, OrderbookLevel } from '../sdk/drift-client-wrapper';

const ROW_H = 22; // px per row — Backpack spec
const PRICE_PRECISION = 1_000_000;
const BASE_PRECISION  = 1_000_000_000;

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
      let cumSize = 0;
      return levels.map((l) => {
        const price = Number(l.price) / PRICE_PRECISION;
        const size = Number(l.size) / BASE_PRECISION;
        const sizeUsd = price * size;
        cumSize += size;
        return { price, size, sizeUsd, total: cumSize, isMine: false };
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
    // header(~32) + col headers(~24) + spread(~36) + bid/ask bar(~24) = ~116px overhead
    const available = h - 116;
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

  // Poll orderbook
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const dlob = await fetchDlobL2(selectedMarket);
        if (!cancelled && dlob && (dlob.asks.length > 0 || dlob.bids.length > 0)) {
          setL2(dlob);
          const storePrice = useDriftStore.getState().oraclePrice;
          if (storePrice === 0 && dlob.bids.length > 0 && dlob.asks.length > 0) {
            const mid = (dlob.bids[0].price + dlob.asks[0].price) / 2;
            useDriftStore.getState().updateMarketData({ oraclePrice: mid });
          }
          return;
        }
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

  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : 0;
  const displayMid = oraclePrice > 0 ? oraclePrice : midPrice;
  const spreadPct = displayMid > 0 ? (spread / displayMid) * 100 : 0;

  // Bid/ask weight percentages
  const totalBidVol = bids.length > 0 ? bids[bids.length - 1].total : 0;
  const totalAskVol = asks.length > 0 ? asks[asks.length - 1].total : 0;
  const totalVol = totalBidVol + totalAskVol;
  const bidPct = totalVol > 0 ? Math.round((totalBidVol / totalVol) * 100) : 50;
  const askPct = 100 - bidPct;

  const dec = 2;
  const visAsks = mode === 'bids' ? [] : asks.slice(0, visibleRows).reverse();
  const visBids = mode === 'asks' ? [] : bids.slice(0, visibleRows);

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtSize = (v: number) => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Header — "Book" + mode icons */}
      <div className="flex items-center justify-between px-3 shrink-0 border-b border-drift-border" style={{ height: 32 }}>
        <span className="text-[13px] font-semibold text-txt-0">Book</span>
        <div className="flex items-center gap-1">
          {(['both','bids','asks'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`w-4 h-4 flex items-center justify-center transition-colors ${mode === m ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`} title={m}>
              {m === 'both' && <svg width="12" height="12"><rect y="0" width="12" height="5" fill="#FF4D6A" rx="1"/><rect y="7" width="12" height="5" fill="#00D26A" rx="1"/></svg>}
              {m === 'bids' && <svg width="12" height="12"><rect width="12" height="12" fill="#00D26A" rx="1"/></svg>}
              {m === 'asks' && <svg width="12" height="12"><rect width="12" height="12" fill="#FF4D6A" rx="1"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers — 11px uppercase */}
      <div className="grid grid-cols-3 px-3 shrink-0 text-[11px] text-txt-1 font-medium" style={{ height: 24, lineHeight: '24px' }}>
        <span>Price (USD)</span>
        <span className="text-right">Size (SOL)</span>
        <span className="text-right">Total (SOL)</span>
      </div>

      {/* Asks */}
      <div className={`overflow-hidden flex flex-col justify-end ${mode === 'bids' ? '' : 'shrink-0'}`} style={{ height: mode === 'bids' ? 0 : visibleRows * ROW_H }}>
        {!hasData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-txt-3 animate-pulse">Loading orderbook…</span>
          </div>
        ) : (
          visAsks.map((l, i) => (
            <Row key={`a${i}`} level={l} maxTotal={maxTotal}
              dec={dec} fmt={fmt} fmtSize={fmtSize} side="ask" onClick={onPriceClick} />
          ))
        )}
      </div>

      {/* Spread / Mark Price — 20px semibold */}
      <div className="px-3 flex items-center justify-between shrink-0 border-y border-drift-border" style={{ height: 36 }}>
        <span className={`text-[20px] font-semibold tabular-nums font-mono ${displayMid > 0 ? (lastPriceChange >= 0 ? 'text-bull' : 'text-bear') : 'text-txt-1'}`}>
          {displayMid > 0 ? displayMid.toFixed(dec) : '—'}
        </span>
        {spread > 0 && (
          <span className="text-[11px] tabular-nums font-mono text-txt-3">
            {spread.toFixed(dec)} ({spreadPct.toFixed(3)}%)
          </span>
        )}
      </div>

      {/* Bids */}
      <div className={`overflow-hidden ${mode === 'asks' ? '' : 'shrink-0'}`} style={{ height: mode === 'asks' ? 0 : visibleRows * ROW_H }}>
        {!hasData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-txt-3">No resting buy orders</span>
          </div>
        ) : (
          visBids.map((l, i) => (
            <Row key={`b${i}`} level={l} maxTotal={maxTotal}
              dec={dec} fmt={fmt} fmtSize={fmtSize} side="bid" onClick={onPriceClick} />
          ))
        )}
      </div>

      {/* Bid/Ask Percentage Bar */}
      <div className="mt-auto px-3 shrink-0 border-t border-drift-border" style={{ height: 24 }}>
        <div className="flex items-center h-full gap-2">
          <span className="text-[11px] font-mono text-bull tabular-nums">{bidPct}%</span>
          <div className="flex-1 h-1 flex rounded-full overflow-hidden">
            <div className="bg-bull/60 h-full transition-all duration-300" style={{ width: `${bidPct}%` }} />
            <div className="bg-bear/60 h-full transition-all duration-300" style={{ width: `${askPct}%` }} />
          </div>
          <span className="text-[11px] font-mono text-bear tabular-nums">{askPct}%</span>
        </div>
      </div>
    </div>
  );
};

/* ── Row sub-component — 22px height, monospace numbers ───── */

const Row: React.FC<{
  level: OrderbookLevel; maxTotal: number;
  dec: number; fmt: (v: number) => string; fmtSize: (v: number) => string;
  side: 'ask' | 'bid'; onClick?: (p: number) => void;
}> = ({ level, maxTotal, dec, fmt, fmtSize, side, onClick }) => {
  const color = side === 'ask' ? 'text-bear' : 'text-bull';
  const barColor = side === 'ask' ? 'rgba(255,77,106,.10)' : 'rgba(0,210,106,.10)';
  const mineHighlight = level.isMine ? 'bg-accent/5' : '';
  return (
    <div
      className={`grid grid-cols-3 px-3 text-[12px] font-mono relative cursor-pointer hover:bg-drift-surface transition-colors ${mineHighlight}`}
      style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}
      onClick={() => onClick?.(level.price)}
      title={level.isMine ? 'Your order' : undefined}
    >
      <div className="absolute inset-y-0 right-0" style={{ width: `${(level.total / maxTotal) * 100}%`, background: barColor }} />
      <span className={`relative z-10 tabular-nums ${color}`}>
        {level.isMine && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1 align-middle" />}
        {level.price.toFixed(dec)}
      </span>
      <span className="relative z-10 text-right tabular-nums text-txt-0">{fmtSize(level.size)}</span>
      <span className="relative z-10 text-right tabular-nums text-txt-0">{fmtSize(level.total)}</span>
    </div>
  );
};

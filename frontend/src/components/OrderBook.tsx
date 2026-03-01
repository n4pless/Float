import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, ArrowUpDown } from 'lucide-react';
import { useDriftStore } from '../stores/useDriftStore';
import type { L2Orderbook, OrderbookLevel } from '../sdk/drift-client-wrapper';

interface Props {
  onPriceClick?: (price: number) => void;
}

export const OrderBook: React.FC<Props> = ({ onPriceClick }) => {
  const [mode, setMode] = useState<'both' | 'bids' | 'asks'>('both');
  const [l2, setL2] = useState<L2Orderbook>({ asks: [], bids: [], slot: 0 });

  const client = useDriftStore((s) => s.client);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);
  const selectedMarket = useDriftStore((s) => s.selectedMarket);
  const lastPriceChange = useDriftStore((s) => s.lastPriceChange);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);

  // Poll real open limit orders and aggregate into L2 price levels.
  // Shows only actual resting orders placed by users — not vAMM implied liquidity.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!client || !isSubscribed) {
      setL2({ asks: [], bids: [], slot: 0 });
      return;
    }

    const poll = () => {
      try {
        const book = client.getOrdersL2(selectedMarket);
        setL2(book);
      } catch {}
    };

    poll();
    intervalRef.current = setInterval(poll, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
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
  const visAsks = mode === 'bids' ? [] : mode === 'both' ? asks.slice(0, 8).reverse() : asks.slice(0, 12).reverse();
  const visBids = mode === 'asks' ? [] : mode === 'both' ? bids.slice(0, 8) : bids.slice(0, 12);

  const fmt = (v: number) =>
    v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0);
  const fmtSize = (v: number) => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-drift-border">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-txt-3" />
          <span className="text-[12px] font-semibold text-txt-0">Order Book</span>
          <span className="text-[9px] text-txt-3 bg-drift-surface/60 px-1.5 py-0.5 rounded font-mono">
            DLOB
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(['both','bids','asks'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`w-5 h-4 flex items-center justify-center rounded transition-all ${mode === m ? 'bg-drift-surface' : 'hover:bg-drift-surface/50'}`} title={m}>
              {m === 'both' && <svg width="10" height="10"><rect y="0" width="10" height="4" fill="#F84960" rx="1" opacity=".8"/><rect y="6" width="10" height="4" fill="#31D0AA" rx="1" opacity=".8"/></svg>}
              {m === 'bids' && <svg width="10" height="10"><rect width="10" height="10" fill="#31D0AA" rx="1" opacity=".8"/></svg>}
              {m === 'asks' && <svg width="10" height="10"><rect width="10" height="10" fill="#F84960" rx="1" opacity=".8"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-txt-3 font-medium bg-drift-surface/30">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total (USD)</span>
      </div>

      {/* Asks */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {!isSubscribed ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-txt-3 animate-pulse">Loading orderbook…</span>
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-txt-3">No resting sell orders</span>
          </div>
        ) : (
          visAsks.map((l, i) => (
            <Row key={`a${i}`} level={l} maxTotal={maxTotal}
              dec={dec} fmt={fmt} fmtSize={fmtSize} side="ask" onClick={onPriceClick} />
          ))
        )}
      </div>

      {/* Spread / Mark Price */}
      <div className="px-3 py-2 flex items-center justify-between shrink-0 border-y border-drift-border bg-drift-surface/20">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3 h-3 text-txt-3" />
          <span className={`text-[14px] font-bold tabular-nums ${oraclePrice > 0 ? (lastPriceChange >= 0 ? 'text-bull' : 'text-bear') : 'text-txt-2'}`}>
            {oraclePrice > 0 ? `$${oraclePrice.toFixed(dec)}` : '—'}
          </span>
        </div>
        {spread > 0 && (
          <span className="text-[10px] tabular-nums text-txt-3">
            Spread: ${spread.toFixed(dec)} ({spreadPct.toFixed(3)}%)
          </span>
        )}
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-hidden">
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
  const barColor = side === 'ask' ? 'rgba(248,73,96,.08)' : 'rgba(49,208,170,.08)';
  const mineHighlight = level.isMine ? 'ring-1 ring-inset ring-accent/30 bg-accent/5' : '';
  return (
    <div
      className={`grid grid-cols-3 px-3 py-px text-[11px] relative cursor-pointer hover:bg-drift-surface/50 transition-colors ${mineHighlight}`}
      style={{ height: 22 }}
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

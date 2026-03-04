import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { AssetIcon } from './icons/AssetIcon';
import DRIFT_CONFIG from '../config';
import { useDriftStore } from '../stores/useDriftStore';

/** Fetch 24h ticker stats from Binance */
async function fetch24hStats(binanceSymbol: string): Promise<{ volume: number; priceChange: number; priceChangePct: number }> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance 24hr error ${res.status}`);
  const d = await res.json();
  return {
    volume: parseFloat(d.quoteVolume),          // USD volume
    priceChange: parseFloat(d.priceChange),
    priceChangePct: parseFloat(d.priceChangePercent),
  };
}

export const MarketBar: React.FC = () => {
  const [open, setOpen] = useState(false);

  const selectedMarket = useDriftStore((s) => s.selectedMarket);
  const setSelectedMarket = useDriftStore((s) => s.setSelectedMarket);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);
  const fundingRate = useDriftStore((s) => s.fundingRate);
  const openInterest = useDriftStore((s) => s.openInterest);
  const lastPriceChange = useDriftStore((s) => s.lastPriceChange);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);

  const market = DRIFT_CONFIG.markets[selectedMarket] ?? DRIFT_CONFIG.markets[0];
  const displayPrice = oraclePrice > 0 ? oraclePrice : 0;
  const up = lastPriceChange >= 0;
  const fundingPct = fundingRate * 100;

  // 24h stats from Binance
  const [stats24h, setStats24h] = useState<{ volume: number; priceChangePct: number } | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const load = () => {
      fetch24hStats(market.binanceSymbol ?? 'SOLUSDT')
        .then(setStats24h)
        .catch(() => {});
    };
    load();
    statsIntervalRef.current = setInterval(load, 30_000);
    return () => clearInterval(statsIntervalRef.current);
  }, [market.binanceSymbol]);

  return (
    <div className="h-12 flex items-center gap-6 px-4 shrink-0 bg-drift-panel border-b border-drift-border select-none overflow-x-auto">
      {/* Market picker — left cluster */}
      <div className="relative flex items-center gap-3">
        <button
          onClick={() => setOpen(!open)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center">
            <AssetIcon asset={market.baseAsset ?? 'SOL'} size={16} />
          </div>
          <span className="font-semibold text-[16px] text-txt-0">{market.pair ?? market.symbol}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[10px] bg-yellow text-black leading-none">{market.maxLev ?? 10}x</span>
          <ChevronDown className={`w-3.5 h-3.5 text-txt-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Current price — 20px semibold */}
        <span className={`text-[20px] font-semibold tabular-nums font-mono ${displayPrice > 0 ? (up ? 'text-bull' : 'text-bear') : 'text-txt-1'}`}>
          {displayPrice > 0
            ? displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '—'}
        </span>

        {!isSubscribed && oraclePrice === 0 && (
          <span className="text-[11px] text-txt-3 animate-pulse">connecting…</span>
        )}

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] py-1 bg-drift-surface border border-drift-border">
            <div className="px-3 py-1.5 text-[11px] text-txt-3 font-medium uppercase tracking-[0.5px]">Markets</div>
            {Object.entries(DRIFT_CONFIG.markets).map(([idx, m]) => (
              <button
                key={idx}
                onClick={() => { setSelectedMarket(+idx); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-[12px] hover:bg-drift-surface transition-colors ${+idx === selectedMarket ? 'bg-drift-active' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-black/40 flex items-center justify-center">
                    <AssetIcon asset={m.baseAsset ?? 'SOL'} size={14} />
                  </div>
                  <span className="text-txt-0 font-medium">{m.symbol}</span>
                </div>
                {+idx === selectedMarket && (
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right cluster — stat blocks with 32px spacing */}
      <div className="hidden md:flex items-center gap-8 ml-auto">
        <Stat label="24H CHANGE" value={stats24h ? `${stats24h.priceChangePct >= 0 ? '+' : ''}${stats24h.priceChangePct.toFixed(2)}%` : (lastPriceChange !== 0 ? `${lastPriceChange >= 0 ? '+' : ''}${lastPriceChange.toFixed(2)}` : '—')} color={stats24h ? (stats24h.priceChangePct >= 0 ? 'text-bull' : 'text-bear') : (lastPriceChange >= 0 ? 'text-bull' : 'text-bear')} />
        <Stat label="FUNDING RATE" value={fundingRate !== 0 ? `${fundingPct >= 0 ? '+' : ''}${fundingPct.toFixed(4)}%` : '—'} color={fundingPct < 0 ? 'text-bear' : fundingPct > 0 ? 'text-bull' : undefined} />
        <Stat label="OPEN INTEREST" value={openInterest > 0 ? `${openInterest.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${market.baseAsset ?? 'SOL'}` : '—'} />
        <Stat label="24H VOLUME" value={stats24h ? `$${formatVolume(stats24h.volume)}` : '—'} />
      </div>
    </div>
  );
};

/** Format volume to human-readable (e.g. 1.2B, 345M, 12.5K) */
function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex flex-col">
    <span className="text-[11px] leading-tight text-txt-1 uppercase tracking-[0.5px]">{label}</span>
    <span className={`text-[13px] font-medium tabular-nums font-mono ${color ?? 'text-txt-0'}`}>{value}</span>
  </div>
);

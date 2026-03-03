import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SolanaLogo } from './icons/SolanaLogo';
import DRIFT_CONFIG from '../config';
import { useDriftStore } from '../stores/useDriftStore';

export const MarketBar: React.FC = () => {
  const [open, setOpen] = useState(false);

  const selectedMarket = useDriftStore((s) => s.selectedMarket);
  const setSelectedMarket = useDriftStore((s) => s.setSelectedMarket);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);
  const fundingRate = useDriftStore((s) => s.fundingRate);
  const openInterest = useDriftStore((s) => s.openInterest);
  const lastPriceChange = useDriftStore((s) => s.lastPriceChange);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);

  const market = DRIFT_CONFIG.markets[selectedMarket as keyof typeof DRIFT_CONFIG.markets];
  const displayPrice = oraclePrice > 0 ? oraclePrice : 0;
  const up = lastPriceChange >= 0;
  const fundingPct = fundingRate * 100;

  return (
    <div className="h-11 flex items-center gap-4 px-3 shrink-0 bg-drift-panel border-b border-drift-border select-none overflow-x-auto">
      {/* Market picker */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-drift-surface transition-colors"
        >
          <div className="w-5 h-5 rounded bg-black/40 flex items-center justify-center">
            <SolanaLogo size={14} />
          </div>
          <span className="font-semibold text-[13px] text-txt-0">{market.symbol}</span>
          <span className="text-[10px] text-txt-3 bg-drift-surface px-1 py-0.5 rounded font-medium">10x</span>
          <ChevronDown className={`w-3.5 h-3.5 text-txt-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] py-1 rounded-md bg-drift-surface border border-drift-border">
            <div className="px-3 py-1.5 text-[10px] text-txt-3 font-medium uppercase tracking-wider">Markets</div>
            {Object.entries(DRIFT_CONFIG.markets).map(([idx, m]) => (
              <button
                key={idx}
                onClick={() => { setSelectedMarket(+idx); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-[11px] hover:bg-drift-active transition-colors ${+idx === selectedMarket ? 'bg-drift-active' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-black/40 flex items-center justify-center">
                    <SolanaLogo size={12} />
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

      {/* Price */}
      <span className={`text-[16px] font-semibold tabular-nums tracking-tight ${displayPrice > 0 ? (up ? 'text-bull' : 'text-bear') : 'text-txt-2'}`}>
        {displayPrice > 0
          ? displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—'}
      </span>

      {!isSubscribed && oraclePrice === 0 && (
        <span className="text-[10px] text-txt-3 animate-pulse">connecting…</span>
      )}

      {/* Stats — Backpack style: label on top, value below */}
      <div className="hidden md:flex items-center gap-5 ml-2">
        <Stat label="24H Change" value={lastPriceChange !== 0 ? `${lastPriceChange >= 0 ? '+' : ''}${lastPriceChange.toFixed(2)}` : '—'} color={lastPriceChange >= 0 ? 'text-bull' : 'text-bear'} />
        <Stat label="Funding Rate" value={fundingRate !== 0 ? `${fundingPct >= 0 ? '+' : ''}${fundingPct.toFixed(4)}%` : '—'} color={fundingPct < 0 ? 'text-bear' : fundingPct > 0 ? 'text-bull' : undefined} />
        <Stat label="Open Interest" value={openInterest > 0 ? `${openInterest.toLocaleString(undefined, { maximumFractionDigits: 1 })} SOL` : '—'} />
        <Stat label="24H Volume" value="—" />
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex flex-col">
    <span className="text-[10px] leading-tight text-txt-3">{label}</span>
    <span className={`text-[11px] font-medium tabular-nums ${color ?? 'text-txt-1'}`}>{value}</span>
  </div>
);

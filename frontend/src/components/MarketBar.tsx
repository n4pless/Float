import React, { useState } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Activity, DollarSign, BarChart3 } from 'lucide-react';
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
    <div className="h-12 sm:h-14 flex items-center gap-3 sm:gap-5 px-2 sm:px-4 shrink-0 bg-drift-panel/50 border-b border-drift-border select-none overflow-x-auto">
      {/* Market picker */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-drift-surface transition-all group"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center shadow-lg shadow-accent/10">
            <span className="text-[10px] font-bold text-white">{market.symbol[0]}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="font-bold text-[14px] text-txt-0 leading-tight">{market.symbol}</span>
            <span className="text-[10px] text-txt-3">Perpetual</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-txt-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-2 z-50 min-w-[240px] py-2 rounded-xl shadow-2xl bg-drift-surface border border-drift-border-lt backdrop-blur-sm">
            <div className="px-3 pb-2 text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Markets</div>
            {Object.entries(DRIFT_CONFIG.markets).map(([idx, m]) => (
              <button
                key={idx}
                onClick={() => { setSelectedMarket(+idx); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-drift-input transition-all rounded-lg mx-0 ${+idx === selectedMarket ? 'bg-drift-input' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center">
                    <span className="text-[9px] font-bold text-white">{m.symbol[0]}</span>
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

      <div className="w-px h-8 bg-drift-border-lt hidden sm:block" />

      {/* Price */}
      <div className="flex items-center gap-2 shrink-0">
        {up ? (
          <TrendingUp className="w-4 h-4 text-bull" />
        ) : (
          <TrendingDown className="w-4 h-4 text-bear" />
        )}
        <span className={`text-lg sm:text-xl font-bold tabular-nums tracking-tight ${displayPrice > 0 ? (up ? 'text-bull' : 'text-bear') : 'text-txt-2'}`}>
          {displayPrice > 0
            ? `$${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '—'}
        </span>
        {!isSubscribed && (
          <span className="text-[10px] text-txt-3 animate-pulse ml-1">connecting…</span>
        )}
      </div>

      {/* Stats — hidden on mobile, shown md+ */}
      <div className="hidden md:flex items-center gap-6 ml-3">
        <Stat icon={DollarSign} label="Oracle" value={displayPrice > 0 ? `$${displayPrice.toFixed(2)}` : '—'} />
        <Stat
          icon={Activity}
          label="Funding Rate"
          value={fundingRate !== 0 ? `${fundingPct >= 0 ? '+' : ''}${fundingPct.toFixed(4)}%` : '—'}
          color={fundingPct < 0 ? 'text-bear' : fundingPct > 0 ? 'text-bull' : undefined}
        />
        <Stat icon={BarChart3} label="Open Interest" value={openInterest > 0 ? `${openInterest.toLocaleString(undefined, { maximumFractionDigits: 1 })} SOL` : '—'} />
        <Stat icon={BarChart3} label="24h Volume" value="—" />
      </div>
    </div>
  );
};

const Stat: React.FC<{ icon: any; label: string; value: string; color?: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="flex items-center gap-2">
    <Icon className="w-3.5 h-3.5 text-txt-3" />
    <div className="flex flex-col">
      <span className="text-[10px] leading-tight text-txt-3">{label}</span>
      <span className={`text-[12px] font-semibold tabular-nums ${color ?? 'text-txt-1'}`}>{value}</span>
    </div>
  </div>
);

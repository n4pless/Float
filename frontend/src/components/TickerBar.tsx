import React from 'react';
import { useDriftStore, selectOraclePrice } from '../stores/useDriftStore';

const PAIRS = [
  { name: 'SOL-PERP', change: '+3.42%', positive: true },
  { name: 'BTC-PERP', change: '+1.87%', positive: true },
  { name: 'ETH-PERP', change: '-0.54%', positive: false },
  { name: 'APT-PERP', change: '+5.12%', positive: true },
  { name: 'ARB-PERP', change: '-1.23%', positive: false },
  { name: 'MATIC-PERP', change: '+0.89%', positive: true },
  { name: 'AVAX-PERP', change: '+2.15%', positive: true },
  { name: 'DOGE-PERP', change: '-0.31%', positive: false },
  { name: 'LINK-PERP', change: '+1.56%', positive: true },
  { name: 'OP-PERP', change: '+4.20%', positive: true },
];

export const TickerBar: React.FC = () => {
  const oraclePrice = useDriftStore(selectOraclePrice);

  const items = PAIRS.map(p => {
    const price = p.name === 'SOL-PERP' && oraclePrice > 0
      ? `$${oraclePrice.toFixed(2)}`
      : `$${(Math.random() * 100 + 10).toFixed(2)}`;
    return { ...p, price };
  });

  // Duplicate for seamless loop
  const allItems = [...items, ...items];

  return (
    <div
      className="flex items-center bg-drift-panel border-t border-drift-border overflow-hidden shrink-0"
      style={{ height: 28 }}
    >
      {/* Label */}
      <div className="flex items-center gap-1.5 px-3 shrink-0 border-r border-drift-border">
        <span style={{ fontSize: 12 }}>🔥</span>
        <span className="text-[11px] text-txt-1 font-medium whitespace-nowrap">Top Movers</span>
      </div>

      {/* Scrolling marquee */}
      <div className="flex-1 overflow-hidden relative">
        <div className="flex items-center animate-ticker whitespace-nowrap" style={{ gap: 24 }}>
          {allItems.map((item, i) => (
            <span key={`${item.name}-${i}`} className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
              <span className="text-txt-1">{item.name}</span>
              <span className="text-txt-0">{item.price}</span>
              <span className={item.positive ? 'text-bull' : 'text-bear'}>{item.change}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

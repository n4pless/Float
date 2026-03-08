import React from 'react';
import { useDriftStore, selectRecentTrades, selectOraclePrice } from '../stores/useDriftStore';

export const RecentTrades: React.FC = () => {
  const trades = useDriftStore(selectRecentTrades);
  const oraclePrice = useDriftStore(selectOraclePrice);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);
  const dec = 2;

  return (
    <div className="flex flex-col h-full">
      {/* Header - 32px */}
      <div className="flex items-center justify-between px-3 shrink-0 border-b border-drift-border" style={{ height: 32 }}>
        <span className="text-[13px] font-semibold text-txt-0">Trades</span>
        {trades.length > 0 && (
          <span className="text-[11px] text-txt-1 font-mono tabular-nums">
            {trades.length}
          </span>
        )}
      </div>

      {/* Column headers - 24px */}
      <div className="grid px-3 text-[11px] text-txt-1 font-medium border-b border-drift-border/50" style={{ height: 24, lineHeight: '24px', gridTemplateColumns: '1fr 1fr 70px' }}>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-txt-1 gap-2">
            {!isSubscribed ? (
              <span className="text-[12px] animate-pulse">Connecting…</span>
            ) : (
              <>
                <span className="text-[12px]">No recent trades</span>
                <span className="text-[11px] text-txt-1/50">Trades appear when orders are filled</span>
              </>
            )}
          </div>
        ) : (
          trades.map((t, i) => {
            const time = new Date(t.ts).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            return (
              <div
                key={`${t.ts}-${i}`}
                className="grid px-3 text-[12px] font-mono hover:bg-drift-surface/40 transition-colors cursor-default items-center"
                style={{ height: 22, gridTemplateColumns: '1fr 1fr 70px' }}
              >
                <span className={`tabular-nums font-medium ${t.side === 'buy' ? 'text-bull' : 'text-bear'}`}>
                  {t.price.toFixed(dec)}
                </span>
                <span className="text-right tabular-nums text-txt-0">
                  ${t.size.toFixed(0)}
                </span>
                <span className="text-right tabular-nums text-txt-1">{time}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

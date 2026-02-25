import React from 'react';
import { Clock, BarChart3 } from 'lucide-react';
import { useDriftStore, selectRecentTrades, selectOraclePrice } from '../stores/useDriftStore';

export const RecentTrades: React.FC = () => {
  const trades = useDriftStore(selectRecentTrades);
  const oraclePrice = useDriftStore(selectOraclePrice);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);
  const dec = 2;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-drift-border">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-txt-3" />
          <span className="text-[12px] font-semibold text-txt-0">Recent Trades</span>
        </div>
        {trades.length > 0 && (
          <span className="text-[10px] text-txt-3 bg-drift-surface px-2 py-0.5 rounded-md font-medium">
            {trades.length}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-txt-3 font-medium bg-drift-surface/30">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-txt-3 gap-2">
            {!isSubscribed ? (
              <span className="text-[11px] animate-pulse">Connecting…</span>
            ) : (
              <>
                <BarChart3 className="w-5 h-5 text-txt-3/50" />
                <span className="text-[11px]">No recent trades</span>
                <span className="text-[10px] text-txt-3/50">Trades will appear when orders are filled</span>
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
                className="grid grid-cols-3 px-3 py-px text-[11px] hover:bg-drift-surface/50 transition-colors cursor-default"
                style={{ height: 20 }}
              >
                <span className={`tabular-nums font-medium ${t.side === 'buy' ? 'text-bull' : 'text-bear'}`}>
                  {t.price.toFixed(dec)}
                </span>
                <span className="text-right tabular-nums text-txt-1">
                  ${t.size.toFixed(0)}
                </span>
                <span className="text-right tabular-nums text-txt-3">{time}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

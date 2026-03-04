import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { UserPosition } from '../sdk/drift-client-wrapper';
import DRIFT_CONFIG from '../config';

interface Props {
  position: UserPosition;
  oraclePrice: number;
  onClose: () => void;
  onMarketClose: (marketIndex: number) => Promise<any>;
  onLimitClose: (marketIndex: number, sizeBase: number, limitPrice: number) => Promise<any>;
}

export const ClosePositionModal: React.FC<Props> = ({
  position,
  oraclePrice,
  onClose,
  onMarketClose,
  onLimitClose,
}) => {
  const [closeType, setCloseType] = useState<'market' | 'limit'>('market');
  const [sizeMode, setSizeMode] = useState<'full' | 'partial'>('full');
  const [partialSize, setPartialSize] = useState('');
  const [limitPrice, setLimitPrice] = useState(
    oraclePrice > 0 ? oraclePrice.toFixed(2) : '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const market = DRIFT_CONFIG.markets[position.marketIndex as keyof typeof DRIFT_CONFIG.markets];
  const isLong = position.direction === 'LONG';
  const fullSize = Math.abs(position.baseAssetAmount);

  const effectiveSize = sizeMode === 'full'
    ? fullSize
    : Math.min(parseFloat(partialSize) || 0, fullSize);

  const handleSubmit = async () => {
    if (effectiveSize <= 0) {
      setError('Enter a valid size');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (closeType === 'market') {
        await onMarketClose(position.marketIndex);
      } else {
        const price = parseFloat(limitPrice);
        if (isNaN(price) || price <= 0) {
          setError('Enter a valid limit price');
          setLoading(false);
          return;
        }
        await onLimitClose(position.marketIndex, effectiveSize, price);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message?.slice(0, 120) || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded border border-drift-border bg-drift-panel shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-drift-border">
          <div>
            <h3 className="text-[14px] font-semibold text-txt-0">Close Position</h3>
            <span className="text-[11px] text-txt-3">
              {market?.symbol ?? `PERP-${position.marketIndex}`} ·{' '}
              <span className={isLong ? 'text-bull' : 'text-bear'}>{position.direction}</span> ·{' '}
              {fullSize.toFixed(4)} SOL
            </span>
          </div>
          <button onClick={onClose} className="text-txt-3 hover:text-txt-0 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Close type tabs */}
          <div className="flex rounded border border-drift-border overflow-hidden">
            {(['market', 'limit'] as const).map(t => (
              <button key={t} onClick={() => setCloseType(t)}
                className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
                  closeType === t
                    ? 'bg-drift-active text-txt-0'
                    : 'text-txt-3 hover:text-txt-1'
                }`}>
                {t === 'market' ? 'Market Close' : 'Limit Close'}
              </button>
            ))}
          </div>

          {/* Size mode */}
          <div>
            <label className="text-[11px] text-txt-3 uppercase tracking-wide block mb-2">Size</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setSizeMode('full')}
                className={`flex-1 py-2 rounded text-[11px] font-semibold border transition-colors ${
                  sizeMode === 'full'
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-drift-border text-txt-3 hover:text-txt-1'
                }`}>
                Full ({fullSize.toFixed(4)})
              </button>
              <button onClick={() => setSizeMode('partial')}
                className={`flex-1 py-2 rounded text-[11px] font-semibold border transition-colors ${
                  sizeMode === 'partial'
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-drift-border text-txt-3 hover:text-txt-1'
                }`}>
                Partial
              </button>
            </div>
            {sizeMode === 'partial' && (
              <div className="flex items-center h-10 rounded bg-drift-bg border border-drift-border focus-within:border-accent/40 transition-colors">
                <span className="pl-3 text-[11px] font-semibold text-txt-2">SOL</span>
                <input type="number" step="0.0001" min="0" max={fullSize}
                  value={partialSize}
                  onChange={e => setPartialSize(e.target.value)}
                  placeholder={fullSize.toFixed(4)}
                  className="flex-1 px-3 h-full bg-transparent text-right text-txt-0 text-[14px] font-semibold tabular-nums placeholder:text-txt-3/30 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Limit price (only for limit close) */}
          {closeType === 'limit' && (
            <div>
              <label className="text-[11px] text-txt-3 uppercase tracking-wide block mb-2">Limit Price</label>
              <div className="flex items-center h-10 rounded bg-drift-bg border border-drift-border focus-within:border-accent/40 transition-colors">
                <span className="pl-3 text-[11px] font-semibold text-txt-2">USD</span>
                <input type="number" step="0.01" min="0"
                  value={limitPrice}
                  onChange={e => setLimitPrice(e.target.value)}
                  placeholder={oraclePrice.toFixed(2)}
                  className="flex-1 px-3 h-full bg-transparent text-right text-txt-0 text-[14px] font-semibold tabular-nums placeholder:text-txt-3/30 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                {[
                  { l: 'Oracle', v: oraclePrice },
                  ...(isLong
                    ? [{ l: '+0.5%', v: oraclePrice * 1.005 }, { l: '+1%', v: oraclePrice * 1.01 }]
                    : [{ l: '-0.5%', v: oraclePrice * 0.995 }, { l: '-1%', v: oraclePrice * 0.99 }]),
                ].map(p => (
                  <button key={p.l} onClick={() => setLimitPrice(p.v.toFixed(2))}
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-drift-surface/60 text-txt-3 hover:text-txt-1 hover:bg-drift-surface transition-colors">
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded bg-drift-bg border border-drift-border p-3 space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-txt-3">Type</span>
              <span className="text-txt-1 font-medium">{closeType === 'market' ? 'Market' : 'Limit'} Close</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-txt-3">Size</span>
              <span className="text-txt-1 font-medium">{effectiveSize.toFixed(4)} SOL</span>
            </div>
            {closeType === 'limit' && (
              <div className="flex justify-between text-[11px]">
                <span className="text-txt-3">Limit Price</span>
                <span className="text-txt-1 font-medium">${parseFloat(limitPrice || '0').toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px]">
              <span className="text-txt-3">Est. P&L</span>
              <span className={`font-semibold ${position.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                {position.unrealizedPnl >= 0 ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
              </span>
            </div>
          </div>

          {error && (
            <div className="text-[11px] text-bear bg-bear/8 border border-bear/15 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-3 rounded border border-drift-border text-txt-2 text-[12px] font-medium hover:text-txt-0 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 py-3 rounded bg-bear text-white text-[13px] font-semibold disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Closing…' : `${closeType === 'market' ? 'Market' : 'Limit'} Close${sizeMode === 'partial' ? ` ${effectiveSize.toFixed(4)} SOL` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

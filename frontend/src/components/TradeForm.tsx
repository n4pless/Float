import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AlertCircle, Shield, Zap, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { useDriftStore } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';

interface Props {
  trading: {
    executeTrade: (params: any) => Promise<string>;
    createAccount: (amount: number) => Promise<string>;
    deposit: (amount: number) => Promise<string>;
  };
  initialLimitPrice?: number;
  onSwitchToAccount?: () => void;
}

type Side = 'long' | 'short';
type OrdType = 'market' | 'limit';

const PCT = [0, 25, 50, 75, 100];
const SLIP = [0.1, 0.5, 1.0];

export const TradeForm: React.FC<Props> = ({ trading, initialLimitPrice, onSwitchToAccount }) => {
  const { connected } = useWallet();

  // Store subscriptions
  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);
  const accountState = useDriftStore((s) => s.accountState);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);
  const fundingRate = useDriftStore((s) => s.fundingRate);
  const selectedMarket = useDriftStore((s) => s.selectedMarket);

  const [side, setSide] = useState<Side>('long');
  const [ordType, setOrdType] = useState<OrdType>('market');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [leverage, setLeverage] = useState(2);
  const [pct, setPct] = useState(0);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);
  const [showTpSl, setShowTpSl] = useState(false);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [slippage, setSlippage] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Auto-fill limit price when OrderBook price is clicked
  React.useEffect(() => {
    if (initialLimitPrice != null) {
      setOrdType('limit');
      setPrice(initialLimitPrice.toFixed(2));
    }
  }, [initialLimitPrice]);

  const market = DRIFT_CONFIG.markets[selectedMarket as keyof typeof DRIFT_CONFIG.markets];
  const sym = market.symbol.replace('-PERP', '');
  const markPrice = oraclePrice > 0 ? oraclePrice : 178.42;

  const sizeNum = parseFloat(size) || 0;
  const notional = sizeNum * markPrice;
  const marginReq = notional > 0 ? notional / leverage : 0;
  const fee = notional * DRIFT_CONFIG.fees.takerFee;
  const liqPrice = sizeNum > 0
    ? side === 'long' ? markPrice * (1 - 1 / leverage * 0.9) : markPrice * (1 + 1 / leverage * 0.9)
    : 0;
  const collateralUsd = accountState?.freeCollateral ?? 0;
  const maxSize = collateralUsd > 0 ? (collateralUsd * leverage) / markPrice : 0;

  const handlePct = (p: number) => {
    setPct(p);
    if (maxSize > 0 && p > 0) {
      const val = (maxSize * p) / 100;
      setSize(val.toFixed(4));
    } else {
      setSize('');
    }
  };

  const handleSubmit = async () => {
    if (!client || !sizeNum) return;
    setLoading(true);
    setMsg(null);
    try {
      await trading.executeTrade({
        marketIndex: selectedMarket,
        side,
        sizeBase: sizeNum,
        leverage,
        orderType: ordType,
        limitPrice: ordType === 'limit' ? parseFloat(price) : undefined,
      });
      setMsg({ type: 'ok', text: 'Order placed!' });
      setSize('');
      setPct(0);
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Order failed' });
    } finally {
      setLoading(false);
    }
  };

  /* ════════════════════════════════════════════════
   * ONBOARDING: show setup prompt if no Drift account
   * ════════════════════════════════════════════════ */
  if (connected && client && !isUserInitialized) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-accent" />
        </div>
        <h3 className="text-sm font-bold text-txt-0 mb-2">Account Setup Required</h3>
        <p className="text-[11px] text-txt-3 mb-5 leading-relaxed max-w-[200px]">
          Create a Drift trading account with USDC collateral to start trading.
        </p>
        {onSwitchToAccount && (
          <button onClick={onSwitchToAccount}
            className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-accent to-purple text-white transition-all hover:opacity-90 shadow-lg shadow-accent/20">
            Set Up Account
          </button>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════
   * ZERO COLLATERAL: account exists but nothing deposited
   * ════════════════════════════════════════════════ */
  if (connected && client && isUserInitialized && (accountState?.totalCollateral ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-bull/10 flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-bull" />
        </div>
        <h3 className="text-sm font-bold text-txt-0 mb-2">Deposit Collateral</h3>
        <p className="text-[11px] text-txt-3 mb-5 leading-relaxed max-w-[200px]">
          Deposit USDC collateral on the Account tab to start trading.
        </p>
        {onSwitchToAccount && (
          <button onClick={onSwitchToAccount}
            className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-bull to-emerald-500 text-white transition-all hover:opacity-90 shadow-lg shadow-bull/20">
            Deposit USDC
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Side toggle */}
      <div className="flex gap-0 shrink-0">
        <button onClick={() => setSide('long')}
          className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            side === 'long'
              ? 'bg-bull/10 text-bull border-b-2 border-bull'
              : 'text-txt-3 hover:text-txt-1 hover:bg-drift-surface/30 border-b-2 border-transparent'
          }`}>
          <TrendingUp className="w-3.5 h-3.5" />
          Long
        </button>
        <button onClick={() => setSide('short')}
          className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            side === 'short'
              ? 'bg-bear/10 text-bear border-b-2 border-bear'
              : 'text-txt-3 hover:text-txt-1 hover:bg-drift-surface/30 border-b-2 border-transparent'
          }`}>
          <TrendingDown className="w-3.5 h-3.5" />
          Short
        </button>
      </div>

      {/* Order type tabs */}
      <div className="flex items-center gap-0 px-3 pt-3 shrink-0">
        {(['market', 'limit'] as OrdType[]).map(t => (
          <button key={t} onClick={() => setOrdType(t)}
            className={`px-3 py-1.5 text-[11px] font-semibold capitalize relative rounded-lg transition-all ${
              ordType === t
                ? 'text-txt-0 bg-drift-surface'
                : 'text-txt-3 hover:text-txt-2'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3 flex-1">
        {/* Messages */}
        {msg && (
          <div className={`px-3 py-2.5 rounded-lg text-[11px] flex items-center gap-2 ${
            msg.type === 'ok' ? 'bg-bull/10 text-bull border border-bull/20' : 'bg-bear/10 text-bear border border-bear/20'}`}>
            {msg.type === 'ok' ? <Zap className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Leverage slider */}
        <div className="rounded-lg bg-drift-surface/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-txt-3 font-medium">Leverage</span>
            <span className="text-[12px] font-bold text-accent tabular-nums bg-accent/10 px-2 py-0.5 rounded-md">{leverage}x</span>
          </div>
          <input type="range" min={1} max={DRIFT_CONFIG.maxLeverage} step={1}
            value={leverage} onChange={e => setLeverage(+e.target.value)}
            className="w-full" />
          <div className="flex justify-between text-[9px] text-txt-3 mt-0.5">
            <span>1x</span><span>5x</span><span>10x</span>
          </div>
        </div>

        {/* Limit price */}
        {ordType === 'limit' && (
          <div>
            <label className="text-[11px] text-txt-3 font-medium mb-1.5 block">Limit Price</label>
            <div className="flex items-center rounded-lg px-3 h-10 bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-accent/30 transition-all">
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                placeholder={markPrice.toFixed(2)}
                className="flex-1 text-xs bg-transparent text-txt-0" />
              <span className="text-[10px] text-txt-3 ml-1 font-medium">USD</span>
            </div>
          </div>
        )}

        {/* Size */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-txt-3 font-medium">Size</label>
            <span className="text-[10px] text-txt-3">
              Max: <span className="text-txt-1 tabular-nums font-medium">{(maxSize / markPrice).toFixed(4)} {sym}</span>
            </span>
          </div>
          <div className="flex items-center rounded-lg px-3 h-10 bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-accent/30 transition-all">
            <input type="number" value={size}
              onChange={e => { setSize(e.target.value); setPct(0); }}
              placeholder="0.00"
              className="flex-1 text-xs bg-transparent text-txt-0" />
            <span className="text-[10px] text-txt-3 ml-1 font-medium">{sym}</span>
          </div>
        </div>

        {/* Notional display */}
        <div className="flex items-center justify-between text-[11px] px-1">
          <span className="text-txt-3">Notional</span>
          <span className="text-txt-1 tabular-nums font-medium">${notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        {/* Pct buttons */}
        <div className="flex items-center gap-1.5">
          {PCT.map(p => (
            <button key={p} onClick={() => handlePct(p)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                pct === p
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-drift-surface text-txt-3 border border-transparent hover:border-drift-border-lt'}`}>
              {p}%
            </button>
          ))}
        </div>

        {/* Slider track */}
        <div className="relative h-1.5 rounded-full bg-drift-surface overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-purple transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Toggles */}
        <div className="space-y-2.5 py-1">
          <Toggle label="Reduce Only" checked={reduceOnly} onChange={setReduceOnly} />
          {ordType === 'limit' && <Toggle label="Post Only" checked={postOnly} onChange={setPostOnly} />}
          <Toggle label="TP / SL" checked={showTpSl} onChange={setShowTpSl} />
        </div>

        {/* TP/SL */}
        {showTpSl && (
          <div className="space-y-2 rounded-lg p-3 bg-drift-surface/50 border border-drift-border">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-bull">Take Profit</span>
                <span className="text-[10px] text-txt-3">
                  Est. P&L: {tp ? <span className="text-bull">+${((side === 'long' ? parseFloat(tp) - markPrice : markPrice - parseFloat(tp)) * sizeNum).toFixed(2)}</span> : '—'}
                </span>
              </div>
              <input type="number" value={tp} onChange={e => setTp(e.target.value)} placeholder="TP Price"
                className="w-full h-8 px-2.5 rounded-lg text-[11px] bg-drift-bg border border-drift-border text-txt-0 focus:border-accent/30 transition-all" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-bear">Stop Loss</span>
                <span className="text-[10px] text-txt-3">
                  Est. P&L: {sl ? <span className="text-bear">-${((side === 'long' ? markPrice - parseFloat(sl) : parseFloat(sl) - markPrice) * sizeNum).toFixed(2)}</span> : '—'}
                </span>
              </div>
              <input type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="SL Price"
                className="w-full h-8 px-2.5 rounded-lg text-[11px] bg-drift-bg border border-drift-border text-txt-0 focus:border-accent/30 transition-all" />
            </div>
          </div>
        )}

        {/* Submit */}
        {connected ? (
          <button onClick={handleSubmit} disabled={loading || !sizeNum}
            className={`w-full py-3 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white shadow-lg ${
              side === 'long'
                ? 'bg-gradient-to-r from-bull to-emerald-500 hover:opacity-90 shadow-bull/20'
                : 'bg-gradient-to-r from-bear to-rose-500 hover:opacity-90 shadow-bear/20'
            }`}>
            {loading ? 'Submitting…' : `${side === 'long' ? 'Long' : 'Short'} ${market.symbol}`}
          </button>
        ) : (
          <WalletMultiButton className="!w-full !justify-center" />
        )}

        {/* Slippage */}
        <div>
          <span className="text-[11px] text-txt-2 block mb-1.5 font-medium">Slippage Tolerance</span>
          <div className="flex gap-1.5">
            {SLIP.map(s => (
              <button key={s} onClick={() => setSlippage(s)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                  slippage === s
                    ? 'bg-drift-surface text-txt-0 border border-drift-border-lt'
                    : 'bg-drift-surface/30 text-txt-3 border border-transparent'}`}>
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/* Order details */}
        <div className="space-y-2 rounded-lg p-3 bg-drift-surface/30 border border-drift-border">
          <span className="text-[11px] font-semibold text-txt-1 block mb-1">Order Summary</span>
          <Detail label="Mark Price" value={`$${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
          <Detail label="Margin Required" value={`$${marginReq.toFixed(2)}`} />
          <Detail label="Est. Liq. Price" value={liqPrice > 0 ? `$${liqPrice.toFixed(2)}` : '—'} />
          <Detail label="Funding Rate" value={`${(fundingRate * 100).toFixed(4)}%`}
            valueClass={fundingRate >= 0 ? 'text-bull' : 'text-bear'} />
          <Detail label="Fees" value={fee > 0 ? `$${fee.toFixed(4)}` : '—'} />
          <Detail label="Max Position" value={`${maxSize.toFixed(4)} ${sym}`} />
        </div>

        {/* Account health */}
        <div className="rounded-lg p-3 bg-drift-surface/30 border border-drift-border space-y-2">
          <span className="text-[11px] font-semibold text-txt-1">Account</span>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-txt-3">Health</span>
              <span className="text-[11px] font-bold tabular-nums text-bull">
                {(accountState?.health ?? 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-drift-bg overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${accountState?.health ?? 100}%`,
                  background: 'linear-gradient(90deg, #F84960 0%, #FBBF24 50%, #31D0AA 100%)',
                }} />
            </div>
          </div>
          <Detail label="Collateral" value={accountState ? `$${accountState.totalCollateral.toFixed(2)}` : '—'} />
          <Detail label="Free Collateral" value={accountState ? `$${accountState.freeCollateral.toFixed(2)}` : '—'} />
          <Detail label="Leverage" value={accountState ? `${accountState.leverage.toFixed(2)}x` : '0x'} />
          <Detail label="Unrealized P&L" value={accountState ? `$${accountState.unrealizedPnl.toFixed(2)}` : '—'}
            valueClass={accountState && accountState.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'} />
        </div>
      </div>
    </div>
  );
};

/* ── Sub-components ───────────────────────────── */

const StepRow: React.FC<{ num: number; label: string; done: boolean; detail: string }> = ({ num, label, done, detail }) => (
  <div className="flex items-center gap-2">
    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
      done ? 'bg-bull/20 text-bull' : 'bg-drift-input text-txt-3'}`}>
      {done ? '✓' : num}
    </div>
    <div className="flex-1">
      <span className={`text-2xs font-medium ${done ? 'text-txt-1' : 'text-txt-2'}`}>{label}</span>
    </div>
    <span className={`text-[10px] tabular-nums ${done ? 'text-bull' : 'text-txt-3'}`}>{detail}</span>
  </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between">
    <span className="text-[11px] text-txt-2">{label}</span>
    <button onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full relative transition-all ${checked ? 'bg-accent shadow-sm shadow-accent/30' : 'bg-drift-surface'}`}>
      <div className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm ${checked ? 'left-[18px]' : 'left-[3px]'}`} />
    </button>
  </div>
);

const Detail: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="flex justify-between text-[11px]">
    <span className="text-txt-3">{label}</span>
    <span className={`tabular-nums font-medium ${valueClass ?? 'text-txt-1'}`}>{value}</span>
  </div>
);

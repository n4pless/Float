import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AlertCircle, ChevronDown, ShieldCheck, Lock, EyeOff, Sparkles, Info, Cpu, ArrowDown, Zap } from 'lucide-react';
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
type OrdType = 'market' | 'limit' | 'privacy';

const PCT = [25, 50, 75, 100];
const SLIP = [0.1, 0.5, 1.0];
const LEV_PRESETS = [1, 2, 3, 5, 10];

export const TradeForm: React.FC<Props> = ({ trading, initialLimitPrice, onSwitchToAccount }) => {
  const { connected } = useWallet();

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
  const [slippage, setSlippage] = useState(0.5);
  const [showSlippage, setShowSlippage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  /* Privacy trade demo state */
  const [privSide, setPrivSide] = useState<Side>('long');
  const [privSize, setPrivSize] = useState('');
  const [privLev, setPrivLev] = useState(5);
  const [privShield, setPrivShield] = useState(true);
  const [privHideLiq, setPrivHideLiq] = useState(true);
  const [privHideEntry, setPrivHideEntry] = useState(false);

  React.useEffect(() => {
    if (initialLimitPrice != null) {
      setOrdType('limit');
      setPrice(initialLimitPrice.toFixed(2));
    }
  }, [initialLimitPrice]);

  const market = DRIFT_CONFIG.markets[selectedMarket as keyof typeof DRIFT_CONFIG.markets];
  const sym = market.symbol.replace('-PERP', '');
  const markPrice = oraclePrice > 0 ? oraclePrice : 0;

  const sizeNum = parseFloat(size) || 0;
  const notional = sizeNum * markPrice;
  const marginReq = notional > 0 ? notional / leverage : 0;
  const fee = notional * DRIFT_CONFIG.fees.takerFee;
  const liqPrice = sizeNum > 0
    ? side === 'long' ? markPrice * (1 - 1 / leverage * 0.9) : markPrice * (1 + 1 / leverage * 0.9)
    : 0;
  const collateralUsd = accountState?.freeCollateral ?? 0;
  const maxSize = collateralUsd > 0 ? (collateralUsd * leverage) / markPrice : 0;

  const sideColor = side === 'long' ? 'bull' : 'bear';

  const handlePct = (p: number) => {
    setPct(p);
    if (maxSize > 0 && p > 0) {
      setSize(((maxSize * p) / 100).toFixed(4));
    } else {
      setSize('');
    }
  };

  const handleSubmit = async () => {
    if (!client || !sizeNum) return;

    // Pre-trade margin check: notional / leverage must not exceed free collateral
    const requiredMargin = notional / leverage;
    if (collateralUsd > 0 && requiredMargin > collateralUsd * 1.01) {
      setMsg({ type: 'err', text: `Insufficient margin: need $${requiredMargin.toFixed(2)} but only $${collateralUsd.toFixed(2)} available. Reduce size or add collateral.` });
      return;
    }

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
        slippageBps: Math.round(slippage * 100), // convert 0.5% → 50 bps
      });
      const feeStr = fee > 0 ? ` · Fee: $${fee.toFixed(4)}` : '';
      const action = ordType === 'limit' ? 'Limit order placed' : `Market ${side.toUpperCase()} filled`;
      setMsg({ type: 'ok', text: `${action} · $${notional.toFixed(2)} notional${feeStr}` });
      setSize('');
      setPct(0);
    } catch (e: any) {
      const raw = e.message || 'Order failed';
      // Parse common on-chain errors into user-friendly messages
      let text = raw;
      if (raw.includes('Access violation in stack frame')) {
        text = 'Order too large for current margin. Reduce size or add collateral.';
      } else if (raw.includes('Simulation failed') || raw.includes('simulation failed')) {
        text = 'Transaction simulation failed — likely insufficient margin or collateral.';
      } else if (raw.includes('Insufficient collateral') || raw.includes('InsufficientCollateral')) {
        text = 'Insufficient collateral. Deposit more USDC to trade this size.';
      }
      setMsg({ type: 'err', text });
    } finally {
      setLoading(false);
    }
  };

  /* ── Onboarding: No account ── */
  if (connected && client && !isUserInitialized) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="w-8 h-8 text-accent mb-3" />
        <h3 className="text-[13px] font-semibold text-txt-0 mb-1">Account Setup Required</h3>
        <p className="text-[11px] text-txt-3 mb-4 leading-relaxed max-w-[220px]">
          Create a Value trading account with USDC collateral to start trading.
        </p>
        {onSwitchToAccount && (
          <button onClick={onSwitchToAccount}
            className="px-5 py-2 rounded text-[11px] font-semibold bg-accent text-white hover:brightness-110 transition-all">
            Set Up Account
          </button>
        )}
      </div>
    );
  }

  /* ── Zero collateral ── */
  if (connected && client && isUserInitialized && (accountState?.totalCollateral ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="w-8 h-8 text-bull mb-3" />
        <h3 className="text-[13px] font-semibold text-txt-0 mb-1">Deposit Collateral</h3>
        <p className="text-[11px] text-txt-3 mb-4 leading-relaxed max-w-[220px]">
          Deposit USDC collateral to start trading perpetual futures.
        </p>
        {onSwitchToAccount && (
          <button onClick={onSwitchToAccount}
            className="px-5 py-2 rounded text-[11px] font-semibold bg-bull text-white hover:brightness-110 transition-all">
            Deposit USDC
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      {/* ── Buy / Sell tabs (Backpack style) ── */}
      <div className="flex shrink-0">
        {(['long', 'short'] as Side[]).map(s => {
          const active = side === s;
          const isBuy = s === 'long';
          return (
            <button key={s} onClick={() => setSide(s)}
              className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
                active
                  ? isBuy ? 'bg-bull/15 text-bull border-b-2 border-bull' : 'bg-bear/15 text-bear border-b-2 border-bear'
                  : 'text-txt-3 hover:text-txt-2 border-b-2 border-transparent'
              }`}>
              {isBuy ? 'Buy / Long' : 'Sell / Short'}
            </button>
          );
        })}
      </div>

      {/* ── Order type tabs ── */}
      <div className="flex items-center gap-0 shrink-0 border-b border-drift-border">
        {(['market', 'limit'] as OrdType[]).map(t => (
          <button key={t} onClick={() => setOrdType(t)}
            className={`px-4 py-2 text-[11px] font-medium capitalize transition-colors border-b-2 -mb-px ${
              ordType === t
                ? 'text-txt-0 border-txt-0'
                : 'text-txt-3 hover:text-txt-2 border-transparent'
            }`}>
            {t}
          </button>
        ))}
        <button onClick={() => setOrdType('privacy')}
          className={`px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            ordType === 'privacy'
              ? 'text-purple border-purple'
              : 'text-txt-3 hover:text-txt-2 border-transparent'
          }`}>
          <ShieldCheck className="w-3 h-3" />
          Arcium
          <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple/15 text-purple leading-none">NEW</span>
        </button>
      </div>

      {/* ── Privacy Trade Demo Panel ── */}
      {ordType === 'privacy' && (
        <PrivacyTradePanel
          side={privSide} setSide={setPrivSide}
          size={privSize} setSize={setPrivSize}
          leverage={privLev} setLeverage={setPrivLev}
          shieldEnabled={privShield} setShieldEnabled={setPrivShield}
          hideLiq={privHideLiq} setHideLiq={setPrivHideLiq}
          hideEntry={privHideEntry} setHideEntry={setPrivHideEntry}
          markPrice={markPrice} sym={sym}
          connected={connected}
        />
      )}

      {ordType !== 'privacy' && <div className="p-3 space-y-2.5 flex-1">
        {/* Messages */}
        {msg && (
          <div className={`px-2.5 py-2 rounded text-[11px] flex items-start gap-2 leading-relaxed ${
            msg.type === 'ok'
              ? 'bg-bull/8 text-bull'
              : 'bg-bear/8 text-bear'
          }`}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{msg.text}</span>
          </div>
        )}

        {/* ── Leverage ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-txt-3">Leverage</span>
            <span className="text-[11px] font-semibold tabular-nums text-txt-0">
              {leverage}×
            </span>
          </div>
          <div className="flex items-center gap-1">
            {LEV_PRESETS.map(l => (
              <button key={l} onClick={() => setLeverage(l)}
                className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                  leverage === l
                    ? 'bg-drift-active text-txt-0'
                    : 'bg-drift-surface text-txt-3 hover:text-txt-2'
                }`}>
                {l}×
              </button>
            ))}
          </div>
          <input type="range" min={1} max={DRIFT_CONFIG.maxLeverage} step={1}
            value={leverage} onChange={e => setLeverage(+e.target.value)}
            className="w-full accent-current h-1 cursor-pointer"
            style={{ accentColor: side === 'long' ? '#24b47e' : '#f84960' }}
          />
        </div>

        {/* ── Limit price ── */}
        {ordType === 'limit' && (
          <div>
            <label className="text-[11px] text-txt-3 font-medium mb-1.5 block">Price</label>
            <InputField
              value={price}
              onChange={setPrice}
              placeholder={markPrice.toFixed(2)}
              suffix="USD"
            />
          </div>
        )}

        {/* ── Size ── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-txt-3 font-medium">Size</label>
            <button
              onClick={() => handlePct(100)}
              className="text-[10px] text-txt-3 hover:text-accent transition-colors cursor-pointer"
            >
              Max: <span className="text-txt-2 tabular-nums font-medium">{maxSize > 0 ? maxSize.toFixed(4) : '0'} {sym}</span>
            </button>
          </div>
          <InputField
            value={size}
            onChange={(v) => { setSize(v); setPct(0); }}
            placeholder="0.00"
            suffix={sym}
          />
          {/* Notional under input */}
          {sizeNum > 0 && (
            <div className="text-right mt-1 text-[10px] tabular-nums text-txt-3">
              ≈ ${notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* ── % buttons + slider ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            {PCT.map(p => (
              <button key={p} onClick={() => handlePct(p)}
                className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                  pct === p
                    ? 'bg-drift-active text-txt-0'
                    : 'bg-drift-surface text-txt-3 hover:text-txt-2'
                }`}>
                {p}%
              </button>
            ))}
          </div>
          <div className="relative h-1 rounded-full bg-drift-surface overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                side === 'long' ? 'bg-bull/60' : 'bg-bear/60'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* ── Toggles ── */}
        <div className="flex items-center gap-3 py-0.5">
          <MiniToggle label="Reduce Only" checked={reduceOnly} onChange={setReduceOnly} />
          {ordType === 'limit' && <MiniToggle label="Post Only" checked={postOnly} onChange={setPostOnly} />}
          <MiniToggle label="TP/SL" checked={showTpSl} onChange={setShowTpSl} />
        </div>

        {/* ── TP/SL ── */}
        {showTpSl && (
          <div className="space-y-2 rounded p-2.5 bg-drift-surface border border-drift-border">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-bull">Take Profit</span>
                {tp && sizeNum > 0 && (
                  <span className="text-[10px] tabular-nums text-bull">
                    +${((side === 'long' ? parseFloat(tp) - markPrice : markPrice - parseFloat(tp)) * sizeNum).toFixed(2)}
                  </span>
                )}
              </div>
              <InputField value={tp} onChange={setTp} placeholder="TP Price" suffix="USD" compact />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-bear">Stop Loss</span>
                {sl && sizeNum > 0 && (
                  <span className="text-[10px] tabular-nums text-bear">
                    -${((side === 'long' ? markPrice - parseFloat(sl) : parseFloat(sl) - markPrice) * sizeNum).toFixed(2)}
                  </span>
                )}
              </div>
              <InputField value={sl} onChange={setSl} placeholder="SL Price" suffix="USD" compact />
            </div>
          </div>
        )}

        {/* ── Submit ── */}
        {connected ? (
          <button onClick={handleSubmit} disabled={loading || !sizeNum}
            className={`w-full py-2.5 rounded text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-white ${
              side === 'long'
                ? 'bg-bull hover:brightness-110'
                : 'bg-bear hover:brightness-110'
            }`}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting…
              </span>
            ) : (
              `${side === 'long' ? 'Buy / Long' : 'Sell / Short'} ${market.symbol}`
            )}
          </button>
        ) : (
          <WalletMultiButton className="!w-full !justify-center !rounded" />
        )}

        {/* ── Slippage (collapsible) ── */}
        <button
          onClick={() => setShowSlippage(!showSlippage)}
          className="flex items-center justify-between w-full text-[11px] text-txt-3 hover:text-txt-2 transition-colors py-0.5"
        >
          <span className="font-medium">Slippage Tolerance</span>
          <span className="flex items-center gap-1 tabular-nums text-txt-2">
            {slippage}%
            <ChevronDown className={`w-3 h-3 transition-transform ${showSlippage ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {showSlippage && (
          <div className="flex gap-1">
            {SLIP.map(s => (
              <button key={s} onClick={() => setSlippage(s)}
                className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                  slippage === s
                    ? 'bg-drift-active text-accent'
                    : 'bg-drift-surface text-txt-3 hover:text-txt-2'
                }`}>
                {s}%
              </button>
            ))}
          </div>
        )}

        {/* ── Order Summary ── */}
        <div className="rounded bg-drift-surface border border-drift-border overflow-hidden">
          <div className="px-3 py-1.5 border-b border-drift-border">
            <span className="text-[11px] font-medium text-txt-2">Order Summary</span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <SummaryRow label="Mark Price" value={markPrice > 0 ? `$${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'} />
            <SummaryRow label="Margin Req." value={`$${marginReq.toFixed(2)}`} />
            <SummaryRow label="Est. Liq. Price" value={liqPrice > 0 ? `$${liqPrice.toFixed(2)}` : '—'} highlight={liqPrice > 0} />
            <SummaryRow label="Funding Rate" value={`${(fundingRate * 100).toFixed(4)}%`}
              valueClass={fundingRate >= 0 ? 'text-bull' : 'text-bear'} />
            <SummaryRow label="Fees (0.05%)" value={fee > 0 ? `$${fee.toFixed(4)}` : '—'} />
          </div>
        </div>

        {/* ── Account snapshot ── */}
        <div className="rounded bg-drift-surface border border-drift-border overflow-hidden">
          <div className="px-3 py-1.5 border-b border-drift-border">
            <span className="text-[11px] font-medium text-txt-2">Account</span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {/* Health bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-txt-3">Health</span>
                <span className={`text-[11px] font-bold tabular-nums ${
                  (accountState?.health ?? 100) > 50 ? 'text-bull' : (accountState?.health ?? 100) > 20 ? 'text-yellow' : 'text-bear'
                }`}>
                  {(accountState?.health ?? 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-drift-bg overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${accountState?.health ?? 100}%`,
                    background: (accountState?.health ?? 100) > 50
                      ? '#24b47e'
                      : (accountState?.health ?? 100) > 20
                        ? '#efa411'
                        : '#f84960',
                  }}
                />
              </div>
            </div>
            <SummaryRow label="Equity" value={accountState ? `$${accountState.totalCollateral.toFixed(2)}` : '—'} />
            <SummaryRow label="Available" value={accountState ? `$${accountState.freeCollateral.toFixed(2)}` : '—'} />
            <SummaryRow label="Leverage" value={accountState ? `${accountState.leverage.toFixed(2)}×` : '0×'} />
            <SummaryRow
              label="Unrealized P&L"
              value={accountState ? `${accountState.unrealizedPnl >= 0 ? '+' : ''}$${accountState.unrealizedPnl.toFixed(2)}` : '—'}
              valueClass={accountState && accountState.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}
            />
          </div>
        </div>
      </div>}
    </div>
  );
};

/* ── Sub-components ───────────────────────────── */

const InputField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  compact?: boolean;
}> = ({ value, onChange, placeholder, suffix, compact }) => (
  <div className={`flex items-center rounded bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-txt-3/40 transition-colors ${compact ? 'px-2.5 h-7' : 'px-3 h-8'}`}>
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`flex-1 bg-transparent text-txt-0 tabular-nums outline-none w-full ${compact ? 'text-[11px]' : 'text-[11px]'}`}
    />
    {suffix && <span className={`text-txt-3 ml-1.5 font-medium shrink-0 text-[10px]`}>{suffix}</span>}
  </div>
);

const MiniToggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
      checked
        ? 'bg-drift-active text-accent'
        : 'text-txt-3 hover:text-txt-2'
    }`}
  >
    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-txt-3/50'}`} />
    {label}
  </button>
);

const SummaryRow: React.FC<{ label: string; value: string; valueClass?: string; highlight?: boolean }> = ({ label, value, valueClass, highlight }) => (
  <div className="flex justify-between items-center text-[10.5px]">
    <span className="text-txt-3">{label}</span>
    <span className={`tabular-nums font-medium ${valueClass ?? (highlight ? 'text-yellow' : 'text-txt-1')}`}>{value}</span>
  </div>
);

/* ── Privacy Trade Demo Panel ─────────────────── */

const PRIV_LEV = [2, 5, 10, 20, 50];
const PRIV_SIZES = ['0.1', '0.5', '1.0', '5.0'];

const PrivacyTradePanel: React.FC<{
  side: Side; setSide: (s: Side) => void;
  size: string; setSize: (v: string) => void;
  leverage: number; setLeverage: (v: number) => void;
  shieldEnabled: boolean; setShieldEnabled: (v: boolean) => void;
  hideLiq: boolean; setHideLiq: (v: boolean) => void;
  hideEntry: boolean; setHideEntry: (v: boolean) => void;
  markPrice: number; sym: string;
  connected: boolean;
}> = ({
  side, setSide, size, setSize, leverage, setLeverage,
  shieldEnabled, setShieldEnabled, hideLiq, setHideLiq,
  hideEntry, setHideEntry, markPrice, sym, connected,
}) => {
  const sizeNum = parseFloat(size) || 0;
  const notional = sizeNum * markPrice;
  const margin = notional > 0 ? notional / leverage : 0;
  const fee = notional * 0.0008; // 0.08% privacy premium
  const liqPrice = sizeNum > 0
    ? side === 'long' ? markPrice * (1 - 1 / leverage * 0.9) : markPrice * (1 + 1 / leverage * 0.9)
    : 0;

  return (
    <div className="p-3 space-y-2.5 flex-1 overflow-y-auto custom-scrollbar">
      {/* Arcium banner */}
      <div className="relative rounded-lg overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple/10 via-accent/5 to-purple/10" />
        <div className="relative flex items-center gap-2.5 px-3 py-2.5 border border-purple/20 rounded-lg">
          <div className="shrink-0 p-1.5 rounded-lg bg-purple/15">
            <ShieldCheck className="w-3.5 h-3.5 text-purple" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-purple flex items-center gap-1.5">
              Arcium Private Trades
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-yellow/15 text-yellow border border-yellow/20 leading-none">CONCEPT</span>
            </div>
            <p className="text-[10px] text-txt-3 mt-0.5 leading-relaxed">
              Powered by <span className="text-purple font-semibold">Arcium's MPC network</span>. Orders are encrypted and matched in secure enclaves — observers see the settlement, never the intent.
            </p>
          </div>
        </div>
      </div>

      {/* Arcium MPC flow diagram */}
      <div className="rounded-lg bg-drift-surface/30 border border-purple/10 p-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Cpu className="w-3 h-3 text-purple/70" />
          <span className="text-[9px] font-bold text-purple/80 uppercase tracking-wider">Arcium Trade Flow</span>
        </div>
        <div className="space-y-1">
          {[
            { step: 'Encrypted order submitted', icon: Lock },
            { step: 'Arcium MPC nodes decrypt & match', icon: Cpu },
            { step: 'Result sent to Float contract', icon: Zap },
            { step: 'On-chain settlement (hidden intent)', icon: ShieldCheck },
          ].map(({ step, icon: Icon }, i) => (
            <div key={step}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-drift-bg/40">
                <div className="shrink-0 w-4 h-4 rounded-full bg-purple/15 flex items-center justify-center">
                  <Icon className="w-2.5 h-2.5 text-purple" />
                </div>
                <span className="text-[9.5px] text-txt-2">{step}</span>
              </div>
              {i < 3 && <div className="flex justify-center py-0.5"><ArrowDown className="w-2.5 h-2.5 text-purple/30" /></div>}
            </div>
          ))}
        </div>
      </div>

      {/* Long / Short */}
      <div className="flex gap-1.5">
        {(['long', 'short'] as Side[]).map(s => {
          const active = side === s;
          const isBuy = s === 'long';
          return (
            <button key={s} onClick={() => setSide(s)}
              className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                active
                  ? isBuy
                    ? 'bg-bull/15 text-bull border border-bull/30 shadow-sm shadow-bull/10'
                    : 'bg-bear/15 text-bear border border-bear/30 shadow-sm shadow-bear/10'
                  : 'bg-drift-surface/50 text-txt-3 border border-drift-border hover:text-txt-2 hover:border-drift-border-lt'
              }`}>
              <Lock className="w-3 h-3" />
              {isBuy ? 'Private Long' : 'Private Short'}
            </button>
          );
        })}
      </div>

      {/* Arcium privacy shields */}
      <div className="rounded-lg bg-drift-surface/50 border border-drift-border p-2.5 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-3.5 h-3.5 text-purple" />
          <span className="text-[10px] font-bold text-txt-1 uppercase tracking-wider">Arcium Shields</span>
        </div>
        <PrivacyToggle label="MPC Encryption" desc="Order encrypted via Arcium MPC nodes" checked={shieldEnabled} onChange={setShieldEnabled} icon={<Cpu className="w-3 h-3" />} />
        <PrivacyToggle label="Hide Liquidation" desc="Liq. price hidden from observers" checked={hideLiq} onChange={setHideLiq} icon={<EyeOff className="w-3 h-3" />} />
        <PrivacyToggle label="Hide Entry Price" desc="Entry processed in secure enclave" checked={hideEntry} onChange={setHideEntry} icon={<Lock className="w-3 h-3" />} />
      </div>

      {/* Leverage */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-txt-3">Leverage</span>
          <span className="text-[11px] font-semibold tabular-nums text-txt-0">{leverage}×</span>
        </div>
        <div className="flex items-center gap-1">
          {PRIV_LEV.map(l => (
            <button key={l} onClick={() => setLeverage(l)}
              className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                leverage === l
                  ? 'bg-purple/20 text-purple border border-purple/30'
                  : 'bg-drift-surface text-txt-3 hover:text-txt-2 border border-transparent'
              }`}>
              {l}×
            </button>
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <label className="text-[11px] text-txt-3 font-medium mb-1.5 block">Size</label>
        <InputField value={size} onChange={setSize} placeholder="0.00" suffix={sym} />
        {sizeNum > 0 && (
          <div className="text-right mt-1 text-[10px] tabular-nums text-txt-3">
            ≈ ${notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {PRIV_SIZES.map(s => (
          <button key={s} onClick={() => setSize(s)}
            className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
              size === s
                ? 'bg-drift-active text-txt-0'
                : 'bg-drift-surface text-txt-3 hover:text-txt-2'
            }`}>
            {s} {sym}
          </button>
        ))}
      </div>

      {/* Order summary */}
      <div className="rounded-lg bg-drift-surface border border-drift-border overflow-hidden">
        <div className="px-3 py-1.5 border-b border-drift-border flex items-center gap-1.5">
          <Lock className="w-3 h-3 text-purple" />
          <span className="text-[11px] font-medium text-txt-2">Arcium Order Preview</span>
        </div>
        <div className="px-3 py-2 space-y-1.5">
          <SummaryRow label="Direction" value={side === 'long' ? '🟢 Long' : '🔴 Short'} valueClass={side === 'long' ? 'text-bull' : 'text-bear'} />
          <SummaryRow label="Mark Price" value={markPrice > 0 ? `$${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'} />
          <SummaryRow label="Margin Req." value={margin > 0 ? `$${margin.toFixed(2)}` : '—'} />
          <div className="flex justify-between items-center text-[10.5px]">
            <span className="text-txt-3">Est. Liq. Price</span>
            {hideLiq ? (
              <span className="flex items-center gap-1 text-purple text-[10px] font-medium">
                <EyeOff className="w-3 h-3" /> Shielded
              </span>
            ) : (
              <span className="tabular-nums font-medium text-yellow">{liqPrice > 0 ? `$${liqPrice.toFixed(2)}` : '—'}</span>
            )}
          </div>
          <div className="flex justify-between items-center text-[10.5px]">
            <span className="text-txt-3">Entry Price</span>
            {hideEntry ? (
              <span className="flex items-center gap-1 text-purple text-[10px] font-medium">
                <EyeOff className="w-3 h-3" /> Shielded
              </span>
            ) : (
              <span className="tabular-nums font-medium text-txt-1">{markPrice > 0 ? `$${markPrice.toFixed(2)}` : '—'}</span>
            )}
          </div>
          <SummaryRow label="Arcium Fee (0.08%)" value={fee > 0 ? `$${fee.toFixed(4)}` : '—'} />
          <SummaryRow label="MPC Status" value={shieldEnabled ? '🛡️ Encrypted' : 'Disabled'} valueClass={shieldEnabled ? 'text-purple' : 'text-txt-3'} />
          <SummaryRow label="Enclave" value={shieldEnabled ? 'Secure' : 'Standard'} valueClass={shieldEnabled ? 'text-bull' : 'text-txt-3'} />
        </div>
      </div>

      {/* On-chain visibility preview */}
      <div className="rounded-lg bg-drift-bg/60 border border-purple/10 p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 mb-1">
          <EyeOff className="w-3 h-3 text-purple/70" />
          <span className="text-[10px] font-bold text-purple/80 uppercase tracking-wider">On-Chain Visibility</span>
        </div>
        <VisRow label="Order Intent" visible={!shieldEnabled} />
        <VisRow label="Position Size" visible={!shieldEnabled} />
        <VisRow label="Liquidation Price" visible={!hideLiq} />
        <VisRow label="Entry Price" visible={!hideEntry} />
        <VisRow label="Direction (Long/Short)" visible={!shieldEnabled} />
        <VisRow label="Settlement Result" visible={true} />
      </div>

      {/* Submit (disabled — demo only) */}
      {connected ? (
        <div className="space-y-1.5">
          <button disabled
            className="w-full py-2.5 rounded-lg text-[12px] font-semibold bg-gradient-to-r from-purple/40 to-accent/30 text-white/50 cursor-not-allowed flex items-center justify-center gap-2 border border-purple/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Submit to Arcium MPC
          </button>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-txt-3">
            <Info className="w-3 h-3 text-yellow/70" />
            <span>Coming Soon — Arcium integration in development</span>
          </div>
        </div>
      ) : (
        <WalletMultiButton className="!w-full !justify-center !rounded" />
      )}
    </div>
  );
};

const PrivacyToggle: React.FC<{
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode;
}> = ({ label, desc, checked, onChange, icon }) => (
  <button onClick={() => onChange(!checked)}
    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left ${
      checked
        ? 'bg-purple/8 border border-purple/20'
        : 'bg-drift-bg/30 border border-drift-border/50 hover:border-drift-border'
    }`}>
    <div className={`shrink-0 p-1 rounded-md transition-colors ${checked ? 'bg-purple/20 text-purple' : 'bg-drift-surface text-txt-3'}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className={`text-[10px] font-semibold ${checked ? 'text-purple' : 'text-txt-2'}`}>{label}</div>
      <div className="text-[9px] text-txt-3 leading-tight">{desc}</div>
    </div>
    <div className={`w-7 h-4 rounded-full relative transition-colors ${checked ? 'bg-purple' : 'bg-drift-surface'}`}>
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
    </div>
  </button>
);

const VisRow: React.FC<{ label: string; visible: boolean }> = ({ label, visible }) => (
  <div className="flex justify-between items-center text-[10px]">
    <span className="text-txt-3">{label}</span>
    {visible ? (
      <span className="text-bear/70 font-medium">Visible</span>
    ) : (
      <span className="text-purple font-medium flex items-center gap-1">
        <Lock className="w-2.5 h-2.5" /> Hidden
      </span>
    )}
  </div>
);

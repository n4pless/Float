/**
 * PredictionPage — SOL/USD Prediction Market
 *
 * Clean, modern UI with:
 * - Horizontally scrollable round cards
 * - Glassmorphism-inspired card design
 * - Animated live round with progress ring
 * - Clean UP/DOWN betting with amount slider
 * - Simple 1.95x payout model (no prize pools)
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Clock,
  Trophy, Lock, CheckCircle2, XCircle, Loader2, ChevronDown,
  History, Flame, ArrowLeft, Users, Zap, Gift, TrendingUp,
} from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDriftStore } from '../stores/useDriftStore';
import {
  usePredictionStore,
  PAYOUT_MULTIPLIER,
  type PredictionRound,
  type BetDirection,
} from '../stores/usePredictionStore';
import { AssetIcon } from '../components/icons/AssetIcon';
import { toast } from 'sonner';

/* ─── Helpers ────────────────────────────────────── */

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtPrice(n: number, digits = 2): string {
  return n === 0 ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtUSD(n: number): string {
  return n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;
}

function delta(a: number, b: number) {
  const d = a - b;
  return { value: `${d >= 0 ? '+' : ''}$${Math.abs(d).toFixed(4)}`, up: d >= 0 };
}

/* ─── Progress Ring for timer ────────────────────── */
const ProgressRing: React.FC<{ pct: number; size?: number; stroke?: number }> = ({ pct, size = 44, stroke = 3 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
    </svg>
  );
};

/* ═══════════════════════════════════════════════════
   ROUND CARD
   ═══════════════════════════════════════════════════ */

interface CardProps {
  round: PredictionRound;
  price: number;
  wallet: string | null;
  onBet: (id: number, dir: BetDirection, amt: number) => void;
  onClaim: (id: number) => void;
}

const RoundCard: React.FC<CardProps> = ({ round, price, wallet, onBet, onClaim }) => {
  const [betDir, setBetDir] = useState<BetDirection | null>(null);
  const [betAmt, setBetAmt] = useState('');
  const getUserBetForRound = usePredictionStore(s => s.getUserBetForRound);

  const userBet = wallet ? getUserBetForRound(round.id, wallet) : undefined;
  const won = round.status === 'expired' && round.result && userBet?.direction === round.result;
  const lost = round.status === 'expired' && round.result && userBet && userBet.direction !== round.result;
  const claimable = won && userBet && !userBet.claimed;

  const liveDelta = round.status === 'live' && round.lockPrice > 0 ? delta(price, round.lockPrice) : null;
  const expDelta = round.status === 'expired' && round.lockPrice > 0 ? delta(round.closePrice, round.lockPrice) : null;

  const submit = (dir: BetDirection) => {
    const a = parseFloat(betAmt);
    if (isNaN(a) || a <= 0) { toast.error('Enter a valid amount'); return; }
    onBet(round.id, dir, a);
    setBetAmt('');
    setBetDir(null);
  };

  /* ── Card chrome ── */
  const isLive = round.status === 'live';
  const isNext = round.status === 'next';
  const isExpired = round.status === 'expired';
  const isLater = round.status === 'later';

  const border = isLive ? 'border-accent/60 shadow-[0_0_30px_rgba(76,139,245,0.12)]'
    : isNext ? 'border-purple/40'
    : 'border-drift-border/70';

  const headerBg = isLive ? 'bg-accent/10'
    : isNext ? 'bg-purple/8'
    : isExpired && round.result === 'up' ? 'bg-bull/8'
    : isExpired && round.result === 'down' ? 'bg-bear/8'
    : 'bg-drift-surface/40';

  return (
    <div className={`w-[290px] sm:w-[310px] shrink-0 rounded-2xl border ${border} bg-drift-panel/95 backdrop-blur-sm overflow-hidden transition-all duration-300 snap-center`}>

      {/* ── Header ── */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${headerBg}`}>
        <div className="flex items-center gap-2">
          {isLive && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
          {isLive && <Flame className="w-3.5 h-3.5 text-accent" />}
          {isNext && <Zap className="w-3.5 h-3.5 text-purple" />}
          {isExpired && <CheckCircle2 className="w-3.5 h-3.5 text-txt-3" />}
          {isLater && <Clock className="w-3.5 h-3.5 text-txt-3" />}
          <span className={`text-[12px] font-bold tracking-wide ${
            isLive ? 'text-accent' : isNext ? 'text-purple' : 'text-txt-3'
          }`}>
            {isLive ? 'LIVE' : isNext ? 'NEXT' : isExpired ? 'CLOSED' : 'LATER'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(round.totalUp > 0 || round.totalDown > 0) && (
            <div className="flex items-center gap-1 text-[10px] text-txt-3">
              <Users className="w-3 h-3" />
              <span>{round.totalUp + round.totalDown}</span>
            </div>
          )}
          <span className="text-[10px] text-txt-3 font-mono">#{round.id}</span>
        </div>
      </div>

      {/* ── Result banner for expired ── */}
      {isExpired && round.result && round.result !== 'tie' && (
        <div className={`flex items-center justify-center gap-2 py-2 text-[12px] font-bold ${
          round.result === 'up' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'
        }`}>
          {round.result === 'up' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          {round.result === 'up' ? 'UP Won' : 'DOWN Won'}
          {expDelta && <span className="font-mono text-[11px] opacity-80">({expDelta.value})</span>}
        </div>
      )}

      {/* ── Price Section ── */}
      <div className="px-4 py-4 space-y-3">
        {isLive && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3 uppercase tracking-widest">Current Price</span>
              {liveDelta && (
                <span className={`text-[11px] font-mono font-bold ${liveDelta.up ? 'text-bull' : 'text-bear'}`}>
                  {liveDelta.value}
                </span>
              )}
            </div>
            <div className={`text-[26px] font-extrabold font-mono tabular-nums leading-none ${
              liveDelta?.up ? 'text-bull' : liveDelta && !liveDelta.up ? 'text-bear' : 'text-txt-0'
            }`}>
              {fmtPrice(price, 4)}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3">Locked</span>
              <span className="text-txt-1 font-mono">{fmtPrice(round.lockPrice, 4)}</span>
            </div>
          </>
        )}

        {isExpired && (
          <>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3 uppercase tracking-widest">Closed</span>
              <span className={`font-mono font-bold ${
                round.result === 'up' ? 'text-bull' : round.result === 'down' ? 'text-bear' : 'text-txt-1'
              }`}>{fmtPrice(round.closePrice, 4)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3">Locked</span>
              <span className="text-txt-1 font-mono">{fmtPrice(round.lockPrice, 4)}</span>
            </div>
          </>
        )}

        {isNext && (
          <div className="text-center py-1">
            <Lock className="w-5 h-5 text-purple/60 mx-auto mb-2" />
            <p className="text-[12px] text-purple font-medium">Accepting Bets</p>
            <p className="text-[10px] text-txt-3 mt-1">Price locks when this round goes live</p>
          </div>
        )}

        {isLater && (
          <div className="text-center py-3">
            <Clock className="w-5 h-5 text-txt-3/40 mx-auto mb-2" />
            <p className="text-[11px] text-txt-3">Starting soon</p>
          </div>
        )}
      </div>

      {/* ── Payout info ── */}
      {!isLater && (
        <div className="mx-4 mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-drift-surface/60 border border-drift-border/50">
          <Gift className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-[11px] text-txt-1">
            Win <span className="text-accent font-bold">{PAYOUT_MULTIPLIER}x</span> your bet
          </span>
        </div>
      )}

      {/* ── Bet buttons (NEXT round, no existing bet) ── */}
      {isNext && !userBet && !betDir && (
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={() => setBetDir('up')}
            className="flex-1 py-3 rounded-xl bg-bull/10 hover:bg-bull/20 border border-bull/20 hover:border-bull/40 text-bull font-bold text-[13px] transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
            <ArrowUp className="w-4 h-4" /> UP
          </button>
          <button onClick={() => setBetDir('down')}
            className="flex-1 py-3 rounded-xl bg-bear/10 hover:bg-bear/20 border border-bear/20 hover:border-bear/40 text-bear font-bold text-[13px] transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
            <ArrowDown className="w-4 h-4" /> DOWN
          </button>
        </div>
      )}

      {/* ── Bet form ── */}
      {isNext && !userBet && betDir && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                betDir === 'up' ? 'bg-bull/20' : 'bg-bear/20'
              }`}>
                {betDir === 'up'
                  ? <ArrowUp className="w-3.5 h-3.5 text-bull" />
                  : <ArrowDown className="w-3.5 h-3.5 text-bear" />}
              </div>
              <span className={`text-[13px] font-bold ${betDir === 'up' ? 'text-bull' : 'text-bear'}`}>
                {betDir === 'up' ? 'Going UP' : 'Going DOWN'}
              </span>
            </div>
            <button onClick={() => setBetDir(null)} className="text-[11px] text-txt-3 hover:text-txt-1 transition-colors">
              Back
            </button>
          </div>

          {/* Amount input */}
          <div className="relative">
            <input type="number" value={betAmt} onChange={e => setBetAmt(e.target.value)}
              placeholder="Enter amount" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submit(betDir); }}
              className="w-full pl-4 pr-16 py-3 bg-drift-surface border border-drift-border rounded-xl text-[14px] text-txt-0 font-mono outline-none focus:border-accent/50 transition-colors placeholder:text-txt-3/50"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-txt-3 font-semibold">USDC</span>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-1.5">
            {[1, 5, 10, 25, 50, 100].map(a => (
              <button key={a} onClick={() => setBetAmt(a.toString())}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                  betAmt === a.toString()
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-drift-surface text-txt-2 hover:text-txt-0 border border-transparent'
                }`}>
                ${a}
              </button>
            ))}
          </div>

          {/* Potential win preview */}
          {betAmt && parseFloat(betAmt) > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-bull/5 border border-bull/10">
              <span className="text-[10px] text-txt-3">Potential win</span>
              <span className="text-[13px] font-bold text-bull font-mono">
                +{fmtUSD(parseFloat(betAmt) * (PAYOUT_MULTIPLIER - 1))}
              </span>
            </div>
          )}

          <button onClick={() => submit(betDir)}
            disabled={!betAmt || parseFloat(betAmt) <= 0}
            className={`w-full py-3 rounded-xl font-bold text-[14px] transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white active:scale-[0.98] ${
              betDir === 'up'
                ? 'bg-gradient-to-r from-bull to-bull/80 hover:shadow-[0_4px_20px_rgba(0,210,106,0.3)]'
                : 'bg-gradient-to-r from-bear to-bear/80 hover:shadow-[0_4px_20px_rgba(255,77,106,0.3)]'
            }`}>
            {!wallet ? 'Connect Wallet' : `Bet ${betDir.toUpperCase()}`}
          </button>
        </div>
      )}

      {/* ── Active bet indicator ── */}
      {isNext && userBet && (
        <div className="px-4 pb-4">
          <div className={`flex items-center justify-between p-3 rounded-xl border ${
            userBet.direction === 'up' ? 'bg-bull/5 border-bull/20' : 'bg-bear/5 border-bear/20'
          }`}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span className="text-[12px] font-semibold text-txt-0">
                {userBet.direction === 'up' ? 'UP' : 'DOWN'} — {fmtUSD(userBet.amount)}
              </span>
            </div>
            <span className="text-[10px] text-accent font-mono">Locked</span>
          </div>
        </div>
      )}

      {/* ── Live round bet indicator ── */}
      {isLive && userBet && (
        <div className="px-4 pb-4">
          <div className={`flex items-center justify-between p-3 rounded-xl border ${
            userBet.direction === 'up' ? 'bg-bull/5 border-bull/20' : 'bg-bear/5 border-bear/20'
          }`}>
            <div className="flex items-center gap-2">
              {userBet.direction === 'up'
                ? <ArrowUp className="w-4 h-4 text-bull" />
                : <ArrowDown className="w-4 h-4 text-bear" />}
              <span className="text-[12px] font-semibold text-txt-0">
                Your bet: {fmtUSD(userBet.amount)}
              </span>
            </div>
            <span className={`text-[10px] font-bold ${
              liveDelta ? (userBet.direction === 'up' ? (liveDelta.up ? 'text-bull' : 'text-bear') : (liveDelta.up ? 'text-bear' : 'text-bull')) : 'text-txt-3'
            }`}>
              {liveDelta ? (
                (userBet.direction === 'up' ? liveDelta.up : !liveDelta.up) ? 'Winning' : 'Losing'
              ) : '...'}
            </span>
          </div>
        </div>
      )}

      {/* ── Claim / Result ── */}
      {isExpired && claimable && (
        <div className="px-4 pb-4">
          <button onClick={() => onClaim(round.id)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-bull to-bull/70 hover:shadow-[0_4px_20px_rgba(0,210,106,0.3)] text-white font-bold text-[14px] transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
            <Trophy className="w-4 h-4" />
            Claim {fmtUSD(userBet!.payout)}
          </button>
        </div>
      )}

      {isExpired && lost && !userBet?.claimed && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-bear/5 border border-bear/10 text-[12px] text-bear">
            <XCircle className="w-3.5 h-3.5" /> Lost {fmtUSD(userBet!.amount)}
          </div>
        </div>
      )}

      {isExpired && userBet?.claimed && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-bull/5 border border-bull/10 text-[12px] text-bull">
            <CheckCircle2 className="w-3.5 h-3.5" /> Claimed {fmtUSD(userBet.payout)}
          </div>
        </div>
      )}
    </div>
  );
};


/* ═══════════════════════════════════════════════════
   PREDICTION PAGE
   ═══════════════════════════════════════════════════ */

interface Props { onBack?: () => void; }

export const PredictionPage: React.FC<Props> = ({ onBack }) => {
  const { publicKey } = useWallet();
  const walletStr = publicKey?.toBase58() ?? null;
  const oraclePrice = useDriftStore(s => s.oraclePrice);
  const {
    rounds, timeRemainingMs, initializeRounds, advanceRound,
    placeBet, claimWinnings, setTimeRemaining, setUserWallet,
  } = usePredictionStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [livePrice, setLivePrice] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  // Binance WebSocket for smooth live price
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/solusdt@trade');
      ws.onmessage = e => {
        try { setLivePrice(parseFloat(JSON.parse(e.data).p)); } catch {}
      };
    } catch {}
    return () => { ws?.close(); };
  }, []);

  const price = livePrice > 0 ? livePrice : oraclePrice;

  useEffect(() => { setUserWallet(walletStr); }, [walletStr]);

  useEffect(() => {
    if (price > 0 && !initialized.current) {
      initializeRounds(price);
      initialized.current = true;
    }
  }, [price]);

  // Tick
  useEffect(() => {
    if (rounds.length === 0) return;
    const live = rounds.find(r => r.status === 'live');
    if (!live) return;
    const iv = setInterval(() => {
      const rem = live.closeTimestamp - Date.now();
      setTimeRemaining(rem);
      if (rem <= 0 && price > 0) advanceRound(price);
    }, 1000);
    return () => clearInterval(iv);
  }, [rounds, price]);

  // Auto-scroll to live on mount
  useEffect(() => {
    if (rounds.length > 0 && scrollRef.current) {
      const idx = rounds.findIndex(r => r.status === 'live');
      if (idx >= 0) {
        const cw = 326;
        const w = scrollRef.current.offsetWidth;
        scrollRef.current.scrollTo({ left: Math.max(0, idx * cw - w / 2 + cw / 2), behavior: 'smooth' });
      }
    }
  }, [rounds.length > 0]);

  const scroll = (d: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: d === 'left' ? -330 : 330, behavior: 'smooth' });
  };

  const handleBet = useCallback((id: number, dir: BetDirection, amt: number) => {
    if (!walletStr) { toast.error('Connect wallet first'); return; }
    if (placeBet(dir, amt, walletStr)) {
      toast.success(`Bet ${dir.toUpperCase()} — ${fmtUSD(amt)}`);
    } else {
      toast.error('Already entered this round');
    }
  }, [walletStr, placeBet]);

  const handleClaim = useCallback((id: number) => {
    if (!walletStr) return;
    const p = claimWinnings(id, walletStr);
    if (p > 0) toast.success(`Claimed ${fmtUSD(p)}!`);
  }, [walletStr, claimWinnings]);

  // User stats
  const userBets = usePredictionStore(s => s.userBets);
  const myBets = userBets.filter(b => b.wallet === walletStr);
  const totalBet = myBets.reduce((s, b) => s + b.amount, 0);
  const totalWon = myBets.filter(b => b.payout > b.amount).reduce((s, b) => s + b.payout, 0);
  const wins = myBets.filter(b => b.payout > b.amount).length;
  const losses = myBets.filter(b => b.payout === 0 && rounds.find(r => r.id === b.roundId)?.status === 'expired').length;
  const net = totalWon - totalBet;

  const liveRound = rounds.find(r => r.status === 'live');
  const pct = liveRound ? Math.max(0, (liveRound.closeTimestamp - Date.now()) / (5 * 60 * 1000)) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-hidden">

      {/* ═══ TOP BAR ═══ */}
      <div className="shrink-0 border-b border-drift-border bg-drift-panel/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-drift-surface text-txt-3 hover:text-txt-0 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/80 to-purple/80 flex items-center justify-center shadow-lg shadow-accent/10">
                <TrendingUp className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[15px] font-bold text-txt-0">SOL Prediction</h1>
                  <span className="text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Beta</span>
                </div>
                <p className="text-[10px] text-txt-3 mt-0.5">Predict price direction — win 1.95x</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* SOL Price pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-drift-surface/80 border border-drift-border/60">
              <AssetIcon asset="SOL" size={18} />
              <span className="text-[14px] font-bold text-txt-0 font-mono tabular-nums">
                {price > 0 ? `$${price.toFixed(2)}` : '—'}
              </span>
            </div>

            {/* Timer ring */}
            {liveRound && (
              <div className="relative flex items-center justify-center text-accent">
                <ProgressRing pct={pct} size={44} stroke={2.5} />
                <span className="absolute text-[12px] font-bold font-mono tabular-nums text-accent">
                  {fmt(timeRemainingMs)}
                </span>
              </div>
            )}

            {/* History */}
            <button onClick={() => setShowHistory(!showHistory)}
              className={`p-2.5 rounded-xl transition-all ${
                showHistory ? 'bg-accent/15 text-accent' : 'bg-drift-surface/60 text-txt-2 hover:text-txt-0 hover:bg-drift-surface'
              }`}>
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ HOW IT WORKS ═══ */}
      <div className="shrink-0 border-b border-drift-border/50">
        <button onClick={() => setShowHowTo(!showHowTo)}
          className="w-full flex items-center justify-between px-5 py-2 text-[11px] text-txt-2 hover:text-txt-0 transition-colors">
          <span className="font-medium">How does it work?</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHowTo ? 'rotate-180' : ''}`} />
        </button>
        {showHowTo && (
          <div className="px-5 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
            <HowStep icon={<Zap className="w-4 h-4 text-accent" />} title="Pick a direction"
              desc="Predict if SOL will go UP or DOWN before the 5-minute round ends." />
            <HowStep icon={<Gift className="w-4 h-4 text-purple" />} title="Bet any amount"
              desc="Enter the USDC amount you want to bet. Your position locks once placed." />
            <HowStep icon={<Trophy className="w-4 h-4 text-bull" />} title="Win 1.95x"
              desc="Correct prediction? Get 1.95x your bet back. Wrong? You lose your bet." />
          </div>
        )}
      </div>

      {/* ═══ CARDS CAROUSEL ═══ */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Left / Right arrows */}
        <button onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-xl bg-drift-panel/90 backdrop-blur-sm border border-drift-border/60 flex items-center justify-center text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all shadow-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-xl bg-drift-panel/90 backdrop-blur-sm border border-drift-border/60 flex items-center justify-center text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all shadow-lg">
          <ChevronRight className="w-5 h-5" />
        </button>

        <div ref={scrollRef}
          className="flex-1 flex items-center gap-4 px-14 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}>
          {rounds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 text-accent/40 mx-auto animate-spin" />
                <p className="text-[13px] text-txt-3">Connecting to oracle...</p>
              </div>
            </div>
          ) : (
            rounds.map(r => (
              <RoundCard key={r.id} round={r} price={price} wallet={walletStr}
                onBet={handleBet} onClaim={handleClaim} />
            ))
          )}
        </div>
      </div>

      {/* ═══ BOTTOM BAR ═══ */}
      <div className="shrink-0 border-t border-drift-border bg-drift-panel/80 backdrop-blur-sm">
        {showHistory ? (
          <HistoryTable rounds={rounds} wallet={walletStr} />
        ) : (
          <div className="flex items-center justify-between px-5 sm:px-6 py-3">
            <div className="flex items-center gap-6 sm:gap-8">
              <Stat label="Rounds" value={`${new Set(myBets.map(b => b.roundId)).size}`} />
              <Stat label="W / L" value={`${wins} / ${losses}`}
                color={wins > losses ? 'text-bull' : losses > wins ? 'text-bear' : undefined} />
              <Stat label="Total Bet" value={totalBet > 0 ? fmtUSD(totalBet) : '—'} />
              <Stat label="P&L" value={net >= 0 ? `+${fmtUSD(net)}` : `-${fmtUSD(Math.abs(net))}`}
                color={net >= 0 ? 'text-bull' : 'text-bear'} />
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-txt-3">
              <span>{PAYOUT_MULTIPLIER}x payout</span>
              <span className="w-px h-3 bg-drift-border" />
              <span>5 min rounds</span>
              <span className="w-px h-3 bg-drift-border" />
              <span>SOL/USD Oracle</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────── */

const HowStep: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="flex gap-3 p-3 rounded-xl bg-drift-surface/40 border border-drift-border/30">
    <div className="shrink-0 mt-0.5">{icon}</div>
    <div>
      <div className="text-txt-0 font-semibold">{title}</div>
      <div className="text-txt-3 mt-0.5 leading-relaxed">{desc}</div>
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div>
    <div className="text-[9px] text-txt-3 uppercase tracking-widest">{label}</div>
    <div className={`text-[14px] font-bold font-mono tabular-nums ${color ?? 'text-txt-0'}`}>{value}</div>
  </div>
);

const HistoryTable: React.FC<{ rounds: PredictionRound[]; wallet: string | null }> = ({ rounds, wallet }) => {
  const userBets = usePredictionStore(s => s.userBets);
  const bets = wallet ? userBets.filter(b => b.wallet === wallet).slice(-20).reverse() : [];

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {bets.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-6 h-6 text-txt-3/30 mx-auto mb-2" />
          <p className="text-[12px] text-txt-3">No predictions yet</p>
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-drift-panel">
            <tr className="text-txt-3 border-b border-drift-border">
              <th className="text-left px-5 py-2 font-medium">Round</th>
              <th className="text-left px-2 py-2 font-medium">Direction</th>
              <th className="text-right px-2 py-2 font-medium">Bet</th>
              <th className="text-center px-2 py-2 font-medium">Result</th>
              <th className="text-right px-5 py-2 font-medium">Payout</th>
            </tr>
          </thead>
          <tbody>
            {bets.map(b => {
              const r = rounds.find(rr => rr.id === b.roundId);
              const pending = !r?.result;
              const won = b.payout > b.amount;
              return (
                <tr key={b.id} className="border-b border-drift-border/30 hover:bg-drift-surface/20 transition-colors">
                  <td className="px-5 py-2.5 font-mono text-txt-1">#{b.roundId}</td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex items-center gap-1 ${b.direction === 'up' ? 'text-bull' : 'text-bear'}`}>
                      {b.direction === 'up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {b.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-txt-0">{fmtUSD(b.amount)}</td>
                  <td className="px-2 py-2.5 text-center">
                    {pending ? <span className="text-yellow">Live</span>
                      : won ? <span className="text-bull">Won</span>
                      : b.payout === b.amount ? <span className="text-yellow">Tie</span>
                      : <span className="text-bear">Lost</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono">
                    {pending ? '—'
                      : won ? <span className="text-bull">+{fmtUSD(b.payout - b.amount)}</span>
                      : b.payout === b.amount ? <span className="text-yellow">Refund</span>
                      : <span className="text-bear">-{fmtUSD(b.amount)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default PredictionPage;

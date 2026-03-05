/**
 * PredictionPage — PancakeSwap-style on-chain SOL/USD prediction market.
 *
 * Horizontal scrolling card chain. Each card has:
 *   - UP (green) top section with payout multiplier
 *   - Round info in the middle (status, prices, pool)
 *   - DOWN (pink) bottom section with payout multiplier
 *
 * Data is fetched directly from the on-chain Prediction program via RPC.
 * Bets and claims are sent as Solana transactions through the user's wallet.
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Clock,
  Trophy, Lock, CheckCircle2, XCircle, Loader2,
  History, Flame, ArrowLeft, Zap, TrendingUp, Award, Timer,
} from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { usePredictionStore, type DisplayRound, type DisplayBet, type RoundStatus } from '../stores/usePredictionStore';
import { PRICE_PRECISION } from '../prediction/client';
import { toast } from 'sonner';

/* ─── Helpers ────────────────────────────────────── */

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtPrice(n: number, digits = 2): string {
  return n === 0 ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtSol(n: number): string {
  if (n === 0) return '0';
  if (n < 0.001) return '<0.001';
  return n.toFixed(n < 1 ? 4 : 3);
}

function priceDelta(current: number, locked: number) {
  const d = current - locked;
  return { value: `${d >= 0 ? '+' : ''}$${Math.abs(d).toFixed(4)}`, up: d >= 0 };
}

/* ─── Progress Ring ──────────────────────────────── */

const ProgressRing: React.FC<{ pct: number; size?: number; stroke?: number; color?: string }> = ({
  pct, size = 52, stroke = 3, color = '#4C8BF5',
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
    </svg>
  );
};

/* ═══════════════════════════════════════════════════
   ROUND CARD — PancakeSwap Style
   ═══════════════════════════════════════════════════ */

interface CardProps {
  round: DisplayRound;
  bet?: DisplayBet;
  livePrice: number;
  intervalSec: number;
  onBet: (epoch: number, dir: 'bull' | 'bear', sol: number) => void;
  onClaim: (epoch: number) => void;
  walletConnected: boolean;
}

const RoundCard: React.FC<CardProps> = ({ round, bet, livePrice, intervalSec, onBet, onClaim, walletConnected }) => {
  const [betDir, setBetDir] = useState<'bull' | 'bear' | null>(null);
  const [betAmt, setBetAmt] = useState('');
  const [placing, setPlacing] = useState(false);

  const { status, epoch } = round;
  const isLive = status === 'live';
  const isNext = status === 'next';
  const isExpired = status === 'expired';
  const isLater = status === 'later';

  // Live delta
  const liveDelta = isLive && round.lockPrice > 0 ? priceDelta(livePrice, round.lockPrice) : null;
  const expDelta = isExpired && round.lockPrice > 0 && round.closePrice > 0 ? priceDelta(round.closePrice, round.lockPrice) : null;

  // Payout multipliers
  const bullPayout = round.result === 'bull' && round.payoutMultiplier ? round.payoutMultiplier.toFixed(2) : null;
  const bearPayout = round.result === 'bear' && round.payoutMultiplier ? round.payoutMultiplier.toFixed(2) : null;

  // UP/DOWN pool percentages
  const total = round.bullAmount + round.bearAmount;
  const bullPct = total > 0 ? Math.round((round.bullAmount / total) * 100) : 50;
  const bearPct = 100 - bullPct;

  // User bet status
  const userWon = isExpired && bet && round.result && (
    (round.result === 'bull' && bet.position === 'bull') ||
    (round.result === 'bear' && bet.position === 'bear') ||
    round.result === 'tie'
  );
  const userLost = isExpired && bet && !userWon;
  const claimable = userWon && bet && !bet.claimed && bet.payout > 0;

  const submit = async (dir: 'bull' | 'bear') => {
    const a = parseFloat(betAmt);
    if (isNaN(a) || a <= 0) { toast.error('Enter a valid SOL amount'); return; }
    if (!walletConnected) { toast.error('Connect wallet first'); return; }
    setPlacing(true);
    try {
      onBet(epoch, dir, a);
    } finally {
      setPlacing(false);
      setBetAmt('');
      setBetDir(null);
    }
  };

  /* ── Card border & header color ── */
  const borderClass = isLive ? 'border-accent/60 shadow-[0_0_24px_rgba(76,139,245,0.15)]'
    : isNext ? 'border-purple/40'
    : isExpired && round.result === 'bull' ? 'border-bull/30'
    : isExpired && round.result === 'bear' ? 'border-bear/30'
    : 'border-drift-border/50';

  return (
    <div className={`w-[300px] sm:w-[320px] shrink-0 rounded-2xl border ${borderClass} bg-drift-panel overflow-hidden transition-all snap-center flex flex-col`}>

      {/* ═══ UP (BULL) Section ═══ */}
      <div className={`relative px-4 py-2.5 ${
        isExpired && round.result === 'bull' ? 'bg-bull/12' : 'bg-bull/5'
      } border-b border-drift-border/30`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isExpired && round.result === 'bull' ? 'bg-bull' : 'bg-bull/20'
            }`}>
              <ArrowUp className={`w-3.5 h-3.5 ${isExpired && round.result === 'bull' ? 'text-white' : 'text-bull'}`} />
            </div>
            <span className="text-[13px] font-bold text-bull">UP</span>
            {bullPayout && (
              <span className="text-[12px] font-bold text-bull bg-bull/10 px-2 py-0.5 rounded-full">
                {bullPayout}x Payout
              </span>
            )}
          </div>
          {total > 0 && (
            <span className="text-[11px] text-txt-3 font-mono">{bullPct}%</span>
          )}
        </div>
        {/* Show user bet indicator on UP */}
        {bet?.position === 'bull' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 rounded-full bg-bull flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* ═══ Middle Section (Round Info) ═══ */}
      <div className="px-4 py-3 flex-1 min-h-[120px] flex flex-col justify-center">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isLive && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
            {isLive && <Flame className="w-3.5 h-3.5 text-accent" />}
            {isNext && <Zap className="w-3.5 h-3.5 text-purple" />}
            {isExpired && <CheckCircle2 className="w-3.5 h-3.5 text-txt-3" />}
            {isLater && <Clock className="w-3.5 h-3.5 text-txt-3" />}
            <span className={`text-[11px] font-bold tracking-wider ${
              isLive ? 'text-accent' : isNext ? 'text-purple' : 'text-txt-3'
            }`}>
              {isLive ? 'LIVE' : isNext ? 'NEXT' : isExpired ? 'EXPIRED' : 'LATER'}
            </span>
          </div>
          <span className="text-[10px] text-txt-3 font-mono">#{epoch}</span>
        </div>

        {/* LIVE: current price & locked price */}
        {isLive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3 uppercase tracking-wider">Last Price</span>
              {liveDelta && (
                <span className={`text-[11px] font-mono font-bold ${liveDelta.up ? 'text-bull' : 'text-bear'}`}>
                  {liveDelta.value}
                </span>
              )}
            </div>
            <div className={`text-[24px] font-extrabold font-mono tabular-nums leading-none ${
              liveDelta?.up ? 'text-bull' : liveDelta && !liveDelta.up ? 'text-bear' : 'text-txt-0'
            }`}>
              {fmtPrice(livePrice, 4)}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3">Locked Price</span>
              <span className="text-txt-1 font-mono">{fmtPrice(round.lockPrice, 4)}</span>
            </div>
            {/* Prize Pool */}
            <div className="flex items-center justify-between pt-1 border-t border-drift-border/30">
              <span className="text-[10px] text-txt-3">Prize Pool</span>
              <span className="text-[12px] font-bold text-txt-0 font-mono">{fmtSol(round.totalAmount)} SOL</span>
            </div>
          </div>
        )}

        {/* EXPIRED: closed/locked prices */}
        {isExpired && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3">Closed Price</span>
              <span className={`font-mono font-bold ${
                round.result === 'bull' ? 'text-bull' : round.result === 'bear' ? 'text-bear' : 'text-txt-1'
              }`}>{fmtPrice(round.closePrice, 4)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3">Locked Price</span>
              <span className="text-txt-2 font-mono">{fmtPrice(round.lockPrice, 4)}</span>
            </div>
            {expDelta && (
              <div className={`text-center text-[12px] font-bold mt-1 ${expDelta.up ? 'text-bull' : 'text-bear'}`}>
                {expDelta.value}
              </div>
            )}
            <div className="flex items-center justify-between pt-1.5 border-t border-drift-border/30">
              <span className="text-[10px] text-txt-3">Prize Pool</span>
              <span className="text-[11px] font-bold text-txt-0 font-mono">{fmtSol(round.totalAmount)} SOL</span>
            </div>
          </div>
        )}

        {/* NEXT: accepting bets */}
        {isNext && !betDir && !bet && (
          <div className="text-center space-y-3 py-2">
            <Lock className="w-6 h-6 text-purple/50 mx-auto" />
            <p className="text-[12px] text-purple font-semibold">Entry</p>
            <div className="flex gap-2">
              <button onClick={() => setBetDir('bull')}
                className="flex-1 py-2.5 rounded-xl bg-bull/10 hover:bg-bull/20 border border-bull/20 hover:border-bull/40 text-bull font-bold text-[13px] transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]">
                <ArrowUp className="w-4 h-4" /> Enter UP
              </button>
              <button onClick={() => setBetDir('bear')}
                className="flex-1 py-2.5 rounded-xl bg-bear/10 hover:bg-bear/20 border border-bear/20 hover:border-bear/40 text-bear font-bold text-[13px] transition-all flex items-center justify-center gap-1.5 active:scale-[0.97]">
                <ArrowDown className="w-4 h-4" /> Enter DOWN
              </button>
            </div>
            {round.totalAmount > 0 && (
              <div className="text-[10px] text-txt-3">
                Prize Pool: <span className="text-txt-1 font-mono font-bold">{fmtSol(round.totalAmount)} SOL</span>
              </div>
            )}
          </div>
        )}

        {/* NEXT: bet form */}
        {isNext && betDir && !bet && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  betDir === 'bull' ? 'bg-bull/20' : 'bg-bear/20'
                }`}>
                  {betDir === 'bull'
                    ? <ArrowUp className="w-3 h-3 text-bull" />
                    : <ArrowDown className="w-3 h-3 text-bear" />}
                </div>
                <span className={`text-[12px] font-bold ${betDir === 'bull' ? 'text-bull' : 'text-bear'}`}>
                  {betDir === 'bull' ? 'UP' : 'DOWN'}
                </span>
              </div>
              <button onClick={() => setBetDir(null)} className="text-[10px] text-txt-3 hover:text-txt-1">✕</button>
            </div>

            <div className="relative">
              <input type="number" value={betAmt} onChange={e => setBetAmt(e.target.value)}
                placeholder="0.0" autoFocus step="0.01" min="0.001"
                onKeyDown={e => { if (e.key === 'Enter') submit(betDir); }}
                className="w-full pl-3 pr-12 py-2.5 bg-drift-surface border border-drift-border rounded-xl text-[14px] text-txt-0 font-mono outline-none focus:border-accent/50 placeholder:text-txt-3/40" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-txt-3 font-bold">SOL</span>
            </div>

            <div className="flex gap-1">
              {[0.01, 0.05, 0.1, 0.25, 0.5, 1].map(a => (
                <button key={a} onClick={() => setBetAmt(a.toString())}
                  className={`flex-1 py-1 rounded-lg text-[9px] font-semibold transition-colors ${
                    betAmt === a.toString()
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-drift-surface text-txt-2 hover:text-txt-0'
                  }`}>
                  {a}
                </button>
              ))}
            </div>

            <button onClick={() => submit(betDir)} disabled={placing || !betAmt || parseFloat(betAmt) <= 0}
              className={`w-full py-2.5 rounded-xl font-bold text-[13px] text-white transition-all disabled:opacity-30 active:scale-[0.97] ${
                betDir === 'bull'
                  ? 'bg-gradient-to-r from-bull to-bull/70 hover:shadow-lg hover:shadow-bull/20'
                  : 'bg-gradient-to-r from-bear to-bear/70 hover:shadow-lg hover:shadow-bear/20'
              }`}>
              {placing ? 'Placing...' : !walletConnected ? 'Connect Wallet' : `Bet ${betDir.toUpperCase()}`}
            </button>
          </div>
        )}

        {/* NEXT: already bet */}
        {isNext && bet && (
          <div className="text-center space-y-2 py-2">
            <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${
              bet.position === 'bull' ? 'bg-bull/5 border-bull/20' : 'bg-bear/5 border-bear/20'
            }`}>
              {bet.position === 'bull'
                ? <ArrowUp className="w-4 h-4 text-bull" />
                : <ArrowDown className="w-4 h-4 text-bear" />}
              <span className="text-[12px] font-bold text-txt-0">
                {bet.position.toUpperCase()} — {fmtSol(bet.amount)} SOL
              </span>
            </div>
            <p className="text-[10px] text-accent">Entered ✓</p>
          </div>
        )}

        {/* LIVE: user bet status */}
        {isLive && bet && (
          <div className={`mt-2 flex items-center justify-between p-2.5 rounded-xl border ${
            bet.position === 'bull' ? 'bg-bull/5 border-bull/20' : 'bg-bear/5 border-bear/20'
          }`}>
            <div className="flex items-center gap-2">
              {bet.position === 'bull'
                ? <ArrowUp className="w-3.5 h-3.5 text-bull" />
                : <ArrowDown className="w-3.5 h-3.5 text-bear" />}
              <span className="text-[11px] font-semibold text-txt-0">{fmtSol(bet.amount)} SOL</span>
            </div>
            <span className={`text-[10px] font-bold ${
              liveDelta ? (bet.position === 'bull' ? (liveDelta.up ? 'text-bull' : 'text-bear') : (liveDelta.up ? 'text-bear' : 'text-bull')) : 'text-txt-3'
            }`}>
              {liveDelta ? ((bet.position === 'bull' ? liveDelta.up : !liveDelta.up) ? '● Winning' : '● Losing') : '...'}
            </span>
          </div>
        )}

        {/* EXPIRED: claim / result */}
        {isExpired && claimable && (
          <div className="mt-2">
            <button onClick={() => onClaim(epoch)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-bull via-accent to-bull text-white font-bold text-[13px] flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-bull/20 active:scale-[0.97] transition-all">
              <Trophy className="w-4 h-4" />
              Collect {fmtSol(bet!.payout)} SOL
            </button>
          </div>
        )}
        {isExpired && userLost && !bet?.claimed && (
          <div className="mt-2 flex items-center justify-center gap-1.5 p-2 rounded-xl bg-bear/5 border border-bear/10">
            <XCircle className="w-3 h-3 text-bear" />
            <span className="text-[11px] text-bear">Lost {fmtSol(bet!.amount)} SOL</span>
          </div>
        )}
        {isExpired && bet?.claimed && (
          <div className="mt-2 flex items-center justify-center gap-1.5 p-2 rounded-xl bg-bull/5 border border-bull/10">
            <CheckCircle2 className="w-3 h-3 text-bull" />
            <span className="text-[11px] text-bull">Collected</span>
          </div>
        )}

        {/* LATER */}
        {isLater && (
          <div className="text-center py-6">
            <Clock className="w-5 h-5 text-txt-3/30 mx-auto mb-1.5" />
            <p className="text-[11px] text-txt-3">Later</p>
          </div>
        )}
      </div>

      {/* ═══ DOWN (BEAR) Section ═══ */}
      <div className={`relative px-4 py-2.5 ${
        isExpired && round.result === 'bear' ? 'bg-bear/12' : 'bg-bear/5'
      } border-t border-drift-border/30`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isExpired && round.result === 'bear' ? 'bg-bear' : 'bg-bear/20'
            }`}>
              <ArrowDown className={`w-3.5 h-3.5 ${isExpired && round.result === 'bear' ? 'text-white' : 'text-bear'}`} />
            </div>
            <span className="text-[13px] font-bold text-bear">DOWN</span>
            {bearPayout && (
              <span className="text-[12px] font-bold text-bear bg-bear/10 px-2 py-0.5 rounded-full">
                {bearPayout}x Payout
              </span>
            )}
          </div>
          {total > 0 && (
            <span className="text-[11px] text-txt-3 font-mono">{bearPct}%</span>
          )}
        </div>
        {bet?.position === 'bear' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 rounded-full bg-bear flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   PREDICTION PAGE
   ═══════════════════════════════════════════════════ */

interface Props { onBack?: () => void; }

export const PredictionPage: React.FC<Props> = ({ onBack }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const walletStr = publicKey?.toBase58() ?? null;

  const {
    game, rounds, userBets, livePrice, timeRemainingMs, loading, error,
    setConnection, refresh, placeBet, claimWinnings,
    setLivePrice, setTimeRemainingMs,
  } = usePredictionStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Set connection once
  useEffect(() => {
    if (connection) setConnection(connection);
  }, [connection]);

  // Binance WS for live price
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

  // Poll on-chain data every 5s
  useEffect(() => {
    if (!connection) return;
    refresh(publicKey ?? undefined);
    const iv = setInterval(() => refresh(publicKey ?? undefined), 5000);
    return () => clearInterval(iv);
  }, [connection, publicKey]);

  // Timer tick
  useEffect(() => {
    const live = rounds.find(r => r.status === 'live');
    if (!live) return;
    const iv = setInterval(() => {
      const rem = live.closeTimestamp * 1000 - Date.now();
      setTimeRemainingMs(rem);
    }, 1000);
    return () => clearInterval(iv);
  }, [rounds]);

  // Auto-scroll to live card on load
  useEffect(() => {
    if (rounds.length > 0 && scrollRef.current) {
      const idx = rounds.findIndex(r => r.status === 'live');
      if (idx >= 0) {
        const cw = 340;
        const w = scrollRef.current.offsetWidth;
        scrollRef.current.scrollTo({
          left: Math.max(0, idx * cw - w / 2 + cw / 2),
          behavior: 'smooth',
        });
      }
    }
  }, [rounds.length > 0]);

  const scroll = (d: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: d === 'left' ? -340 : 340, behavior: 'smooth' });
  };

  const handleBet = useCallback(async (epoch: number, dir: 'bull' | 'bear', sol: number) => {
    if (!publicKey) { toast.error('Connect wallet'); return; }
    try {
      toast.loading('Placing bet...', { id: 'bet' });
      await placeBet(publicKey, epoch, dir, sol, sendTransaction);
      toast.success(`Bet ${dir.toUpperCase()} — ${sol} SOL`, { id: 'bet' });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.slice(0, 80) || 'Bet failed', { id: 'bet' });
    }
  }, [publicKey, placeBet, sendTransaction]);

  const handleClaim = useCallback(async (epoch: number) => {
    if (!publicKey) return;
    try {
      toast.loading('Claiming...', { id: 'claim' });
      await claimWinnings(publicKey, epoch, sendTransaction);
      toast.success('Claimed!', { id: 'claim' });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.slice(0, 80) || 'Claim failed', { id: 'claim' });
    }
  }, [publicKey, claimWinnings, sendTransaction]);

  // Stats
  const myBets = useMemo(() => Array.from(userBets.values()), [userBets]);
  const totalBetSol = myBets.reduce((s, b) => s + b.amount, 0);
  const totalWon = myBets.filter(b => b.payout > b.amount).reduce((s, b) => s + b.payout, 0);
  const wins = myBets.filter(b => b.payout > b.amount).length;
  const losses = myBets.filter(b => b.payout === 0).length;
  const net = totalWon - totalBetSol;

  const liveRound = rounds.find(r => r.status === 'live');
  const intervalMs = (game?.intervalSeconds ?? 300) * 1000;
  const pct = liveRound ? Math.max(0, (liveRound.closeTimestamp * 1000 - Date.now()) / intervalMs) : 0;

  // Not initialized yet
  const notReady = !game || !game.genesisStart;

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
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-purple flex items-center justify-center shadow-lg shadow-accent/10">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[15px] font-bold text-txt-0">SOL Prediction</h1>
                  <span className="text-[8px] bg-bull/15 text-bull px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">On-chain</span>
                </div>
                <p className="text-[10px] text-txt-3 mt-0.5">Predict SOL price — win from the pool</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* SOL Price */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-drift-surface/60 border border-drift-border/40">
              <span className="text-[10px] text-txt-3 font-medium">SOL</span>
              <span className="text-[14px] font-bold text-txt-0 font-mono tabular-nums">
                {livePrice > 0 ? `$${livePrice.toFixed(2)}` : '—'}
              </span>
            </div>

            {/* Timer ring */}
            {liveRound && timeRemainingMs > 0 && (
              <div className="relative flex items-center justify-center">
                <ProgressRing pct={pct} />
                <span className="absolute text-[11px] font-bold font-mono tabular-nums text-accent">
                  {fmt(timeRemainingMs)}
                </span>
              </div>
            )}

            {/* History toggle */}
            <button onClick={() => setShowHistory(!showHistory)}
              className={`p-2.5 rounded-xl transition-all ${
                showHistory ? 'bg-accent/15 text-accent' : 'bg-drift-surface/60 text-txt-2 hover:text-txt-0'
              }`}>
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ CARDS CAROUSEL ═══ */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Arrows */}
        <button onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-drift-panel/90 backdrop-blur-sm border border-drift-border/50 flex items-center justify-center text-txt-2 hover:text-txt-0 transition-all shadow-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-drift-panel/90 backdrop-blur-sm border border-drift-border/50 flex items-center justify-center text-txt-2 hover:text-txt-0 transition-all shadow-lg">
          <ChevronRight className="w-5 h-5" />
        </button>

        <div ref={scrollRef}
          className="flex-1 flex items-center gap-5 px-14 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}>

          {notReady ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 text-accent/40 mx-auto animate-spin" />
                <p className="text-[13px] text-txt-3">
                  {error || 'Waiting for prediction game to initialize...'}
                </p>
              </div>
            </div>
          ) : rounds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 text-accent/40 mx-auto animate-spin" />
                <p className="text-[13px] text-txt-3">Loading rounds...</p>
              </div>
            </div>
          ) : (
            rounds.map(r => (
              <RoundCard
                key={r.epoch}
                round={r}
                bet={userBets.get(r.epoch)}
                livePrice={livePrice}
                intervalSec={game?.intervalSeconds ?? 300}
                onBet={handleBet}
                onClaim={handleClaim}
                walletConnected={!!publicKey}
              />
            ))
          )}
        </div>
      </div>

      {/* ═══ BOTTOM BAR ═══ */}
      <div className="shrink-0 border-t border-drift-border bg-drift-panel/80 backdrop-blur-sm">
        {showHistory ? (
          <HistoryPanel rounds={rounds} bets={myBets} onClaim={handleClaim} />
        ) : (
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-6 sm:gap-8">
              <Stat label="Rounds" value={String(myBets.length)} />
              <Stat label="W / L" value={`${wins} / ${losses}`}
                color={wins > losses ? 'text-bull' : losses > wins ? 'text-bear' : undefined} />
              <Stat label="Total Bet" value={totalBetSol > 0 ? `${fmtSol(totalBetSol)} SOL` : '—'} />
              <Stat label="P&L" value={`${net >= 0 ? '+' : ''}${fmtSol(Math.abs(net))} SOL`}
                color={net >= 0 ? 'text-bull' : 'text-bear'} />
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-txt-3">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-bull" /> On-chain
              </span>
              <span className="w-px h-3 bg-drift-border" />
              <span>{game?.intervalSeconds ?? 300}s rounds</span>
              <span className="w-px h-3 bg-drift-border" />
              <span>{((game?.treasuryFee ?? 300) / 100).toFixed(1)}% fee</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────── */

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div>
    <div className="text-[9px] text-txt-3 uppercase tracking-widest">{label}</div>
    <div className={`text-[14px] font-bold font-mono tabular-nums ${color ?? 'text-txt-0'}`}>{value}</div>
  </div>
);

const HistoryPanel: React.FC<{
  rounds: DisplayRound[];
  bets: DisplayBet[];
  onClaim: (epoch: number) => void;
}> = ({ rounds, bets, onClaim }) => {
  const sorted = [...bets].sort((a, b) => b.epoch - a.epoch);

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {sorted.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-6 h-6 text-txt-3/30 mx-auto mb-2" />
          <p className="text-[12px] text-txt-3">No predictions yet</p>
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-drift-panel">
            <tr className="text-txt-3 border-b border-drift-border">
              <th className="text-left px-5 py-2 font-medium">Round</th>
              <th className="text-left px-2 py-2 font-medium">Position</th>
              <th className="text-right px-2 py-2 font-medium">Bet</th>
              <th className="text-center px-2 py-2 font-medium">Result</th>
              <th className="text-right px-5 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(b => {
              const r = rounds.find(rr => rr.epoch === b.epoch);
              const pending = !r?.oracleCalled;
              const won = b.payout > b.amount;
              const tie = b.payout === b.amount && b.payout > 0;
              return (
                <tr key={b.epoch} className="border-b border-drift-border/30 hover:bg-drift-surface/20">
                  <td className="px-5 py-2.5 font-mono text-txt-1">#{b.epoch}</td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex items-center gap-1 ${
                      b.position === 'bull' ? 'text-bull' : 'text-bear'
                    }`}>
                      {b.position === 'bull' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {b.position.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-txt-0">{fmtSol(b.amount)}</td>
                  <td className="px-2 py-2.5 text-center">
                    {pending ? <span className="text-yellow">Live</span>
                      : won ? <span className="text-bull">Won</span>
                      : tie ? <span className="text-yellow">Tie</span>
                      : <span className="text-bear">Lost</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {(won || tie) && !b.claimed ? (
                      <button onClick={() => onClaim(b.epoch)}
                        className="text-[10px] font-bold text-bull bg-bull/10 hover:bg-bull/20 px-2 py-1 rounded-lg transition-colors">
                        {tie ? 'Refund' : 'Collect'}
                      </button>
                    ) : b.claimed ? (
                      <span className="text-[10px] text-bull">Collected</span>
                    ) : pending ? (
                      <span className="text-[10px] text-txt-3">—</span>
                    ) : (
                      <span className="text-[10px] text-bear">-{fmtSol(b.amount)}</span>
                    )}
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

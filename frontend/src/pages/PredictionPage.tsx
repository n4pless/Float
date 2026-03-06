/**
 * PredictionPage — Premium on-chain SOL/USD prediction market.
 *
 * Immersive full-screen experience with:
 *   - Glassmorphism top bar with back navigation, live price, countdown
 *   - PancakeSwap-style horizontal card carousel
 *   - Polished card design with glow effects and smooth transitions
 *   - Stats dashboard in bottom bar
 *   - Slide-up history panel
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Clock,
  Trophy, Lock, CheckCircle2, XCircle, Loader2,
  History, Flame, ArrowLeft, Zap, TrendingUp, Award, Timer,
  Home, Wallet, CircleDollarSign, BarChart3,
} from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { usePredictionStore, type DisplayRound, type DisplayBet, type RoundStatus } from '../stores/usePredictionStore';
import { PRICE_PRECISION } from '../prediction/client';
import { toast } from 'sonner';

/* ─── Solana Logo ─────────────────────────────────── */
const SolanaLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 397.7 311.7" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sol-grad" x1="360.879" y1="-37.455" x2="141.213" y2="383.294" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
    </defs>
    <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="url(#sol-grad)" />
    <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#sol-grad)" />
    <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#sol-grad)" />
  </svg>
);

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

/* ─── Animated Progress Ring ─────────────────────── */

const ProgressRing: React.FC<{ pct: number; size?: number; stroke?: number }> = ({
  pct, size = 56, stroke = 3,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, pct)));
  const color = pct > 0.5 ? '#4C8BF5' : pct > 0.2 ? '#f59e0b' : '#FF4D6A';
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        style={{ filter: `drop-shadow(0 0 6px ${color}40)` }} />
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

  const liveDelta = isLive && round.lockPrice > 0 ? priceDelta(livePrice, round.lockPrice) : null;
  const expDelta = isExpired && round.lockPrice > 0 && round.closePrice > 0 ? priceDelta(round.closePrice, round.lockPrice) : null;

  const bullPayout = round.result === 'bull' && round.payoutMultiplier ? round.payoutMultiplier.toFixed(2) : null;
  const bearPayout = round.result === 'bear' && round.payoutMultiplier ? round.payoutMultiplier.toFixed(2) : null;

  const total = round.bullAmount + round.bearAmount;
  const bullPct = total > 0 ? Math.round((round.bullAmount / total) * 100) : 50;
  const bearPct = 100 - bullPct;

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

  /* Card glow / border styling based on status */
  const cardGlow = isLive
    ? 'shadow-[0_0_30px_rgba(76,139,245,0.12)] border-accent/50'
    : isNext
    ? 'shadow-[0_0_20px_rgba(155,125,255,0.08)] border-purple/40'
    : isExpired && round.result === 'bull'
    ? 'border-bull/25'
    : isExpired && round.result === 'bear'
    ? 'border-bear/25'
    : 'border-white/[0.06]';

  /* Status pill */
  const statusConfigs: Record<string, { bg: string; text: string; label: string; Icon: React.FC<{ className?: string }>; dot: boolean }> = {
    live: { bg: 'bg-accent/15', text: 'text-accent', label: 'LIVE', Icon: Flame, dot: true },
    next: { bg: 'bg-purple/15', text: 'text-purple', label: 'NEXT', Icon: Zap, dot: false },
    expired: { bg: 'bg-white/5', text: 'text-txt-3', label: 'CLOSED', Icon: CheckCircle2, dot: false },
    calculating: { bg: 'bg-amber-400/10', text: 'text-amber-400', label: 'CALCULATING', Icon: Loader2, dot: false },
    later: { bg: 'bg-white/5', text: 'text-txt-3', label: 'LATER', Icon: Clock, dot: false },
  };
  const statusConfig = statusConfigs[status] ?? statusConfigs.later;

  return (
    <div className={`w-[310px] sm:w-[330px] shrink-0 rounded-2xl border ${cardGlow} bg-gradient-to-b from-[#181820] to-[#12121a] overflow-hidden transition-all duration-300 snap-center flex flex-col hover:scale-[1.01] hover:shadow-xl`}>

      {/* ═══ UP (BULL) Section ═══ */}
      <div className={`relative px-4 py-3 ${
        isExpired && round.result === 'bull'
          ? 'bg-gradient-to-r from-bull/15 to-bull/5'
          : 'bg-gradient-to-r from-bull/8 to-transparent'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isExpired && round.result === 'bull' ? 'bg-bull shadow-lg shadow-bull/30' : 'bg-bull/15'
            }`}>
              <ArrowUp className={`w-4 h-4 ${isExpired && round.result === 'bull' ? 'text-white' : 'text-bull'}`} />
            </div>
            <span className="text-[13px] font-bold text-bull tracking-wide">UP</span>
            {bullPayout && (
              <span className="text-[11px] font-bold text-bull bg-bull/10 px-2.5 py-0.5 rounded-full border border-bull/20">
                {bullPayout}x
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <span className="text-[11px] text-txt-3/70 font-mono">{bullPct}%</span>
            )}
            {bet?.position === 'bull' && (
              <div className="w-5 h-5 rounded-full bg-bull flex items-center justify-center shadow-lg shadow-bull/40">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        </div>
        {/* Pool split bar */}
        {total > 0 && (
          <div className="mt-2 h-1 rounded-full bg-white/[0.04] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-bull/60 to-bull/30 transition-all duration-500"
              style={{ width: `${bullPct}%` }} />
          </div>
        )}
      </div>

      {/* ═══ Middle Section (Round Info) ═══ */}
      <div className="px-4 py-3.5 flex-1 min-h-[130px] flex flex-col justify-center border-y border-white/[0.04]">
        {/* Status header */}
        <div className="flex items-center justify-between mb-3">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${statusConfig.bg}`}>
            {statusConfig.dot && <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
            <statusConfig.Icon className={`w-3 h-3 ${statusConfig.text}`} />
            <span className={`text-[10px] font-bold tracking-widest ${statusConfig.text}`}>
              {statusConfig.label}
            </span>
          </div>
          <span className="text-[10px] text-txt-3/50 font-mono bg-white/[0.03] px-2 py-0.5 rounded">#{epoch}</span>
        </div>

        {/* LIVE: current price & locked price */}
        {isLive && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3/70 uppercase tracking-wider font-medium">Last Price</span>
              {liveDelta && (
                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                  liveDelta.up ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10'
                }`}>
                  {liveDelta.value}
                </span>
              )}
            </div>
            <div className={`text-[26px] font-extrabold font-mono tabular-nums leading-none tracking-tight ${
              liveDelta?.up ? 'text-bull' : liveDelta && !liveDelta.up ? 'text-bear' : 'text-txt-0'
            }`}>
              {fmtPrice(livePrice, 4)}
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1">
              <span className="text-txt-3/60">Locked Price</span>
              <span className="text-txt-2/80 font-mono">{fmtPrice(round.lockPrice, 4)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span className="text-[10px] text-txt-3/60 flex items-center gap-1">
                <CircleDollarSign className="w-3 h-3" /> Prize Pool
              </span>
              <span className="text-[13px] font-bold text-txt-0 font-mono">{fmtSol(round.totalAmount)} SOL</span>
            </div>
          </div>
        )}

        {/* EXPIRED: closed/locked prices */}
        {isExpired && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3/60">Closed Price</span>
              <span className={`font-mono font-bold text-[13px] ${
                round.result === 'bull' ? 'text-bull' : round.result === 'bear' ? 'text-bear' : 'text-txt-1'
              }`}>{fmtPrice(round.closePrice, 4)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-txt-3/60">Locked Price</span>
              <span className="text-txt-2/70 font-mono">{fmtPrice(round.lockPrice, 4)}</span>
            </div>
            {expDelta && (
              <div className={`text-center text-[13px] font-bold mt-1 py-1.5 rounded-lg ${
                expDelta.up ? 'text-bull bg-bull/8' : 'text-bear bg-bear/8'
              }`}>
                {expDelta.value}
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <span className="text-[10px] text-txt-3/60 flex items-center gap-1">
                <CircleDollarSign className="w-3 h-3" /> Prize Pool
              </span>
              <span className="text-[12px] font-bold text-txt-0 font-mono">{fmtSol(round.totalAmount)} SOL</span>
            </div>
          </div>
        )}

        {/* NEXT: accepting bets — direction chooser */}
        {isNext && !betDir && !bet && (
          <div className="text-center space-y-3 py-1">
            <div className="w-10 h-10 rounded-xl bg-purple/10 border border-purple/20 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5 text-purple/60" />
            </div>
            <p className="text-[12px] text-purple font-semibold">Place your prediction</p>
            <div className="flex gap-2.5">
              <button onClick={() => setBetDir('bull')}
                className="flex-1 py-3 rounded-xl bg-bull/8 hover:bg-bull/15 border border-bull/15 hover:border-bull/40 text-bull font-bold text-[13px] transition-all flex items-center justify-center gap-2 active:scale-[0.97] group">
                <ArrowUp className="w-4 h-4 group-hover:translate-y-[-1px] transition-transform" /> UP
              </button>
              <button onClick={() => setBetDir('bear')}
                className="flex-1 py-3 rounded-xl bg-bear/8 hover:bg-bear/15 border border-bear/15 hover:border-bear/40 text-bear font-bold text-[13px] transition-all flex items-center justify-center gap-2 active:scale-[0.97] group">
                <ArrowDown className="w-4 h-4 group-hover:translate-y-[1px] transition-transform" /> DOWN
              </button>
            </div>
            {round.totalAmount > 0 && (
              <div className="text-[10px] text-txt-3/60">
                Prize Pool: <span className="text-txt-1 font-mono font-bold">{fmtSol(round.totalAmount)} SOL</span>
              </div>
            )}
          </div>
        )}

        {/* NEXT: bet amount form */}
        {isNext && betDir && !bet && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  betDir === 'bull' ? 'bg-bull/15' : 'bg-bear/15'
                }`}>
                  {betDir === 'bull'
                    ? <ArrowUp className="w-3.5 h-3.5 text-bull" />
                    : <ArrowDown className="w-3.5 h-3.5 text-bear" />}
                </div>
                <span className={`text-[12px] font-bold ${betDir === 'bull' ? 'text-bull' : 'text-bear'}`}>
                  {betDir === 'bull' ? 'Predict UP' : 'Predict DOWN'}
                </span>
              </div>
              <button onClick={() => setBetDir(null)}
                className="w-6 h-6 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-txt-3 hover:text-txt-1 transition-colors text-[11px]">
                ✕
              </button>
            </div>

            <div className="relative">
              <input type="number" value={betAmt} onChange={e => setBetAmt(e.target.value)}
                placeholder="0.0" autoFocus step="0.01" min="0.001"
                onKeyDown={e => { if (e.key === 'Enter') submit(betDir); }}
                className="w-full pl-3 pr-14 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-[15px] text-txt-0 font-mono outline-none focus:border-accent/40 focus:bg-white/[0.05] placeholder:text-txt-3/30 transition-all" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-txt-3/60 font-bold bg-white/[0.04] px-2 py-0.5 rounded">SOL</span>
            </div>

            <div className="flex gap-1.5">
              {[0.01, 0.05, 0.1, 0.25, 0.5, 1].map(a => (
                <button key={a} onClick={() => setBetAmt(a.toString())}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-semibold transition-all ${
                    betAmt === a.toString()
                      ? 'bg-accent/15 text-accent border border-accent/25 shadow-sm shadow-accent/10'
                      : 'bg-white/[0.03] text-txt-3/60 hover:text-txt-1 hover:bg-white/[0.06] border border-transparent'
                  }`}>
                  {a}
                </button>
              ))}
            </div>

            <button onClick={() => submit(betDir)} disabled={placing || !betAmt || parseFloat(betAmt) <= 0}
              className={`w-full py-3 rounded-xl font-bold text-[13px] text-white transition-all disabled:opacity-25 active:scale-[0.97] ${
                betDir === 'bull'
                  ? 'bg-gradient-to-r from-bull to-green-500/80 hover:shadow-lg hover:shadow-bull/25'
                  : 'bg-gradient-to-r from-bear to-rose-500/80 hover:shadow-lg hover:shadow-bear/25'
              }`}>
              {placing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Placing...
                </span>
              ) : !walletConnected ? 'Connect Wallet' : `Predict ${betDir.toUpperCase()}`}
            </button>
          </div>
        )}

        {/* NEXT: already bet */}
        {isNext && bet && (
          <div className="text-center space-y-2.5 py-2">
            <div className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
              bet.position === 'bull' ? 'bg-bull/5 border-bull/15' : 'bg-bear/5 border-bear/15'
            }`}>
              {bet.position === 'bull'
                ? <ArrowUp className="w-4 h-4 text-bull" />
                : <ArrowDown className="w-4 h-4 text-bear" />}
              <span className="text-[13px] font-bold text-txt-0">
                {bet.position.toUpperCase()} — {fmtSol(bet.amount)} SOL
              </span>
            </div>
            <p className="text-[10px] text-accent font-medium flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Prediction placed
            </p>
          </div>
        )}

        {/* LIVE: user bet indicator */}
        {isLive && bet && (
          <div className={`mt-2.5 flex items-center justify-between p-3 rounded-xl border backdrop-blur-sm ${
            bet.position === 'bull' ? 'bg-bull/5 border-bull/15' : 'bg-bear/5 border-bear/15'
          }`}>
            <div className="flex items-center gap-2">
              {bet.position === 'bull'
                ? <ArrowUp className="w-3.5 h-3.5 text-bull" />
                : <ArrowDown className="w-3.5 h-3.5 text-bear" />}
              <span className="text-[12px] font-semibold text-txt-0">{fmtSol(bet.amount)} SOL</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              liveDelta
                ? (bet.position === 'bull' ? (liveDelta.up ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10') : (liveDelta.up ? 'text-bear bg-bear/10' : 'text-bull bg-bull/10'))
                : 'text-txt-3'
            }`}>
              {liveDelta ? ((bet.position === 'bull' ? liveDelta.up : !liveDelta.up) ? 'Winning' : 'Losing') : '...'}
            </span>
          </div>
        )}

        {/* EXPIRED: claim / result */}
        {isExpired && claimable && (
          <div className="mt-2.5">
            <button onClick={() => onClaim(epoch)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-bull via-emerald-500 to-bull text-white font-bold text-[13px] flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-bull/25 active:scale-[0.97] transition-all">
              <Trophy className="w-4 h-4" />
              Collect {fmtSol(bet!.payout)} SOL
            </button>
          </div>
        )}
        {isExpired && userLost && !bet?.claimed && (
          <div className="mt-2.5 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-bear/5 border border-bear/10">
            <XCircle className="w-3.5 h-3.5 text-bear/60" />
            <span className="text-[11px] text-bear/80">Lost {fmtSol(bet!.amount)} SOL</span>
          </div>
        )}
        {isExpired && bet?.claimed && (
          <div className="mt-2.5 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-bull/5 border border-bull/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-bull/70" />
            <span className="text-[11px] text-bull/80">Collected</span>
          </div>
        )}

        {/* LATER */}
        {isLater && (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mx-auto mb-2">
              <Clock className="w-5 h-5 text-txt-3/30" />
            </div>
            <p className="text-[11px] text-txt-3/40">Upcoming</p>
          </div>
        )}
      </div>

      {/* ═══ DOWN (BEAR) Section ═══ */}
      <div className={`relative px-4 py-3 ${
        isExpired && round.result === 'bear'
          ? 'bg-gradient-to-r from-bear/15 to-bear/5'
          : 'bg-gradient-to-r from-bear/8 to-transparent'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isExpired && round.result === 'bear' ? 'bg-bear shadow-lg shadow-bear/30' : 'bg-bear/15'
            }`}>
              <ArrowDown className={`w-4 h-4 ${isExpired && round.result === 'bear' ? 'text-white' : 'text-bear'}`} />
            </div>
            <span className="text-[13px] font-bold text-bear tracking-wide">DOWN</span>
            {bearPayout && (
              <span className="text-[11px] font-bold text-bear bg-bear/10 px-2.5 py-0.5 rounded-full border border-bear/20">
                {bearPayout}x
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <span className="text-[11px] text-txt-3/70 font-mono">{bearPct}%</span>
            )}
            {bet?.position === 'bear' && (
              <div className="w-5 h-5 rounded-full bg-bear flex items-center justify-center shadow-lg shadow-bear/40">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        </div>
        {/* Pool split bar */}
        {total > 0 && (
          <div className="mt-2 h-1 rounded-full bg-white/[0.04] overflow-hidden flex justify-end">
            <div className="h-full rounded-full bg-gradient-to-l from-bear/60 to-bear/30 transition-all duration-500"
              style={{ width: `${bearPct}%` }} />
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
  const lastCenteredEpoch = useRef<number | null>(null);

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

  // Center the live card whenever the live epoch changes or on first load
  const scrollToLive = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!scrollRef.current || rounds.length === 0) return;
    const idx = rounds.findIndex(r => r.status === 'live');
    if (idx < 0) return;
    const gap = 20; // gap-5 = 1.25rem = 20px
    const cardW = window.innerWidth >= 640 ? 330 : 310; // sm:w-[330px] / w-[310px]
    const containerW = scrollRef.current.offsetWidth;
    const scrollLeft = idx * (cardW + gap) - (containerW / 2) + (cardW / 2);
    scrollRef.current.scrollTo({ left: Math.max(0, scrollLeft), behavior });
  }, [rounds]);

  // Auto-center on live card whenever the live epoch changes
  useEffect(() => {
    const liveEpoch = rounds.find(r => r.status === 'live')?.epoch ?? null;
    if (liveEpoch !== null && liveEpoch !== lastCenteredEpoch.current) {
      lastCenteredEpoch.current = liveEpoch;
      // Small delay to let DOM render new cards
      requestAnimationFrame(() => scrollToLive('smooth'));
    }
  }, [rounds, scrollToLive]);

  // Also center on first load
  useEffect(() => {
    if (rounds.length > 0) {
      requestAnimationFrame(() => scrollToLive('auto'));
    }
  }, [rounds.length > 0]);

  const scroll = (d: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: d === 'left' ? -350 : 350, behavior: 'smooth' });
  };

  const handleBet = useCallback(async (epoch: number, dir: 'bull' | 'bear', sol: number) => {
    if (!publicKey) { toast.error('Connect wallet'); return; }
    try {
      toast.loading('Placing prediction...', { id: 'bet' });
      await placeBet(publicKey, epoch, dir, sol, sendTransaction);
      toast.success(`${dir.toUpperCase()} — ${sol} SOL`, { id: 'bet' });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.slice(0, 80) || 'Prediction failed', { id: 'bet' });
    }
  }, [publicKey, placeBet, sendTransaction]);

  const handleClaim = useCallback(async (epoch: number) => {
    if (!publicKey) return;
    try {
      toast.loading('Claiming winnings...', { id: 'claim' });
      await claimWinnings(publicKey, epoch, sendTransaction);
      toast.success('Winnings collected!', { id: 'claim' });
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
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-hidden relative">

      {/* ═══ Background gradient accents ═══ */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-accent/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[250px] bg-purple/[0.03] rounded-full blur-[100px]" />
      </div>

      {/* ═══ TOP BAR ═══ */}
      <div className="shrink-0 relative z-10 border-b border-white/[0.06] bg-drift-panel/60 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5">
          {/* Left: Back + Branding */}
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-txt-2 hover:text-txt-0 transition-all group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-[12px] font-medium hidden sm:inline">Home</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 border border-white/[0.08] flex items-center justify-center shadow-lg shadow-[#9945FF]/15">
                <SolanaLogo className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-txt-0 flex items-center gap-2">
                  SOL Prediction
                  <span className="text-[8px] bg-bull/10 text-bull px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-bull/15">Live</span>
                </h1>
                <p className="text-[10px] text-txt-3/60 mt-0.5">Predict SOL price — win from the pool</p>
              </div>
            </div>
          </div>

          {/* Right: SOL Price + Timer + History + Wallet */}
          <div className="flex items-center gap-2.5">
            {/* SOL Price Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <SolanaLogo className="w-5 h-5" />
              <span className="text-[15px] font-bold text-txt-0 font-mono tabular-nums">
                {livePrice > 0 ? `$${livePrice.toFixed(2)}` : '—'}
              </span>
            </div>

            {/* Timer ring */}
            {liveRound && timeRemainingMs > 0 && (
              <div className="relative flex items-center justify-center">
                <ProgressRing pct={pct} />
                <span className="absolute text-[11px] font-bold font-mono tabular-nums text-txt-0">
                  {fmt(timeRemainingMs)}
                </span>
              </div>
            )}

            {/* History toggle */}
            <button onClick={() => setShowHistory(!showHistory)}
              className={`p-2.5 rounded-xl transition-all border ${
                showHistory
                  ? 'bg-accent/10 text-accent border-accent/20'
                  : 'bg-white/[0.04] text-txt-3 hover:text-txt-0 border-white/[0.06] hover:border-white/[0.1]'
              }`}>
              <History className="w-4 h-4" />
            </button>

            {/* Wallet button */}
            <div className="[&_.wallet-adapter-button]:!h-9 [&_.wallet-adapter-button]:!rounded-xl [&_.wallet-adapter-button]:!text-[12px] [&_.wallet-adapter-button]:!font-semibold [&_.wallet-adapter-button]:!bg-accent/15 [&_.wallet-adapter-button]:!border [&_.wallet-adapter-button]:!border-accent/20 [&_.wallet-adapter-button]:hover:!bg-accent/25 [&_.wallet-adapter-button]:!px-3">
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CARDS CAROUSEL ═══ */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        {/* Scroll arrows */}
        <button onClick={() => scroll('left')}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-drift-panel/80 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-txt-3 hover:text-txt-0 hover:border-white/[0.15] transition-all shadow-xl hover:shadow-2xl group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
        </button>
        <button onClick={() => scroll('right')}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-drift-panel/80 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-txt-3 hover:text-txt-0 hover:border-white/[0.15] transition-all shadow-xl hover:shadow-2xl group">
          <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Re-center on LIVE button */}
        <button onClick={() => scrollToLive('smooth')}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 backdrop-blur-xl border border-accent/20 text-accent text-[11px] font-semibold hover:bg-accent/25 transition-all shadow-lg">
          <Flame className="w-3 h-3" /> LIVE
        </button>

        <div ref={scrollRef}
          className="flex-1 flex items-center gap-5 px-16 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}>

          {notReady ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/15 flex items-center justify-center mx-auto">
                  <Loader2 className="w-7 h-7 text-accent/50 animate-spin" />
                </div>
                <div>
                  <p className="text-[14px] text-txt-2 font-medium">
                    {error || 'Connecting to prediction game...'}
                  </p>
                  <p className="text-[11px] text-txt-3/40 mt-1">On-chain data loading</p>
                </div>
              </div>
            </div>
          ) : rounds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-purple/10 border border-purple/15 flex items-center justify-center mx-auto">
                  <Loader2 className="w-7 h-7 text-purple/50 animate-spin" />
                </div>
                <p className="text-[14px] text-txt-2 font-medium">Loading rounds...</p>
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
      <div className="shrink-0 relative z-10 border-t border-white/[0.06] bg-drift-panel/60 backdrop-blur-xl">
        {showHistory ? (
          <HistoryPanel rounds={rounds} bets={myBets} onClaim={handleClaim} />
        ) : (
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5">
            <div className="flex items-center gap-5 sm:gap-8">
              <StatPill icon={BarChart3} label="Rounds" value={String(myBets.length)} />
              <StatPill icon={Trophy} label="W / L" value={`${wins} / ${losses}`}
                color={wins > losses ? 'text-bull' : losses > wins ? 'text-bear' : undefined} />
              <StatPill icon={CircleDollarSign} label="Wagered" value={totalBetSol > 0 ? `${fmtSol(totalBetSol)} SOL` : '—'} />
              <StatPill icon={TrendingUp} label="P&L" value={`${net >= 0 ? '+' : ''}${fmtSol(Math.abs(net))} SOL`}
                color={net >= 0 ? 'text-bull' : 'text-bear'} />
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-txt-3/50">
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" /> On-chain
              </span>
              <span className="w-px h-3 bg-white/[0.06]" />
              <span>{game?.intervalSeconds ?? 300}s rounds</span>
              <span className="w-px h-3 bg-white/[0.06]" />
              <span>{((game?.treasuryFee ?? 300) / 100).toFixed(1)}% fee</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────── */

const StatPill: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  color?: string;
}> = ({ icon: Icon, label, value, color }) => (
  <div className="flex items-center gap-2.5">
    <div className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center hidden sm:flex">
      <Icon className="w-3.5 h-3.5 text-txt-3/50" />
    </div>
    <div>
      <div className="text-[9px] text-txt-3/50 uppercase tracking-widest font-medium">{label}</div>
      <div className={`text-[14px] font-bold font-mono tabular-nums ${color ?? 'text-txt-0'}`}>{value}</div>
    </div>
  </div>
);

const HistoryPanel: React.FC<{
  rounds: DisplayRound[];
  bets: DisplayBet[];
  onClaim: (epoch: number) => void;
}> = ({ rounds, bets, onClaim }) => {
  const sorted = [...bets].sort((a, b) => b.epoch - a.epoch);

  return (
    <div className="max-h-[220px] overflow-y-auto">
      {sorted.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mx-auto mb-3">
            <History className="w-5 h-5 text-txt-3/20" />
          </div>
          <p className="text-[12px] text-txt-3/40">No predictions yet</p>
          <p className="text-[10px] text-txt-3/25 mt-1">Place your first prediction to see history</p>
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-drift-panel/95 backdrop-blur-lg">
            <tr className="text-txt-3/50 border-b border-white/[0.06]">
              <th className="text-left px-5 py-2.5 font-medium">Round</th>
              <th className="text-left px-2 py-2.5 font-medium">Position</th>
              <th className="text-right px-2 py-2.5 font-medium">Amount</th>
              <th className="text-center px-2 py-2.5 font-medium">Result</th>
              <th className="text-right px-5 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(b => {
              const r = rounds.find(rr => rr.epoch === b.epoch);
              const pending = !r?.oracleCalled;
              const won = b.payout > b.amount;
              const tie = b.payout === b.amount && b.payout > 0;
              return (
                <tr key={b.epoch} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 font-mono text-txt-2">#{b.epoch}</td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${
                      b.position === 'bull' ? 'text-bull bg-bull/8' : 'text-bear bg-bear/8'
                    }`}>
                      {b.position === 'bull' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {b.position.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-txt-0">{fmtSol(b.amount)}</td>
                  <td className="px-2 py-3 text-center">
                    {pending ? (
                      <span className="text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Live</span>
                    ) : won ? (
                      <span className="text-bull bg-bull/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Won</span>
                    ) : tie ? (
                      <span className="text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Tie</span>
                    ) : (
                      <span className="text-bear bg-bear/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Lost</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {(won || tie) && !b.claimed ? (
                      <button onClick={() => onClaim(b.epoch)}
                        className="text-[10px] font-bold text-bull bg-bull/10 hover:bg-bull/20 px-3 py-1.5 rounded-lg transition-all hover:shadow-sm hover:shadow-bull/10 border border-bull/15">
                        {tie ? 'Refund' : 'Collect'}
                      </button>
                    ) : b.claimed ? (
                      <span className="text-[10px] text-bull/60 flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : pending ? (
                      <span className="text-[10px] text-txt-3/30">—</span>
                    ) : (
                      <span className="text-[10px] text-bear/50">-{fmtSol(b.amount)}</span>
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

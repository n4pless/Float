/**
 * PredictionPage — PancakeSwap-style SOL/USD prediction market.
 *
 * Matches PancakeSwap's BNB Prediction UI with:
 *   - Dark purple/blue gradient background (#27262C → #1E1D2B)
 *   - Horizontal scrollable card carousel with snap
 *   - Teal UP (#31D0AA) / Pink DOWN (#ED4B9E) colour scheme
 *   - Purple glowing LIVE card border (#7645D9)
 *   - Real-time SOL price, countdown, oracle badge
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Clock,
  Trophy, Lock, CheckCircle2, XCircle, Loader2,
  History, Flame, Zap, TrendingUp, Timer,
  HelpCircle, Settings, CircleDollarSign, BarChart3,
} from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { usePredictionStore, type DisplayRound, type DisplayBet, type RoundStatus } from '../stores/usePredictionStore';
import { PRICE_PRECISION } from '../prediction/client';
import { toast } from 'sonner';

/* ═══ PancakeSwap Colour Palette ═══ */
const C = {
  up: '#31D0AA',
  upDark: '#1a7a65',
  down: '#ED4B9E',
  downDark: '#8a2d5e',
  purple: '#7645D9',
  bg: '#1a1a23',
  bgDark: '#13111C',
  card: '#353547',
  cardDark: '#27262C',
  text: '#F4EEFF',
  muted: '#8C8CA1',
  mutedDark: '#666680',
  yellow: '#F0B90B',
} as const;

/* ─── Solana Logo ─── */
const SolanaLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 397.7 311.7" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sol-grad-ps" x1="360.879" y1="-37.455" x2="141.213" y2="383.294" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
    </defs>
    <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="url(#sol-grad-ps)" />
    <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#sol-grad-ps)" />
    <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#sol-grad-ps)" />
  </svg>
);

/* ─── Pyth Logo (simple) ─── */
const PythLogo: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="16" fill="#242235" />
    <path d="M16 6L22 12L16 18L10 12L16 6Z" fill="#E6DAFE" />
    <path d="M16 18L22 12V20L16 26L10 20V12L16 18Z" fill="#BB86FC" fillOpacity="0.6" />
  </svg>
);

/* ─── Helpers ─── */

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
  return { value: `$${Math.abs(d).toFixed(4)}`, up: d >= 0 };
}

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
  timeRemainingMs?: number;
  pct?: number;
}

const RoundCard: React.FC<CardProps> = ({ round, bet, livePrice, intervalSec, onBet, onClaim, walletConnected, timeRemainingMs = 0, pct = 0 }) => {
  const [betDir, setBetDir] = useState<'bull' | 'bear' | null>(null);
  const [betAmt, setBetAmt] = useState('');
  const [placing, setPlacing] = useState(false);

  const { status, epoch } = round;
  const isLive = status === 'live';
  const isNext = status === 'next';
  const isExpired = status === 'expired';
  const isLater = status === 'later';
  const isCalc = status === 'calculating';

  const total = round.bullAmount + round.bearAmount;
  const upMulti = total > 0 && round.bullAmount > 0 ? (total / round.bullAmount) : 0;
  const downMulti = total > 0 && round.bearAmount > 0 ? (total / round.bearAmount) : 0;

  const liveDelta = isLive && round.lockPrice > 0 ? priceDelta(livePrice, round.lockPrice) : null;
  const expDelta = isExpired && round.lockPrice > 0 && round.closePrice > 0 ? priceDelta(round.closePrice, round.lockPrice) : null;
  const liveDir = liveDelta ? (liveDelta.up ? 'bull' : 'bear') : null;

  // Payout calculation based on user's deposit
  const inputAmt = parseFloat(betAmt) || 0;
  const depositSol = bet ? bet.amount : (isNext ? inputAmt : 0);
  const upPayoutSol = depositSol > 0 && upMulti > 0 ? depositSol * upMulti : 0;
  const downPayoutSol = depositSol > 0 && downMulti > 0 ? depositSol * downMulti : 0;

  // User wins if they picked the right side, or if it's a tie, or if it's a refund round (one side has 0 bets)
  const isRefundRound = round.bullAmount === 0 || round.bearAmount === 0 || round.result === 'tie';
  const userWon = isExpired && bet && round.result && (
    (round.result === 'bull' && bet.position === 'bull') ||
    (round.result === 'bear' && bet.position === 'bear') ||
    isRefundRound
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

  /* UP & DOWN banner highlights */
  const upHighlight = (isExpired && round.result === 'bull') || (isLive && liveDir === 'bull');
  const downHighlight = (isExpired && round.result === 'bear') || (isLive && liveDir === 'bear');

  /* Card classes */
  const isLiveGlow = isLive;
  const isMuted = isExpired || isLater;
  const liveGlowClass = isLiveGlow
    ? liveDir === 'bull'
      ? 'live-card-glow-up border-2'
      : liveDir === 'bear'
      ? 'live-card-glow-down border-2'
      : 'live-card-glow border-2'
    : '';

  return (
    <div
      className={`w-[280px] sm:w-[370px] shrink-0 rounded-2xl overflow-hidden snap-center flex flex-col transition-all duration-300 ${
        isLiveGlow
          ? liveGlowClass
          : isNext
          ? 'border border-[#7645D9]/30'
          : 'border border-white/[0.08]'
      } ${isMuted ? 'opacity-70 hover:opacity-90' : ''}`}
      style={{ background: C.cardDark }}
    >

      {/* ═══ HEADER STRIP ═══ */}
      <div className="flex items-center justify-between px-4 py-2" style={{
        background: isExpired && round.result === 'bull' ? 'rgba(49,208,170,0.15)'
          : isExpired && round.result === 'bear' ? 'rgba(237,75,158,0.15)'
          : C.card
      }}>
        <div className="flex items-center gap-1.5">
          {isLive && <div className="w-2 h-2 rounded-full bg-[#31D0AA] animate-pulse" />}
          {isNext && <div className="w-2 h-2 rounded-full bg-[#7645D9] animate-pulse" />}
          {isCalc && <Loader2 className="w-3 h-3 text-[#F0B90B] animate-spin" />}
          {isLater && <div className="w-2 h-2 rounded-full bg-[#8C8CA1]/40" />}
          {isExpired && (
            round.result === 'bull'
              ? <ArrowUp className="w-3.5 h-3.5 text-[#31D0AA]" />
              : round.result === 'bear'
              ? <ArrowDown className="w-3.5 h-3.5 text-[#ED4B9E]" />
              : <CheckCircle2 className="w-3 h-3 text-[#8C8CA1]/40" />
          )}
          <span className={`text-[11px] font-bold tracking-wide ${
            isLive ? 'text-[#31D0AA]' : isNext ? 'text-[#7645D9]' : isCalc ? 'text-[#F0B90B]'
            : isExpired && round.result === 'bull' ? 'text-[#31D0AA]'
            : isExpired && round.result === 'bear' ? 'text-[#ED4B9E]'
            : 'text-[#8C8CA1]'
          }`}>
            {isLive ? 'LIVE' : isNext ? 'Next' : isCalc ? 'Calculating'
              : isExpired && round.result === 'bull' ? 'UP Won'
              : isExpired && round.result === 'bear' ? 'DOWN Won'
              : isExpired ? 'Expired'
              : 'Later'}
          </span>
        </div>
        <span className="text-[11px] text-[#8C8CA1]/50 font-mono">#{epoch}</span>
      </div>

      {/* ═══ LIVE PROGRESS BAR ═══ */}
      {isLive && (
        <div className="w-full h-[3px] relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full transition-all duration-1000 rounded-r-full"
            style={{
              width: `${Math.min(100, pct * 100)}%`,
              background: timeRemainingMs < 15000
                ? 'linear-gradient(90deg, #ED4B9E, #ED4B9E)'
                : `linear-gradient(90deg, ${C.purple}, #31D0AA)`,
              boxShadow: timeRemainingMs < 15000
                ? '0 0 8px rgba(237,75,158,0.5)'
                : `0 0 8px rgba(118,69,217,0.4)`,
            }}
          />
        </div>
      )}

      {/* ═══ UP SHIELD BANNER ═══ */}
      <div className={`relative transition-all duration-500 ${upHighlight ? 'shield-glow-up' : ''}`} style={{ height: 56 }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d="M0,0 L100,0 L100,45 C100,52 97,58 92,63 L56,90 Q50,100 44,90 L8,63 C3,58 0,52 0,45 Z"
            fill={upHighlight ? C.up : C.card}
            className="transition-all duration-500"
          />
        </svg>
        <div className="relative z-10 flex flex-col items-center justify-center h-full pb-1">
          <span className={`text-[15px] sm:text-[18px] font-extrabold tracking-wider transition-colors duration-500 ${
            upHighlight ? 'text-[#1a1b2e]' : 'text-[#31D0AA]/60'
          }`}>UP</span>
          <span className={`text-[10px] sm:text-[11px] font-bold transition-colors duration-500 ${
            upHighlight ? 'text-[#1a1b2e]/70' : 'text-[#8C8CA1]/50'
          }`}>
            {upMulti > 0 ? `${upMulti.toFixed(2)}x` : '—'} Payout
          </span>
          {bet?.position === 'bull' && (
            <span className={`text-[8px] font-bold mt-0.5 px-1.5 py-0.5 rounded-sm ${
              upHighlight ? 'bg-[#1a1b2e]/20 text-[#1a1b2e]' : 'bg-[#31D0AA]/15 text-[#31D0AA]'
            }`}>ENTERED</span>
          )}
        </div>
      </div>

      {/* ═══ MAIN INFO BOX ═══ */}
      <div
        className="mx-2 sm:mx-3 my-1 rounded-xl border-2 flex-1 min-h-[160px] sm:min-h-[180px] flex flex-col transition-all duration-500 px-3 sm:px-4 py-2.5 sm:py-3"
        style={{
          borderColor: upHighlight ? C.up : downHighlight ? C.down : 'rgba(255,255,255,0.08)',
          background: 'rgba(19,17,28,0.8)',
        }}
      >
        {/* ── LIVE Content ── */}
        {isLive && (
          <div className="flex-1 flex flex-col justify-center space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#8C8CA1] uppercase tracking-wider font-medium">Last Price</span>
              {liveDelta && (
                <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-md ${
                  liveDelta.up ? 'text-[#31D0AA] bg-[#31D0AA]/10' : 'text-[#ED4B9E] bg-[#ED4B9E]/10'
                }`}>
                  {liveDelta.up ? '↑' : '↓'} {liveDelta.value}
                </span>
              )}
            </div>
            <div className={`text-[22px] sm:text-[28px] font-extrabold font-mono tabular-nums leading-none tracking-tight transition-colors ${
              liveDelta?.up ? 'text-[#31D0AA]' : liveDelta && !liveDelta.up ? 'text-[#ED4B9E]' : 'text-[#F4EEFF]'
            }`}>
              {fmtPrice(livePrice, 4)}
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#8C8CA1] font-bold">Locked Price</span>
                <span className="text-[#F4EEFF]/70 font-mono font-bold">{fmtPrice(round.lockPrice, 4)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#8C8CA1] font-bold">Prize Pool</span>
                <span className="text-[#F4EEFF] font-mono font-bold">{fmtSol(round.totalAmount)} SOL</span>
              </div>
            </div>
            {/* User bet indicator */}
            {bet && (
              <div className={`mt-1 flex items-center justify-between p-2.5 rounded-xl border ${
                bet.position === 'bull' ? 'border-[#31D0AA]/15 bg-[#31D0AA]/5' : 'border-[#ED4B9E]/15 bg-[#ED4B9E]/5'
              }`}>
                <div className="flex items-center gap-2">
                  {bet.position === 'bull'
                    ? <ArrowUp className="w-3.5 h-3.5 text-[#31D0AA]" />
                    : <ArrowDown className="w-3.5 h-3.5 text-[#ED4B9E]" />}
                  <span className="text-[12px] font-semibold text-[#F4EEFF]">{fmtSol(bet.amount)} SOL</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  liveDelta
                    ? (bet.position === 'bull'
                      ? (liveDelta.up ? 'text-[#31D0AA] bg-[#31D0AA]/10' : 'text-[#ED4B9E] bg-[#ED4B9E]/10')
                      : (liveDelta.up ? 'text-[#ED4B9E] bg-[#ED4B9E]/10' : 'text-[#31D0AA] bg-[#31D0AA]/10'))
                    : 'text-[#8C8CA1]'
                }`}>
                  {liveDelta ? ((bet.position === 'bull' ? liveDelta.up : !liveDelta.up) ? 'Winning ✓' : 'Losing') : '...'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── EXPIRED Content ── */}
        {isExpired && (
          <div className="flex-1 flex flex-col justify-center space-y-2">
            {/* BIG RESULT BANNER */}
            <div className={`flex items-center justify-center gap-2 py-2 -mx-1 rounded-lg ${
              round.result === 'bull'
                ? 'bg-[#31D0AA]/15 border border-[#31D0AA]/30'
                : round.result === 'bear'
                ? 'bg-[#ED4B9E]/15 border border-[#ED4B9E]/30'
                : 'bg-[#8C8CA1]/10 border border-[#8C8CA1]/20'
            }`}>
              {round.result === 'bull'
                ? <ArrowUp className="w-5 h-5 text-[#31D0AA]" />
                : round.result === 'bear'
                ? <ArrowDown className="w-5 h-5 text-[#ED4B9E]" />
                : null}
              <span className={`text-[14px] sm:text-[16px] font-extrabold tracking-wide ${
                round.result === 'bull' ? 'text-[#31D0AA]'
                : round.result === 'bear' ? 'text-[#ED4B9E]'
                : 'text-[#8C8CA1]'
              }`}>
                {round.result === 'bull' ? 'UP WON' : round.result === 'bear' ? 'DOWN WON' : 'TIE'}
              </span>
              {round.result === 'bull'
                ? <ArrowUp className="w-5 h-5 text-[#31D0AA]" />
                : round.result === 'bear'
                ? <ArrowDown className="w-5 h-5 text-[#ED4B9E]" />
                : null}
            </div>
            <div className="text-[10px] text-[#8C8CA1] uppercase tracking-wider font-medium">Closed Price</div>
            <div className={`text-[20px] sm:text-[24px] font-extrabold font-mono tabular-nums leading-none ${
              round.result === 'bull' ? 'text-[#31D0AA]' : round.result === 'bear' ? 'text-[#ED4B9E]' : 'text-[#F4EEFF]'
            }`}>
              {fmtPrice(round.closePrice, 4)}
            </div>
            {expDelta && (
              <span className={`inline-flex self-start text-[11px] font-bold font-mono px-2 py-0.5 rounded-md ${
                expDelta.up ? 'text-[#31D0AA] bg-[#31D0AA]/10' : 'text-[#ED4B9E] bg-[#ED4B9E]/10'
              }`}>
                {expDelta.up ? '↑' : '↓'} {expDelta.value}
              </span>
            )}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#8C8CA1] font-bold">Locked Price</span>
                <span className="text-[#F4EEFF]/60 font-mono font-bold">{fmtPrice(round.lockPrice, 4)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#8C8CA1] font-bold">Prize Pool</span>
                <span className="text-[#F4EEFF]/60 font-mono font-bold">{fmtSol(round.totalAmount)} SOL</span>
              </div>
            </div>
            {/* Collect / Lost / Collected badges */}
            {claimable && (
              <button onClick={() => onClaim(epoch)}
                className="mt-1 w-full py-2.5 rounded-xl text-white font-bold text-[13px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.97] transition-all"
                style={{ background: C.up }}>
                <Trophy className="w-4 h-4" /> Collect {fmtSol(bet!.payout)} SOL
              </button>
            )}
            {userLost && !bet?.claimed && (
              <div className="mt-1 flex items-center justify-center gap-2 p-2 rounded-xl bg-[#ED4B9E]/5 border border-[#ED4B9E]/10">
                <XCircle className="w-3.5 h-3.5 text-[#ED4B9E]/60" />
                <span className="text-[11px] text-[#ED4B9E]/80">-{fmtSol(bet!.amount)} SOL</span>
              </div>
            )}
            {bet?.claimed && (
              <div className="mt-1 flex items-center justify-center gap-2 p-2 rounded-xl bg-[#31D0AA]/5 border border-[#31D0AA]/10">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#31D0AA]/70" />
                <span className="text-[11px] text-[#31D0AA]/80">Collected</span>
              </div>
            )}
          </div>
        )}

        {/* ── NEXT Content — Direction Chooser ── */}
        {isNext && !betDir && !bet && (
          <div className="flex-1 flex flex-col justify-center space-y-3">
            <div className="text-center">
              <div className="text-[13px] text-[#8C8CA1] font-bold mb-1">Prize Pool</div>
              <div className="text-[18px] sm:text-[22px] font-extrabold text-[#F4EEFF] font-mono">{fmtSol(round.totalAmount)} SOL</div>
            </div>
            <button
              onClick={() => setBetDir('bull')}
              className="w-full py-3 sm:py-3.5 rounded-xl font-bold text-[13px] sm:text-[14px] text-white transition-all active:scale-[0.97] hover:brightness-110 flex items-center justify-center gap-2"
              style={{ background: C.up }}
            >
              Enter UP <ArrowUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setBetDir('bear')}
              className="w-full py-3 sm:py-3.5 rounded-xl font-bold text-[13px] sm:text-[14px] text-white transition-all active:scale-[0.97] hover:brightness-110 flex items-center justify-center gap-2"
              style={{ background: C.down }}
            >
              Enter DOWN <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── NEXT Content — Bet Amount Form ── */}
        {isNext && betDir && !bet && (
          <div className="flex-1 flex flex-col justify-center space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {betDir === 'bull'
                  ? <ArrowUp className="w-4 h-4 text-[#31D0AA]" />
                  : <ArrowDown className="w-4 h-4 text-[#ED4B9E]" />}
                <span className={`text-[13px] font-bold ${betDir === 'bull' ? 'text-[#31D0AA]' : 'text-[#ED4B9E]'}`}>
                  Enter {betDir === 'bull' ? 'UP' : 'DOWN'}
                </span>
              </div>
              <button
                onClick={() => setBetDir(null)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[#8C8CA1] hover:text-[#F4EEFF] transition-colors text-[12px]"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <input
                type="number" value={betAmt} onChange={e => setBetAmt(e.target.value)}
                placeholder="0.0" autoFocus step="0.01" min="0.001"
                onKeyDown={e => { if (e.key === 'Enter') submit(betDir); }}
                className="w-full pl-3 pr-14 py-3 rounded-xl text-[15px] font-mono outline-none transition-all placeholder:text-[#8C8CA1]/30"
                style={{
                  background: C.bgDark,
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: C.text,
                }}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.04)', color: C.muted }}
              >
                SOL
              </span>
            </div>

            <div className="flex gap-1 sm:gap-1.5">
              {[0.01, 0.05, 0.1, 0.25, 0.5, 1].map(a => (
                <button
                  key={a}
                  onClick={() => setBetAmt(a.toString())}
                  className={`flex-1 py-1.5 rounded-lg text-[8px] sm:text-[9px] font-semibold transition-all border ${
                    betAmt === a.toString()
                      ? 'border-[#7645D9] text-[#F4EEFF]'
                      : 'border-transparent text-[#8C8CA1] hover:text-[#F4EEFF]'
                  }`}
                  style={{
                    background: betAmt === a.toString() ? 'rgba(118,69,217,0.15)' : 'rgba(255,255,255,0.04)',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>

            <button
              onClick={() => submit(betDir)}
              disabled={placing || !betAmt || parseFloat(betAmt) <= 0}
              className="w-full py-3 rounded-xl font-bold text-[14px] text-white transition-all disabled:opacity-30 active:scale-[0.97] hover:brightness-110"
              style={{ background: betDir === 'bull' ? C.up : C.down }}
            >
              {placing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Placing...
                </span>
              ) : !walletConnected ? 'Connect Wallet' : `Confirm ${betDir === 'bull' ? 'UP' : 'DOWN'}`}
            </button>
          </div>
        )}

        {/* ── NEXT Content — Already Entered ── */}
        {isNext && bet && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2">
            <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border ${
              bet.position === 'bull' ? 'border-[#31D0AA]/20 bg-[#31D0AA]/5' : 'border-[#ED4B9E]/20 bg-[#ED4B9E]/5'
            }`}>
              {bet.position === 'bull'
                ? <ArrowUp className="w-4 h-4 text-[#31D0AA]" />
                : <ArrowDown className="w-4 h-4 text-[#ED4B9E]" />}
              <span className="text-[13px] font-bold text-[#F4EEFF]">
                {bet.position === 'bull' ? 'UP' : 'DOWN'} — {fmtSol(bet.amount)} SOL
              </span>
            </div>
            <div className="flex items-center gap-1 text-[#31D0AA] text-[11px] font-semibold">
              <CheckCircle2 className="w-3 h-3" /> ENTERED
            </div>
          </div>
        )}

        {/* ── CALCULATING Content ── */}
        {isCalc && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.yellow }} />
            <p className="text-[13px] font-semibold" style={{ color: C.yellow }}>Calculating...</p>
          </div>
        )}

        {/* ── LATER Content ── */}
        {isLater && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-center">
            <img src="/clock.png" alt="clock" className="w-8 h-8 opacity-25" />
            <div>
              <p className="text-[12px] text-[#8C8CA1]/50 font-medium">Entry starts</p>
              <p className="text-[16px] text-[#8C8CA1] font-mono font-bold mt-0.5">
                ~{fmt(Math.max(0, round.lockTimestamp * 1000 - Date.now()))}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ DOWN SHIELD BANNER ═══ */}
      <div className={`relative transition-all duration-500 ${downHighlight ? 'shield-glow-down' : ''}`} style={{ height: 56 }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d="M44,10 Q50,0 56,10 L92,37 C97,42 100,48 100,55 L100,100 L0,100 L0,55 C0,48 3,42 8,37 L44,10 Z"
            fill={downHighlight ? C.down : C.card}
            className="transition-all duration-500"
          />
        </svg>
        <div className="relative z-10 flex flex-col items-center justify-center h-full pt-1">
          <span className={`text-[10px] sm:text-[11px] font-bold transition-colors duration-500 ${
            downHighlight ? 'text-white/80' : 'text-[#8C8CA1]/50'
          }`}>
            {downMulti > 0 ? `${downMulti.toFixed(2)}x` : '—'} Payout
          </span>
          <span className={`text-[15px] sm:text-[18px] font-extrabold tracking-wider transition-colors duration-500 ${
            downHighlight ? 'text-white' : 'text-[#ED4B9E]/60'
          }`}>DOWN</span>
          {bet?.position === 'bear' && (
            <span className={`text-[8px] font-bold mt-0.5 px-1.5 py-0.5 rounded-sm ${
              downHighlight ? 'bg-white/20 text-white' : 'bg-[#ED4B9E]/15 text-[#ED4B9E]'
            }`}>ENTERED</span>
          )}
        </div>
      </div>
    </div>
  );
};


/* ═══════════════════════════════════════════════════
   PREDICTION PAGE — Main Layout
   ═══════════════════════════════════════════════════ */

interface Props { onBack?: () => void; }

export const PredictionPage: React.FC<Props> = ({ onBack }) => {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const walletStr = publicKey?.toBase58() ?? null;

  const {
    game, rounds, userBets, livePrice, timeRemainingMs, loading, error,
    setConnection, refresh, placeBet, claimWinnings,
    setLivePrice, setTimeRemainingMs,
    historyRounds, historyBets, historyLoading, refreshHistory,
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

  // Poll on-chain data every 10s
  useEffect(() => {
    if (!connection) return;
    refresh(publicKey ?? undefined);
    const iv = setInterval(() => refresh(publicKey ?? undefined), 10000);
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
    // +1 to skip the leading spacer div
    const cardEl = scrollRef.current.children[idx + 1] as HTMLElement | undefined;
    if (!cardEl) return;
    const containerW = scrollRef.current.offsetWidth;
    const scrollLeft = cardEl.offsetLeft - (containerW / 2) + (cardEl.offsetWidth / 2);
    scrollRef.current.scrollTo({ left: Math.max(0, scrollLeft), behavior });
  }, [rounds]);

  // Auto-center on live card whenever the live epoch changes
  useEffect(() => {
    const liveEpoch = rounds.find(r => r.status === 'live')?.epoch ?? null;
    if (liveEpoch !== null && liveEpoch !== lastCenteredEpoch.current) {
      lastCenteredEpoch.current = liveEpoch;
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
    scrollRef.current?.scrollBy({ left: d === 'left' ? -330 : 330, behavior: 'smooth' });
  };

  // Wheel-to-horizontal-scroll on the card carousel
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollBy({ left: e.deltaY * 2 });
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleBet = useCallback(async (epoch: number, dir: 'bull' | 'bear', sol: number) => {
    if (game?.paused) { toast.error('Predictions are currently paused'); return; }
    if (!publicKey || !signTransaction) { toast.error('Connect wallet'); return; }
    try {
      toast.loading('Placing prediction...', { id: 'bet' });
      await placeBet(publicKey, epoch, dir, sol, signTransaction);
      toast.success(`${dir.toUpperCase()} — ${sol} SOL`, { id: 'bet' });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.slice(0, 80) || 'Prediction failed', { id: 'bet' });
    }
  }, [publicKey, placeBet, signTransaction]);

  const handleClaim = useCallback(async (epoch: number) => {
    if (!publicKey || !signTransaction) return;
    try {
      toast.loading('Claiming winnings...', { id: 'claim' });
      await claimWinnings(publicKey, epoch, signTransaction);
      toast.success('Winnings collected!', { id: 'claim' });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.slice(0, 80) || 'Claim failed', { id: 'claim' });
    }
  }, [publicKey, claimWinnings, signTransaction]);

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

  const notReady = !game || !game.genesisStart;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgDark} 100%)` }}>

      {/* ═══ Background decorations ═══ */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />
        {/* Top-left teal glow */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] opacity-[0.07]" style={{
          background: 'radial-gradient(circle, rgba(49,208,170,0.6) 0%, transparent 70%)',
        }} />
        {/* Top-right pink glow */}
        <div className="absolute -top-24 -right-24 w-[400px] h-[400px] opacity-[0.05]" style={{
          background: 'radial-gradient(circle, rgba(237,75,158,0.6) 0%, transparent 70%)',
        }} />
        {/* Center purple glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-[0.04]" style={{
          background: 'radial-gradient(ellipse at center, rgba(118,69,217,0.8) 0%, transparent 70%)',
        }} />
      </div>

      {/* ═══ Inject LIVE glow animation ═══ */}
      <style>{`
        @keyframes live-glow {
          0%, 100% { box-shadow: 0 0 15px rgba(118,69,217,0.4), 0 0 30px rgba(118,69,217,0.15); border-color: #7645D9; }
          50% { box-shadow: 0 0 25px rgba(118,69,217,0.6), 0 0 50px rgba(118,69,217,0.25); border-color: #9a6ef5; }
        }
        .live-card-glow {
          animation: live-glow 2s ease-in-out infinite;
          border-color: #7645D9;
        }
        @keyframes live-glow-up {
          0%, 100% { box-shadow: 0 0 18px rgba(49,208,170,0.45), 0 0 35px rgba(49,208,170,0.15); border-color: #31D0AA; }
          50% { box-shadow: 0 0 30px rgba(49,208,170,0.7), 0 0 60px rgba(49,208,170,0.3); border-color: #5EECC4; }
        }
        .live-card-glow-up {
          animation: live-glow-up 2s ease-in-out infinite;
          border-color: #31D0AA;
        }
        @keyframes live-glow-down {
          0%, 100% { box-shadow: 0 0 18px rgba(237,75,158,0.45), 0 0 35px rgba(237,75,158,0.15); border-color: #ED4B9E; }
          50% { box-shadow: 0 0 30px rgba(237,75,158,0.7), 0 0 60px rgba(237,75,158,0.3); border-color: #F77FBC; }
        }
        .live-card-glow-down {
          animation: live-glow-down 2s ease-in-out infinite;
          border-color: #ED4B9E;
        }
        .price-flash {
          animation: price-flash 0.3s ease-out;
        }
        @keyframes price-flash {
          0% { background: rgba(244,238,255,0.08); }
          100% { background: transparent; }
        }
        .arrow-glow-up {
          animation: arrow-pulse-up 1.5s ease-in-out infinite;
        }
        .arrow-glow-down {
          animation: arrow-pulse-down 1.5s ease-in-out infinite;
        }
        @keyframes arrow-pulse-up {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(49,208,170,0.5)) drop-shadow(0 0 15px rgba(49,208,170,0.3)); transform: scale(1); }
          50% { filter: drop-shadow(0 0 14px rgba(49,208,170,0.9)) drop-shadow(0 0 30px rgba(49,208,170,0.5)); transform: scale(1.08); }
        }
        @keyframes arrow-pulse-down {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(237,75,158,0.5)) drop-shadow(0 0 15px rgba(237,75,158,0.3)); transform: scale(1); }
          50% { filter: drop-shadow(0 0 14px rgba(237,75,158,0.9)) drop-shadow(0 0 30px rgba(237,75,158,0.5)); transform: scale(1.08); }
        }
        .shield-glow-up {
          filter: drop-shadow(0 4px 12px rgba(49,208,170,0.35)) drop-shadow(0 2px 6px rgba(49,208,170,0.2));
        }
        .shield-glow-down {
          filter: drop-shadow(0 -4px 12px rgba(237,75,158,0.35)) drop-shadow(0 -2px 6px rgba(237,75,158,0.2));
        }
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div className="shrink-0 relative z-50 border-b border-white/[0.06] overflow-visible" style={{ background: `${C.cardDark}e6` }}>
        <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3">

          {/* Left: Logo + Back + SOL Price Ticker */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Float Logo */}
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 hover:brightness-125 transition-all"
              >
                <img src="/float-logo-v2.svg" alt="Float" className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg shadow-lg shadow-purple-500/20" />
                <span className="text-[14px] font-bold text-[#F4EEFF] hidden sm:inline">Float</span>
              </button>
            )}
            <div className="w-px h-5 bg-white/[0.08] hidden sm:block" />
            {/* SOL Price Ticker */}
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <SolanaLogo className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-[12px] sm:text-[14px] font-bold font-mono tabular-nums" style={{ color: C.text }}>
                {livePrice > 0 ? `$${livePrice.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>



          {/* Right: Icons + Wallet */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* History */}
            <button
              onClick={() => {
                const next = !showHistory;
                setShowHistory(next);
                if (next && publicKey) refreshHistory(publicKey);
              }}
              className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all ${
                showHistory ? 'text-[#7645D9]' : 'text-[#8C8CA1] hover:text-[#F4EEFF]'
              }`}
              style={{
                background: showHistory ? 'rgba(118,69,217,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${showHistory ? 'rgba(118,69,217,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <History className="w-4 h-4" />
            </button>

            {/* Trophy / Leaderboard */}
            <button
              className="hidden sm:flex p-2.5 rounded-xl text-[#8C8CA1] hover:text-[#F4EEFF] transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Trophy className="w-4 h-4" />
            </button>

            {/* Help */}
            <button
              className="hidden sm:flex p-2.5 rounded-xl text-[#8C8CA1] hover:text-[#F4EEFF] transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Wallet — compact on mobile */}
            <div className="relative z-[100] overflow-visible [&_.wallet-adapter-button]:!h-8 [&_.wallet-adapter-button]:!rounded-lg [&_.wallet-adapter-button]:!text-[11px] [&_.wallet-adapter-button]:!font-semibold [&_.wallet-adapter-button]:!bg-[#7645D9]/20 [&_.wallet-adapter-button]:!border [&_.wallet-adapter-button]:!border-[#7645D9]/30 [&_.wallet-adapter-button]:hover:!bg-[#7645D9]/30 [&_.wallet-adapter-button]:!px-2.5 sm:[&_.wallet-adapter-button]:!h-9 sm:[&_.wallet-adapter-button]:!rounded-xl sm:[&_.wallet-adapter-button]:!text-[12px] sm:[&_.wallet-adapter-button]:!px-3 [&_.wallet-adapter-dropdown]:!z-[9999] [&_.wallet-adapter-dropdown-list]:!z-[9999]">
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COUNTDOWN CLOCK (PancakeSwap-style — centered above cards) ═══ */}
      {liveRound && (
        <div className="shrink-0 relative z-10 flex items-center justify-center py-2 sm:py-4">
          <div
            className="flex items-center gap-2.5 sm:gap-4 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border"
            style={{
              background: 'rgba(53,53,71,0.55)',
              borderColor: timeRemainingMs < 15000
                ? 'rgba(237,75,158,0.35)'
                : 'rgba(118,69,217,0.25)',
              backdropFilter: 'blur(12px)',
              boxShadow: timeRemainingMs < 15000
                ? '0 0 20px rgba(237,75,158,0.15)'
                : '0 0 20px rgba(118,69,217,0.1)',
            }}
          >
            {/* Clock / Flame icon */}
            {timeRemainingMs < 15000
              ? <Flame className="w-14 h-14 sm:w-16 sm:h-16 text-[#ED4B9E] animate-pulse" />
              : <img src="/clock.png" alt="clock" className="w-16 h-16 sm:w-20 sm:h-20 object-contain scale-[1.8]" />
            }

            {/* Time display */}
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="text-[22px] sm:text-[32px] font-extrabold font-mono tabular-nums leading-none"
                  style={{ color: timeRemainingMs < 15000 ? C.down : C.text }}
                >
                  {fmt(timeRemainingMs)}
                </span>
                <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md" style={{ background: 'rgba(49,208,170,0.1)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#31D0AA] animate-pulse" />
                  <span className="text-[9px] sm:text-[10px] font-bold text-[#31D0AA] tracking-wide">LIVE</span>
                </div>
              </div>
              <span className="text-[10px] sm:text-[11px] font-medium mt-0.5" style={{ color: C.muted }}>
                #{liveRound.epoch} · {Math.floor((game?.intervalSeconds ?? 300) / 60)}m rounds
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAUSED BANNER ═══ */}
      {game?.paused && (
        <div className="shrink-0 relative z-20 flex items-center justify-center px-4 py-3">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{ background: 'rgba(237,75,158,0.12)', border: '1px solid rgba(237,75,158,0.25)' }}>
            <span className="text-lg">⏸</span>
            <div>
              <p className="text-[13px] sm:text-[14px] font-bold" style={{ color: '#ED4B9E' }}>Predictions Paused</p>
              <p className="text-[10px] sm:text-[11px]" style={{ color: 'rgba(237,75,158,0.7)' }}>Betting is temporarily disabled. Existing bets are safe.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CARDS CAROUSEL ═══ */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">

        {/* Nav arrows above cards */}
        <div className="shrink-0 flex items-center justify-center gap-3 pt-0 pb-1">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[#8C8CA1] hover:text-[#F4EEFF] transition-all hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scrollToLive('smooth')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all hover:scale-105"
            style={{ background: 'rgba(118,69,217,0.15)', color: C.purple }}
          >
            <Flame className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[#8C8CA1] hover:text-[#F4EEFF] transition-all hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 flex items-center gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}
        >

          {notReady ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto" style={{ background: 'rgba(118,69,217,0.1)', borderColor: 'rgba(118,69,217,0.15)' }}>
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'rgba(118,69,217,0.5)' }} />
                </div>
                <div>
                  <p className="text-[14px] font-medium" style={{ color: C.muted }}>
                    {error || 'Connecting to prediction game...'}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: 'rgba(140,140,161,0.4)' }}>On-chain data loading</p>
                </div>
              </div>
            </div>
          ) : rounds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto" style={{ background: 'rgba(118,69,217,0.1)', borderColor: 'rgba(118,69,217,0.15)' }}>
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'rgba(118,69,217,0.5)' }} />
                </div>
                <p className="text-[14px] font-medium" style={{ color: C.muted }}>Loading rounds...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 w-[calc(50vw-140px)] sm:w-[calc(50vw-185px)]" aria-hidden />
              {rounds.map(r => (
                <RoundCard
                  key={r.epoch}
                  round={r}
                  bet={userBets.get(r.epoch)}
                  livePrice={livePrice}
                  intervalSec={game?.intervalSeconds ?? 300}
                  onBet={handleBet}
                  onClaim={handleClaim}
                  walletConnected={!!publicKey}
                  timeRemainingMs={r.status === 'live' ? timeRemainingMs : undefined}
                  pct={r.status === 'live' ? pct : undefined}
                />
              ))}

              {/* ── Upcoming empty card ── */}
              {rounds.length > 0 && (
                <div
                  className="w-[280px] sm:w-[370px] shrink-0 rounded-2xl overflow-hidden snap-center flex flex-col border border-white/[0.06] opacity-40"
                  style={{ background: C.cardDark }}
                >
                  {/* Header placeholder */}
                  <div className="flex items-center justify-between px-4 py-2" style={{ background: C.card }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#8C8CA1]/20" />
                      <span className="text-[11px] font-bold tracking-wide text-[#8C8CA1]/30">Later</span>
                    </div>
                    <span className="text-[11px] text-[#8C8CA1]/25 font-mono">#{(rounds[rounds.length - 1]?.epoch ?? 0) + 1}</span>
                  </div>

                  {/* UP shield placeholder */}
                  <div className="relative" style={{ height: 56 }}>
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M0,0 L100,0 L100,45 C100,52 97,58 92,63 L56,90 Q50,100 44,90 L8,63 C3,58 0,52 0,45 Z" fill={C.card} opacity="0.5" />
                    </svg>
                    <div className="relative z-10 flex flex-col items-center justify-center h-full pb-2">
                      <span className="text-[18px] font-extrabold tracking-wider text-[#31D0AA]/15">UP</span>
                      <span className="text-[11px] font-bold text-[#8C8CA1]/20">— Payout</span>
                    </div>
                  </div>

                  {/* Empty middle */}
                  <div className="mx-2 sm:mx-3 my-1 rounded-xl border-2 flex-1 min-h-[160px] sm:min-h-[180px] flex flex-col items-center justify-center space-y-3" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(19,17,28,0.5)' }}>
                    <Lock className="w-10 h-10 text-[#8C8CA1]/10" />
                    <p className="text-[12px] text-[#8C8CA1]/30 font-medium">Upcoming</p>
                  </div>

                  {/* DOWN shield placeholder */}
                  <div className="relative" style={{ height: 56 }}>
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M44,10 Q50,0 56,10 L92,37 C97,42 100,48 100,55 L100,100 L0,100 L0,55 C0,48 3,42 8,37 L44,10 Z" fill={C.card} opacity="0.5" />
                    </svg>
                    <div className="relative z-10 flex flex-col items-center justify-center h-full pt-2">
                      <span className="text-[11px] font-bold text-[#8C8CA1]/20">— Payout</span>
                      <span className="text-[18px] font-extrabold tracking-wider text-[#ED4B9E]/15">DOWN</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="shrink-0 w-[calc(50vw-140px)] sm:w-[calc(50vw-185px)]" aria-hidden />
            </>
          )}
        </div>

        {/* Mobile floating nav arrows */}
        {!notReady && rounds.length > 0 && (
          <>
            <button
              onClick={() => scroll('left')}
              className="sm:hidden absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:text-white active:scale-90 transition-all"
              style={{ background: 'rgba(39,38,44,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="sm:hidden absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center text-white/60 active:text-white active:scale-90 transition-all"
              style={{ background: 'rgba(39,38,44,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* ═══ HISTORY OVERLAY ═══ */}
      {showHistory && (
        <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: C.bg }}>
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/[0.06]" style={{ background: C.cardDark }}>
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-[#7645D9]" />
              <h2 className="text-[16px] sm:text-[18px] font-bold" style={{ color: C.text }}>Prediction History</h2>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8C8CA1] hover:text-[#F4EEFF] transition-all text-[14px]"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#7645D9]" />
                <p className="text-[13px] text-[#8C8CA1]">Loading history...</p>
              </div>
            ) : !publicKey ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <History className="w-10 h-10 text-[#8C8CA1]/20" />
                <p className="text-[13px] text-[#8C8CA1]/60">Connect wallet to see history</p>
              </div>
            ) : historyBets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <History className="w-10 h-10 text-[#8C8CA1]/20" />
                <p className="text-[13px] text-[#8C8CA1]/60">No predictions found</p>
                <p className="text-[10px] text-[#8C8CA1]/30">Place your first prediction to see history</p>
              </div>
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 px-4 sm:px-6 py-4">
                  {(() => {
                    const hWins = historyBets.filter(b => b.payout > b.amount).length;
                    const hLosses = historyBets.filter(b => b.payout === 0).length;
                    const hWagered = historyBets.reduce((s, b) => s + b.amount, 0);
                    const hWon = historyBets.filter(b => b.payout > b.amount).reduce((s, b) => s + b.payout, 0);
                    const hNet = hWon - hWagered;
                    const unclaimed = historyBets.filter(b => (b.payout > b.amount || (b.payout === b.amount && b.payout > 0)) && !b.claimed).length;
                    return (
                      <>
                        <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <div className="text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: C.muted }}>Total Rounds</div>
                          <div className="text-[18px] font-bold font-mono" style={{ color: C.text }}>{historyBets.length}</div>
                        </div>
                        <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <div className="text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: C.muted }}>Win / Loss</div>
                          <div className="text-[18px] font-bold font-mono" style={{ color: hWins > hLosses ? C.up : hLosses > hWins ? C.down : C.text }}>{hWins} / {hLosses}</div>
                        </div>
                        <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <div className="text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: C.muted }}>Net P&L</div>
                          <div className="text-[18px] font-bold font-mono" style={{ color: hNet >= 0 ? C.up : C.down }}>{hNet >= 0 ? '+' : ''}{fmtSol(Math.abs(hNet))} SOL</div>
                        </div>
                        <div className="rounded-xl p-3 border border-white/[0.06]" style={{ background: unclaimed > 0 ? 'rgba(49,208,170,0.05)' : 'rgba(255,255,255,0.02)', borderColor: unclaimed > 0 ? 'rgba(49,208,170,0.15)' : undefined }}>
                          <div className="text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: unclaimed > 0 ? C.up : C.muted }}>Unclaimed</div>
                          <div className="text-[18px] font-bold font-mono" style={{ color: unclaimed > 0 ? C.up : C.text }}>{unclaimed}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block px-4 sm:px-6 pb-4">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0" style={{ background: C.bg }}>
                      <tr style={{ color: C.muted }} className="border-b border-white/[0.06]">
                        <th className="text-left px-4 py-3 font-medium">Round</th>
                        <th className="text-left px-2 py-3 font-medium">Your Position</th>
                        <th className="text-left px-2 py-3 font-medium">Round Result</th>
                        <th className="text-right px-2 py-3 font-medium">Amount</th>
                        <th className="text-right px-2 py-3 font-medium">Payout</th>
                        <th className="text-center px-2 py-3 font-medium">Status</th>
                        <th className="text-right px-4 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...historyBets].sort((a, b) => b.epoch - a.epoch).map(b => {
                        const r = historyRounds.find(rr => rr.epoch === b.epoch);
                        const pending = !r?.oracleCalled;
                        const won = b.payout > b.amount;
                        const tie = b.payout === b.amount && b.payout > 0;
                        const canClaim = (won || tie) && !b.claimed;
                        return (
                          <tr key={b.epoch} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 font-mono" style={{ color: C.muted }}>#{b.epoch}</td>
                            <td className="px-2 py-3">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${
                                b.position === 'bull' ? 'bg-[#31D0AA]/8 text-[#31D0AA]' : 'bg-[#ED4B9E]/8 text-[#ED4B9E]'
                              }`}>
                                {b.position === 'bull' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                {b.position === 'bull' ? 'UP' : 'DOWN'}
                              </span>
                            </td>
                            <td className="px-2 py-3">
                              {pending ? (
                                <span className="text-[#F0B90B] text-[11px]">Pending</span>
                              ) : r?.result === 'bull' ? (
                                <span className="inline-flex items-center gap-1 text-[#31D0AA] text-[11px] font-medium">
                                  <ArrowUp className="w-3 h-3" /> UP Won
                                </span>
                              ) : r?.result === 'bear' ? (
                                <span className="inline-flex items-center gap-1 text-[#ED4B9E] text-[11px] font-medium">
                                  <ArrowDown className="w-3 h-3" /> DOWN Won
                                </span>
                              ) : (
                                <span className="text-[#F0B90B] text-[11px]">Tie</span>
                              )}
                            </td>
                            <td className="px-2 py-3 text-right font-mono" style={{ color: C.text }}>{fmtSol(b.amount)} SOL</td>
                            <td className="px-2 py-3 text-right font-mono" style={{ color: won ? C.up : tie ? C.yellow : C.down }}>
                              {pending ? '—' : won ? `+${fmtSol(b.payout)}` : tie ? fmtSol(b.payout) : '0'} SOL
                            </td>
                            <td className="px-2 py-3 text-center">
                              {pending ? (
                                <span className="text-[#F0B90B] bg-[#F0B90B]/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Live</span>
                              ) : won ? (
                                <span className="text-[#31D0AA] bg-[#31D0AA]/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Won</span>
                              ) : tie ? (
                                <span className="text-[#F0B90B] bg-[#F0B90B]/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Tie</span>
                              ) : (
                                <span className="text-[#ED4B9E] bg-[#ED4B9E]/10 px-2 py-0.5 rounded-md text-[10px] font-medium">Lost</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {canClaim ? (
                                <button
                                  onClick={() => handleClaim(b.epoch)}
                                  className="text-[11px] font-bold px-4 py-2 rounded-lg transition-all hover:brightness-110 border active:scale-95"
                                  style={{ color: '#fff', background: C.up, borderColor: 'rgba(49,208,170,0.3)' }}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Trophy className="w-3.5 h-3.5" />
                                    {tie ? 'Refund' : `Collect ${fmtSol(b.payout)} SOL`}
                                  </span>
                                </button>
                              ) : b.claimed ? (
                                <span className="text-[11px] flex items-center justify-end gap-1" style={{ color: 'rgba(49,208,170,0.6)' }}>
                                  <CheckCircle2 className="w-3 h-3" /> Collected
                                </span>
                              ) : pending ? (
                                <span className="text-[11px]" style={{ color: 'rgba(140,140,161,0.3)' }}>—</span>
                              ) : (
                                <span className="text-[11px] text-[#ED4B9E]/50">-{fmtSol(b.amount)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card view */}
                <div className="sm:hidden flex flex-col divide-y divide-white/[0.04] px-2 pb-4">
                  {[...historyBets].sort((a, b) => b.epoch - a.epoch).map(b => {
                    const r = historyRounds.find(rr => rr.epoch === b.epoch);
                    const pending = !r?.oracleCalled;
                    const won = b.payout > b.amount;
                    const tie = b.payout === b.amount && b.payout > 0;
                    const canClaim = (won || tie) && !b.claimed;
                    return (
                      <div key={b.epoch} className="flex items-center justify-between px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            b.position === 'bull' ? 'bg-[#31D0AA]/10' : 'bg-[#ED4B9E]/10'
                          }`}>
                            {b.position === 'bull'
                              ? <ArrowUp className="w-4 h-4 text-[#31D0AA]" />
                              : <ArrowDown className="w-4 h-4 text-[#ED4B9E]" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-bold" style={{ color: C.text }}>
                                {b.position === 'bull' ? 'UP' : 'DOWN'}
                              </span>
                              <span className="text-[10px] font-mono" style={{ color: C.muted }}>#{b.epoch}</span>
                              {!pending && r?.result && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  r.result === 'bull' ? 'bg-[#31D0AA]/10 text-[#31D0AA]'
                                  : r.result === 'bear' ? 'bg-[#ED4B9E]/10 text-[#ED4B9E]'
                                  : 'bg-[#F0B90B]/10 text-[#F0B90B]'
                                }`}>
                                  {r.result === 'bull' ? '↑ UP Won' : r.result === 'bear' ? '↓ DOWN Won' : 'Tie'}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono" style={{ color: C.muted }}>{fmtSol(b.amount)} SOL</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canClaim ? (
                            <button
                              onClick={() => handleClaim(b.epoch)}
                              className="text-[11px] font-bold px-3 py-2 rounded-lg border active:scale-95 transition-all text-white"
                              style={{ background: C.up, borderColor: 'rgba(49,208,170,0.3)' }}
                            >
                              {tie ? 'Refund' : `+${fmtSol(b.payout)}`}
                            </button>
                          ) : b.claimed ? (
                            <span className="text-[10px] flex items-center gap-1 text-[#31D0AA]/60">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : pending ? (
                            <span className="text-[#F0B90B] bg-[#F0B90B]/10 px-2 py-1 rounded-md text-[10px] font-bold">Live</span>
                          ) : won ? (
                            <span className="text-[#31D0AA] text-[11px] font-mono">+{fmtSol(b.payout)}</span>
                          ) : (
                            <span className="text-[#ED4B9E]/70 text-[11px] font-mono">-{fmtSol(b.amount)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ BOTTOM BAR ═══ */}
      <div className="shrink-0 relative z-10 border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]" style={{ background: `${C.cardDark}e6` }}>
          <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3">
            {/* Left: Stats */}
            <div className="flex items-center gap-3 sm:gap-8 overflow-x-auto scrollbar-hide">
              <StatPill label="Rounds" value={String(myBets.length)} />
              <StatPill label="W / L" value={`${wins} / ${losses}`} color={wins > losses ? C.up : losses > wins ? C.down : undefined} />
              <StatPill label="Wagered" value={totalBetSol > 0 ? `${fmtSol(totalBetSol)} SOL` : '—'} />
              <StatPill label="P&L" value={`${net >= 0 ? '+' : ''}${fmtSol(Math.abs(net))} SOL`} color={net >= 0 ? C.up : C.down} />
            </div>

            {/* Right: Oracle Badge */}
            <div className="hidden sm:flex items-center gap-2 text-[10px]" style={{ color: 'rgba(140,140,161,0.5)' }}>
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.up }} />
                On-chain
              </span>
              <span className="w-px h-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span>{(game?.intervalSeconds ?? 300)}s rounds</span>
              <span className="w-px h-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex items-center gap-1">
                <PythLogo className="w-3.5 h-3.5" />
                <span className="font-medium">Pyth Oracle</span>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};


/* ═══ Sub-components ═══ */

const StatPill: React.FC<{
  label: string;
  value: string;
  color?: string;
}> = ({ label, value, color }) => (
  <div className="min-w-0">
    <div className="text-[8px] sm:text-[9px] uppercase tracking-widest font-medium whitespace-nowrap" style={{ color: 'rgba(140,140,161,0.5)' }}>{label}</div>
    <div className="text-[12px] sm:text-[14px] font-bold font-mono tabular-nums whitespace-nowrap" style={{ color: color ?? C.text }}>{value}</div>
  </div>
);


export default PredictionPage;

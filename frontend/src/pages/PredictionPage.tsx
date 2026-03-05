/**
 * PredictionPage — PancakeSwap-style SOL/USD prediction market
 *
 * Layout (matching PancakeSwap):
 * ┌──────────────────────────────────────────────────────────┐
 * │ Header bar: SOL/USD price, timer, history link           │
 * ├──────────────────────────────────────────────────────────┤
 * │  ◄  [ Expired ][ Expired ][ LIVE ][ NEXT ][ Later ]  ►  │
 * │       card       card      card    card     card         │
 * │  ← horizontally scrollable round cards →                 │
 * ├──────────────────────────────────────────────────────────┤
 * │ Bottom: stats, history, your positions                   │
 * └──────────────────────────────────────────────────────────┘
 */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Clock, Trophy,
  TrendingUp, TrendingDown, Lock, Unlock, Timer, DollarSign,
  AlertCircle, CheckCircle2, XCircle, Loader2, ChevronDown,
  History, BarChart3, Flame, ArrowLeft, Volume2,
} from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useDriftStore } from '../stores/useDriftStore';
import { usePredictionStore, type PredictionRound, type BetDirection } from '../stores/usePredictionStore';
import { AssetIcon } from '../components/icons/AssetIcon';
import { toast } from 'sonner';

/* ─── Constants ──────────────────────────────────── */
const ROUND_DURATION = 5 * 60; // 5 minutes in seconds

/* ─── Helpers ────────────────────────────────────── */
function formatTimer(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPrice(n: number): string {
  if (n === 0) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function formatUSD(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function priceDelta(close: number, lock: number): { value: string; positive: boolean } {
  const diff = close - lock;
  const prefix = diff >= 0 ? '+' : '';
  return {
    value: `${prefix}$${Math.abs(diff).toFixed(4)}`,
    positive: diff >= 0,
  };
}

/* ─── Timer hook ─────────────────────────────────── */
function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(targetMs - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(targetMs - Date.now());
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [targetMs]);

  return Math.max(0, remaining);
}

/* ═══════════════════════════════════════════════════
   ROUND CARD — The core visual element
   ═══════════════════════════════════════════════════ */

interface RoundCardProps {
  round: PredictionRound;
  currentPrice: number;
  wallet: string | null;
  onBet: (roundId: number, direction: BetDirection, amount: number) => void;
  onClaim: (roundId: number) => void;
  isCurrentLive: boolean;
}

const RoundCard: React.FC<RoundCardProps> = ({ round, currentPrice, wallet, onBet, onClaim, isCurrentLive }) => {
  const [betAmount, setBetAmount] = useState('');
  const [showBetPanel, setShowBetPanel] = useState<BetDirection | null>(null);
  const getPayoutRatio = usePredictionStore(s => s.getPayoutRatio);
  const getUserBetForRound = usePredictionStore(s => s.getUserBetForRound);
  const getUserWinnings = usePredictionStore(s => s.getUserWinnings);

  const upPayout = getPayoutRatio(round.id, 'up');
  const downPayout = getPayoutRatio(round.id, 'down');
  const totalPool = round.totalUpAmount + round.totalDownAmount;
  const userBet = wallet ? getUserBetForRound(round.id, wallet) : undefined;
  const userWinnings = wallet ? getUserWinnings(round.id, wallet) : 0;
  const userWon = round.status === 'expired' && round.result && userBet?.direction === round.result;
  const userLost = round.status === 'expired' && round.result && userBet && userBet.direction !== round.result;

  const liveDelta = round.status === 'live' && round.lockPrice > 0
    ? priceDelta(currentPrice, round.lockPrice)
    : null;

  const expiredDelta = round.status === 'expired' && round.lockPrice > 0
    ? priceDelta(round.closePrice, round.lockPrice)
    : null;

  const handleSubmitBet = (dir: BetDirection) => {
    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid bet amount');
      return;
    }
    onBet(round.id, dir, amt);
    setBetAmount('');
    setShowBetPanel(null);
  };

  // Status badge
  const statusConfig = {
    expired: { label: 'Expired', bg: 'bg-drift-surface', text: 'text-txt-3', icon: CheckCircle2 },
    live: { label: 'LIVE', bg: 'bg-accent/20', text: 'text-accent', icon: Flame },
    next: { label: 'Next', bg: 'bg-yellow/20', text: 'text-yellow', icon: Timer },
    later: { label: 'Later', bg: 'bg-drift-surface', text: 'text-txt-3', icon: Clock },
    canceled: { label: 'Canceled', bg: 'bg-bear/20', text: 'text-bear', icon: XCircle },
  }[round.status];
  const StatusIcon = statusConfig.icon;

  // Card border color
  const borderColor = round.status === 'live' ? 'border-accent/50 shadow-[0_0_20px_rgba(116,92,216,0.15)]'
    : round.status === 'next' ? 'border-yellow/40'
    : 'border-drift-border';

  return (
    <div className={`w-[300px] shrink-0 rounded-xl border ${borderColor} bg-drift-panel overflow-hidden transition-all duration-300 snap-center`}>
      {/* Status header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-drift-border">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.text}`} />
          <span className={`text-[12px] font-semibold ${statusConfig.text}`}>{statusConfig.label}</span>
        </div>
        <span className="text-[11px] text-txt-3 font-mono">#{round.id}</span>
      </div>

      {/* ── UP Section ── */}
      <div className={`px-4 py-3 flex items-center justify-between transition-colors ${
        round.status === 'expired' && round.result === 'up' ? 'bg-bull/10' : ''
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
            round.status === 'expired' && round.result === 'up' ? 'bg-bull' : 'bg-bull/20'
          }`}>
            <ArrowUp className={`w-4 h-4 ${round.result === 'up' ? 'text-white' : 'text-bull'}`} />
          </div>
          <span className="text-[13px] font-semibold text-txt-0">UP</span>
          {userBet?.direction === 'up' && (
            <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold">ENTERED</span>
          )}
        </div>
        <span className={`text-[13px] font-mono font-semibold ${upPayout > 0 ? 'text-bull' : 'text-txt-3'}`}>
          {upPayout > 0 ? `${upPayout.toFixed(2)}x` : '0x'} <span className="text-[10px] text-txt-3 font-normal">Payout</span>
        </span>
      </div>

      {/* ── Price info section (center) ── */}
      <div className="px-4 py-3 bg-drift-surface/50 border-y border-drift-border space-y-2">
        {round.status === 'live' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3 uppercase tracking-wider">Last Price</span>
              {liveDelta && (
                <span className={`text-[11px] font-mono font-semibold ${liveDelta.positive ? 'text-bull' : 'text-bear'}`}>
                  {liveDelta.value}
                </span>
              )}
            </div>
            <div className={`text-[22px] font-bold font-mono tabular-nums ${
              liveDelta?.positive ? 'text-bull' : liveDelta && !liveDelta.positive ? 'text-bear' : 'text-txt-0'
            }`}>
              {formatPrice(currentPrice)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3">Locked Price:</span>
              <span className="text-[11px] text-txt-1 font-mono">{formatPrice(round.lockPrice)}</span>
            </div>
          </>
        )}

        {round.status === 'expired' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3 uppercase tracking-wider">Closed Price</span>
              {expiredDelta && (
                <span className={`text-[11px] font-mono font-semibold ${expiredDelta.positive ? 'text-bull' : 'text-bear'}`}>
                  {expiredDelta.value}
                </span>
              )}
            </div>
            <div className={`text-[18px] font-bold font-mono tabular-nums ${
              round.result === 'up' ? 'text-bull' : round.result === 'down' ? 'text-bear' : 'text-txt-0'
            }`}>
              {formatPrice(round.closePrice)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-txt-3">Locked Price:</span>
              <span className="text-[11px] text-txt-1 font-mono">{formatPrice(round.lockPrice)}</span>
            </div>
          </>
        )}

        {round.status === 'next' && (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Lock className="w-3.5 h-3.5 text-yellow" />
              <span className="text-[11px] text-yellow font-medium">Accepting Entries</span>
            </div>
            <span className="text-[10px] text-txt-3">Price locks when round goes live</span>
          </div>
        )}

        {round.status === 'later' && (
          <div className="text-center py-3">
            <Clock className="w-5 h-5 text-txt-3 mx-auto mb-1" />
            <span className="text-[11px] text-txt-3">Entry starts soon</span>
          </div>
        )}

        {/* Prize pool */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-txt-3">Prize Pool:</span>
          <span className="text-[11px] text-txt-0 font-mono font-medium">
            {totalPool > 0 ? `${totalPool.toFixed(2)} USDC` : '<0.01 USDC'}
          </span>
        </div>
      </div>

      {/* ── DOWN Section ── */}
      <div className={`px-4 py-3 flex items-center justify-between transition-colors ${
        round.status === 'expired' && round.result === 'down' ? 'bg-bear/10' : ''
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
            round.status === 'expired' && round.result === 'down' ? 'bg-bear' : 'bg-bear/20'
          }`}>
            <ArrowDown className={`w-4 h-4 ${round.result === 'down' ? 'text-white' : 'text-bear'}`} />
          </div>
          <span className="text-[13px] font-semibold text-txt-0">DOWN</span>
          {userBet?.direction === 'down' && (
            <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold">ENTERED</span>
          )}
        </div>
        <span className={`text-[13px] font-mono font-semibold ${downPayout > 0 ? 'text-bear' : 'text-txt-3'}`}>
          {downPayout > 0 ? `${downPayout.toFixed(2)}x` : '0x'} <span className="text-[10px] text-txt-3 font-normal">Payout</span>
        </span>
      </div>

      {/* ── Action area ── */}
      {round.status === 'next' && !userBet && (
        <div className="px-4 py-3 border-t border-drift-border space-y-2">
          {!showBetPanel ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowBetPanel('up')}
                className="flex-1 py-2.5 rounded-lg bg-bull/20 hover:bg-bull/30 text-bull font-semibold text-[13px] transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-4 h-4" /> Enter UP
              </button>
              <button
                onClick={() => setShowBetPanel('down')}
                className="flex-1 py-2.5 rounded-lg bg-bear/20 hover:bg-bear/30 text-bear font-semibold text-[13px] transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowDown className="w-4 h-4" /> Enter DOWN
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[12px] font-semibold ${showBetPanel === 'up' ? 'text-bull' : 'text-bear'}`}>
                  {showBetPanel === 'up' ? '↑ Enter UP' : '↓ Enter DOWN'}
                </span>
                <button onClick={() => setShowBetPanel(null)} className="text-[11px] text-txt-3 hover:text-txt-0">Cancel</button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-drift-surface border border-drift-border rounded-lg text-[13px] text-txt-0 font-mono outline-none focus:border-accent/50 transition-colors pr-14"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitBet(showBetPanel); }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-txt-3 font-medium">USDC</span>
                </div>
              </div>
              {/* Quick amounts */}
              <div className="flex gap-1.5">
                {[5, 10, 25, 50, 100].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setBetAmount(amt.toString())}
                    className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
                      betAmount === amt.toString()
                        ? 'bg-accent/20 text-accent'
                        : 'bg-drift-surface text-txt-2 hover:text-txt-0'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleSubmitBet(showBetPanel)}
                disabled={!betAmount || parseFloat(betAmount) <= 0}
                className={`w-full py-2.5 rounded-lg font-semibold text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white ${
                  showBetPanel === 'up'
                    ? 'bg-bull hover:bg-bull/80'
                    : 'bg-bear hover:bg-bear/80'
                }`}
              >
                {!wallet ? 'Connect Wallet' : `Confirm ${showBetPanel === 'up' ? 'UP' : 'DOWN'}`}
              </button>
              <p className="text-[9px] text-txt-3 text-center">You won't be able to change your position once entered.</p>
            </div>
          )}
        </div>
      )}

      {/* User bet entered indicator */}
      {round.status === 'next' && userBet && (
        <div className="px-4 py-3 border-t border-drift-border">
          <div className="flex items-center gap-2 text-[12px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
            <span className="text-accent font-medium">
              Entered {userBet.direction.toUpperCase()} — {formatUSD(userBet.amount)}
            </span>
          </div>
        </div>
      )}

      {/* Claim winnings for expired rounds */}
      {round.status === 'expired' && userBet && userWon && !userBet.claimed && (
        <div className="px-4 py-3 border-t border-drift-border">
          <button
            onClick={() => onClaim(round.id)}
            className="w-full py-2.5 rounded-lg bg-bull hover:bg-bull/80 text-white font-semibold text-[13px] transition-colors flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4" />
            Collect Winnings ({formatUSD(userWinnings)})
          </button>
        </div>
      )}

      {/* Lost indicator */}
      {round.status === 'expired' && userLost && (
        <div className="px-4 py-3 border-t border-drift-border">
          <div className="flex items-center gap-2 text-[12px] text-bear">
            <XCircle className="w-3.5 h-3.5" />
            <span className="font-medium">Round lost — {formatUSD(userBet!.amount)}</span>
          </div>
        </div>
      )}

      {/* Claimed indicator */}
      {round.status === 'expired' && userBet?.claimed && (
        <div className="px-4 py-3 border-t border-drift-border">
          <div className="flex items-center gap-2 text-[12px] text-bull">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-medium">Won & Claimed {formatUSD(userWinnings)}</span>
          </div>
        </div>
      )}
    </div>
  );
};


/* ═══════════════════════════════════════════════════
   PREDICTION PAGE — Main component
   ═══════════════════════════════════════════════════ */

interface PredictionPageProps {
  onBack?: () => void;
}

export const PredictionPage: React.FC<PredictionPageProps> = ({ onBack }) => {
  const { publicKey, connected } = useWallet();
  const walletStr = publicKey?.toBase58() ?? null;

  // Oracle price
  const oraclePrice = useDriftStore(s => s.oraclePrice);

  // Prediction store
  const {
    rounds, currentRoundId, timeRemainingMs,
    initializeRounds, advanceRound, placeBet, claimWinnings,
    setTimeRemaining, setUserWallet, feePercent,
  } = usePredictionStore();

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [livePrice, setLivePrice] = useState(0);

  // Fetch live price from Binance for smoother updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/solusdt@trade');
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLivePrice(parseFloat(data.p));
        } catch {}
      };
    } catch {}
    return () => { ws?.close(); };
  }, []);

  const displayPrice = livePrice > 0 ? livePrice : oraclePrice;

  // Set wallet
  useEffect(() => { setUserWallet(walletStr); }, [walletStr]);

  // Initialize rounds
  useEffect(() => {
    if (displayPrice > 0 && !initialized.current) {
      initializeRounds(displayPrice);
      initialized.current = true;
    }
  }, [displayPrice]);

  // Timer tick — advance rounds every 5 minutes
  useEffect(() => {
    if (rounds.length === 0) return;

    const liveRound = rounds.find(r => r.status === 'live');
    if (!liveRound) return;

    const iv = setInterval(() => {
      const remaining = liveRound.closeTimestamp - Date.now();
      setTimeRemaining(remaining);

      if (remaining <= 0 && displayPrice > 0) {
        advanceRound(displayPrice);
      }
    }, 1000);

    return () => clearInterval(iv);
  }, [rounds, displayPrice]);

  // Auto-scroll to live round on init
  useEffect(() => {
    if (rounds.length > 0 && scrollRef.current) {
      const liveIdx = rounds.findIndex(r => r.status === 'live');
      if (liveIdx >= 0) {
        const cardWidth = 316; // 300px card + 16px gap
        const containerWidth = scrollRef.current.offsetWidth;
        const scrollTo = liveIdx * cardWidth - containerWidth / 2 + cardWidth / 2;
        scrollRef.current.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
      }
    }
  }, [rounds.length > 0]);

  // Scroll helpers
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  // Handlers
  const handleBet = useCallback((roundId: number, direction: BetDirection, amount: number) => {
    if (!walletStr) {
      toast.error('Connect your wallet first');
      return;
    }
    const success = placeBet(direction, amount, walletStr);
    if (success) {
      toast.success(`Entered ${direction.toUpperCase()} with ${formatUSD(amount)}`);
    } else {
      toast.error('Failed to place bet — you may have already entered this round');
    }
  }, [walletStr, placeBet]);

  const handleClaim = useCallback((roundId: number) => {
    if (!walletStr) return;
    const payout = claimWinnings(roundId, walletStr);
    if (payout > 0) {
      toast.success(`Collected ${formatUSD(payout)} winnings!`);
    }
  }, [walletStr, claimWinnings]);

  // Stats
  const userBets = usePredictionStore(s => s.userBets);
  const totalBet = userBets.reduce((sum, b) => sum + b.amount, 0);
  const wonBets = userBets.filter(b => {
    const r = rounds.find(rr => rr.id === b.roundId);
    return r?.result === b.direction;
  });
  const winRate = userBets.length > 0 ? (wonBets.length / userBets.length * 100) : 0;

  const liveRound = rounds.find(r => r.status === 'live');
  const nextRound = rounds.find(r => r.status === 'next');

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-hidden">
      {/* ─── Top bar ─── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-drift-border bg-drift-panel">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-txt-3 hover:text-txt-0 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-bull flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[16px] font-bold text-txt-0">Prediction</h1>
                <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-semibold">BETA</span>
              </div>
              <span className="text-[10px] text-txt-3">Predict SOL price — win from the pool</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Live SOL price */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-drift-surface border border-drift-border">
            <AssetIcon asset="SOL" size={18} />
            <span className="text-[14px] font-semibold text-txt-0 font-mono tabular-nums">
              {displayPrice > 0 ? `$${displayPrice.toFixed(2)}` : '—'}
            </span>
            <span className="text-[10px] text-txt-3">SOL/USD</span>
          </div>

          {/* Timer for current round */}
          {liveRound && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[14px] font-bold text-accent font-mono tabular-nums">
                {formatTimer(timeRemainingMs)}
              </span>
              <span className="text-[10px] text-accent/70">5m</span>
            </div>
          )}

          {/* History toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-accent/20 text-accent' : 'bg-drift-surface text-txt-2 hover:text-txt-0'}`}
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── How it works banner (collapsible) ─── */}
      <HowItWorks />

      {/* ─── Round cards carousel ─── */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Scroll arrows */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-drift-panel/90 border border-drift-border flex items-center justify-center text-txt-1 hover:text-txt-0 hover:bg-drift-surface transition-colors shadow-lg backdrop-blur-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-drift-panel/90 border border-drift-border flex items-center justify-center text-txt-1 hover:text-txt-0 hover:bg-drift-surface transition-colors shadow-lg backdrop-blur-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex-1 flex items-center gap-4 px-16 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}
        >
          {rounds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-txt-3 mx-auto mb-3 animate-spin" />
                <span className="text-[13px] text-txt-2">Waiting for oracle price...</span>
              </div>
            </div>
          ) : (
            rounds.map(round => (
              <RoundCard
                key={round.id}
                round={round}
                currentPrice={displayPrice}
                wallet={walletStr}
                onBet={handleBet}
                onClaim={handleClaim}
                isCurrentLive={round.id === currentRoundId}
              />
            ))
          )}
        </div>
      </div>

      {/* ─── Bottom section: Stats + History ─── */}
      <div className="shrink-0 border-t border-drift-border bg-drift-panel">
        {showHistory ? (
          <BetHistory rounds={rounds} wallet={walletStr} />
        ) : (
          <div className="flex items-center justify-between px-6 py-3">
            {/* Stats */}
            <div className="flex items-center gap-8">
              <StatBlock label="Rounds Played" value={userBets.length > 0 ? `${new Set(userBets.map(b => b.roundId)).size}` : '0'} />
              <StatBlock label="Total Bet" value={totalBet > 0 ? formatUSD(totalBet) : '$0'} />
              <StatBlock label="Win Rate" value={`${winRate.toFixed(0)}%`} color={winRate >= 50 ? 'text-bull' : winRate > 0 ? 'text-bear' : undefined} />
              <StatBlock label="Net Result" value={(() => {
                const total = wonBets.reduce((sum, b) => {
                  const r = rounds.find(rr => rr.id === b.roundId);
                  if (!r) return sum;
                  const pool = r.totalUpAmount + r.totalDownAmount;
                  const winPool = b.direction === 'up' ? r.totalUpAmount : r.totalDownAmount;
                  return sum + (winPool > 0 ? (b.amount / winPool) * pool * 0.97 : 0);
                }, 0);
                const net = total - totalBet;
                return net >= 0 ? `+${formatUSD(net)}` : `-${formatUSD(Math.abs(net))}`;
              })()} color="text-accent" />
            </div>

            {/* Fee info */}
            <div className="hidden md:flex items-center gap-4">
              <div className="text-[10px] text-txt-3">
                <span className="text-txt-2">{feePercent}% fee</span> per round
              </div>
              <div className="flex items-center gap-1 text-[10px] text-txt-3">
                <Clock className="w-3 h-3" />
                5 min rounds
              </div>
              <a
                href="https://docs.pancakeswap.finance/products/prediction"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-accent hover:underline"
              >
                How it works →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── How It Works Banner ────────────────────────── */

const HowItWorks: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="shrink-0 border-b border-drift-border bg-drift-surface/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-txt-2 hover:text-txt-0 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-yellow" />
          <span className="font-medium">How Prediction works — quick guide</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-4 gap-3 text-[11px]">
          <Step num={1} title="Pick UP or DOWN" desc="Predict if SOL price will be higher or lower when the LIVE round ends." />
          <Step num={2} title="Place your bet" desc="Enter any USDC amount. Position locks once placed — no changes allowed." />
          <Step num={3} title="Wait for results" desc="Each round lasts 5 minutes. Live price from Binance oracle." />
          <Step num={4} title="Collect winnings" desc="Winners split the pool (minus 3% fee). Losers forfeit their bet." />
        </div>
      )}
    </div>
  );
};

const Step: React.FC<{ num: number; title: string; desc: string }> = ({ num, title, desc }) => (
  <div className="flex gap-2.5">
    <div className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold shrink-0">{num}</div>
    <div>
      <div className="text-txt-0 font-medium">{title}</div>
      <div className="text-txt-3 mt-0.5">{desc}</div>
    </div>
  </div>
);

/* ─── Bet History Table ──────────────────────────── */

const BetHistory: React.FC<{ rounds: PredictionRound[]; wallet: string | null }> = ({ rounds, wallet }) => {
  const userBets = usePredictionStore(s => s.userBets);
  const betsToShow = wallet ? userBets.filter(b => b.wallet === wallet).slice(-20).reverse() : [];

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {betsToShow.length === 0 ? (
        <div className="text-center py-6">
          <History className="w-6 h-6 text-txt-3 mx-auto mb-2" />
          <span className="text-[12px] text-txt-3">No prediction history yet. Place your first bet!</span>
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-drift-panel">
            <tr className="text-txt-3 border-b border-drift-border">
              <th className="text-left px-4 py-2 font-medium">Round</th>
              <th className="text-left px-2 py-2 font-medium">Direction</th>
              <th className="text-right px-2 py-2 font-medium">Amount</th>
              <th className="text-center px-2 py-2 font-medium">Result</th>
              <th className="text-right px-4 py-2 font-medium">Payout</th>
            </tr>
          </thead>
          <tbody>
            {betsToShow.map(bet => {
              const round = rounds.find(r => r.id === bet.roundId);
              const won = round?.result === bet.direction;
              const pending = !round?.result;
              const totalPool = round ? round.totalUpAmount + round.totalDownAmount : 0;
              const winPool = round ? (bet.direction === 'up' ? round.totalUpAmount : round.totalDownAmount) : 0;
              const payout = won && winPool > 0 ? (bet.amount / winPool) * totalPool * 0.97 : 0;

              return (
                <tr key={bet.id} className="border-b border-drift-border/50 hover:bg-drift-surface/30 transition-colors">
                  <td className="px-4 py-2 font-mono text-txt-1">#{bet.roundId}</td>
                  <td className="px-2 py-2">
                    <span className={`flex items-center gap-1 ${bet.direction === 'up' ? 'text-bull' : 'text-bear'}`}>
                      {bet.direction === 'up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {bet.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-txt-0">{formatUSD(bet.amount)}</td>
                  <td className="px-2 py-2 text-center">
                    {pending ? (
                      <span className="text-yellow">Pending</span>
                    ) : won ? (
                      <span className="text-bull flex items-center justify-center gap-1"><Trophy className="w-3 h-3" />Won</span>
                    ) : (
                      <span className="text-bear">Lost</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {pending ? '—' : won ? <span className="text-bull">+{formatUSD(payout)}</span> : <span className="text-bear">-{formatUSD(bet.amount)}</span>}
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

/* ─── Stat Block ─────────────────────────────────── */

const StatBlock: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex flex-col">
    <span className="text-[10px] text-txt-3 uppercase tracking-wider">{label}</span>
    <span className={`text-[14px] font-semibold font-mono tabular-nums ${color ?? 'text-txt-0'}`}>{value}</span>
  </div>
);

export default PredictionPage;

/**
 * Prediction Market Store
 *
 * PancakeSwap-style prediction rounds for SOL/USD.
 * Each round is 5 minutes. Uses the live SOL oracle price from Value Exchange.
 *
 * Round lifecycle:
 *   1. NEXT     — Accepting bets (UP / DOWN)
 *   2. LIVE     — Price is moving, no more bets
 *   3. EXPIRED  — Round settled, winners can claim
 *   4. CANCELED — Oracle failure, bets refunded
 *
 * Payout mechanics (matching PancakeSwap exactly):
 *   - 3% fee on the total prize pool
 *   - Payout Ratio (UP)   = Total Pool / UP Pool
 *   - Payout Ratio (DOWN) = Total Pool / DOWN Pool
 *   - If Closed Price > Lock Price → UP wins
 *   - If Closed Price < Lock Price → DOWN wins
 *   - If Closed Price = Lock Price → House wins (all bets lost)
 */
import { create } from 'zustand';

/* ─── Types ─────────────────────────────────────── */

export type RoundStatus = 'next' | 'live' | 'expired' | 'canceled' | 'later';

export type BetDirection = 'up' | 'down';

export interface Bet {
  id: string;
  roundId: number;
  direction: BetDirection;
  amount: number;       // in USDC
  wallet: string;       // pubkey
  timestamp: number;    // unix ms
  claimed: boolean;
}

export interface PredictionRound {
  id: number;
  status: RoundStatus;
  lockPrice: number;      // SOL price when round started (locked)
  closePrice: number;     // SOL price when round ended
  lockTimestamp: number;   // unix ms
  closeTimestamp: number;  // unix ms
  totalUpAmount: number;
  totalDownAmount: number;
  bets: Bet[];
  result?: 'up' | 'down' | 'tie';
}

export interface PredictionState {
  /* ── Rounds ── */
  rounds: PredictionRound[];
  currentRoundId: number;
  epoch: number;              // ever-incrementing round counter

  /* ── Timing ── */
  roundDurationMs: number;    // 5 minutes = 300000
  nextRoundStartMs: number;   // when the next round locks
  timeRemainingMs: number;    // countdown for current live round
  isPaused: boolean;

  /* ── User ── */
  userBets: Bet[];            // all bets by connected wallet
  userWallet: string | null;
  balance: number;            // USDC balance available for betting

  /* ── Stats ── */
  totalBetVolume: number;
  totalRoundsPlayed: number;
  winRate: number;            // 0–100%

  /* ── Fee ── */
  feePercent: number;         // 3%

  /* ── Actions ── */
  initializeRounds: (currentPrice: number) => void;
  advanceRound: (currentPrice: number) => void;
  placeBet: (direction: BetDirection, amount: number, wallet: string) => boolean;
  claimWinnings: (roundId: number, wallet: string) => number;
  setTimeRemaining: (ms: number) => void;
  setUserWallet: (wallet: string | null) => void;
  setBalance: (balance: number) => void;
  getRound: (roundId: number) => PredictionRound | undefined;
  getPayoutRatio: (roundId: number, direction: BetDirection) => number;
  getUserBetForRound: (roundId: number, wallet: string) => Bet | undefined;
  getUserWinnings: (roundId: number, wallet: string) => number;
  reset: () => void;
}

/* ─── Constants ──────────────────────────────────── */

const ROUND_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const FEE_PERCENT = 3;
const STORAGE_KEY = 'value_prediction_state';

/* ─── Persistence helpers ────────────────────────── */

function saveState(rounds: PredictionRound[], epoch: number, userBets: Bet[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      rounds: rounds.slice(-20), // keep last 20 rounds
      epoch,
      userBets: userBets.slice(-100),
      savedAt: Date.now(),
    }));
  } catch {}
}

function loadState(): { rounds: PredictionRound[]; epoch: number; userBets: Bet[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Discard if older than 1 hour
    if (Date.now() - data.savedAt > 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

/* ─── Round factory ──────────────────────────────── */

function createRound(id: number, status: RoundStatus, lockTimestamp: number): PredictionRound {
  return {
    id,
    status,
    lockPrice: 0,
    closePrice: 0,
    lockTimestamp,
    closeTimestamp: lockTimestamp + ROUND_DURATION_MS,
    totalUpAmount: 0,
    totalDownAmount: 0,
    bets: [],
  };
}

/* ─── Simulated market maker bets ────────────────── */
// Adds realistic-looking bot bets to make the prediction market feel active

function addSimulatedBets(round: PredictionRound): void {
  const botNames = [
    'Degen_Whale_69', 'SOLdier_Alpha', 'PumpMaster3k', 'OrbitTrader',
    'MoonBoi_Capital', 'LiqHunter', 'DriftMaxi', 'SolanaSteve',
    'CryptoNinja42', 'FastFillFred', 'ApeInAndy', 'DiamondPaws',
  ];

  // Random number of bets per round (3-8)
  const numBets = 3 + Math.floor(Math.random() * 6);
  
  for (let i = 0; i < numBets; i++) {
    const direction: BetDirection = Math.random() > 0.48 ? 'up' : 'down'; // slight UP bias
    // Random amounts: mostly small, occasional whale
    const isWhale = Math.random() < 0.15;
    const amount = isWhale
      ? Math.round((50 + Math.random() * 200) * 100) / 100
      : Math.round((2 + Math.random() * 25) * 100) / 100;

    const bot = botNames[Math.floor(Math.random() * botNames.length)];
    const bet: Bet = {
      id: `sim-${round.id}-${i}`,
      roundId: round.id,
      direction,
      amount,
      wallet: bot,
      timestamp: round.lockTimestamp - Math.floor(Math.random() * ROUND_DURATION_MS * 0.8),
      claimed: false,
    };

    round.bets.push(bet);
    if (direction === 'up') round.totalUpAmount += amount;
    else round.totalDownAmount += amount;
  }
}

/* ─── Store ──────────────────────────────────────── */

const saved = loadState();

export const usePredictionStore = create<PredictionState>((set, get) => ({
  rounds: saved?.rounds ?? [],
  currentRoundId: saved?.epoch ? saved.epoch - 1 : 0,
  epoch: saved?.epoch ?? 1,
  roundDurationMs: ROUND_DURATION_MS,
  nextRoundStartMs: 0,
  timeRemainingMs: 0,
  isPaused: false,
  userBets: saved?.userBets ?? [],
  userWallet: null,
  balance: 0,
  totalBetVolume: 0,
  totalRoundsPlayed: 0,
  winRate: 0,
  feePercent: FEE_PERCENT,

  initializeRounds: (currentPrice: number) => {
    const state = get();
    if (state.rounds.length > 0 && state.rounds.some(r => r.status === 'live' || r.status === 'next')) {
      return; // Already initialized
    }

    const now = Date.now();
    // Align to 5-min intervals
    const alignedNow = Math.floor(now / ROUND_DURATION_MS) * ROUND_DURATION_MS;
    const epoch = state.epoch || 1;

    // Create past expired rounds with simulated data
    const rounds: PredictionRound[] = [];
    for (let i = -5; i <= 2; i++) {
      const roundId = epoch + i + 5;
      const lockTs = alignedNow + i * ROUND_DURATION_MS;

      if (i < 0) {
        // Expired rounds — create with simulated prices
        const round = createRound(roundId, 'expired', lockTs);
        const priceVariation = (Math.random() - 0.5) * 4; // ±$2
        round.lockPrice = currentPrice + priceVariation;
        round.closePrice = round.lockPrice + (Math.random() - 0.48) * 3;
        round.result = round.closePrice > round.lockPrice ? 'up'
          : round.closePrice < round.lockPrice ? 'down' : 'tie';
        addSimulatedBets(round);
        rounds.push(round);
      } else if (i === 0) {
        // Live round
        const round = createRound(roundId, 'live', lockTs);
        round.lockPrice = currentPrice + (Math.random() - 0.5) * 1;
        addSimulatedBets(round);
        rounds.push(round);
      } else if (i === 1) {
        // Next round (accepting bets)
        const round = createRound(roundId, 'next', lockTs + ROUND_DURATION_MS);
        addSimulatedBets(round);
        rounds.push(round);
      } else {
        // Later rounds
        const round = createRound(roundId, 'later', lockTs + ROUND_DURATION_MS * 2);
        rounds.push(round);
      }
    }

    set({
      rounds,
      currentRoundId: rounds.find(r => r.status === 'live')?.id ?? epoch + 5,
      epoch: epoch + 10,
      nextRoundStartMs: alignedNow + ROUND_DURATION_MS,
      timeRemainingMs: (alignedNow + ROUND_DURATION_MS) - now,
    });
  },

  advanceRound: (currentPrice: number) => {
    const state = get();
    const now = Date.now();

    set((prev) => {
      const newRounds = prev.rounds.map(r => {
        if (r.status === 'live') {
          // Settle the live round
          return {
            ...r,
            status: 'expired' as RoundStatus,
            closePrice: currentPrice,
            closeTimestamp: now,
            result: currentPrice > r.lockPrice ? 'up' as const
              : currentPrice < r.lockPrice ? 'down' as const
              : 'tie' as const,
          };
        }
        if (r.status === 'next') {
          // Next becomes live
          const liveRound = {
            ...r,
            status: 'live' as RoundStatus,
            lockPrice: currentPrice,
            lockTimestamp: now,
            closeTimestamp: now + ROUND_DURATION_MS,
          };
          return liveRound;
        }
        if (r.status === 'later') {
          // First 'later' becomes 'next'
          return {
            ...r, 
            status: 'next' as RoundStatus,
            lockTimestamp: now + ROUND_DURATION_MS,
            closeTimestamp: now + ROUND_DURATION_MS * 2,
          };
        }
        return r;
      });

      // Add a new 'later' round
      const newId = prev.epoch + 1;
      const laterRound = createRound(newId, 'later', now + ROUND_DURATION_MS * 2);

      const updatedRounds = [...newRounds, laterRound].slice(-15); // Keep 15 rounds max
      const newCurrentId = updatedRounds.find(r => r.status === 'live')?.id ?? prev.currentRoundId;

      // Add simulated bets to the new 'next' round
      const nextRound = updatedRounds.find(r => r.status === 'next');
      if (nextRound && nextRound.bets.length === 0) {
        addSimulatedBets(nextRound);
      }

      saveState(updatedRounds, prev.epoch + 1, prev.userBets);

      return {
        rounds: updatedRounds,
        currentRoundId: newCurrentId,
        epoch: prev.epoch + 1,
        nextRoundStartMs: now + ROUND_DURATION_MS,
        timeRemainingMs: ROUND_DURATION_MS,
      };
    });
  },

  placeBet: (direction: BetDirection, amount: number, wallet: string) => {
    const state = get();
    const nextRound = state.rounds.find(r => r.status === 'next');
    if (!nextRound) return false;
    if (amount <= 0) return false;

    // Check if user already bet on this round
    const existing = nextRound.bets.find(b => b.wallet === wallet && !b.id.startsWith('sim-'));
    if (existing) return false; // Already bet

    const bet: Bet = {
      id: `bet-${nextRound.id}-${wallet}-${Date.now()}`,
      roundId: nextRound.id,
      direction,
      amount,
      wallet,
      timestamp: Date.now(),
      claimed: false,
    };

    set((prev) => {
      const updatedRounds = prev.rounds.map(r => {
        if (r.id === nextRound.id) {
          return {
            ...r,
            bets: [...r.bets, bet],
            totalUpAmount: direction === 'up' ? r.totalUpAmount + amount : r.totalUpAmount,
            totalDownAmount: direction === 'down' ? r.totalDownAmount + amount : r.totalDownAmount,
          };
        }
        return r;
      });

      const newUserBets = [...prev.userBets, bet];
      saveState(updatedRounds, prev.epoch, newUserBets);

      return { rounds: updatedRounds, userBets: newUserBets };
    });

    return true;
  },

  claimWinnings: (roundId: number, wallet: string) => {
    const state = get();
    const round = state.rounds.find(r => r.id === roundId);
    if (!round || round.status !== 'expired') return 0;

    const userBet = round.bets.find(b => b.wallet === wallet && !b.claimed && !b.id.startsWith('sim-'));
    if (!userBet) return 0;

    // Check if user won
    if (!round.result || round.result === 'tie') return 0;
    if (userBet.direction !== round.result) return 0;

    const totalPool = round.totalUpAmount + round.totalDownAmount;
    const winningPool = round.result === 'up' ? round.totalUpAmount : round.totalDownAmount;
    if (winningPool === 0) return 0;

    const poolAfterFee = totalPool * (1 - FEE_PERCENT / 100);
    const payout = (userBet.amount / winningPool) * poolAfterFee;

    // Mark as claimed
    set((prev) => {
      const updatedRounds = prev.rounds.map(r => {
        if (r.id === roundId) {
          return {
            ...r,
            bets: r.bets.map(b => b.id === userBet.id ? { ...b, claimed: true } : b),
          };
        }
        return r;
      });
      const updatedUserBets = prev.userBets.map(b => b.id === userBet.id ? { ...b, claimed: true } : b);
      saveState(updatedRounds, prev.epoch, updatedUserBets);
      return { rounds: updatedRounds, userBets: updatedUserBets };
    });

    return payout;
  },

  setTimeRemaining: (ms: number) => set({ timeRemainingMs: Math.max(0, ms) }),
  setUserWallet: (wallet) => set({ userWallet: wallet }),
  setBalance: (balance) => set({ balance }),

  getRound: (roundId) => get().rounds.find(r => r.id === roundId),

  getPayoutRatio: (roundId, direction) => {
    const round = get().rounds.find(r => r.id === roundId);
    if (!round) return 0;
    const total = round.totalUpAmount + round.totalDownAmount;
    if (total === 0) return 0;
    const pool = direction === 'up' ? round.totalUpAmount : round.totalDownAmount;
    if (pool === 0) return 0;
    return total / pool;
  },

  getUserBetForRound: (roundId, wallet) => {
    return get().userBets.find(b => b.roundId === roundId && b.wallet === wallet);
  },

  getUserWinnings: (roundId, wallet) => {
    const round = get().rounds.find(r => r.id === roundId);
    if (!round || !round.result || round.result === 'tie') return 0;

    const userBet = get().userBets.find(b => b.roundId === roundId && b.wallet === wallet);
    if (!userBet || userBet.direction !== round.result) return 0;

    const totalPool = round.totalUpAmount + round.totalDownAmount;
    const winningPool = round.result === 'up' ? round.totalUpAmount : round.totalDownAmount;
    if (winningPool === 0) return 0;

    const poolAfterFee = totalPool * (1 - FEE_PERCENT / 100);
    return (userBet.amount / winningPool) * poolAfterFee;
  },

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      rounds: [],
      currentRoundId: 0,
      epoch: 1,
      nextRoundStartMs: 0,
      timeRemainingMs: 0,
      userBets: [],
    });
  },
}));

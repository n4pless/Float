/**
 * Prediction Market Store — Simple 2x Payout Model
 *
 * Each round is 5 minutes. Uses live SOL oracle price.
 *
 * Payout model (simple — no prize pools):
 *   - You bet X USDC on UP or DOWN
 *   - If correct: you get 1.95x back (2x minus 2.5% fee)
 *   - If wrong: you lose your bet
 *   - Tie (exact same price): full refund
 */
import { create } from 'zustand';

/* ─── Types ─────────────────────────────────────── */

export type RoundStatus = 'next' | 'live' | 'expired' | 'canceled' | 'later';
export type BetDirection = 'up' | 'down';

export interface Bet {
  id: string;
  roundId: number;
  direction: BetDirection;
  amount: number;
  wallet: string;
  timestamp: number;
  claimed: boolean;
  payout: number; // set after round expires
}

export interface PredictionRound {
  id: number;
  status: RoundStatus;
  lockPrice: number;
  closePrice: number;
  lockTimestamp: number;
  closeTimestamp: number;
  bets: Bet[];
  result?: 'up' | 'down' | 'tie';
  totalUp: number;   // count of UP participants
  totalDown: number;  // count of DOWN participants
}

export interface PredictionState {
  rounds: PredictionRound[];
  currentRoundId: number;
  epoch: number;
  roundDurationMs: number;
  timeRemainingMs: number;
  userBets: Bet[];
  userWallet: string | null;

  initializeRounds: (currentPrice: number) => void;
  advanceRound: (currentPrice: number) => void;
  placeBet: (direction: BetDirection, amount: number, wallet: string) => boolean;
  claimWinnings: (roundId: number, wallet: string) => number;
  setTimeRemaining: (ms: number) => void;
  setUserWallet: (wallet: string | null) => void;
  getUserBetForRound: (roundId: number, wallet: string) => Bet | undefined;
  reset: () => void;
}

/* ─── Constants ──────────────────────────────────── */

const ROUND_DURATION_MS = 5 * 60 * 1000;
export const PAYOUT_MULTIPLIER = 1.95; // 2x minus 2.5% fee
const STORAGE_KEY = 'value_prediction_v2';

/* ─── Persistence ────────────────────────────────── */

function saveState(rounds: PredictionRound[], epoch: number, userBets: Bet[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      rounds: rounds.slice(-20),
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
    if (Date.now() - data.savedAt > 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

/* ─── Round factory ──────────────────────────────── */

function createRound(id: number, status: RoundStatus, lockTimestamp: number): PredictionRound {
  return {
    id, status,
    lockPrice: 0, closePrice: 0,
    lockTimestamp,
    closeTimestamp: lockTimestamp + ROUND_DURATION_MS,
    bets: [],
    totalUp: 0, totalDown: 0,
  };
}

/* ─── Simulated participant counts ───────────────── */

function addSimulatedActivity(round: PredictionRound): void {
  round.totalUp = 3 + Math.floor(Math.random() * 15);
  round.totalDown = 3 + Math.floor(Math.random() * 15);
}

/* ─── Store ──────────────────────────────────────── */

const saved = loadState();

export const usePredictionStore = create<PredictionState>((set, get) => ({
  rounds: saved?.rounds ?? [],
  currentRoundId: saved?.epoch ? saved.epoch - 1 : 0,
  epoch: saved?.epoch ?? 1,
  roundDurationMs: ROUND_DURATION_MS,
  timeRemainingMs: 0,
  userBets: saved?.userBets ?? [],
  userWallet: null,

  initializeRounds: (currentPrice: number) => {
    const state = get();
    if (state.rounds.length > 0 && state.rounds.some(r => r.status === 'live' || r.status === 'next')) {
      return;
    }

    const now = Date.now();
    const alignedNow = Math.floor(now / ROUND_DURATION_MS) * ROUND_DURATION_MS;
    const epoch = state.epoch || 1;

    const rounds: PredictionRound[] = [];
    for (let i = -5; i <= 2; i++) {
      const roundId = epoch + i + 5;
      const lockTs = alignedNow + i * ROUND_DURATION_MS;

      if (i < 0) {
        const round = createRound(roundId, 'expired', lockTs);
        const variation = (Math.random() - 0.5) * 4;
        round.lockPrice = currentPrice + variation;
        round.closePrice = round.lockPrice + (Math.random() - 0.48) * 3;
        round.result = round.closePrice > round.lockPrice ? 'up'
          : round.closePrice < round.lockPrice ? 'down' : 'tie';
        addSimulatedActivity(round);
        rounds.push(round);
      } else if (i === 0) {
        const round = createRound(roundId, 'live', lockTs);
        round.lockPrice = currentPrice + (Math.random() - 0.5) * 1;
        addSimulatedActivity(round);
        rounds.push(round);
      } else if (i === 1) {
        const round = createRound(roundId, 'next', lockTs + ROUND_DURATION_MS);
        addSimulatedActivity(round);
        rounds.push(round);
      } else {
        const round = createRound(roundId, 'later', lockTs + ROUND_DURATION_MS * 2);
        rounds.push(round);
      }
    }

    set({
      rounds,
      currentRoundId: rounds.find(r => r.status === 'live')?.id ?? epoch + 5,
      epoch: epoch + 10,
      timeRemainingMs: (alignedNow + ROUND_DURATION_MS) - now,
    });
  },

  advanceRound: (currentPrice: number) => {
    const now = Date.now();

    set((prev) => {
      const newRounds = prev.rounds.map(r => {
        if (r.status === 'live') {
          const result = currentPrice > r.lockPrice ? 'up' as const
            : currentPrice < r.lockPrice ? 'down' as const
            : 'tie' as const;
          const bets = r.bets.map(b => ({
            ...b,
            payout: result === 'tie' ? b.amount
              : b.direction === result ? b.amount * PAYOUT_MULTIPLIER
              : 0,
          }));
          return { ...r, status: 'expired' as RoundStatus, closePrice: currentPrice, closeTimestamp: now, result, bets };
        }
        if (r.status === 'next') {
          return { ...r, status: 'live' as RoundStatus, lockPrice: currentPrice, lockTimestamp: now, closeTimestamp: now + ROUND_DURATION_MS };
        }
        if (r.status === 'later') {
          return { ...r, status: 'next' as RoundStatus, lockTimestamp: now + ROUND_DURATION_MS, closeTimestamp: now + ROUND_DURATION_MS * 2 };
        }
        return r;
      });

      const laterRound = createRound(prev.epoch + 1, 'later', now + ROUND_DURATION_MS * 2);
      const updatedRounds = [...newRounds, laterRound].slice(-15);

      const nextRound = updatedRounds.find(r => r.status === 'next');
      if (nextRound && nextRound.totalUp === 0 && nextRound.totalDown === 0) {
        addSimulatedActivity(nextRound);
      }

      const updatedUserBets = prev.userBets.map(ub => {
        const round = updatedRounds.find(r => r.id === ub.roundId);
        if (round?.status === 'expired' && ub.payout === 0 && !ub.claimed) {
          const result = round.result;
          if (result === 'tie') return { ...ub, payout: ub.amount };
          if (ub.direction === result) return { ...ub, payout: ub.amount * PAYOUT_MULTIPLIER };
        }
        return ub;
      });

      saveState(updatedRounds, prev.epoch + 1, updatedUserBets);

      return {
        rounds: updatedRounds,
        currentRoundId: updatedRounds.find(r => r.status === 'live')?.id ?? prev.currentRoundId,
        epoch: prev.epoch + 1,
        timeRemainingMs: ROUND_DURATION_MS,
        userBets: updatedUserBets,
      };
    });
  },

  placeBet: (direction: BetDirection, amount: number, wallet: string) => {
    const state = get();
    const nextRound = state.rounds.find(r => r.status === 'next');
    if (!nextRound || amount <= 0) return false;

    const existing = state.userBets.find(b => b.roundId === nextRound.id && b.wallet === wallet);
    if (existing) return false;

    const bet: Bet = {
      id: `bet-${nextRound.id}-${wallet}-${Date.now()}`,
      roundId: nextRound.id,
      direction, amount, wallet,
      timestamp: Date.now(),
      claimed: false,
      payout: 0,
    };

    set((prev) => {
      const updatedRounds = prev.rounds.map(r => {
        if (r.id === nextRound.id) {
          return {
            ...r,
            bets: [...r.bets, bet],
            totalUp: direction === 'up' ? r.totalUp + 1 : r.totalUp,
            totalDown: direction === 'down' ? r.totalDown + 1 : r.totalDown,
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
    const userBet = state.userBets.find(b => b.roundId === roundId && b.wallet === wallet && !b.claimed);
    if (!userBet || userBet.payout <= 0) return 0;

    const payout = userBet.payout;
    set((prev) => {
      const updatedUserBets = prev.userBets.map(b => b.id === userBet.id ? { ...b, claimed: true } : b);
      const updatedRounds = prev.rounds.map(r => {
        if (r.id === roundId) {
          return { ...r, bets: r.bets.map(b => b.id === userBet.id ? { ...b, claimed: true } : b) };
        }
        return r;
      });
      saveState(updatedRounds, prev.epoch, updatedUserBets);
      return { rounds: updatedRounds, userBets: updatedUserBets };
    });
    return payout;
  },

  setTimeRemaining: (ms: number) => set({ timeRemainingMs: Math.max(0, ms) }),
  setUserWallet: (wallet) => set({ userWallet: wallet }),

  getUserBetForRound: (roundId, wallet) => {
    return get().userBets.find(b => b.roundId === roundId && b.wallet === wallet);
  },

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ rounds: [], currentRoundId: 0, epoch: 1, timeRemainingMs: 0, userBets: [] });
  },
}));

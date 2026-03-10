/**
 * Prediction Market Store — On-chain Zustand store
 *
 * Polls the Solana prediction program for game state, rounds, and user bets.
 * Builds and sends transactions for bet / claim through the user's wallet.
 */
import { create } from 'zustand';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  fetchGame, fetchRounds, fetchUserBets, fetchRound,
  buildBetBullIx, buildBetBearIx, buildAddPositionIx, buildClaimIx,
  PRICE_PRECISION,
  type GameAccount,
  type RoundAccount,
  type UserBetAccount,
} from '../prediction/client';
import DRIFT_CONFIG from '../config';

/* ─── Display types used by the UI ───────────────── */

export type RoundStatus = 'expired' | 'live' | 'next' | 'later' | 'calculating';

export interface DisplayRound {
  epoch: number;
  status: RoundStatus;
  lockPrice: number;       // human-readable USD
  closePrice: number;
  lockTimestamp: number;    // unix seconds
  closeTimestamp: number;
  totalAmount: number;      // SOL (not lamports)
  bullAmount: number;
  bearAmount: number;
  rewardAmount: number;
  oracleCalled: boolean;
  result?: 'bull' | 'bear' | 'tie';
  payoutMultiplier?: number; // e.g. 2.5x for the winning side
}

export interface DisplayBet {
  epoch: number;
  amount: number;           // SOL
  position: 'bull' | 'bear';
  claimed: boolean;
  payout: number;           // SOL (computed)
}

/* ─── Store interface ────────────────────────────── */

interface PredictionStore {
  // Connection
  connection: Connection | null;
  setConnection: (c: Connection) => void;

  // On-chain state
  game: GameAccount | null;
  rounds: DisplayRound[];
  userBets: Map<number, DisplayBet>;  // epoch → bet
  loading: boolean;
  error: string | null;

  // Full history (all epochs)
  historyRounds: DisplayRound[];
  historyBets: DisplayBet[];
  historyLoading: boolean;

  // Live price (from Binance WS, not on-chain)
  livePrice: number;
  setLivePrice: (p: number) => void;

  // Timer
  timeRemainingMs: number;
  setTimeRemainingMs: (ms: number) => void;

  // Actions
  refresh: (wallet?: PublicKey) => Promise<void>;
  refreshHistory: (wallet: PublicKey) => Promise<void>;
  placeBet: (
    wallet: PublicKey,
    epoch: number,
    direction: 'bull' | 'bear',
    amountSol: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>,
  ) => Promise<string>;
  claimWinnings: (
    wallet: PublicKey,
    epoch: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>,
  ) => Promise<string>;
  addPosition: (
    wallet: PublicKey,
    epoch: number,
    amountSol: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>,
  ) => Promise<string>;
}

/* ─── Helpers ────────────────────────────────────── */

const LAMPORTS = 1_000_000_000;
const lamToSol = (l: number) => l / LAMPORTS;
const priceToUsd = (p: number) => p / PRICE_PRECISION;

function classifyRound(r: RoundAccount, game: GameAccount): RoundStatus {
  const nowSec = Math.floor(Date.now() / 1000);
  // The "live" round is the one that is locked (bets closed) and waiting to close
  // The "next" round is the latest epoch (accepting bets)
  // Expired rounds have oracleCalled = true

  if (r.oracleCalled) return 'expired';
  if (r.lockPrice > 0 && !r.oracleCalled) {
    // Locked but not yet closed = live
    return 'live';
  }
  if (r.epoch === game.currentEpoch) return 'next';
  if (r.epoch > game.currentEpoch) return 'later';
  // If lock price is 0 and epoch < currentEpoch, it's in limbo (shouldn't happen normally)
  return 'calculating';
}

function toDisplayRound(r: RoundAccount, game: GameAccount): DisplayRound {
  const status = classifyRound(r, game);
  const lockP = priceToUsd(r.lockPrice);
  const closeP = priceToUsd(r.closePrice);

  let result: 'bull' | 'bear' | 'tie' | undefined;
  let payoutMultiplier: number | undefined;

  if (r.oracleCalled) {
    // Determine result purely by price direction
    if (r.closePrice > r.lockPrice) {
      result = 'bull';
    } else if (r.closePrice < r.lockPrice) {
      result = 'bear';
    } else {
      result = 'tie';
    }
    // Payout multiplier only when both sides have bets (otherwise it's a refund round)
    if (r.bullAmount > 0 && r.bearAmount > 0) {
      if (result === 'bull' && r.bullAmount > 0) {
        payoutMultiplier = r.rewardAmount / r.bullAmount;
      } else if (result === 'bear' && r.bearAmount > 0) {
        payoutMultiplier = r.rewardAmount / r.bearAmount;
      }
    }
  }

  return {
    epoch: r.epoch,
    status,
    lockPrice: lockP,
    closePrice: closeP,
    lockTimestamp: r.lockTimestamp,
    closeTimestamp: r.closeTimestamp,
    totalAmount: lamToSol(r.totalAmount),
    bullAmount: lamToSol(r.bullAmount),
    bearAmount: lamToSol(r.bearAmount),
    rewardAmount: lamToSol(r.rewardAmount),
    oracleCalled: r.oracleCalled,
    result,
    payoutMultiplier,
  };
}

function computePayout(r: RoundAccount, b: UserBetAccount): number {
  if (!r.oracleCalled) return 0;

  const refund =
    r.lockPrice === r.closePrice ||
    r.bullAmount === 0 ||
    r.bearAmount === 0;

  if (refund) return lamToSol(b.amount);

  const bullsWin = r.closePrice > r.lockPrice;
  const userBull = b.position === 0;

  if (bullsWin !== userBull) return 0;

  const winTotal = bullsWin ? r.bullAmount : r.bearAmount;
  return lamToSol(Math.floor((b.amount * r.rewardAmount) / winTotal));
}

/* ─── Store ──────────────────────────────────────── */

export const usePredictionStore = create<PredictionStore>((set, get) => ({
  connection: null,
  setConnection: (c) => set({ connection: c }),

  game: null,
  rounds: [],
  userBets: new Map(),
  loading: false,
  error: null,

  historyRounds: [],
  historyBets: [],
  historyLoading: false,

  livePrice: 0,
  setLivePrice: (p) => set({ livePrice: p }),

  timeRemainingMs: 0,
  setTimeRemainingMs: (ms) => set({ timeRemainingMs: Math.max(0, ms) }),

  refresh: async (wallet?: PublicKey) => {
    const conn = get().connection;
    if (!conn) return;

    try {
      const game = await fetchGame(conn);
      if (!game || !game.genesisStart) {
        set({ game, rounds: [], loading: false, error: 'Game not initialized' });
        return;
      }

      // Determine which epochs to fetch (last 8 or fewer)
      const maxEpoch = game.currentEpoch;
      const minEpoch = Math.max(1, maxEpoch - 7);
      const epochs: number[] = [];
      for (let e = minEpoch; e <= maxEpoch; e++) epochs.push(e);

      const [roundMap, betMap] = await Promise.all([
        fetchRounds(conn, epochs),
        wallet ? fetchUserBets(conn, epochs, wallet) : Promise.resolve(new Map<number, UserBetAccount>()),
      ]);

      const displayRounds: DisplayRound[] = [];
      const displayBets = new Map<number, DisplayBet>();

      for (const ep of epochs) {
        const r = roundMap.get(ep);
        if (!r) continue;
        displayRounds.push(toDisplayRound(r, game));

        const b = betMap.get(ep);
        if (b) {
          displayBets.set(ep, {
            epoch: ep,
            amount: lamToSol(b.amount),
            position: b.position === 0 ? 'bull' : 'bear',
            claimed: b.claimed,
            payout: computePayout(r, b),
          });
        }
      }

      set({ game, rounds: displayRounds, userBets: displayBets, loading: false, error: null });
    } catch (err: any) {
      console.error('Prediction refresh error:', err);
      set({ error: err.message || 'Failed to fetch' });
    }
  },

  refreshHistory: async (wallet: PublicKey) => {
    const conn = get().connection;
    const game = get().game;
    if (!conn || !game || !game.genesisStart) return;

    set({ historyLoading: true });
    try {
      const maxEpoch = game.currentEpoch;
      // Fetch ALL epochs from 1..maxEpoch in batches of 100 (getMultipleAccountsInfo limit)
      const allEpochs: number[] = [];
      for (let e = 1; e <= maxEpoch; e++) allEpochs.push(e);

      const BATCH = 100;
      const roundMap = new Map<number, RoundAccount>();
      const betMap = new Map<number, UserBetAccount>();

      for (let i = 0; i < allEpochs.length; i += BATCH) {
        const batch = allEpochs.slice(i, i + BATCH);
        const [rounds, bets] = await Promise.all([
          fetchRounds(conn, batch),
          fetchUserBets(conn, batch, wallet),
        ]);
        rounds.forEach((v, k) => roundMap.set(k, v));
        bets.forEach((v, k) => betMap.set(k, v));
      }

      const historyRounds: DisplayRound[] = [];
      const historyBets: DisplayBet[] = [];

      for (const ep of allEpochs) {
        const r = roundMap.get(ep);
        if (!r) continue;
        const dr = toDisplayRound(r, game);
        historyRounds.push(dr);

        const b = betMap.get(ep);
        if (b) {
          historyBets.push({
            epoch: ep,
            amount: lamToSol(b.amount),
            position: b.position === 0 ? 'bull' : 'bear',
            claimed: b.claimed,
            payout: computePayout(r, b),
          });
        }
      }

      set({ historyRounds, historyBets, historyLoading: false });
    } catch (err: any) {
      console.error('History refresh error:', err);
      set({ historyLoading: false });
    }
  },

  placeBet: async (wallet, epoch, direction, amountSol, signTransaction) => {
    const conn = get().connection;
    if (!conn) throw new Error('No connection');

    const lamports = Math.round(amountSol * LAMPORTS);
    const ix = direction === 'bull'
      ? buildBetBullIx(wallet, epoch, lamports)
      : buildBetBearIx(wallet, epoch, lamports);

    const tx = new Transaction().add(ix);
    tx.feePayer = wallet;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    // Sign via wallet, then send through our own RPC connection
    const signed = await signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    // Refresh after bet
    await get().refresh(wallet);
    return sig;
  },

  claimWinnings: async (wallet, epoch, signTransaction) => {
    const conn = get().connection;
    if (!conn) throw new Error('No connection');

    const ix = buildClaimIx(wallet, epoch);
    const tx = new Transaction().add(ix);
    tx.feePayer = wallet;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    const signed = await signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    await get().refresh(wallet);
    return sig;
  },

  addPosition: async (wallet, epoch, amountSol, signTransaction) => {
    const conn = get().connection;
    if (!conn) throw new Error('No connection');

    const lamports = Math.round(amountSol * LAMPORTS);
    const ix = buildAddPositionIx(wallet, epoch, lamports);

    const tx = new Transaction().add(ix);
    tx.feePayer = wallet;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    const signed = await signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    await get().refresh(wallet);
    return sig;
  },
}));

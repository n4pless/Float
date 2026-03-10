/**
 * prediction/client.ts — Low-level on-chain interaction for the Prediction Market program.
 *
 * Provides PDA derivation, account deserialisation, and transaction instruction builders.
 * Uses @solana/web3.js directly (no Anchor dependency in the browser).
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
} from '@solana/web3.js';

/* ─── Program ID ─────────────────────────────────── */

export const PREDICTION_PROGRAM_ID = new PublicKey(
  'FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf',
);

/* ─── Price precision (same as keeper) ───────────── */

export const PRICE_PRECISION = 1_000_000;

/* ─── Discriminators (SHA-256 of Anchor names, first 8 bytes) ─── */

const DISC = {
  // Instructions
  bet_bull: new Uint8Array([7, 162, 183, 202, 139, 162, 235, 55]),
  bet_bear: new Uint8Array([185, 134, 109, 63, 188, 166, 162, 105]),
  add_position: new Uint8Array([87, 116, 106, 156, 24, 216, 38, 243]),
  claim:    new Uint8Array([62, 198, 214, 193, 213, 159, 108, 210]),
  pause:    new Uint8Array([211, 22, 221, 251, 74, 121, 193, 47]),
  unpause:  new Uint8Array([169, 144, 4, 38, 10, 141, 188, 255]),
  // Accounts
  Game:     new Uint8Array([27, 90, 166, 125, 74, 100, 121, 18]),
  Round:    new Uint8Array([87, 127, 165, 51, 73, 78, 116, 174]),
  UserBet:  new Uint8Array([180, 131, 8, 241, 60, 243, 46, 63]),
};

/* ─── PDA derivation ─────────────────────────────── */

export function gamePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game')],
    PREDICTION_PROGRAM_ID,
  );
}

export function roundPDA(epoch: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('round'), buf],
    PREDICTION_PROGRAM_ID,
  );
}

export function betPDA(epoch: number, user: PublicKey): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bet'), buf, user.toBuffer()],
    PREDICTION_PROGRAM_ID,
  );
}

/* ─── Account types ──────────────────────────────── */

export interface GameAccount {
  admin: PublicKey;
  operator: PublicKey;
  treasury: PublicKey;
  currentEpoch: number;
  intervalSeconds: number;
  minBetAmount: number;    // lamports
  treasuryFee: number;     // basis points
  genesisStart: boolean;
  genesisLock: boolean;
  paused: boolean;
  bump: number;
}

export interface RoundAccount {
  epoch: number;
  startTimestamp: number;
  lockTimestamp: number;
  closeTimestamp: number;
  lockPrice: number;       // raw (×10^6)
  closePrice: number;
  totalAmount: number;     // lamports
  bullAmount: number;
  bearAmount: number;
  rewardAmount: number;
  treasuryAmount: number;
  oracleCalled: boolean;
  bump: number;
}

export interface UserBetAccount {
  user: PublicKey;
  roundEpoch: number;
  amount: number;          // lamports
  position: number;        // 0=Bull, 1=Bear
  claimed: boolean;
  bump: number;
}

/* ─── Deserialisers ──────────────────────────────── */

export function deserializeGame(data: Buffer): GameAccount {
  let o = 8;
  const admin    = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const operator = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const treasury = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const currentEpoch    = Number(data.readBigUInt64LE(o)); o += 8;
  const intervalSeconds = data.readUInt32LE(o);            o += 4;
  const minBetAmount    = Number(data.readBigUInt64LE(o)); o += 8;
  const treasuryFee     = data.readUInt32LE(o);            o += 4;
  const genesisStart    = !!data[o++];
  const genesisLock     = !!data[o++];
  const paused          = !!data[o++];
  const bump            = data[o++];
  return {
    admin, operator, treasury, currentEpoch,
    intervalSeconds, minBetAmount, treasuryFee,
    genesisStart, genesisLock, paused, bump,
  };
}

export function deserializeRound(data: Buffer): RoundAccount {
  let o = 8;
  const epoch          = Number(data.readBigUInt64LE(o)); o += 8;
  const startTimestamp = Number(data.readBigInt64LE(o));   o += 8;
  const lockTimestamp  = Number(data.readBigInt64LE(o));   o += 8;
  const closeTimestamp = Number(data.readBigInt64LE(o));   o += 8;
  const lockPrice      = Number(data.readBigInt64LE(o));   o += 8;
  const closePrice     = Number(data.readBigInt64LE(o));   o += 8;
  const totalAmount    = Number(data.readBigUInt64LE(o));  o += 8;
  const bullAmount     = Number(data.readBigUInt64LE(o));  o += 8;
  const bearAmount     = Number(data.readBigUInt64LE(o));  o += 8;
  const rewardAmount   = Number(data.readBigUInt64LE(o));  o += 8;
  const treasuryAmount = Number(data.readBigUInt64LE(o));  o += 8;
  const oracleCalled   = !!data[o++];
  const bump           = data[o++];
  return {
    epoch, startTimestamp, lockTimestamp, closeTimestamp,
    lockPrice, closePrice, totalAmount, bullAmount, bearAmount,
    rewardAmount, treasuryAmount, oracleCalled, bump,
  };
}

export function deserializeUserBet(data: Buffer): UserBetAccount {
  let o = 8;
  const user       = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const roundEpoch = Number(data.readBigUInt64LE(o));         o += 8;
  const amount     = Number(data.readBigUInt64LE(o));         o += 8;
  const position   = data[o++];
  const claimed    = !!data[o++];
  const bump       = data[o++];
  return { user, roundEpoch, amount, position, claimed, bump };
}

/* ─── Instruction builders ───────────────────────── */

function u64LE(v: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
}

function i64LE(v: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
}

/** Build a bet_bull instruction */
export function buildBetBullIx(
  user: PublicKey,
  epoch: number,
  amountLamports: number,
): TransactionInstruction {
  const [game] = gamePDA();
  const [round] = roundPDA(epoch);
  const [userBet] = betPDA(epoch, user);
  const data = Buffer.concat([
    Buffer.from(DISC.bet_bull),
    u64LE(epoch),
    u64LE(amountLamports),
  ]);
  return new TransactionInstruction({
    programId: PREDICTION_PROGRAM_ID,
    keys: [
      { pubkey: game,                    isSigner: false, isWritable: true  },
      { pubkey: round,                   isSigner: false, isWritable: true  },
      { pubkey: userBet,                 isSigner: false, isWritable: true  },
      { pubkey: user,                    isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Build a bet_bear instruction */
export function buildBetBearIx(
  user: PublicKey,
  epoch: number,
  amountLamports: number,
): TransactionInstruction {
  const [game] = gamePDA();
  const [round] = roundPDA(epoch);
  const [userBet] = betPDA(epoch, user);
  const data = Buffer.concat([
    Buffer.from(DISC.bet_bear),
    u64LE(epoch),
    u64LE(amountLamports),
  ]);
  return new TransactionInstruction({
    programId: PREDICTION_PROGRAM_ID,
    keys: [
      { pubkey: game,                    isSigner: false, isWritable: true  },
      { pubkey: round,                   isSigner: false, isWritable: true  },
      { pubkey: userBet,                 isSigner: false, isWritable: true  },
      { pubkey: user,                    isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Build an add_position instruction (add SOL to existing bet, same direction) */
export function buildAddPositionIx(
  user: PublicKey,
  epoch: number,
  amountLamports: number,
): TransactionInstruction {
  const [game] = gamePDA();
  const [round] = roundPDA(epoch);
  const [userBet] = betPDA(epoch, user);
  const data = Buffer.concat([
    Buffer.from(DISC.add_position),
    u64LE(epoch),
    u64LE(amountLamports),
  ]);
  return new TransactionInstruction({
    programId: PREDICTION_PROGRAM_ID,
    keys: [
      { pubkey: game,                    isSigner: false, isWritable: true  },
      { pubkey: round,                   isSigner: false, isWritable: true  },
      { pubkey: userBet,                 isSigner: false, isWritable: true  },
      { pubkey: user,                    isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Build a claim instruction */
export function buildClaimIx(
  user: PublicKey,
  epoch: number,
): TransactionInstruction {
  const [game] = gamePDA();
  const [round] = roundPDA(epoch);
  const [userBet] = betPDA(epoch, user);
  const data = Buffer.concat([
    Buffer.from(DISC.claim),
    u64LE(epoch),
  ]);
  return new TransactionInstruction({
    programId: PREDICTION_PROGRAM_ID,
    keys: [
      { pubkey: game,    isSigner: false, isWritable: true },
      { pubkey: round,   isSigner: false, isWritable: false },
      { pubkey: userBet, isSigner: false, isWritable: true  },
      { pubkey: user,    isSigner: true,  isWritable: true  },
    ],
    data,
  });
}

/** Build a pause instruction (admin only) */
export function buildPauseIx(admin: PublicKey): TransactionInstruction {
  const [game] = gamePDA();
  const data = Buffer.from(DISC.pause);
  return new TransactionInstruction({
    programId: PREDICTION_PROGRAM_ID,
    keys: [
      { pubkey: game,  isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true,  isWritable: false },
    ],
    data,
  });
}

/** Build an unpause instruction (admin only) */
export function buildUnpauseIx(admin: PublicKey): TransactionInstruction {
  const [game] = gamePDA();
  const data = Buffer.from(DISC.unpause);
  return new TransactionInstruction({
    programId: PREDICTION_PROGRAM_ID,
    keys: [
      { pubkey: game,  isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true,  isWritable: false },
    ],
    data,
  });
}

/* ─── Fetch helpers ──────────────────────────────── */

export async function fetchGame(conn: Connection): Promise<GameAccount | null> {
  const [pub] = gamePDA();
  const info = await conn.getAccountInfo(pub);
  if (!info) return null;
  return deserializeGame(info.data as Buffer);
}

export async function fetchRound(conn: Connection, epoch: number): Promise<RoundAccount | null> {
  const [pub] = roundPDA(epoch);
  const info = await conn.getAccountInfo(pub);
  if (!info) return null;
  return deserializeRound(info.data as Buffer);
}

export async function fetchUserBet(
  conn: Connection,
  epoch: number,
  user: PublicKey,
): Promise<UserBetAccount | null> {
  const [pub] = betPDA(epoch, user);
  const info = await conn.getAccountInfo(pub);
  if (!info) return null;
  return deserializeUserBet(info.data as Buffer);
}

/** Fetch multiple rounds by epoch range */
export async function fetchRounds(
  conn: Connection,
  epochs: number[],
): Promise<Map<number, RoundAccount>> {
  const pubs = epochs.map(e => roundPDA(e)[0]);
  const infos = await conn.getMultipleAccountsInfo(pubs);
  const map = new Map<number, RoundAccount>();
  infos.forEach((info, i) => {
    if (info) map.set(epochs[i], deserializeRound(info.data as Buffer));
  });
  return map;
}

/** Fetch user bets for multiple epochs */
export async function fetchUserBets(
  conn: Connection,
  epochs: number[],
  user: PublicKey,
): Promise<Map<number, UserBetAccount>> {
  const pubs = epochs.map(e => betPDA(e, user)[0]);
  const infos = await conn.getMultipleAccountsInfo(pubs);
  const map = new Map<number, UserBetAccount>();
  infos.forEach((info, i) => {
    if (info) map.set(epochs[i], deserializeUserBet(info.data as Buffer));
  });
  return map;
}

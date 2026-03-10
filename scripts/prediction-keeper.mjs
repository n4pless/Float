#!/usr/bin/env node
/**
 * Prediction Market Keeper Bot
 *
 * Manages the on-chain prediction game:
 *   1. Initialises the game (if needed)
 *   2. Starts genesis round → locks genesis → then loops execute_round
 *   3. Fetches SOL price from Binance and posts it on-chain each interval
 *
 * Usage:  node scripts/prediction-keeper.mjs
 * Env:    KEEPER_KEY  — path to operator keypair JSON  (default: keys/admin-keypair.json)
 *         RPC_URL     — Solana RPC                     (default: devnet)
 *         INTERVAL    — round duration in seconds       (default: 300)
 *         MIN_BET     — minimum bet in lamports          (default: 1_000_000 = 0.001 SOL)
 *         TREASURY_FEE — basis points                   (default: 300 = 3%)
 */
import {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionInstruction, Transaction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ─── Config ─────────────────────────────────────── */

const PROGRAM_ID = new PublicKey('FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf');
const RPC = process.env.RPC_URL || 'https://api.devnet.solana.com';
const INTERVAL = parseInt(process.env.INTERVAL || '300', 10);        // 5 min
const MIN_BET = BigInt(process.env.MIN_BET || '1000000');            // 0.001 SOL
const TREASURY_FEE = parseInt(process.env.TREASURY_FEE || '300', 10); // 3 %
const PRICE_PRECISION = 1_000_000; // 10^6

const keyPath = process.env.KEEPER_KEY || path.join(__dirname, '..', 'keys', 'admin-keypair.json');
const keypairData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const operator = Keypair.fromSecretKey(Uint8Array.from(keypairData));
const treasury = operator.publicKey; // fees go back to admin for now

const conn = new Connection(RPC, 'confirmed');

/* ─── Discriminators (precomputed SHA-256 first 8 bytes) ─── */

function disc(name) {
  return crypto.createHash('sha256').update(name).digest().subarray(0, 8);
}

const IX = {
  initialize:           disc('global:initialize'),
  genesis_start_round:  disc('global:genesis_start_round'),
  genesis_lock_round:   disc('global:genesis_lock_round'),
  execute_round:        disc('global:execute_round'),
  close_round:          disc('global:close_round'),
  bet_bull:             disc('global:bet_bull'),
  bet_bear:             disc('global:bet_bear'),
  claim:                disc('global:claim'),
};

const ACCT_DISC = {
  Game:    disc('account:Game'),
  Round:   disc('account:Round'),
  UserBet: disc('account:UserBet'),
};

/* ─── PDA helpers ────────────────────────────────── */

function gamePDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('game')], PROGRAM_ID);
}

function roundPDA(epoch) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync([Buffer.from('round'), buf], PROGRAM_ID);
}

/* ─── Serialisation helpers ──────────────────────── */

function u32LE(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }
function u64LE(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }
function i64LE(v) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; }

/* ─── Account deserialisers ──────────────────────── */

function parseGame(data) {
  let o = 8; // skip discriminator
  const admin     = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const op        = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const tres      = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const epoch     = data.readBigUInt64LE(o);                 o += 8;
  const interval  = data.readUInt32LE(o);                    o += 4;
  const minBet    = data.readBigUInt64LE(o);                 o += 8;
  const fee       = data.readUInt32LE(o);                    o += 4;
  const genStart  = !!data[o++];
  const genLock   = !!data[o++];
  const paused    = !!data[o++];
  const bump      = data[o++];
  return { admin, operator: op, treasury: tres, currentEpoch: Number(epoch),
           interval, minBet, fee, genesisStart: genStart, genesisLock: genLock, paused, bump };
}

function parseRound(data) {
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
  return { epoch, startTimestamp, lockTimestamp, closeTimestamp,
           lockPrice, closePrice, totalAmount, bullAmount, bearAmount,
           rewardAmount, treasuryAmount, oracleCalled, bump };
}

/* ─── Binance price helper ───────────────────────── */

async function getSolPrice() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    const json = await res.json();
    return Math.round(parseFloat(json.price) * PRICE_PRECISION);
  } catch (e) {
    console.error('Price fetch error:', e.message);
    return null;
  }
}

/* ─── Transaction builders ───────────────────────── */

function txInitialize() {
  const [game] = gamePDA();
  const data = Buffer.concat([
    IX.initialize,
    u32LE(INTERVAL),
    u64LE(MIN_BET),
    u32LE(TREASURY_FEE),
  ]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: game,                  isSigner: false, isWritable: true },
      { pubkey: operator.publicKey,    isSigner: true,  isWritable: true },
      { pubkey: treasury,              isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  return ix;
}

function txGenesisStart() {
  const [game] = gamePDA();
  const [round] = roundPDA(1);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: game,                  isSigner: false, isWritable: true  },
      { pubkey: round,                 isSigner: false, isWritable: true  },
      { pubkey: operator.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: IX.genesis_start_round,
  });
  return ix;
}

function txGenesisLock(price) {
  const [game] = gamePDA();
  const [r1] = roundPDA(1);
  const [r2] = roundPDA(2);
  const data = Buffer.concat([IX.genesis_lock_round, i64LE(price)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: game,                  isSigner: false, isWritable: true  },
      { pubkey: r1,                    isSigner: false, isWritable: true  },
      { pubkey: r2,                    isSigner: false, isWritable: true  },
      { pubkey: operator.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function txExecuteRound(closeEpoch, price) {
  const [game] = gamePDA();
  const [closing] = roundPDA(closeEpoch);
  const [current] = roundPDA(closeEpoch + 1);
  const [next]    = roundPDA(closeEpoch + 2);
  const data = Buffer.concat([IX.execute_round, u64LE(closeEpoch), i64LE(price)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: game,                    isSigner: false, isWritable: true  },
      { pubkey: closing,                 isSigner: false, isWritable: true  },
      { pubkey: current,                 isSigner: false, isWritable: true  },
      { pubkey: next,                    isSigner: false, isWritable: true  },
      { pubkey: treasury,                isSigner: false, isWritable: true  },
      { pubkey: operator.publicKey,      isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function send(ix) {
  const tx = new Transaction().add(ix);
  tx.feePayer = operator.publicKey;
  const sig = await sendAndConfirmTransaction(conn, tx, [operator], { commitment: 'confirmed' });
  return sig;
}

/* ─── Close old rounds (reclaim rent) ────────────── */

const CLOSE_GRACE = parseInt(process.env.CLOSE_GRACE || String(48 * 3600), 10); // 48h default
let oldestUnclosed = 1;

function txCloseRound(epoch) {
  const [game] = gamePDA();
  const [round] = roundPDA(epoch);
  const data = Buffer.concat([IX.close_round, u64LE(epoch)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: game,               isSigner: false, isWritable: false },
      { pubkey: round,              isSigner: false, isWritable: true  },
      { pubkey: operator.publicKey, isSigner: true,  isWritable: true  },
    ],
    data,
  });
}

async function closeOldRounds(currentCloseEpoch) {
  const now = Math.floor(Date.now() / 1000);
  let closed = 0;
  for (let ep = oldestUnclosed; ep <= currentCloseEpoch - 2 && closed < 5; ep++) {
    try {
      const [pub] = roundPDA(ep);
      const info = await conn.getAccountInfo(pub);
      if (!info) {
        oldestUnclosed = ep + 1;
        continue;
      }
      const r = parseRound(info.data);
      if (!r.oracleCalled) { oldestUnclosed = ep + 1; continue; }
      if (now <= r.closeTimestamp + CLOSE_GRACE) break; // rest are too new

      console.log(`  Closing old round ${ep} (reclaiming ~0.001 SOL)...`);
      await send(txCloseRound(ep));
      console.log(`  ✓ Round ${ep} rent reclaimed`);
      oldestUnclosed = ep + 1;
      closed++;
    } catch (err) {
      console.warn(`  Round ${ep} close failed:`, err.message);
      oldestUnclosed = ep + 1;
    }
  }
  if (closed > 0) console.log(`  Reclaimed rent from ${closed} old round(s)`);
}

/* ─── Main loop ──────────────────────────────────── */

async function main() {
  console.log(`=== Prediction Keeper ===`);
  console.log(`Program : ${PROGRAM_ID.toBase58()}`);
  console.log(`Operator: ${operator.publicKey.toBase58()}`);
  console.log(`RPC     : ${RPC}`);
  console.log(`Interval: ${INTERVAL}s`);

  const [gamePub] = gamePDA();

  // ── 1. Ensure game is initialised ──
  let gameInfo = await conn.getAccountInfo(gamePub);
  if (!gameInfo) {
    console.log('Initialising game...');
    await send(txInitialize());
    console.log('Game initialised.');
    gameInfo = await conn.getAccountInfo(gamePub);
  }

  let game = parseGame(gameInfo.data);

  // ── 2. Genesis ──
  if (!game.genesisStart) {
    console.log('Genesis start round...');
    await send(txGenesisStart());
    gameInfo = await conn.getAccountInfo(gamePub);
    game = parseGame(gameInfo.data);
    console.log('Genesis round 1 created.');
  }

  if (!game.genesisLock) {
    // Read round 1 to get its lock_timestamp – wait only the remaining time
    const [r1Pub] = roundPDA(1);
    const r1Info = await conn.getAccountInfo(r1Pub);
    if (!r1Info) throw new Error('Round 1 not found after genesis start');
    const r1 = parseRound(r1Info.data);
    const now = Math.floor(Date.now() / 1000);
    const waitSec = Math.max(0, r1.lockTimestamp - now);
    if (waitSec > 0) {
      console.log(`Waiting ${waitSec}s for genesis lock (lock_ts=${r1.lockTimestamp})...`);
      await sleep(waitSec * 1000 + 2000); // +2s buffer
    } else {
      console.log('Lock timestamp already passed, locking immediately...');
    }
    const price = await getSolPrice();
    if (!price) throw new Error('Cannot fetch price for genesis lock');
    console.log(`Genesis lock (price=${price / PRICE_PRECISION})...`);
    await send(txGenesisLock(price));
    gameInfo = await conn.getAccountInfo(gamePub);
    game = parseGame(gameInfo.data);
    console.log('Genesis locked. Rounds 1 (live) & 2 (next) created.');
  }

  // ── 3. Main loop: execute round every interval ──
  console.log('Entering main loop...');

  while (true) {
    try {
      // Re-read game state
      gameInfo = await conn.getAccountInfo(gamePub);
      game = parseGame(gameInfo.data);

      const closeEpoch = game.currentEpoch - 1;

      // Read the round to close to know its close_timestamp
      const [closingPub] = roundPDA(closeEpoch);
      const closingInfo = await conn.getAccountInfo(closingPub);
      if (!closingInfo) {
        console.error(`Round ${closeEpoch} not found. Waiting...`);
        await sleep(10_000);
        continue;
      }
      const closing = parseRound(closingInfo.data);

      if (closing.oracleCalled) {
        // Already closed — we missed it or state is ahead; fetch again
        console.log(`Round ${closeEpoch} already closed. Re-checking...`);
        await sleep(5_000);
        continue;
      }

      // Wait until close_timestamp
      const now = Math.floor(Date.now() / 1000);
      const wait = closing.closeTimestamp - now;
      if (wait > 0) {
        console.log(`Round ${closeEpoch} closes in ${wait}s. Waiting...`);
        await sleep(wait * 1000 + 2000); // +2s buffer for clock drift
      }

      // Fetch price
      const price = await getSolPrice();
      if (!price) {
        console.error('Price unavailable, retrying in 5s...');
        await sleep(5000);
        continue;
      }

      console.log(`Executing round ${closeEpoch}  |  price=$${(price / PRICE_PRECISION).toFixed(4)}  |  epoch→${closeEpoch + 2}`);
      const sig = await send(txExecuteRound(closeEpoch, price));
      console.log(`  ✓ tx: ${sig}`);

      // Reclaim rent from old rounds (up to 5 per cycle)
      await closeOldRounds(closeEpoch);
    } catch (err) {
      console.error('Keeper error:', err.message || err);
      await sleep(10_000);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

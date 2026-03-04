/**
 * Drift Protocol SDK Wrapper
 *
 * Handles connection to the Drift program, account management,
 * position tracking, and order execution. Designed to work with
 * the drift-labs/sdk v2 API on Solana devnet.
 *
 * KEY FLOW:
 *   1. initialize()              → DriftClient.subscribe()
 *   2. initializeUserAccount()   → create Drift sub-account on-chain
 *   3. depositCollateral()       → deposit USDC so user has margin
 *   4. openPosition()            → place perp orders
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  DriftClient,
  BN,
  User,
  PositionDirection,
  OrderType,
  OrderTriggerCondition,
  PRICE_PRECISION,
  BASE_PRECISION,
  QUOTE_PRECISION,
  PerpPosition,
  initialize as sdkInitialize,
  getMarketsAndOraclesForSubscription,
  MarketType,
  BulkAccountLoader,
  OracleSource,
  getVammL2Generator,
  createL2Levels,
  getUserStatsAccountPublicKey,
  getUserAccountPublicKeySync,
  getInsuranceFundStakeAccountPublicKey,
  unstakeSharesToAmount,
} from '@drift-labs/sdk';
import type { Order, L2Level, UserAccount, MakerInfo } from '@drift-labs/sdk';
export type { Order } from '@drift-labs/sdk';
import { useDriftStore } from '../stores/useDriftStore';

type CachedUserAccount = { publicKey: PublicKey; account: UserAccount };

/* ─── Types ─────────────────────────────────────────── */

export interface WalletLike {
  publicKey: PublicKey;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
}

export interface TradingConfig {
  rpcUrl: string;
  driftProgramId: string;
  wallet: WalletLike;
}

export interface UserPosition {
  marketIndex: number;
  baseAssetAmount: number;   // in base units (e.g. SOL)
  quoteEntryAmount: number;  // in USD
  direction: 'LONG' | 'SHORT';
  leverage: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  settledPnl: number;        // cumulative realised PnL settled to balance
  liquidationPrice: number;
  marginUsed: number;
}

export interface AccountState {
  publicKey: string;
  totalCollateral: number;
  freeCollateral: number;
  maintenanceMargin: number;
  unrealizedPnl: number;
  leverage: number;
  health: number; // 0-100
}

export interface MarketData {
  marketIndex: number;
  symbol: string;
  markPrice: number;
  oraclePrice: number;
  fundingRate: number;
  openInterest: number;
  volume24h: number;
  change24h: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;     // base units
  sizeUsd: number;
  total: number;    // cumulative USD
  isMine?: boolean; // true if user has an order at this price
}

export interface L2Orderbook {
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  slot: number;
}

export interface BotPosition {
  botName: string;
  walletAddress: string;
  marketIndex: number;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  baseAssetAmount: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  openOrders: number;
}

export interface AmmStats {
  /** Net base position held by the AMM (SOL units, negative = AMM is short) */
  netPosition: number;
  /** Direction label */
  netDirection: 'LONG' | 'SHORT' | 'FLAT';
  /** sqrt(k) — overall AMM liquidity depth */
  sqrtK: number;
  /** Base asset reserve in SOL */
  baseReserve: number;
  /** Quote asset reserve in USD */
  quoteReserve: number;
  /** Peg multiplier (≈ target price) */
  pegMultiplier: number;
  /** Current long spread from oracle (bps) */
  longSpread: number;
  /** Current short spread from oracle (bps) */
  shortSpread: number;
  /** Base spread (bps) */
  baseSpread: number;
  /** Max spread (bps) */
  maxSpread: number;
  /** Total fees collected (USD) */
  totalFee: number;
  /** Total fees minus distributions (USD) */
  totalFeeMinusDistributions: number;
  /** Long open interest (SOL) */
  longOI: number;
  /** Short open interest (SOL) */
  shortOI: number;
  /** Last funding rate */
  lastFundingRate: number;
}

export interface InsuranceFundStats {
  /** USDC balance in the IF vault */
  vaultBalance: number;
  /** Total shares outstanding */
  totalShares: string;
  /** User (staker) shares outstanding */
  userShares: string;
  /** Unstaking cooldown period in seconds */
  unstakingPeriod: number;
  /** Revenue settle period in seconds */
  revenueSettlePeriod: number;
  /** Total IF factor (basis points out of 10000) */
  totalFactor: number;
  /** User IF factor (basis points out of 10000) */
  userFactor: number;
  /** Revenue pool scaled balance (raw BN string) */
  revenuePoolBalance: string;
  /** Last revenue settle timestamp */
  lastRevenueSettleTs: number;
  /** Share base exponent */
  sharesBase: number;
  /** Total trading fees collected across perp markets (USDC) */
  totalFeesCollected: number;
}

export interface UserIfStake {
  /** User's IF shares */
  ifShares: string;
  /** Estimated value in USDC */
  stakeValue: number;
  /** Pending withdraw request shares */
  lastWithdrawRequestShares: string;
  /** Pending withdraw request USDC value */
  lastWithdrawRequestValue: number;
  /** Timestamp of last withdraw request */
  lastWithdrawRequestTs: number;
  /** Cost basis in USDC */
  costBasis: number;
  /** Whether the user has an initialized IF stake account */
  isInitialized: boolean;
}

/* Known bot wallet addresses */
export const BOT_WALLETS: Record<string, string> = {
  'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G': 'Admin',
  '66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK': 'Filler',
  'D9k5Mo7YLBoQi7prKyVrfc9xKFRmJYzh2vifnuzuYNGX': 'Liquidator',
  '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U': 'Maker',
};

export interface SpotBalance {
  marketIndex: number;
  symbol: string;
  deposits: number;
  borrows: number;
  netBalance: number;
  valueUsd: number;
}

/* ─── Client ────────────────────────────────────────── */

export class DriftTradingClient {
  private connection: Connection;
  private driftClient!: DriftClient;
  private user!: User;
  private wallet: WalletLike;
  private programId: PublicKey;
  private _subscribed = false;
  private _userInitialized = false;

  // Cross-user orderbook: cache of ALL user accounts on the protocol
  private _allUserAccounts: CachedUserAccount[] = [];
  // Position snapshots for fill detection (pubkey → baseAssetAmount as string)
  private _prevPositions: Map<string, string> = new Map();
  private _allUserAccountsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _allUserAccountsLoading = false;

  // Optimistic pending orders — shown immediately in orderbook before on-chain confirmation
  private _pendingOrders: { marketIndex: number; direction: 'long' | 'short'; price: number; sizeBase: number; placedAt: number }[] = [];

  constructor(config: TradingConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.wallet = config.wallet;
    this.programId = new PublicKey(config.driftProgramId);
  }

  /* ── lifecycle ─────────────────────────────────── */

  async initialize(): Promise<void> {
    try {
      // Initialize SDK environment — set program IDs for devnet
      // (we override to our custom devnet program via the programID config below)
      sdkInitialize({ env: 'devnet' });

      // Use websocket subscription (Helius free tier blocks batch RPC requests)
      this.driftClient = new DriftClient({
        connection: this.connection as any,
        wallet: this.wallet as any,
        programID: this.programId,
        opts: { commitment: 'confirmed' },
        perpMarketIndexes: [0],     // SOL-PERP
        spotMarketIndexes: [0],     // USDC
        oracleInfos: [
          {
            publicKey: new PublicKey('8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG'),
            source: OracleSource.Prelaunch,
          },
        ],
        accountSubscription: {
          type: 'websocket',
        },
        txVersion: 'legacy',        // Legacy txns for broad wallet compat
        activeSubAccountId: 0,
      });

      await this.driftClient.subscribe();
      this._subscribed = true;
      console.log('[drift] client subscribed to protocol state');

      // Load ALL user accounts across the protocol for cross-user orderbook
      await this._refreshAllUserAccounts();
      this._startUserAccountsRefreshLoop();

      // Check if this wallet already has a Drift user account
      await this._checkUserAccount();
    } catch (err) {
      console.error('[drift] init failed', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this._allUserAccountsRefreshTimer) {
      clearInterval(this._allUserAccountsRefreshTimer);
      this._allUserAccountsRefreshTimer = null;
    }
    this._allUserAccounts = [];
    if (this._subscribed) {
      try { await this.driftClient.unsubscribe(); } catch { /* ignore */ }
      this._subscribed = false;
    }
  }

  /**
   * Fetch ALL Drift user accounts on this program.
   * This gives us every user's orders for the cross-user orderbook.
   * Also detects position changes to emit fill events.
   */
  private async _refreshAllUserAccounts(): Promise<void> {
    if (this._allUserAccountsLoading) return;
    this._allUserAccountsLoading = true;
    try {
      let accounts: CachedUserAccount[];
      try {
        accounts = (await this.driftClient.fetchAllUserAccounts(true)) as unknown as CachedUserAccount[];
      } catch (gpaErr) {
        console.warn('[drift] getProgramAccounts failed, using direct account fetch fallback:', gpaErr);
        accounts = [];
      }

      // Fallback: if gPA returned nothing (rate-limited, CORS, etc.),
      // directly fetch known bot accounts by PDA so maker matching still works.
      if (accounts.length === 0) {
        console.log('[drift] gPA returned 0 accounts — fetching known bots individually');
        const knownAuthorities = Object.keys(BOT_WALLETS).map(k => new PublicKey(k));
        // Also include ourself
        knownAuthorities.push(this.wallet.publicKey);
        const fetched: CachedUserAccount[] = [];
        for (const auth of knownAuthorities) {
          try {
            const userPDA = getUserAccountPublicKeySync(this.programId, auth, 0);
            const userAcct = await (this.driftClient as any).program.account.user.fetch(userPDA);
            if (userAcct) {
              fetched.push({ publicKey: userPDA, account: userAcct as UserAccount });
            }
          } catch { /* account doesn't exist or fetch failed */ }
        }
        if (fetched.length > 0) {
          console.log(`[drift] fallback fetched ${fetched.length} account(s)`);
          accounts = fetched;
        }
      }

      this._allUserAccounts = accounts;

      // ── Fill detection via position-change tracking ──
      // Each refresh, compare perp position sizes to detect fills.
      // This costs ZERO extra RPC calls — we already have the data.
      const oraclePrice = useDriftStore.getState().oraclePrice;
      if (oraclePrice > 0) {
        for (const ua of this._allUserAccounts) {
          const key = ua.publicKey.toBase58();
          const perp = (ua.account as any).perpPositions?.[0];
          if (!perp) continue;

          const curBase = perp.baseAssetAmount?.toString() ?? '0';
          const prevBase = this._prevPositions.get(key);

          if (prevBase !== undefined && prevBase !== curBase) {
            // Position changed → a fill happened
            try {
              const prevNum = Number(prevBase);
              const curNum = Number(curBase);
              const delta = curNum - prevNum;
              if (delta === 0) continue;

              const basePrecision = BASE_PRECISION.toNumber();
              const absDeltaBase = Math.abs(delta) / basePrecision;
              const sizeUsd = absDeltaBase * oraclePrice;

              if (sizeUsd >= 0.01) {
                const side: 'buy' | 'sell' = delta > 0 ? 'buy' : 'sell';
                // Deduplicate: don't emit if the store already has a very recent trade
                // with the same price and size (from direct capture)
                const recent = useDriftStore.getState().recentTrades;
                const isDuplicate = recent.length > 0 && recent.some(t =>
                  Math.abs(t.ts - Date.now()) < 15_000 &&
                  t.side === side &&
                  Math.abs(t.size - sizeUsd) < sizeUsd * 0.1
                );
                if (!isDuplicate) {
                  const TAKER_FEE_RATE = 0.0005;
                  const takerFee = sizeUsd * TAKER_FEE_RATE;
                  useDriftStore.getState().addRecentTrade({
                    price: oraclePrice,
                    size: sizeUsd,
                    side,
                    ts: Date.now(),
                    taker: key,
                    marketIndex: 0,
                    takerFee,
                  });
                  console.log(`[drift] detected fill via position change: ${side} $${sizeUsd.toFixed(2)} (fee: $${takerFee.toFixed(4)}) by ${key.slice(0,8)}...`);
                }
              }
            } catch { /* ignore parse errors */ }
          }
          this._prevPositions.set(key, curBase);
        }
      }

      console.log(`[drift] loaded ${accounts.length} user account(s) from chain`);

      // Update bot positions in store
      try {
        const botPositions = this.getBotPositions();
        useDriftStore.getState().setBotPositions(botPositions);
      } catch { /* ignore */ }
    } catch (err) {
      console.warn('[drift] fetchAllUserAccounts failed, retrying next cycle:', err);
    } finally {
      this._allUserAccountsLoading = false;
    }
  }

  /**
   * Start a background loop to keep the all-users cache fresh.
   */
  private _startUserAccountsRefreshLoop(): void {
    if (this._allUserAccountsRefreshTimer) return;
    this._allUserAccountsRefreshTimer = setInterval(() => {
      this._refreshAllUserAccounts();
    }, 30000); // refresh every 30 seconds (reduce RPC load from getProgramAccounts)
  }

  get isSubscribed() { return this._subscribed; }
  get isUserInitialized() { return this._userInitialized; }
  get walletPublicKey() { return this.wallet.publicKey; }

  /**
   * Get the underlying DriftClient for advanced operations.
   */
  getDriftClient(): DriftClient { return this.driftClient; }

  /**
   * Get the Connection instance for event subscriptions.
   */
  getConnection() { return this.connection; }

  /**
   * Get the programId for this Drift deployment.
   */
  getProgramId() { return this.programId; }

  /**
   * Get the cached user accounts (refreshed every 8s).
   */
  getCachedUserAccounts() { return this._allUserAccounts; }

  /**
   * Get positions and order counts for all known bot wallets.
   * Uses the cached user accounts — no extra RPC calls.
   */
  getBotPositions(): BotPosition[] {
    const results: BotPosition[] = [];
    const oraclePrice = useDriftStore.getState().oraclePrice;

    for (const ua of this._allUserAccounts) {
      const authority = (ua.account as any).authority?.toBase58?.() ?? '';
      const botName = BOT_WALLETS[authority];
      if (!botName) continue;

      // Parse perp positions
      const perpPositions = (ua.account as any).perpPositions ?? [];
      let hasPosition = false;

      for (const pos of perpPositions) {
        const baseAmt = pos.baseAssetAmount;
        if (!baseAmt || (typeof baseAmt.isZero === 'function' && baseAmt.isZero())) continue;

        hasPosition = true;
        const baseNum = (typeof baseAmt.toNumber === 'function' ? baseAmt.toNumber() : Number(baseAmt)) / BASE_PRECISION.toNumber();
        // Use quoteAssetAmount (includes fees + funding) for accurate PnL
        const quoteAssetAmt = pos.quoteAssetAmount ?? pos.quoteEntryAmount;
        const quoteAssetNum = quoteAssetAmt
          ? (typeof quoteAssetAmt.toNumber === 'function' ? quoteAssetAmt.toNumber() : Number(quoteAssetAmt)) / PRICE_PRECISION.toNumber()
          : 0;
        const quoteEntryNum = pos.quoteEntryAmount
          ? (typeof pos.quoteEntryAmount.toNumber === 'function' ? pos.quoteEntryAmount.toNumber() : Number(pos.quoteEntryAmount)) / PRICE_PRECISION.toNumber()
          : 0;
        const entryPrice = baseNum !== 0 ? Math.abs(quoteEntryNum / baseNum) : 0;
        const markPrice = oraclePrice > 0 ? oraclePrice : 0;
        const unrealizedPnl = baseNum * markPrice + quoteAssetNum;

        // Count open orders for this user
        const orders = (ua.account as any).orders ?? [];
        const openOrders = orders.filter((o: any) => {
          if (!o || !o.status) return false;
          return typeof o.status === 'object' ? 'open' in o.status : false;
        }).length;

        results.push({
          botName,
          walletAddress: authority,
          marketIndex: pos.marketIndex ?? 0,
          direction: baseNum > 0 ? 'LONG' : baseNum < 0 ? 'SHORT' : 'FLAT',
          baseAssetAmount: Math.abs(baseNum),
          entryPrice,
          markPrice,
          unrealizedPnl,
          openOrders,
        });
      }

      // If bot has no positions, still show it with open orders count
      if (!hasPosition) {
        const orders = (ua.account as any).orders ?? [];
        const openOrders = orders.filter((o: any) => {
          if (!o || !o.status) return false;
          return typeof o.status === 'object' ? 'open' in o.status : false;
        }).length;

        results.push({
          botName,
          walletAddress: authority,
          marketIndex: 0,
          direction: 'FLAT',
          baseAssetAmount: 0,
          entryPrice: 0,
          markPrice: oraclePrice,
          unrealizedPnl: 0,
          openOrders,
        });
      }
    }

    return results;
  }

  /* ── sub-account management ────────────────────── */

  /**
   * Get list of user sub-accounts for this wallet.
   */
  async getUserSubAccounts(): Promise<Array<{
    subAccountId: number;
    name: string;
    totalCollateral: number;
    freeCollateral: number;
    unrealizedPnl: number;
    openPositions: number;
    spotBalances: number;
  }>> {
    if (!this._subscribed) return [];

    try {
      const userAccounts = await this.driftClient.getUserAccountsForAuthority(
        this.wallet.publicKey,
      );
      if (!userAccounts || userAccounts.length === 0) return [];

      const results = [];
      for (const account of userAccounts) {
        const subAccountId = account.subAccountId;
        const name = Buffer.from(account.name).toString('utf8').replace(/\0/g, '').trim() || `Account #${subAccountId}`;

        // Count active perp positions
        let openPositions = 0;
        for (const pos of account.perpPositions) {
          if (!pos.baseAssetAmount.isZero()) openPositions++;
        }

        // Count non-zero spot balances
        let spotBalances = 0;
        for (const bal of account.spotPositions) {
          if (!bal.scaledBalance.isZero()) spotBalances++;
        }

        // Attempt to read collateral using User wrapper
        let totalCollateral = 0;
        let freeCollateral = 0;
        let unrealizedPnl = 0;
        try {
          // For the active sub-account we can use the subscribed user
          if (subAccountId === this.driftClient.activeSubAccountId) {
            const user = this.driftClient.getUser();
            totalCollateral = this.bnToNum(user.getTotalCollateral());
            freeCollateral = this.bnToNum(user.getFreeCollateral());
            unrealizedPnl = this.bnToNum(user.getUnrealizedPNL(true));
          }
        } catch { /* skip if unable */ }

        results.push({
          subAccountId,
          name,
          totalCollateral,
          freeCollateral,
          unrealizedPnl,
          openPositions,
          spotBalances,
        });
      }
      return results;
    } catch (err) {
      console.warn('[drift] getUserSubAccounts failed:', err);
      return [];
    }
  }

  /**
   * Initialize a new sub-account with optional deposit.
   */
  async initializeSubAccount(
    subAccountId: number,
    name: string,
    depositAmount?: number,
  ): Promise<string> {
    console.log(`[drift] creating sub-account #${subAccountId} "${name}"...`);
    const [txSig] = await this.driftClient.initializeUserAccount(
      subAccountId,
      name,
    );
    console.log('[drift] sub-account created:', txSig);

    if (subAccountId === 0) {
      this._userInitialized = true;
    }

    if (depositAmount && depositAmount > 0) {
      await new Promise(r => setTimeout(r, 2000));
      // Switch to the new sub-account for depositing
      await this.driftClient.switchActiveUser(subAccountId);
      await this.depositCollateral(depositAmount);
    }

    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Delete a sub-account. Account must have no open positions or balances.
   */
  async deleteSubAccount(subAccountId: number): Promise<string> {
    console.log(`[drift] deleting sub-account #${subAccountId}...`);
    const txSig = await this.driftClient.deleteUser(subAccountId);
    console.log('[drift] sub-account deleted:', txSig);

    // If we deleted sub-account 0, user is no longer initialized
    if (subAccountId === 0) {
      this._userInitialized = false;
    }
    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Switch the active sub-account.
   */
  async switchActiveSubAccount(subAccountId: number): Promise<void> {
    console.log(`[drift] switching to sub-account #${subAccountId}`);
    await this.driftClient.switchActiveUser(subAccountId);
  }

  /* ── user account management ───────────────────── */

  /**
   * Check if the connected wallet already has a Drift user account.
   */
  private async _checkUserAccount(): Promise<void> {
    try {
      const userAccountPubkey = await this.driftClient.getUserAccountPublicKey();
      const info = await this.connection.getAccountInfo(userAccountPubkey);
      if (info && info.data.length > 0) {
        this._userInitialized = true;
        console.log('[drift] user account found:', userAccountPubkey.toString());
      } else {
        this._userInitialized = false;
        console.log('[drift] no user account — needs initialization');
      }
    } catch (err) {
      this._userInitialized = false;
      console.log('[drift] user account check failed (needs init):', (err as any)?.message);
    }
  }

  /**
   * Initialize a Drift user sub-account for this wallet.
   * Must be called before any trading.
   */
  async initializeUserAccount(): Promise<string> {
    if (this._userInitialized) {
      console.log('[drift] user account already initialized');
      return 'already-initialized';
    }

    console.log('[drift] initializing user account...');
    const [txSig] = await this.driftClient.initializeUserAccount(
      0,          // subAccountId
      'trader',   // name
    );
    console.log('[drift] user account created:', txSig);
    this._userInitialized = true;
    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Initialize user account AND deposit USDC collateral in one flow.
   * This is the recommended onboarding experience.
   */
  async initializeAndDeposit(usdcAmount: number): Promise<string> {
    if (this._userInitialized) {
      // Already have an account — just deposit
      return this.depositCollateral(usdcAmount);
    }

    console.log(`[drift] initializing user + depositing ${usdcAmount} USDC...`);

    // Step 1: Create user account
    const [initTx] = await this.driftClient.initializeUserAccount(0, 'trader');
    console.log('[drift] user account created:', initTx);
    this._userInitialized = true;

    // Small delay for on-chain confirmation
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Deposit
    return this.depositCollateral(usdcAmount);
  }

  /* ── account spot balances (deposits/borrows inside Drift) ── */

  /**
   * Get the user's spot balances from their Drift account.
   * Returns deposits, borrows, and net balance for each active spot market.
   */
  async getSpotBalances(): Promise<SpotBalance[]> {
    if (!this._userInitialized) return [];

    try {
      const user = this.driftClient.getUser();
      const userAccount = user.getUserAccount();
      const balances: SpotBalance[] = [];

      for (const spotPos of userAccount.spotPositions) {
        if (spotPos.scaledBalance.isZero()) continue;

        const marketIndex = spotPos.marketIndex;
        const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
        if (!spotMarket) continue;

        const decimals = spotMarket.decimals;
        const precision = Math.pow(10, decimals);

        // getTokenAmount returns signed BN: positive = deposit, negative = borrow
        const tokenAmountBN = user.getTokenAmount(marketIndex);
        const tokenAmount = tokenAmountBN.toNumber() / precision;

        const deposits = tokenAmount > 0 ? tokenAmount : 0;
        const borrows = tokenAmount < 0 ? Math.abs(tokenAmount) : 0;
        const netBalance = tokenAmount;

        // Map market index to symbol
        let symbol = 'UNKNOWN';
        let priceUsd = 0;
        if (marketIndex === 0) {
          symbol = 'USDC';
          priceUsd = 1;
        } else if (marketIndex === 1) {
          symbol = 'SOL';
          try {
            const oracle = this.driftClient.getOracleDataForSpotMarket(marketIndex);
            priceUsd = oracle ? oracle.price.toNumber() / PRICE_PRECISION.toNumber() : 0;
          } catch { priceUsd = 0; }
        }

        balances.push({
          marketIndex,
          symbol,
          deposits,
          borrows,
          netBalance,
          valueUsd: Math.abs(netBalance) * priceUsd,
        });
      }

      return balances;
    } catch (err) {
      console.warn('[drift] getSpotBalances failed:', err);
      return [];
    }
  }

  /* ── collateral / deposits ─────────────────────── */

  /**
   * Get user's USDC token balance (in wallet, NOT deposited in Drift yet)
   */
  async getUsdcBalance(usdcMintAddress: string): Promise<number> {
    try {
      const usdcMint = new PublicKey(usdcMintAddress);
      // getAssociatedTokenAddress is available from SPL but we can also use
      // connection.getTokenAccountsByOwner for robustness
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: usdcMint },
      );
      if (tokenAccounts.value.length === 0) return 0;

      // Parse balance from the first matching account
      const info = await this.connection.getTokenAccountBalance(
        tokenAccounts.value[0].pubkey,
      );
      return info.value.uiAmount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Deposit USDC collateral into the Drift user account.
   * User must have USDC tokens AND a Drift account first.
   */
  async depositCollateral(usdcAmount: number, spotMarketIndex = 0): Promise<string> {
    if (!this._userInitialized) {
      throw new Error('User account not initialized. Call initializeUserAccount() first.');
    }

    const amountBN = new BN(Math.floor(usdcAmount * 1e6)); // USDC has 6 decimals
    console.log(`[drift] depositing ${usdcAmount} USDC (${amountBN.toString()} raw)...`);

    // Derive the user's Associated Token Account for the spot market mint
    const spotMarket = this.driftClient.getSpotMarketAccount(spotMarketIndex);
    if (!spotMarket) throw new Error('Spot market not found');
    const userTokenAccount = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.wallet.publicKey,
    );
    console.log('[drift] user token account:', userTokenAccount.toString());

    const txSig = await this.driftClient.deposit(
      amountBN,
      spotMarketIndex,
      userTokenAccount,
    );
    console.log('[drift] deposit tx:', txSig);
    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Withdraw USDC collateral from the Drift user account.
   */
  async withdrawCollateral(usdcAmount: number, spotMarketIndex = 0): Promise<string> {
    const amountBN = new BN(Math.floor(usdcAmount * 1e6));

    // Derive the user's Associated Token Account for the spot market mint
    const spotMarket = this.driftClient.getSpotMarketAccount(spotMarketIndex);
    if (!spotMarket) throw new Error('Spot market not found');
    const userTokenAccount = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.wallet.publicKey,
    );

    const txSig = await this.driftClient.withdraw(
      amountBN,
      spotMarketIndex,
      userTokenAccount,
    );
    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /* ── wallet balance ────────────────────────────── */

  async getBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.wallet.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }

  /* ── account state ─────────────────────────────── */

  async getAccountState(): Promise<AccountState> {
    if (!this._userInitialized) {
      return {
        publicKey: this.wallet.publicKey.toString(),
        totalCollateral: 0, freeCollateral: 0,
        maintenanceMargin: 0, unrealizedPnl: 0,
        leverage: 0, health: 100,
      };
    }

    try {
      const user = this.driftClient.getUser();
      const totalCollateral = user.getTotalCollateral();
      const freeCollateral = user.getFreeCollateral();
      const maintenanceMargin = user.getMaintenanceMarginRequirement();
      const unrealizedPnl = user.getUnrealizedPNL(true);

      const collateralNum = this.bnToNum(totalCollateral);
      const marginNum = this.bnToNum(maintenanceMargin);
      const health = collateralNum > 0
        ? Math.min(100, Math.max(0, ((collateralNum - marginNum) / collateralNum) * 100))
        : 100;

      return {
        publicKey: this.wallet.publicKey.toString(),
        totalCollateral: collateralNum,
        freeCollateral: this.bnToNum(freeCollateral),
        maintenanceMargin: marginNum,
        unrealizedPnl: this.bnToNum(unrealizedPnl),
        leverage: user.getLeverage().toNumber() / 10000,
        health,
      };
    } catch (err) {
      console.warn('[drift] getAccountState failed:', err);
      return {
        publicKey: this.wallet.publicKey.toString(),
        totalCollateral: 0, freeCollateral: 0,
        maintenanceMargin: 0, unrealizedPnl: 0,
        leverage: 0, health: 100,
      };
    }
  }

  /* ── positions ─────────────────────────────────── */

  async getPositions(): Promise<UserPosition[]> {
    if (!this._userInitialized) return [];

    try {
      const user = this.driftClient.getUser();
      const perpPositions = user.getActivePerpPositions();
      const positions: UserPosition[] = [];

      for (const pos of perpPositions) {
        const baseAmt = pos.baseAssetAmount;
        if (baseAmt.isZero()) continue;

        const market = this.driftClient.getPerpMarketAccount(pos.marketIndex);
        if (!market) continue;

        const oracle = this.driftClient.getOracleDataForPerpMarket(pos.marketIndex);
        const markPrice = oracle ? this.bnToNum(oracle.price) : 0;

        const baseNum = baseAmt.toNumber() / BASE_PRECISION.toNumber();
        const quoteEntryNum = pos.quoteEntryAmount.toNumber() / PRICE_PRECISION.toNumber();
        // quoteAssetAmount includes funding payments and fee adjustments — most accurate PnL
        const quoteAssetNum = pos.quoteAssetAmount
          ? (typeof pos.quoteAssetAmount.toNumber === 'function'
              ? pos.quoteAssetAmount.toNumber() / PRICE_PRECISION.toNumber()
              : Number(pos.quoteAssetAmount) / PRICE_PRECISION.toNumber())
          : quoteEntryNum;
        // quoteBreakEvenAmount includes fees but not funding — used for entry price display
        const quoteBreakEvenNum = (pos as any).quoteBreakEvenAmount
          ? (typeof (pos as any).quoteBreakEvenAmount.toNumber === 'function'
              ? (pos as any).quoteBreakEvenAmount.toNumber() / PRICE_PRECISION.toNumber()
              : Number((pos as any).quoteBreakEvenAmount) / PRICE_PRECISION.toNumber())
          : quoteEntryNum;
        const entryPrice = baseNum !== 0 ? Math.abs(quoteBreakEvenNum / baseNum) : 0;
        // PnL = base * mark + quoteAssetAmount (includes fees + funding)
        const unrealizedPnl = baseNum * markPrice + quoteAssetNum;
        const settledPnl = (pos as any).settledPnl
          ? (typeof (pos as any).settledPnl.toNumber === 'function'
              ? (pos as any).settledPnl.toNumber() / PRICE_PRECISION.toNumber()
              : Number((pos as any).settledPnl) / PRICE_PRECISION.toNumber())
          : 0;

        // Liquidation price via the SDK's User.liquidationPrice() method
        let liquidationPrice = 0;
        try {
          const liqPriceBN = user.liquidationPrice(pos.marketIndex);
          if (liqPriceBN.gt(new BN(0))) {
            liquidationPrice = liqPriceBN.toNumber() / PRICE_PRECISION.toNumber();
          }
        } catch (err) {
          console.debug('[drift] liq price calc failed for market', pos.marketIndex, err);
        }

        // Per-position leverage via SDK
        let leverage = 1;
        try {
          leverage = user.getLeverage(true, pos.marketIndex).toNumber() / 10000;
          if (leverage <= 0) leverage = 1;
        } catch {
          // fallback: notional / collateral
          const totalCollateral = user.getTotalCollateral().toNumber() / PRICE_PRECISION.toNumber();
          if (totalCollateral > 0) {
            leverage = Math.abs(baseNum * markPrice) / totalCollateral;
          }
        }

        positions.push({
          marketIndex: pos.marketIndex,
          baseAssetAmount: Math.abs(baseNum),
          quoteEntryAmount: Math.abs(quoteEntryNum),
          direction: baseAmt.gt(new BN(0)) ? 'LONG' : 'SHORT',
          leverage,
          entryPrice,
          markPrice,
          unrealizedPnl,
          settledPnl,
          liquidationPrice,
          marginUsed: Math.abs(quoteEntryNum),
        });
      }
      return positions;
    } catch (err) {
      console.warn('[drift] getPositions failed:', err);
      return [];
    }
  }

  /* ── open orders ───────────────────────────────── */

  getOpenOrders(): Order[] {
    if (!this._userInitialized) return [];
    try {
      const user = this.driftClient.getUser();
      return user.getOpenOrders();
    } catch (err) {
      console.warn('[drift] getOpenOrders failed:', err);
      return [];
    }
  }

  /* ── market data ───────────────────────────────── */

  getMarkPrice(marketIndex: number): number {
    try {
      const oracle = this.driftClient.getOracleDataForPerpMarket(marketIndex);
      return oracle ? this.bnToNum(oracle.price) : 0;
    } catch { return 0; }
  }

  getFundingRate(marketIndex: number): number {
    try {
      const market = this.driftClient.getPerpMarketAccount(marketIndex);
      if (!market) return 0;
      return market.amm.lastFundingRate.toNumber() / PRICE_PRECISION.toNumber();
    } catch { return 0; }
  }

  /**
   * Get real L2 orderbook from on-chain vAMM state.
   * Uses getVammL2Generator to derive the actual AMM-implied liquidity levels.
   */
  getL2Orderbook(marketIndex: number, depth = 10): L2Orderbook {
    try {
      const market = this.driftClient.getPerpMarketAccount(marketIndex);
      if (!market) return { asks: [], bids: [], slot: 0 };

      const oracle = this.driftClient.getOracleDataForPerpMarket(marketIndex);
      if (!oracle) return { asks: [], bids: [], slot: 0 };

      const slotNum = oracle.slot.toNumber();
      const slotBN = oracle.slot;

      // Get vAMM-derived L2 levels — this is real on-chain AMM liquidity
      const vammL2Gen = getVammL2Generator({
        marketAccount: market,
        mmOraclePriceData: {
          price: oracle.price,
          slot: oracle.slot,
          confidence: oracle.confidence,
          hasSufficientNumberOfDataPoints: oracle.hasSufficientNumberOfDataPoints,
          isMMOracleActive: true,
        },
        numOrders: depth,
        latestSlot: slotBN,
      });

      const rawAsks = createL2Levels(vammL2Gen.getL2Asks(), depth);
      const rawBids = createL2Levels(vammL2Gen.getL2Bids(), depth);

      const pricePrecNum = PRICE_PRECISION.toNumber();
      const basePrecNum = BASE_PRECISION.toNumber();

      const convertLevels = (levels: L2Level[]): OrderbookLevel[] => {
        let cumTotal = 0;
        return levels.map(l => {
          const price = l.price.toNumber() / pricePrecNum;
          const size = l.size.toNumber() / basePrecNum;
          const sizeUsd = price * size;
          cumTotal += sizeUsd;
          return { price, size, sizeUsd, total: cumTotal };
        });
      };

      return {
        asks: convertLevels(rawAsks),
        bids: convertLevels(rawBids),
        slot: slotNum,
      };
    } catch (err) {
      console.warn('[drift] getL2Orderbook failed:', err);
      return { asks: [], bids: [], slot: 0 };
    }
  }

  /**
   * Get L2 orderbook from DLOB — aggregates ALL users' resting limit orders.
   * Falls back to current user's orders if DLOB is unavailable.
   */
  getOrdersL2(marketIndex: number): L2Orderbook {
    // Aggregate orders from ALL user accounts loaded from the chain
    try {
      const pricePrecNum = PRICE_PRECISION.toNumber();
      const basePrecNum = BASE_PRECISION.toNumber();

      // Get oracle price for resolving oracle-pegged orders
      let oraclePriceNum = 0;
      try {
        oraclePriceNum = this._getOraclePriceBN(marketIndex).toNumber() / pricePrecNum;
      } catch { /* ignore */ }

      const askMap = new Map<number, number>();
      const bidMap = new Map<number, number>();

      /**
       * Resolve the effective price of an order.
       * Fixed-price orders use order.price directly.
       * Oracle-pegged orders (oraclePriceOffset != 0, price == 0) compute
       * effective price as oraclePrice + offset.
       */
      const resolvePrice = (order: any): number => {
        const rawPrice = order.price.toNumber() / pricePrecNum;
        if (rawPrice > 0) return rawPrice;
        // Oracle-pegged order: price = oracle + offset
        const offset = order.oraclePriceOffset
          ? (typeof order.oraclePriceOffset === 'number'
              ? order.oraclePriceOffset
              : order.oraclePriceOffset.toNumber())
          : 0;
        if (offset !== 0 && oraclePriceNum > 0) {
          return oraclePriceNum + offset / pricePrecNum;
        }
        return 0; // can't resolve
      };

      // Compute the connected user's account PDA so we can avoid double-counting
      let myUserPDA: string | null = null;
      if (this._userInitialized) {
        try {
          myUserPDA = getUserAccountPublicKeySync(this.programId, this.wallet.publicKey, 0).toBase58();
        } catch { /* ignore */ }
      }

      // Iterate over ALL cached user accounts — skip the connected user
      // (their orders are added from getOpenOrders() below for freshness)
      for (const { publicKey, account: userAccount } of this._allUserAccounts) {
        if (!userAccount || !userAccount.orders) continue;
        // Skip connected user — we use getOpenOrders() for them (more up-to-date)
        if (myUserPDA && publicKey.toBase58() === myUserPDA) continue;
        for (const order of userAccount.orders) {
          // Only include OPEN orders for the right market
          if (!order || !('open' in (order.status as any))) continue;
          if (order.baseAssetAmount.isZero()) continue;
          if (order.marketIndex !== marketIndex) continue;
          if (!('perp' in (order.marketType as any))) continue;
          // Only include limit orders (not market orders)
          if (!('limit' in (order.orderType as any))) continue;

          const price = resolvePrice(order);
          const remaining = (order.baseAssetAmount.toNumber() - order.baseAssetAmountFilled.toNumber()) / basePrecNum;
          if (remaining <= 0 || price <= 0) continue;

          const isLong = 'long' in (order.direction as any);
          const map = isLong ? bidMap : askMap;
          map.set(price, (map.get(price) || 0) + remaining);
        }
      }

      // Always include current user's open orders (freshest via websocket subscription)
      const myBidPrices = new Set<number>();
      const myAskPrices = new Set<number>();
      if (this._userInitialized) {
        try {
          const myOrders = this.getOpenOrders().filter(
            o => o.marketIndex === marketIndex && 'perp' in (o.marketType as any)
          );
          for (const o of myOrders) {
            if (!('limit' in (o.orderType as any))) continue;
            const price = resolvePrice(o);
            const remaining = (o.baseAssetAmount.toNumber() - o.baseAssetAmountFilled.toNumber()) / basePrecNum;
            if (remaining <= 0 || price <= 0) continue;
            const isLong = 'long' in (o.direction as any);
            const map = isLong ? bidMap : askMap;
            map.set(price, (map.get(price) || 0) + remaining);
            (isLong ? myBidPrices : myAskPrices).add(price);
          }
        } catch { /* ignore */ }
      }

      // Include optimistic pending orders (not yet confirmed on-chain)
      const now = Date.now();
      this._pendingOrders = this._pendingOrders.filter(po => now - po.placedAt < 30_000);
      for (const po of this._pendingOrders) {
        if (po.marketIndex !== marketIndex) continue;
        // Skip if already confirmed in getOpenOrders
        const alreadyOnChain = this._userInitialized && (() => {
          try {
            return this.getOpenOrders().some(o =>
              o.marketIndex === marketIndex &&
              'limit' in (o.orderType as any) &&
              Math.abs(resolvePrice(o) - po.price) < 0.01
            );
          } catch { return false; }
        })();
        if (alreadyOnChain) continue;
        const map = po.direction === 'long' ? bidMap : askMap;
        map.set(po.price, (map.get(po.price) || 0) + po.sizeBase);
        (po.direction === 'long' ? myBidPrices : myAskPrices).add(po.price);
      }

      const buildLevels = (map: Map<number, number>, ascending: boolean, myPrices: Set<number>): OrderbookLevel[] => {
        const entries = [...map.entries()].sort((a, b) => ascending ? a[0] - b[0] : b[0] - a[0]);
        let cumTotal = 0;
        return entries.map(([price, size]) => {
          const sizeUsd = price * size;
          cumTotal += sizeUsd;
          return { price, size, sizeUsd, total: cumTotal, isMine: myPrices.has(price) };
        });
      };

      return {
        asks: buildLevels(askMap, true, myAskPrices),
        bids: buildLevels(bidMap, false, myBidPrices),
        slot: 0,
      };
    } catch (err) {
      console.warn('[drift] getOrdersL2 failed:', err);
      return { asks: [], bids: [], slot: 0 };
    }
  }

  /**
   * Build MakerInfo[] from cached user accounts for the given market and direction.
   * Used to match market orders against other users' resting limit orders.
   */
  private _getMakerInfoForOrder(
    marketIndex: number,
    takerDirection: PositionDirection,
  ): MakerInfo[] {
    try {
      const isLong = 'long' in (takerDirection as any);
      const myKey = this.wallet.publicKey.toString();
      const makersMap = new Map<string, MakerInfo>();

      console.log(`[drift] _getMakerInfoForOrder: scanning ${this._allUserAccounts.length} cached accounts, myKey=${myKey.slice(0,8)}..., looking for ${isLong ? 'SHORT' : 'LONG'} makers`);

      for (const { publicKey, account: userAccount } of this._allUserAccounts) {
        if (makersMap.size >= 5) break; // tx size limit
        if (!userAccount || !userAccount.orders) continue;

        const userPkStr = publicKey.toString();
        // Skip self
        if (userAccount.authority.toString() === myKey) continue;
        if (makersMap.has(userPkStr)) continue;

        // Check if this user has any opposing resting limit orders
        const hasOpposingOrder = userAccount.orders.some((order: any) => {
          if (!order || !('open' in (order.status as any))) return false;
          if (order.baseAssetAmount.isZero()) return false;
          if (order.marketIndex !== marketIndex) return false;
          if (!('perp' in (order.marketType as any))) return false;
          if (!('limit' in (order.orderType as any))) return false;
          const remaining = order.baseAssetAmount.toNumber() - order.baseAssetAmountFilled.toNumber();
          if (remaining <= 0) return false;
          // If taker is buying (long), we need resting sells (short direction)
          const orderIsLong = 'long' in (order.direction as any);
          return isLong ? !orderIsLong : orderIsLong;
        });

        if (!hasOpposingOrder) continue;

        // Find the specific best opposing order to pass as maker order
        const bestOrder = userAccount.orders.find((order: any) => {
          if (!order || !('open' in (order.status as any))) return false;
          if (order.baseAssetAmount.isZero()) return false;
          if (order.marketIndex !== marketIndex) return false;
          if (!('perp' in (order.marketType as any))) return false;
          if (!('limit' in (order.orderType as any))) return false;
          const rem = order.baseAssetAmount.toNumber() - order.baseAssetAmountFilled.toNumber();
          if (rem <= 0) return false;
          const oIsLong = 'long' in (order.direction as any);
          return isLong ? !oIsLong : oIsLong;
        });

        try {
          const makerStats = getUserStatsAccountPublicKey(
            this.programId,
            userAccount.authority,
          );
          makersMap.set(userPkStr, {
            maker: publicKey,
            makerStats,
            makerUserAccount: userAccount,
            order: bestOrder,
          });
        } catch { /* skip */ }
      }

      const makers = [...makersMap.values()];
      if (makers.length > 0) {
        console.log(`[drift] found ${makers.length} maker(s) to match against`);
      }
      return makers;
    } catch (err) {
      console.warn('[drift] _getMakerInfoForOrder failed:', err);
      return [];
    }
  }

  /**
   * Get open interest from AMM state.
   * Returns base asset amount open in the market (in SOL units).
   */
  getOpenInterest(marketIndex: number): number {
    try {
      const market = this.driftClient.getPerpMarketAccount(marketIndex);
      if (!market) return 0;
      const longOI = market.amm.baseAssetAmountLong.abs().toNumber() / BASE_PRECISION.toNumber();
      const shortOI = market.amm.baseAssetAmountShort.abs().toNumber() / BASE_PRECISION.toNumber();
      return (longOI + shortOI) / 2; // one side of the market
    } catch { return 0; }
  }

  /**
   * Get comprehensive AMM stats for display in Bot Monitor.
   */
  getAmmStats(marketIndex: number): AmmStats | null {
    try {
      const market = this.driftClient.getPerpMarketAccount(marketIndex);
      if (!market) return null;
      const amm = market.amm;
      const basePrecNum = BASE_PRECISION.toNumber();
      const pricePrecNum = PRICE_PRECISION.toNumber();
      const PEG_PRECISION = 1e6;
      const SPREAD_PRECISION = 1e6;

      const netBase = amm.baseAssetAmountWithAmm.toNumber() / basePrecNum;
      const sqrtK = amm.sqrtK.toNumber() / basePrecNum;
      const baseReserve = amm.baseAssetReserve.toNumber() / basePrecNum;
      const quoteReserve = amm.quoteAssetReserve.toNumber() / basePrecNum;
      const pegMultiplier = amm.pegMultiplier.toNumber() / PEG_PRECISION;

      const longSpread = (amm.longSpread ?? 0);
      const shortSpread = (amm.shortSpread ?? 0);
      const baseSpread = amm.baseSpread;
      const maxSpread = amm.maxSpread;

      const totalFee = amm.totalFee.toNumber() / pricePrecNum;
      const totalFeeMinusDist = amm.totalFeeMinusDistributions.toNumber() / pricePrecNum;

      const longOI = amm.baseAssetAmountLong.abs().toNumber() / basePrecNum;
      const shortOI = amm.baseAssetAmountShort.abs().toNumber() / basePrecNum;
      const lastFundingRate = amm.lastFundingRate.toNumber() / pricePrecNum;

      return {
        netPosition: Math.abs(netBase),
        netDirection: netBase > 0.0001 ? 'LONG' : netBase < -0.0001 ? 'SHORT' : 'FLAT',
        sqrtK,
        baseReserve,
        quoteReserve,
        pegMultiplier,
        longSpread: longSpread / (SPREAD_PRECISION / 10000),  // convert to bps
        shortSpread: shortSpread / (SPREAD_PRECISION / 10000),
        baseSpread: baseSpread / (SPREAD_PRECISION / 10000),
        maxSpread: maxSpread / (SPREAD_PRECISION / 10000),
        totalFee,
        totalFeeMinusDistributions: totalFeeMinusDist,
        longOI,
        shortOI,
        lastFundingRate,
      };
    } catch (err) {
      console.warn('[drift] getAmmStats failed:', err);
      return null;
    }
  }

  /* ── trading ───────────────────────────────────── */

  /**
   * Emit a trade directly to the Zustand store so the Recent Trades panel
   * updates instantly after a placeAndTakePerpOrder (no polling delay).
   */
  private _emitRecentTrade(
    marketIndex: number,
    direction: 'long' | 'short' | 'buy' | 'sell',
    sizeBase: number,
    oraclePriceRaw: number,
    txSig: string,
  ) {
    try {
      const price = oraclePriceRaw / PRICE_PRECISION.toNumber();
      const sizeUsd = sizeBase * price;
      const side: 'buy' | 'sell' =
        direction === 'long' || direction === 'buy' ? 'buy' : 'sell';

      // Estimate taker fee from notional value (0.05% default)
      const TAKER_FEE_RATE = 0.0005;
      const takerFee = sizeUsd * TAKER_FEE_RATE;

      useDriftStore.getState().addRecentTrade({
        price,
        size: sizeUsd,
        side,
        ts: Date.now(),
        txSig,
        marketIndex,
        takerFee,
      });
      console.log(`[drift] emitted recent trade: ${side} ${sizeBase.toFixed(4)} @ $${price.toFixed(2)} (fee: $${takerFee.toFixed(4)})`);
    } catch (err) {
      console.debug('[drift] _emitRecentTrade error:', err);
    }
  }

  /**
   * Get the current oracle price for a perp market (as raw BN).
   */
  private _getOraclePriceBN(marketIndex: number): BN {
    try {
      const oracle = this.driftClient.getOracleDataForPerpMarket(marketIndex);
      if (oracle && oracle.price && !oracle.price.isZero()) {
        return oracle.price;
      }
    } catch { /* fall through */ }
    // Fallback: use the store's cached oracle price if available
    const storePrice = useDriftStore.getState().oraclePrice;
    if (storePrice > 0) {
      return new BN(Math.round(storePrice * PRICE_PRECISION.toNumber()));
    }
    // Last resort: throw so callers don't silently use a wrong price
    throw new Error('Oracle price unavailable — cannot determine market price');
  }

  async openPosition(
    marketIndex: number,
    direction: 'long' | 'short',
    sizeBase: number,
    leverage: number,
    orderType: 'market' | 'limit' = 'market',
    limitPrice?: number,
    slippageBps?: number,
  ): Promise<string> {
    if (!this._userInitialized) {
      throw new Error('No Value account. Please set up your account first.');
    }

    const baseAmount = new BN(Math.floor(sizeBase * BASE_PRECISION.toNumber()));
    const dir = direction === 'long' ? PositionDirection.LONG : PositionDirection.SHORT;

    console.log(`[drift] placing ${direction} ${orderType}: ${sizeBase} base @ ${leverage}x`);

    if (orderType === 'limit' && limitPrice != null) {
      const priceBN = new BN(Math.floor(limitPrice * PRICE_PRECISION.toNumber()));

      // Check for crossing makers — on devnet there are no keeper bots,
      // so we must use placeAndTakePerpOrder to fill immediately when possible.
      await this._refreshAllUserAccounts();
      const makerInfo = this._getMakerInfoForOrder(marketIndex, dir);

      // Check if any maker's price actually crosses our limit price
      const hasCrossingMaker = makerInfo.some((m) => {
        if (!m.order?.price) return false;
        const makerPrice = m.order.price;
        if (direction === 'long') {
          // Buying: maker's ask price must be <= our limit buy price
          return makerPrice.lte(priceBN);
        } else {
          // Selling: maker's bid price must be >= our limit sell price
          return makerPrice.gte(priceBN);
        }
      });

      if (hasCrossingMaker) {
        console.log(`[drift] limit order has ${makerInfo.length} crossing maker(s) — using placeAndTake`);
        try {
          const txSig = await this.driftClient.placeAndTakePerpOrder(
            {
              marketIndex,
              direction: dir,
              baseAssetAmount: baseAmount,
              orderType: OrderType.LIMIT,
              price: priceBN,
              auctionDuration: 0,
              auctionStartPrice: priceBN,
              auctionEndPrice: priceBN,
            },
            makerInfo,
            undefined,  // referrerInfo
            undefined,  // successCondition
            100,        // auctionDurationPercentage
          );
          const txSigStr = typeof txSig === 'string' ? txSig : String(txSig);
          console.log('[drift] limit order filled via placeAndTake:', txSigStr);
          this._emitRecentTrade(marketIndex, direction, sizeBase, limitPrice! * PRICE_PRECISION.toNumber(), txSigStr);
          this._refreshAllUserAccounts();
          return txSigStr;
        } catch (err: any) {
          console.warn('[drift] placeAndTake for limit failed, falling back to placePerpOrder:', err?.message);
          // Fall through to just place the order as a resting limit
        }
      }

      // No crossing makers (or placeAndTake failed) — just place a resting limit order
      // Add optimistic entry so it shows in orderbook immediately
      this._pendingOrders.push({
        marketIndex,
        direction,
        price: limitPrice!,
        sizeBase,
        placedAt: Date.now(),
      });

      const txSig = await this.driftClient.placePerpOrder({
        marketIndex,
        direction: dir,
        baseAssetAmount: baseAmount,
        orderType: OrderType.LIMIT,
        price: priceBN,
      });
      const txSigStr = typeof txSig === 'string' ? txSig : String(txSig);
      console.log('[drift] limit order placed (resting):', txSigStr);
      // Force-refresh so the on-chain order replaces the optimistic entry
      await this._refreshAllUserAccounts();
      return txSigStr;
    }

    // ── Market order via placeAndTakePerpOrder ──────────────────
    // Force-refresh user accounts so we match against the latest resting orders.
    await this._refreshAllUserAccounts();

    const makerInfo = this._getMakerInfoForOrder(marketIndex, dir);
    console.log(`[drift] found ${makerInfo.length} maker(s) for market ${direction}`);
    for (const m of makerInfo) {
      console.log(`[drift]   maker=${m.maker.toBase58()}, order price=${m.order?.price?.toString()}, dir=${JSON.stringify(m.order?.direction)}`);
    }

    // Compute a generous worst-case price for placeAndTake market orders.
    //
    // IMPORTANT: For placeAndTake, the auction start price determines the
    // taker's price at the exact slot the instruction executes (slot 0 of
    // the auction).  The on-chain program only matches maker orders whose
    // effective price crosses the taker's price at that slot.
    //
    // The maker bot uses oracle-offset limit orders (e.g. ask = oracle + 0.16).
    // If we set auctionStartPrice = oracle, the taker price at slot 0 is just
    // oracle, which is BELOW the maker's asks → no maker match → entire fill
    // goes to the AMM and the maker's position never changes.
    //
    // Fix: set auctionStartPrice = worstCasePrice so the taker immediately
    // crosses with ALL maker orders at slot 0.  The on-chain program still
    // fills at the BEST available price (makers first, then AMM), so the user
    // gets price improvement despite the generous limit.
    const oraclePriceBN = this._getOraclePriceBN(marketIndex);
    const oracleNum = oraclePriceBN.toNumber();
    const effectiveSlippageBps = slippageBps ?? 100; // default 1% if not specified

    let worstCasePrice: BN;

    if (direction === 'long') {
      // Buyer: willing to pay up to oracle * (1 + slippage%)
      worstCasePrice = new BN(Math.ceil(oracleNum * (1 + effectiveSlippageBps / 10000)));
    } else {
      // Seller: willing to sell down to oracle * (1 - slippage%)
      worstCasePrice = new BN(Math.floor(oracleNum * (1 - effectiveSlippageBps / 10000)));
    }

    console.log(`[drift] oracle=${oracleNum}, worstCase=${worstCasePrice.toString()}, slippage=${effectiveSlippageBps}bps, makers=${makerInfo.length}`);

    try {
      const txSig = await this.driftClient.placeAndTakePerpOrder(
        {
          marketIndex,
          direction: dir,
          baseAssetAmount: baseAmount,
          orderType: OrderType.MARKET,
          price: worstCasePrice,
          // For placeAndTake: start the auction at the worst-case price so
          // maker orders cross immediately at slot 0.  The program fills at
          // the best available price regardless.
          auctionDuration: 10,
          auctionStartPrice: worstCasePrice,
          auctionEndPrice: worstCasePrice,
        },
        makerInfo.length > 0 ? makerInfo : undefined,
        undefined,  // referrerInfo
        undefined,  // successCondition
      );
      const txSigStr = typeof txSig === 'string' ? txSig : String(txSig);
      console.log('[drift] market order tx:', txSigStr, makerInfo.length > 0 ? `(matched ${makerInfo.length} maker(s))` : '(AMM only)');
      // Emit direct trade capture so Recent Trades updates instantly
      this._emitRecentTrade(marketIndex, direction, sizeBase, oracleNum, txSigStr);
      // Force-refresh so filled orders disappear from orderbook
      this._refreshAllUserAccounts();
      return txSigStr;
    } catch (err: any) {
      console.error('[drift] placeAndTakePerpOrder failed:', err);
      // Re-throw with a clearer message
      const msg = err?.message || err?.toString() || 'Unknown error';
      const logs = err?.logs?.join?.('\n') || '';
      if (logs) console.error('[drift] tx logs:\n', logs);
      throw new Error(`Market order failed: ${msg}`);
    }
  }

  /** Convenience: open a long perp position at market */
  async openLongPosition(marketIndex: number, sizeBase: number, leverage: number): Promise<string> {
    return this.openPosition(marketIndex, 'long', sizeBase, leverage, 'market');
  }

  /** Convenience: open a short perp position at market */
  async openShortPosition(marketIndex: number, sizeBase: number, leverage: number): Promise<string> {
    return this.openPosition(marketIndex, 'short', sizeBase, leverage, 'market');
  }

  async closePosition(marketIndex: number, slippageBps?: number): Promise<string> {
    try {
      const user = this.driftClient.getUser();
      const pos = user.getPerpPosition(marketIndex);
      if (!pos || pos.baseAssetAmount.isZero()) {
        throw new Error('No open position');
      }

      const closeDir = pos.baseAssetAmount.gt(new BN(0))
        ? PositionDirection.SHORT
        : PositionDirection.LONG;

      // Use placeAndTakePerpOrder (same as market orders) so the position
      // is filled immediately against the AMM instead of waiting for a filler bot.
      await this._refreshAllUserAccounts();

      const makerInfo = this._getMakerInfoForOrder(marketIndex, closeDir);
      const oraclePriceBN = this._getOraclePriceBN(marketIndex);
      const oracleNum = oraclePriceBN.toNumber();
      const effectiveSlippageBps = slippageBps ?? 100; // default 1% if not specified

      let worstCasePrice: BN;

      if (closeDir === PositionDirection.LONG) {
        worstCasePrice = new BN(Math.ceil(oracleNum * (1 + effectiveSlippageBps / 10000)));
      } else {
        worstCasePrice = new BN(Math.floor(oracleNum * (1 - effectiveSlippageBps / 10000)));
      }

      console.log(`[drift] closing position: dir=${closeDir === PositionDirection.LONG ? 'LONG' : 'SHORT'}, size=${pos.baseAssetAmount.abs().toString()}, oracle=${oracleNum}, worstCase=${worstCasePrice.toString()}`);

      const txSig = await this.driftClient.placeAndTakePerpOrder(
        {
          marketIndex,
          direction: closeDir,
          baseAssetAmount: pos.baseAssetAmount.abs(),
          orderType: OrderType.MARKET,
          reduceOnly: true,
          price: worstCasePrice,
          // Start auction at worst-case price so maker orders cross immediately
          auctionDuration: 10,
          auctionStartPrice: worstCasePrice,
          auctionEndPrice: worstCasePrice,
        },
        makerInfo.length > 0 ? makerInfo : undefined,
        undefined, // referrerInfo
        undefined, // successCondition
      );

      const txSigStr = typeof txSig === 'string' ? txSig : String(txSig);
      console.log('[drift] close position tx:', txSigStr);
      // Direct trade capture for close
      const closeSide = pos.baseAssetAmount.gt(new BN(0)) ? 'sell' : 'buy';
      const closeSizeBase = pos.baseAssetAmount.abs().toNumber() / BASE_PRECISION.toNumber();
      this._emitRecentTrade(marketIndex, closeSide, closeSizeBase, oracleNum, txSigStr);
      this._refreshAllUserAccounts();
      return txSigStr;
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Unknown error';
      const logs = err?.logs?.join?.('\n') || '';
      if (logs) console.error('[drift] close position tx logs:\n', logs);
      throw new Error(`Close position failed: ${msg}`);
    }
  }

  /**
   * Close a position (fully or partially) with a limit order.
   * Places a reduce-only limit order that won't increase the position.
   */
  async closeLimitPosition(
    marketIndex: number,
    sizeBase: number,
    limitPrice: number,
  ): Promise<string> {
    try {
      const user = this.driftClient.getUser();
      const pos = user.getPerpPosition(marketIndex);
      if (!pos || pos.baseAssetAmount.isZero()) {
        throw new Error('No open position');
      }

      const closeDir = pos.baseAssetAmount.gt(new BN(0))
        ? PositionDirection.SHORT
        : PositionDirection.LONG;

      const baseAmount = new BN(Math.floor(sizeBase * BASE_PRECISION.toNumber()));
      const priceBN = new BN(Math.floor(limitPrice * PRICE_PRECISION.toNumber()));

      console.log(`[drift] placing reduce-only limit close: dir=${closeDir === PositionDirection.LONG ? 'LONG' : 'SHORT'}, size=${sizeBase}, price=${limitPrice}`);

      const txSig = await this.driftClient.placePerpOrder({
        marketIndex,
        direction: closeDir,
        baseAssetAmount: baseAmount,
        orderType: OrderType.LIMIT,
        price: priceBN,
        reduceOnly: true,
      });

      const txSigStr = typeof txSig === 'string' ? txSig : String(txSig);
      console.log('[drift] limit close order placed:', txSigStr);
      await this._refreshAllUserAccounts();
      return txSigStr;
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Unknown error';
      const logs = err?.logs?.join?.('\n') || '';
      if (logs) console.error('[drift] limit close tx logs:\n', logs);
      throw new Error(`Limit close failed: ${msg}`);
    }
  }

  async cancelOrder(orderId: number): Promise<string> {
    const txSig = await this.driftClient.cancelOrder(orderId);
    // Force-refresh ALL user accounts so the orderbook updates immediately
    this._refreshAllUserAccounts();
    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Settle PnL for the connected user on a given perp market.
   * Converts unrealized PnL into realized (settled) balance.
   */
  async settlePnl(marketIndex: number): Promise<string> {
    const user = this.driftClient.getUser();
    const userAccountPubkey = await this.driftClient.getUserAccountPublicKey();
    const userAccount = user.getUserAccount();

    console.log(`[drift] settling PnL for market ${marketIndex}...`);
    const txSig = await this.driftClient.settlePNL(
      userAccountPubkey,
      userAccount,
      marketIndex,
    );
    const txStr = typeof txSig === 'string' ? txSig : String(txSig);
    console.log('[drift] settle PnL tx:', txStr);
    this._refreshAllUserAccounts();
    return txStr;
  }

  /**
   * Settle PnL for ALL perp markets where the user has positions.
   */
  async settleAllPnl(): Promise<string[]> {
    const user = this.driftClient.getUser();
    const userAccount = user.getUserAccount();
    const results: string[] = [];

    for (const perpPos of userAccount.perpPositions) {
      if (perpPos.baseAssetAmount.isZero() && perpPos.quoteAssetAmount.isZero()) continue;
      try {
        const tx = await this.settlePnl(perpPos.marketIndex);
        results.push(tx);
      } catch (err: any) {
        console.warn(`[drift] settle PnL market ${perpPos.marketIndex} failed:`, err?.message);
      }
    }
    return results;
  }

  /* ── Insurance Fund ────────────────────────────── */

  /**
   * Fetch insurance fund stats from the spot market account (market 0 = USDC).
   */
  async getInsuranceFundStats(marketIndex = 0): Promise<InsuranceFundStats | null> {
    try {
      const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
      if (!spotMarket) return null;
      const ifData = spotMarket.insuranceFund;

      // Get IF vault balance
      let vaultBalance = 0;
      try {
        const bal = await this.connection.getTokenAccountBalance(ifData.vault);
        vaultBalance = Number(bal.value.uiAmountString || '0');
      } catch { /* vault may not exist yet */ }

      // Sum total fees from all perp markets
      let totalFeesCollected = 0;
      try {
        const numMarkets = this.driftClient.getStateAccount().numberOfMarkets;
        for (let i = 0; i < numMarkets; i++) {
          const perp = this.driftClient.getPerpMarketAccount(i);
          if (perp) {
            totalFeesCollected += perp.amm.totalFee.toNumber() / 1e6;
          }
        }
      } catch { /* ignore */ }

      return {
        vaultBalance,
        totalShares: ifData.totalShares.toString(),
        userShares: ifData.userShares.toString(),
        unstakingPeriod: ifData.unstakingPeriod.toNumber(),
        revenueSettlePeriod: ifData.revenueSettlePeriod.toNumber(),
        totalFactor: ifData.totalFactor,
        userFactor: ifData.userFactor,
        revenuePoolBalance: spotMarket.revenuePool.scaledBalance.toString(),
        lastRevenueSettleTs: ifData.lastRevenueSettleTs.toNumber(),
        sharesBase: typeof ifData.sharesBase === 'number' ? ifData.sharesBase : (ifData.sharesBase as any).toNumber(),
        totalFeesCollected,
      };
    } catch (err) {
      console.error('[drift] getInsuranceFundStats error', err);
      return null;
    }
  }

  /**
   * Fetch user's IF stake info.
   */
  async getUserIfStake(marketIndex = 0): Promise<UserIfStake> {
    const notInitialized: UserIfStake = {
      ifShares: '0',
      stakeValue: 0,
      lastWithdrawRequestShares: '0',
      lastWithdrawRequestValue: 0,
      lastWithdrawRequestTs: 0,
      costBasis: 0,
      isInitialized: false,
    };

    try {
      const authority = this.wallet.publicKey;
      if (!authority) return notInitialized;

      const stakeAccountPubkey = getInsuranceFundStakeAccountPublicKey(
        this.programId,
        authority,
        marketIndex
      );

      // Check if account exists
      const acctInfo = await this.connection.getAccountInfo(stakeAccountPubkey);
      if (!acctInfo) return notInitialized;

      // Decode the InsuranceFundStake account
      const stakeAccount = (this.driftClient as any).program.account.insuranceFundStake.coder.accounts.decode(
        'InsuranceFundStake',
        acctInfo.data
      );

      // Calculate current value of shares
      const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
      let stakeValue = 0;
      if (spotMarket) {
        try {
          const ifVaultBal = await this.connection.getTokenAccountBalance(spotMarket.insuranceFund.vault);
          const vaultBalanceBN = new BN(ifVaultBal.value.amount);
          const valueBN = unstakeSharesToAmount(
            stakeAccount.ifShares,
            spotMarket.insuranceFund.totalShares,
            vaultBalanceBN
          );
          stakeValue = valueBN.toNumber() / QUOTE_PRECISION.toNumber();
        } catch { /* ignore */ }
      }

      return {
        ifShares: stakeAccount.ifShares.toString(),
        stakeValue,
        lastWithdrawRequestShares: stakeAccount.lastWithdrawRequestShares.toString(),
        lastWithdrawRequestValue: stakeAccount.lastWithdrawRequestValue.toNumber() / QUOTE_PRECISION.toNumber(),
        lastWithdrawRequestTs: stakeAccount.lastWithdrawRequestTs.toNumber(),
        costBasis: stakeAccount.costBasis.toNumber() / QUOTE_PRECISION.toNumber(),
        isInitialized: true,
      };
    } catch (err) {
      console.error('[drift] getUserIfStake error', err);
      return notInitialized;
    }
  }

  /**
   * Initialize insurance fund stake account + add initial stake.
   */
  async stakeInInsuranceFund(usdcAmount: number, marketIndex = 0): Promise<string> {
    const amountBN = new BN(usdcAmount * QUOTE_PRECISION.toNumber());
    const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
    if (!spotMarket) throw new Error('Spot market not found');

    const ata = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.wallet.publicKey!,
      true
    );

    // Check if stake account already exists
    const stakeAccountPubkey = getInsuranceFundStakeAccountPublicKey(
      this.programId,
      this.wallet.publicKey!,
      marketIndex
    );
    const acctInfo = await this.connection.getAccountInfo(stakeAccountPubkey);
    const needsInit = !acctInfo;

    const txSig = await this.driftClient.addInsuranceFundStake({
      marketIndex,
      amount: amountBN,
      collateralAccountPublicKey: ata,
      initializeStakeAccount: needsInit,
    });

    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Request to unstake from insurance fund (starts cooldown).
   *
   * The on-chain instruction expects a RAW TOKEN AMOUNT (USDC lamports),
   * not shares.  It internally converts:
   *   n_shares = amount * total_shares / vault_balance
   *
   * For a full unstake we compute the exact token value of all the user's
   * shares from fresh on-chain data so rounding is minimal.
   */
  async requestUnstakeInsuranceFund(usdcAmount: number, marketIndex = 0): Promise<string> {
    const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
    if (!spotMarket) throw new Error('Spot market not found');

    // Fetch user's real stake for full-unstake detection
    const userStake = await this.getUserIfStake(marketIndex);
    if (!userStake.isInitialized) throw new Error('No insurance fund stake account found');

    let amountBN: BN;

    if (userStake.stakeValue > 0 && usdcAmount >= userStake.stakeValue * 0.999) {
      // Full unstake — compute exact token value of ALL user shares using
      // a fresh vault balance read so the on-chain division lands on the
      // correct share count.
      const userSharesBN = new BN(userStake.ifShares);
      const ifVaultBal = await this.connection.getTokenAccountBalance(spotMarket.insuranceFund.vault);
      const vaultBalanceBN = new BN(ifVaultBal.value.amount);
      amountBN = unstakeSharesToAmount(
        userSharesBN,
        spotMarket.insuranceFund.totalShares,
        vaultBalanceBN
      );
      console.log('[drift] requestUnstake FULL — shares:', userSharesBN.toString(),
        'totalShares:', spotMarket.insuranceFund.totalShares.toString(),
        'vault:', vaultBalanceBN.toString(),
        'tokenAmount:', amountBN.toString());
    } else {
      // Partial unstake — pass the USDC amount in raw lamports; the
      // on-chain program will convert to the appropriate share count.
      amountBN = new BN(Math.round(usdcAmount * QUOTE_PRECISION.toNumber()));
      console.log('[drift] requestUnstake PARTIAL — usdcAmount:', usdcAmount,
        'lamports:', amountBN.toString());
    }

    const txSig = await this.driftClient.requestRemoveInsuranceFundStake(
      marketIndex,
      amountBN
    );

    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Complete unstake after cooldown period has passed.
   */
  async completeUnstakeInsuranceFund(marketIndex = 0): Promise<string> {
    const spotMarket = this.driftClient.getSpotMarketAccount(marketIndex);
    if (!spotMarket) throw new Error('Spot market not found');

    const ata = getAssociatedTokenAddressSync(
      spotMarket.mint,
      this.wallet.publicKey!,
      true
    );

    const txSig = await this.driftClient.removeInsuranceFundStake(
      marketIndex,
      ata
    );

    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /**
   * Cancel a pending unstake request.
   */
  async cancelUnstakeInsuranceFund(marketIndex = 0): Promise<string> {
    const txSig = await this.driftClient.cancelRequestRemoveInsuranceFundStake(marketIndex);
    return typeof txSig === 'string' ? txSig : String(txSig);
  }

  /* ── helpers ───────────────────────────────────── */

  private bnToNum(bn: any): number {
    if (typeof bn === 'number') return bn;
    try {
      return bn.toNumber() / PRICE_PRECISION.toNumber();
    } catch {
      return 0;
    }
  }
}

export default DriftTradingClient;

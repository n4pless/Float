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
} from '@drift-labs/sdk';
import type { Order, L2Level, UserAccount, MakerInfo } from '@drift-labs/sdk';
export type { Order } from '@drift-labs/sdk';

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
}

export interface L2Orderbook {
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  slot: number;
}

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
  private _bulkLoader: BulkAccountLoader | null = null;

  // Cross-user orderbook: cache of ALL user accounts on the protocol
  private _allUserAccounts: CachedUserAccount[] = [];
  private _allUserAccountsRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _allUserAccountsLoading = false;

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

      // Use polling subscription for reliable updates
      this._bulkLoader = new BulkAccountLoader(
        this.connection as any,
        'confirmed',
        1000  // poll every 1s
      );

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
          type: 'polling',
          accountLoader: this._bulkLoader,
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
    if (this._bulkLoader) {
      try { (this._bulkLoader as any).stopPolling?.(); } catch { /* ignore */ }
    }
  }

  /**
   * Fetch ALL Drift user accounts on this program.
   * This gives us every user's orders for the cross-user orderbook.
   */
  private async _refreshAllUserAccounts(): Promise<void> {
    if (this._allUserAccountsLoading) return;
    this._allUserAccountsLoading = true;
    try {
      const accounts = await this.driftClient.fetchAllUserAccounts(true);
      this._allUserAccounts = accounts as unknown as CachedUserAccount[];
      console.log(`[drift] loaded ${accounts.length} user account(s) from chain`);
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
    }, 8000); // refresh every 8 seconds
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
        const quoteNum = pos.quoteEntryAmount.toNumber() / PRICE_PRECISION.toNumber();
        const entryPrice = baseNum !== 0 ? Math.abs(quoteNum / baseNum) : 0;
        const unrealizedPnl = baseNum * (markPrice - entryPrice);

        positions.push({
          marketIndex: pos.marketIndex,
          baseAssetAmount: Math.abs(baseNum),
          quoteEntryAmount: Math.abs(quoteNum),
          direction: baseAmt.gt(new BN(0)) ? 'LONG' : 'SHORT',
          leverage: 1,
          entryPrice,
          markPrice,
          unrealizedPnl,
          liquidationPrice: 0,
          marginUsed: Math.abs(quoteNum),
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

      // Iterate over ALL cached user accounts (not just the connected wallet)
      for (const { account: userAccount } of this._allUserAccounts) {
        if (!userAccount || !userAccount.orders) continue;
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

      // Also include current user's open orders (in case fetchAll hasn't refreshed yet)
      if (this._userInitialized) {
        try {
          const myOrders = this.getOpenOrders().filter(
            o => o.marketIndex === marketIndex && 'perp' in (o.marketType as any)
          );
          for (const o of myOrders) {
            const price = resolvePrice(o);
            const remaining = (o.baseAssetAmount.toNumber() - o.baseAssetAmountFilled.toNumber()) / basePrecNum;
            if (remaining <= 0 || price <= 0) continue;
            const isLong = 'long' in (o.direction as any);
            const map = isLong ? bidMap : askMap;
            // Don't double-count — only add if not already from fetchAll
            if (!map.has(price)) {
              map.set(price, remaining);
            }
          }
        } catch { /* ignore */ }
      }

      const buildLevels = (map: Map<number, number>, ascending: boolean): OrderbookLevel[] => {
        const entries = [...map.entries()].sort((a, b) => ascending ? a[0] - b[0] : b[0] - a[0]);
        let cumTotal = 0;
        return entries.map(([price, size]) => {
          const sizeUsd = price * size;
          cumTotal += sizeUsd;
          return { price, size, sizeUsd, total: cumTotal };
        });
      };

      return {
        asks: buildLevels(askMap, true),
        bids: buildLevels(bidMap, false),
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

  /* ── trading ───────────────────────────────────── */

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
    // Fallback: use a sensible default so the order still has a price
    return new BN(100).mul(PRICE_PRECISION);
  }

  async openPosition(
    marketIndex: number,
    direction: 'long' | 'short',
    sizeBase: number,
    leverage: number,
    orderType: 'market' | 'limit' = 'market',
    limitPrice?: number,
  ): Promise<string> {
    if (!this._userInitialized) {
      throw new Error('No Float account. Please set up your account first.');
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
          console.log('[drift] limit order filled via placeAndTake:', txSig);
          this._refreshAllUserAccounts();
          return typeof txSig === 'string' ? txSig : String(txSig);
        } catch (err: any) {
          console.warn('[drift] placeAndTake for limit failed, falling back to placePerpOrder:', err?.message);
          // Fall through to just place the order as a resting limit
        }
      }

      // No crossing makers (or placeAndTake failed) — just place a resting limit order
      const txSig = await this.driftClient.placePerpOrder({
        marketIndex,
        direction: dir,
        baseAssetAmount: baseAmount,
        orderType: OrderType.LIMIT,
        price: priceBN,
      });
      console.log('[drift] limit order placed (resting):', txSig);
      // Force-refresh so the new order shows in orderbook immediately
      this._refreshAllUserAccounts();
      return typeof txSig === 'string' ? txSig : String(txSig);
    }

    // ── Market order via placeAndTakePerpOrder ──────────────────
    // Force-refresh user accounts so we match against the latest resting orders.
    await this._refreshAllUserAccounts();

    const makerInfo = this._getMakerInfoForOrder(marketIndex, dir);
    console.log(`[drift] found ${makerInfo.length} maker(s) for market ${direction}`);
    for (const m of makerInfo) {
      console.log(`[drift]   maker=${m.maker.toBase58()}, order price=${m.order?.price?.toString()}, dir=${JSON.stringify(m.order?.direction)}`);
    }

    // Compute a generous worst-case price and explicit auction params
    // so the on-chain program has room to cross against makers.
    // On fresh devnet markets the TWAP-derived auction is often too tight.
    const oraclePriceBN = this._getOraclePriceBN(marketIndex);
    const oracleNum = oraclePriceBN.toNumber();
    const slippageBps = 500; // 5% slippage tolerance

    let worstCasePrice: BN;
    let auctionStartPrice: BN;
    let auctionEndPrice: BN;

    if (direction === 'long') {
      // Buyer: willing to pay up to oracle * 1.05
      worstCasePrice = new BN(Math.ceil(oracleNum * (1 + slippageBps / 10000)));
      auctionStartPrice = oraclePriceBN;
      auctionEndPrice = worstCasePrice;
    } else {
      // Seller: willing to sell down to oracle * 0.95
      worstCasePrice = new BN(Math.floor(oracleNum * (1 - slippageBps / 10000)));
      auctionStartPrice = oraclePriceBN;
      auctionEndPrice = worstCasePrice;
    }

    console.log(`[drift] oracle=${oracleNum}, worstCase=${worstCasePrice.toString()}, auctionStart=${auctionStartPrice.toString()}, auctionEnd=${auctionEndPrice.toString()}`);

    try {
      const txSig = await this.driftClient.placeAndTakePerpOrder(
        {
          marketIndex,
          direction: dir,
          baseAssetAmount: baseAmount,
          orderType: OrderType.MARKET,
          price: worstCasePrice,
          auctionDuration: 10,
          auctionStartPrice: auctionStartPrice,
          auctionEndPrice: auctionEndPrice,
        },
        makerInfo.length > 0 ? makerInfo : undefined,
        undefined,  // referrerInfo
        undefined,  // successCondition
        100,        // auctionDurationPercentage — fill at auction end price immediately
      );
      console.log('[drift] market order tx:', txSig, makerInfo.length > 0 ? `(matched ${makerInfo.length} maker(s))` : '(AMM only)');
      // Force-refresh so filled orders disappear from orderbook
      this._refreshAllUserAccounts();
      return typeof txSig === 'string' ? txSig : String(txSig);
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

  async closePosition(marketIndex: number): Promise<string> {
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
      const slippageBps = 500; // 5 %

      let worstCasePrice: BN;
      let auctionStartPrice: BN;
      let auctionEndPrice: BN;

      if (closeDir === PositionDirection.LONG) {
        worstCasePrice = new BN(Math.ceil(oracleNum * (1 + slippageBps / 10000)));
        auctionStartPrice = oraclePriceBN;
        auctionEndPrice = worstCasePrice;
      } else {
        worstCasePrice = new BN(Math.floor(oracleNum * (1 - slippageBps / 10000)));
        auctionStartPrice = oraclePriceBN;
        auctionEndPrice = worstCasePrice;
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
          auctionDuration: 10,
          auctionStartPrice,
          auctionEndPrice,
        },
        makerInfo.length > 0 ? makerInfo : undefined,
        undefined,
        undefined,
        100,
      );

      console.log('[drift] close position tx:', txSig);
      this._refreshAllUserAccounts();
      return typeof txSig === 'string' ? txSig : String(txSig);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Unknown error';
      const logs = err?.logs?.join?.('\n') || '';
      if (logs) console.error('[drift] close position tx logs:\n', logs);
      throw new Error(`Close position failed: ${msg}`);
    }
  }

  async cancelOrder(orderId: number): Promise<string> {
    const txSig = await this.driftClient.cancelOrder(orderId);
    // Force-refresh ALL user accounts so the orderbook updates immediately
    this._refreshAllUserAccounts();
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

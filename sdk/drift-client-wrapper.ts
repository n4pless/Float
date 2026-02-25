/**
 * Drift Protocol Client Wrapper
 * 
 * Simplifies interactions with the Drift Protocol for trading perps and spots
 */

import {
  Connection,
  PublicKey,
  Wallet,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  DriftClient,
  BN,
  User,
  MarketType,
  PositionDirection,
  OracleSource,
  PRICE_PRECISION,
  AMM_RESERVE_PRECISION,
} from '@drift-labs/sdk';

export interface TradingConfig {
  rpcUrl: string;
  driftProgramId: string;
  wallet: Wallet;
}

export interface UserPosition {
  marketIndex: number;
  baseAmount: BN;
  quoteAmount: BN;
  direction: string;
  leverage: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  marginUsed: number;
}

export interface MarketInfo {
  marketIndex: number;
  symbol: string;
  price: number;
  markPrice: number;
  indexPrice: number;
  bid: number;
  ask: number;
  baseAssetReserve: BN;
  quoteAssetReserve: BN;
  openInterest: BN;
}

export interface AccountState {
  publicKey: PublicKey;
  collateral: number;
  totalPositions: number;
  unrealizedPnL: number;
  maintenanceMarginRequired: number;
  availableMargin: number;
  leverage: number;
}

/**
 * Drift Trading Client Wrapper
 * 
 * Provides simplified methods for trading on Drift Protocol
 */
export class DriftTradingClient {
  private connection: Connection;
  private driftClient: DriftClient;
  private wallet: Wallet;
  private driftProgramId: PublicKey;

  constructor(config: TradingConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.wallet = config.wallet;
    this.driftProgramId = new PublicKey(config.driftProgramId);
  }

  /**
   * Initialize the Drift client (call before any trading operations)
   */
  async initialize(): Promise<void> {
    const user = new User({
      driftClient: this.driftClient,
      userAccountPublicKey: await this.driftClient.getUserAccountPublicKey(),
      accountLoader: this.driftClient.accountLoader,
    });

    this.driftClient = new DriftClient({
      connection: this.connection,
      wallet: this.wallet,
      programID: this.driftProgramId,
      opts: { commitment: 'confirmed' },
    });

    await this.driftClient.subscribe();
    console.log('✅ Drift client initialized');
  }

  /**
   * Get wallet balance in SOL
   */
  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Get account state including collateral and positions
   */
  async getAccountState(): Promise<AccountState> {
    const user = this.driftClient.getUser();
    const state = user.getUserAccount();
    
    const totalCollateral = user.getTotalCollateral();
    const maintenanceMargin = user.getMaintenanceMarginRequirement();
    const totalUnrealizedPnL = user.getUnrealizedPNL();
    const availableMargin = totalCollateral - maintenanceMargin;

    return {
      publicKey: state.owner,
      collateral: totalCollateral.toNumber() / PRICE_PRECISION.toNumber(),
      totalPositions: state.positions.length,
      unrealizedPnL: totalUnrealizedPnL.toNumber() / PRICE_PRECISION.toNumber(),
      maintenanceMarginRequired: maintenanceMargin.toNumber() / PRICE_PRECISION.toNumber(),
      availableMargin: availableMargin.toNumber() / PRICE_PRECISION.toNumber(),
      leverage: totalCollateral > 0 
        ? (state.totalMarginRequirement.toNumber() / totalCollateral.toNumber())
        : 0,
    };
  }

  /**
   * Get all user positions
   */
  async getPositions(): Promise<UserPosition[]> {
    const user = this.driftClient.getUser();
    const positions: UserPosition[] = [];

    for (const position of user.getPerpPositions()) {
      if (position.baseAmount.isZero()) continue;

      const market = this.driftClient.getPerpMarketAccount(position.marketIndex);
      if (!market) continue;

      const baseAmount = position.baseAmount.toNumber() / AMM_RESERVE_PRECISION.toNumber();
      const quoteAmount = position.quoteAmount.toNumber() / PRICE_PRECISION.toNumber();
      const currentPrice = market.amm.lastMarkPrice.toNumber() / PRICE_PRECISION.toNumber();
      const entryPrice = baseAmount !== 0 ? Math.abs(quoteAmount / baseAmount) : 0;
      const unrealizedPnL = baseAmount !== 0 
        ? (currentPrice - entryPrice) * baseAmount
        : 0;

      positions.push({
        marketIndex: position.marketIndex,
        baseAmount: position.baseAmount,
        quoteAmount: position.quoteAmount,
        direction: position.baseAmount.gt(new BN(0)) ? 'LONG' : 'SHORT',
        leverage: 1, // Placeholder - calculate from collateral
        entryPrice,
        currentPrice,
        unrealizedPnL,
        marginUsed: Math.abs(quoteAmount),
      });
    }

    return positions;
  }

  /**
   * Get market information
   */
  async getMarketInfo(marketIndex: number): Promise<MarketInfo> {
    const market = this.driftClient.getPerpMarketAccount(marketIndex);
    if (!market) {
      throw new Error(`Market ${marketIndex} not found`);
    }

    const price = market.amm.lastMarkPrice.toNumber() / PRICE_PRECISION.toNumber();
    const bid = price * 0.995; // Simplified bid/ask
    const ask = price * 1.005;

    return {
      marketIndex,
      symbol: `PERP-${marketIndex}`, // TODO: Map to actual symbol
      price,
      markPrice: price,
      indexPrice: market.amm.lastMarkPrice.toNumber() / PRICE_PRECISION.toNumber(),
      bid,
      ask,
      baseAssetReserve: market.amm.baseAssetReserve,
      quoteAssetReserve: market.amm.quoteAssetReserve,
      openInterest: market.amm.baseAssetAmountLong,
    };
  }

  /**
   * Open a long position
   */
  async openLongPosition(
    marketIndex: number,
    amount: number,
    leverage: number = 1
  ): Promise<string> {
    try {
      const amountBN = new BN(amount * AMM_RESERVE_PRECISION.toNumber());
      
      const txSig = await this.driftClient.openPosition(
        PositionDirection.LONG,
        amountBN,
        marketIndex,
        new BN(leverage * 10000), // Simplified leverage calculation
      );

      return txSig;
    } catch (error) {
      throw new Error(`Failed to open long position: ${error}`);
    }
  }

  /**
   * Open a short position
   */
  async openShortPosition(
    marketIndex: number,
    amount: number,
    leverage: number = 1
  ): Promise<string> {
    try {
      const amountBN = new BN(amount * AMM_RESERVE_PRECISION.toNumber());
      
      const txSig = await this.driftClient.openPosition(
        PositionDirection.SHORT,
        amountBN,
        marketIndex,
        new BN(leverage * 10000),
      );

      return txSig;
    } catch (error) {
      throw new Error(`Failed to open short position: ${error}`);
    }
  }

  /**
   * Close an existing position
   */
  async closePosition(marketIndex: number): Promise<string> {
    try {
      const user = this.driftClient.getUser();
      const position = user.getPerpPosition(marketIndex);

      if (!position || position.baseAmount.isZero()) {
        throw new Error(`No open position for market ${marketIndex}`);
      }

      const closeAmount = position.baseAmount.abs();
      const closeDirection = position.baseAmount.gt(new BN(0)) 
        ? PositionDirection.SHORT 
        : PositionDirection.LONG;

      const txSig = await this.driftClient.openPosition(
        closeDirection,
        closeAmount,
        marketIndex,
      );

      return txSig;
    } catch (error) {
      throw new Error(`Failed to close position: ${error}`);
    }
  }

  /**
   * Get estimated entry price for an order
   */
  async getEstimatedEntryPrice(
    marketIndex: number,
    amount: number,
    direction: PositionDirection
  ): Promise<number> {
    try {
      const market = this.driftClient.getPerpMarketAccount(marketIndex);
      if (!market) {
        throw new Error(`Market ${marketIndex} not found`);
      }

      // Simplified: just return current mark price
      // In production, would calculate impact based on AMM reserves
      return market.amm.lastMarkPrice.toNumber() / PRICE_PRECISION.toNumber();
    } catch (error) {
      throw new Error(`Failed to get estimated entry price: ${error}`);
    }
  }

  /**
   * Liquidate a user account (admin only)
   */
  async liquidateUser(userPublicKey: PublicKey, marketIndex: number): Promise<string> {
    try {
      const txSig = await this.driftClient.liquidate(
        userPublicKey,
        marketIndex,
      );

      return txSig;
    } catch (error) {
      throw new Error(`Failed to liquidate user: ${error}`);
    }
  }

  /**
   * Deposit collateral (USDC)
   */
  async depositCollateral(amount: number): Promise<string> {
    try {
      const amountBN = new BN(amount * PRICE_PRECISION.toNumber());
      
      const txSig = await this.driftClient.deposit(
        amountBN,
        0, // USDC is spot market 0
      );

      return txSig;
    } catch (error) {
      throw new Error(`Failed to deposit collateral: ${error}`);
    }
  }

  /**
   * Withdraw collateral (USDC)
   */
  async withdrawCollateral(amount: number): Promise<string> {
    try {
      const amountBN = new BN(amount * PRICE_PRECISION.toNumber());
      
      const txSig = await this.driftClient.withdraw(
        amountBN,
        0, // USDC is spot market 0
      );

      return txSig;
    } catch (error) {
      throw new Error(`Failed to withdraw collateral: ${error}`);
    }
  }

  /**
   * Subscribe to real-time account updates
   */
  subscribe(callback: (accountState: AccountState) => void): () => void {
    const interval = setInterval(async () => {
      try {
        const state = await this.getAccountState();
        callback(state);
      } catch (error) {
        console.error('Error fetching account state:', error);
      }
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }

  /**
   * Disconnect the client
   */
  async disconnect(): Promise<void> {
    if (this.driftClient) {
      await this.driftClient.unsubscribe();
    }
  }
}

export default DriftTradingClient;

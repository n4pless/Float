/**
 * Central Zustand store for Drift Protocol state.
 *
 * Modeled after drift-ui-template's store architecture:
 *   - DriftStore       → client + connection state
 *   - OraclePriceStore → oracle/mark prices
 *   - UserAccountStore → positions, orders, account metrics
 *
 * All merged into a single store for our single-market setup.
 * Components subscribe to slices via selectors for minimal re-renders.
 */
import { create } from 'zustand';
import type {
  DriftTradingClient,
  AccountState,
  UserPosition,
  SpotBalance,
  BotPosition,
  AmmStats,
  InsuranceFundStats,
  UserIfStake,
} from '../sdk/drift-client-wrapper';
import type { Order } from '../sdk/drift-client-wrapper';

/* ─── Recent trade type ────────────────────────── */

export interface RecentTrade {
  price: number;
  size: number;
  side: 'buy' | 'sell';
  ts: number;              // unix ms
  txSig?: string;          // transaction signature
  taker?: string;          // taker pubkey
  maker?: string;          // maker pubkey
  takerFee?: number;       // in USD
  makerFee?: number;       // in USD
  fillId?: string;         // unique fill record ID
  marketIndex?: number;    // market index
}

/* ─── Price snapshot (for chart) ───────────────── */

export interface PriceSnapshot {
  ts: number;
  price: number;
}

/* ─── Sub-account type ─────────────────────────── */

export interface SubAccount {
  subAccountId: number;
  name: string;
  totalCollateral: number;
  freeCollateral: number;
  unrealizedPnl: number;
  openPositions: number;
  spotBalances: number; // count of non-zero spot balances
}

/* ─── Store interface ──────────────────────────── */

interface DriftStoreState {
  /* ── Client ── */
  client: DriftTradingClient | null;
  isSubscribed: boolean;
  isUserInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  /* ── User management ── */
  subAccounts: SubAccount[];
  activeSubAccountId: number;
  setSubAccounts: (accounts: SubAccount[]) => void;
  setActiveSubAccountId: (id: number) => void;

  /* ── Market data ── */
  selectedMarket: number;
  oraclePrice: number;
  markPrice: number;
  fundingRate: number;
  openInterest: number;
  lastPriceChange: number;  // for color flash

  /* ── User ── */
  accountState: AccountState | null;
  positions: UserPosition[];
  openOrders: Order[];
  solBalance: number | null;
  usdcBalance: number | null;
  accountSpotBalances: SpotBalance[];

  /* ── Live feed ── */
  recentTrades: RecentTrade[];
  priceHistory: PriceSnapshot[];
  botPositions: BotPosition[];
  ammStats: AmmStats | null;
  insuranceFundStats: InsuranceFundStats | null;
  userIfStake: UserIfStake | null;

  /* ── Actions ── */
  setClient: (c: DriftTradingClient | null) => void;
  setSubscribed: (v: boolean) => void;
  setUserInitialized: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setSelectedMarket: (idx: number) => void;

  updateMarketData: (data: {
    oraclePrice?: number;
    markPrice?: number;
    fundingRate?: number;
    openInterest?: number;
  }) => void;

  setAccountState: (s: AccountState | null) => void;
  setPositions: (p: UserPosition[]) => void;
  setOpenOrders: (o: Order[]) => void;
  setSolBalance: (b: number | null) => void;
  setUsdcBalance: (b: number | null) => void;
  setAccountSpotBalances: (b: SpotBalance[]) => void;

  addRecentTrade: (t: RecentTrade) => void;
  addPriceSnapshot: (s: PriceSnapshot) => void;
  setBotPositions: (b: BotPosition[]) => void;
  setAmmStats: (a: AmmStats | null) => void;
  setInsuranceFundStats: (s: InsuranceFundStats | null) => void;
  setUserIfStake: (s: UserIfStake | null) => void;

  /* ── Computed reset ── */
  reset: () => void;
}

const initialState = {
  client: null,
  isSubscribed: false,
  isUserInitialized: false,
  isLoading: false,
  error: null,

  selectedMarket: 0,
  oraclePrice: 0,
  markPrice: 0,
  fundingRate: 0,
  openInterest: 0,
  lastPriceChange: 0,

  accountState: null,
  positions: [],
  openOrders: [],
  solBalance: null,
  usdcBalance: null,
  accountSpotBalances: [],

  recentTrades: [],
  priceHistory: [],
  botPositions: [],
  ammStats: null,
  insuranceFundStats: null,
  userIfStake: null,
  subAccounts: [],
  activeSubAccountId: 0,
};

export const useDriftStore = create<DriftStoreState>((set, get) => ({
  ...initialState,

  /* ── Client actions ── */
  setClient: (c) => set({ client: c }),
  setSubscribed: (v) => set({ isSubscribed: v }),
  setUserInitialized: (v) => set({ isUserInitialized: v }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  setSelectedMarket: (idx) => set({ selectedMarket: idx }),

  /* ── Market data ── */
  updateMarketData: (data) => {
    const prev = get();
    const newPrice = data.oraclePrice ?? prev.oraclePrice;
    const priceChange = newPrice !== prev.oraclePrice ? newPrice - prev.oraclePrice : prev.lastPriceChange;
    set({
      ...(data.oraclePrice != null && { oraclePrice: data.oraclePrice }),
      ...(data.markPrice != null && { markPrice: data.markPrice }),
      ...(data.fundingRate != null && { fundingRate: data.fundingRate }),
      ...(data.openInterest != null && { openInterest: data.openInterest }),
      lastPriceChange: priceChange,
    });
  },

  /* ── User data ── */
  setAccountState: (s) => set({ accountState: s }),
  setPositions: (p) => set({ positions: p }),
  setOpenOrders: (o) => set({ openOrders: o }),
  setSolBalance: (b) => set({ solBalance: b }),
  setUsdcBalance: (b) => set({ usdcBalance: b }),
  setAccountSpotBalances: (b) => set({ accountSpotBalances: b }),

  /* ── Live feed ── */
  addRecentTrade: (t) =>
    set((s) => ({
      recentTrades: [t, ...s.recentTrades].slice(0, 100),
    })),
  addPriceSnapshot: (s) =>
    set((state) => ({
      priceHistory: [...state.priceHistory, s].slice(-500),
    })),
  setBotPositions: (b) => set({ botPositions: b }),
  setAmmStats: (a) => set({ ammStats: a }),
  setInsuranceFundStats: (s) => set({ insuranceFundStats: s }),
  setUserIfStake: (s) => set({ userIfStake: s }),

  /* ── User management ── */
  setSubAccounts: (accounts) => set({ subAccounts: accounts }),
  setActiveSubAccountId: (id) => set({ activeSubAccountId: id }),

  /* ── Reset ── */
  reset: () => set(initialState),
}));

/* ─── Selectors (for minimal re-renders) ──────── */

export const selectClient = (s: DriftStoreState) => s.client;
export const selectIsSubscribed = (s: DriftStoreState) => s.isSubscribed;
export const selectIsUserInitialized = (s: DriftStoreState) => s.isUserInitialized;
export const selectOraclePrice = (s: DriftStoreState) => s.oraclePrice;
export const selectMarkPrice = (s: DriftStoreState) => s.markPrice;
export const selectFundingRate = (s: DriftStoreState) => s.fundingRate;
export const selectAccountState = (s: DriftStoreState) => s.accountState;
export const selectPositions = (s: DriftStoreState) => s.positions;
export const selectOpenOrders = (s: DriftStoreState) => s.openOrders;
export const selectSolBalance = (s: DriftStoreState) => s.solBalance;
export const selectUsdcBalance = (s: DriftStoreState) => s.usdcBalance;
export const selectAccountSpotBalances = (s: DriftStoreState) => s.accountSpotBalances;
export const selectRecentTrades = (s: DriftStoreState) => s.recentTrades;
export const selectPriceHistory = (s: DriftStoreState) => s.priceHistory;
export const selectSelectedMarket = (s: DriftStoreState) => s.selectedMarket;
export const selectSubAccounts = (s: DriftStoreState) => s.subAccounts;
export const selectActiveSubAccountId = (s: DriftStoreState) => s.activeSubAccountId;
export const selectBotPositions = (s: DriftStoreState) => s.botPositions;
export const selectAmmStats = (s: DriftStoreState) => s.ammStats;
export const selectInsuranceFundStats = (s: DriftStoreState) => s.insuranceFundStats;
export const selectUserIfStake = (s: DriftStoreState) => s.userIfStake;

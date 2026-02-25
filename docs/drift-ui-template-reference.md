# Drift UI Template - Complete Reference

> Fetched from https://github.com/drift-labs/drift-ui-template (branch: `master`)
> Commit: 886212a (ChesterSim - ~Dec 2025)

## Architecture Overview

The template uses:
- **Next.js 15** with React 19, TypeScript
- **@drift-labs/common** (^1.0.14) - `AuthorityDrift` wrapper, `CandleClient`, `MarketId`, `TRADING_UTILS`, orderbook types
- **@drift-labs/sdk** (2.146.0-beta.12) - `DriftClient`, `BigNum`, precision constants
- **zustand** for state management
- **lightweight-charts** for TradingView-style candle charts

### Key Pattern: `AuthorityDrift`
Everything goes through `AuthorityDrift` from `@drift-labs/common`. This is a simplified wrapper around `DriftClient` that provides:
- `orderbookCache` - cached L2 orderbook data
- `orderbookManager` - manages orderbook subscriptions with grouping
- `oraclePriceCache` - oracle price lookup
- `markPriceCache` - mark price lookup (includes bestBid, bestAsk, spread)
- `userAccountCache` - user account data
- `pollingDlob` - polling DLOB manager
- Event emitters: `onOrderbookUpdate()`, `onOraclePricesUpdate()`, `onMarkPricesUpdate()`, `onUserAccountUpdate()`

---

## File: `ui/src/stores/DriftStore.ts` (COMPLETE)

```typescript
import { produce } from "immer";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AuthorityDrift } from "@drift-labs/common";
import {
  SpotMarketConfig,
  PerpMarketConfig,
  BigNum,
  DriftEnv,
} from "@drift-labs/sdk";

export type DriftEnvironment = Extract<DriftEnv, "devnet" | "mainnet-beta">;

export interface DriftStore {
  set: (x: (s: DriftStore) => void) => void;
  get: () => DriftStore;
  drift: AuthorityDrift | undefined;
  isSwiftClientHealthy: boolean;
  walletSpotBalances: {
    marketConfig: SpotMarketConfig;
    balance: BigNum;
  }[];
  getSpotMarketConfigs: (poolId?: number) => SpotMarketConfig[];
  getPerpMarketConfigs: () => PerpMarketConfig[];
  environment: DriftEnvironment;
  setEnvironment: (env: DriftEnvironment) => void;
}

const DEFAULT_SPOT_MARKET_CONFIGS: SpotMarketConfig[] = [];
const DEFAULT_PERP_MARKET_CONFIGS: PerpMarketConfig[] = [];

const createPersistStorage = () =>
  typeof window === "undefined"
    ? {
        getItem: (_key: string) => null,
        setItem: (_key: string, _value: string) => undefined,
        removeItem: (_key: string) => undefined,
      }
    : window.localStorage;

export const useDriftStore = create<DriftStore>()(
  persist(
    (set, get) => ({
      set: (fn) => set(produce(fn)),
      get: () => get(),
      drift: undefined,
      isSwiftClientHealthy: false,
      walletSpotBalances: [],
      environment: "devnet",
      setEnvironment: (env) =>
        set(
          produce((state: DriftStore) => {
            state.environment = env;
          }),
        ),
      getSpotMarketConfigs: () => {
        if (!get().drift) return DEFAULT_SPOT_MARKET_CONFIGS;
        return get().drift!.spotMarketConfigs;
      },
      getPerpMarketConfigs: () => {
        if (!get().drift) return DEFAULT_PERP_MARKET_CONFIGS;
        return get().drift!.perpMarketConfigs;
      },
    }),
    {
      name: "drift-environment",
      storage: createJSONStorage(createPersistStorage),
      partialize: (state) => ({ environment: state.environment }),
    },
  ),
);
```

---

## File: `ui/src/hooks/globalSyncs/useSetupDrift.ts` (COMPLETE)

```typescript
import { DriftEnvironment, useDriftStore } from "@/stores/DriftStore";
import { useMarkPriceStore } from "@/stores/MarkPriceStore";
import { useOraclePriceStore } from "@/stores/OraclePriceStore";
import { useUserAccountDataStore } from "@/stores/UserAccountDataStore";
import { IWallet, IWalletV2, MarketType } from "@drift-labs/sdk";
import {
  AuthorityDrift,
  AuthorityDriftConfig,
  COMMON_UI_UTILS,
  MarketId,
  UserAccountCache,
} from "@drift-labs/common";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useMemo, useRef } from "react";
import { useDebounce, useLatest } from "react-use";

type PartialAuthorityDriftConfig = Omit<AuthorityDriftConfig, "wallet">;

type DriftConfigMap = Record<DriftEnvironment, PartialAuthorityDriftConfig>;

const DRIFT_CONFIGS: DriftConfigMap = {
  devnet: {
    solanaRpcEndpoint: process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_ENDPOINT!,
    driftEnv: "devnet",
  },
  "mainnet-beta": {
    solanaRpcEndpoint: process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_ENDPOINT!,
    driftEnv: "mainnet-beta",
    tradableMarkets: [
      new MarketId(0, MarketType.SPOT), // USDC
      new MarketId(1, MarketType.SPOT), // SOL
      new MarketId(0, MarketType.PERP), // SOL-PERP
      new MarketId(1, MarketType.PERP), // BTC-PERP
      new MarketId(2, MarketType.PERP), // ETH-PERP
    ],
  },
};

// Update AuthorityDrift's authority when the wallet changes
const useSyncDriftAuthority = () => {
  const drift = useDriftStore((s) => s.drift);
  const wallet = useWallet();
  const walletPubkey = wallet.wallet?.adapter.publicKey;

  useEffect(() => {
    if (!walletPubkey || !drift) return;
    drift.updateAuthority(wallet as IWallet);
  }, [walletPubkey, drift, wallet]);
};

export const useSetupDrift = () => {
  const drift = useDriftStore((s) => s.drift);
  const environment = useDriftStore((s) => s.environment);
  const setDriftStore = useDriftStore((s) => s.set);
  const setOraclePriceStore = useOraclePriceStore((s) => s.set);
  const setMarkPriceStore = useMarkPriceStore((s) => s.set);
  const setUserAccountDataStore = useUserAccountDataStore((s) => s.set);
  const wallet = useWallet();
  const isSubscribingToDrift = useRef(false);
  const driftRef = useLatest(drift);

  const isConnected = wallet.wallet?.adapter.connected;
  const driftConfig = useMemo(() => DRIFT_CONFIGS[environment], [environment]);

  useSyncDriftAuthority();

  // teardown and setup AuthorityDrift and zustand stores
  useDebounce(
    () => {
      if (isSubscribingToDrift.current) return;

      const currentDrift = driftRef.current;
      const needsNewDrift =
        !currentDrift || currentDrift.driftClient.env !== driftConfig.driftEnv;

      if (!needsNewDrift) return;

      let cancelled = false;
      let authorityDriftInstance: AuthorityDrift | undefined;

      const walletToUse = isConnected
        ? (wallet as IWalletV2)
        : COMMON_UI_UTILS.createPlaceholderIWallet() as IWalletV2;

      const setup = async () => {
        isSubscribingToDrift.current = true;

        if (currentDrift) {
          try {
            await currentDrift.unsubscribe();
          } catch (error) {
            console.error("Failed to unsubscribe from Drift", error);
          }
        }

        // reset stores
        setDriftStore((s) => {
          if (s.drift === currentDrift) {
            s.drift = undefined;
          }
        });
        setOraclePriceStore((s) => {
          s.lookup = {};
        });
        setMarkPriceStore((s) => {
          s.lookup = {};
        });
        setUserAccountDataStore((s) => {
          s.lookup = {};
          s.activeSubAccountId = undefined;
        });

        authorityDriftInstance = new AuthorityDrift({
          ...driftConfig,
          wallet: walletToUse,
        });

        try {
          await authorityDriftInstance.subscribe();

          if (cancelled) {
            await authorityDriftInstance.unsubscribe().catch(() => undefined);
            return;
          }

          // setup stores
          setDriftStore((s) => {
            s.drift = authorityDriftInstance!;
          });

          setOraclePriceStore((s) => {
            s.lookup = authorityDriftInstance!.oraclePriceCache;
          });
          authorityDriftInstance.onOraclePricesUpdate(
            (newOraclePricesLookup) => {
              setOraclePriceStore((s) => {
                s.lookup = {
                  ...s.lookup,
                  ...newOraclePricesLookup,
                };
              });
            },
          );

          setMarkPriceStore((s) => {
            s.lookup = authorityDriftInstance!.markPriceCache;
          });
          authorityDriftInstance.onMarkPricesUpdate((newMarkPricesLookup) => {
            setMarkPriceStore((s) => {
              s.lookup = { ...s.lookup, ...newMarkPricesLookup };
            });
          });

          setUserAccountDataStore((s) => {
            s.lookup = authorityDriftInstance!.userAccountCache;

            if (
              Object.keys(authorityDriftInstance!.userAccountCache).length > 0
            ) {
              s.activeSubAccountId = Object.values(
                authorityDriftInstance!.userAccountCache,
              )[0].subAccountId;
            }
          });

          authorityDriftInstance.onUserAccountUpdate((newUserAccount) => {
            setUserAccountDataStore((s) => {
              s.lookup[
                UserAccountCache.getUserAccountKey(
                  newUserAccount.subAccountId,
                  newUserAccount.authority,
                )
              ] = newUserAccount;

              if (s.activeSubAccountId === undefined) {
                s.activeSubAccountId = newUserAccount.subAccountId;
              }
            });
          });
        } catch (error) {
          console.error("Failed to set up Drift", error);
        } finally {
          isSubscribingToDrift.current = false;
        }
      };

      setup();

      return () => {
        cancelled = true;
        const driftInStore = useDriftStore.getState().drift;

        if (authorityDriftInstance && driftInStore !== authorityDriftInstance) {
          authorityDriftInstance.unsubscribe().catch(() => undefined);
        }
      };
    },
    500,
    [
      driftRef,
      driftConfig,
      isConnected,
      wallet,
      setDriftStore,
      setOraclePriceStore,
      setMarkPriceStore,
      setUserAccountDataStore,
    ],
  );

  // teardown and reset zustand stores
  useEffect(() => {
    return () => {
      const currentDrift = useDriftStore.getState().drift;

      if (currentDrift) {
        currentDrift.unsubscribe().catch(() => undefined);
        useDriftStore.getState().set((s) => {
          if (s.drift === currentDrift) {
            s.drift = undefined;
          }
        });
      }

      useOraclePriceStore.getState().set((s) => {
        s.lookup = {};
      });
      useMarkPriceStore.getState().set((s) => {
        s.lookup = {};
      });
      useUserAccountDataStore.getState().set((s) => {
        s.lookup = {};
        s.activeSubAccountId = undefined;
      });
    };
  }, []);
};
```

---

## File: `ui/src/components/perps/Orderbook/Orderbook.tsx` (COMPLETE)

```typescript
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { FormSelect } from "../../ui/form-select";
import { useDriftStore } from "@/stores/DriftStore";
import { useMarkPriceStore } from "@/stores/MarkPriceStore";
import {
  DEFAULT_ORDERBOOK_GROUPING,
  L2WithOracleAndMarketData,
  TRADING_UTILS,
} from "@drift-labs/common";
import { MarketId } from "@drift-labs/common";
import { OrderbookGrouping } from "@drift-labs/common";
import {
  BigNum,
  PRICE_PRECISION_EXP,
  BASE_PRECISION_EXP,
  ZERO,
  BN,
} from "@drift-labs/sdk";
import { BookOpenText } from "lucide-react";

const ORDERBOOK_MAX_LEVELS = 20;

interface OrderbookProps {
  selectedMarketId: MarketId;
}

interface OrderbookLevel {
  price: string;
  size: string;
  total: string;
}

type OrderbookItem = {
  type: "ask" | "bid" | "mark";
  level?: OrderbookLevel;
  markPrice?: string;
  spread?: string;
};

interface OrderbookRowProps {
  item: OrderbookItem;
}

const OrderbookRow: React.FC<OrderbookRowProps> = ({ item }) => {
  if (item.type === "mark") {
    return (
      <div
        className="px-4 py-3 bg-gray-800/50 border-y border-gray-600"
        data-mark-price="true"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Mark:</span>
            <span className="text-sm font-mono text-green-400">
              {item.markPrice || "--"}
            </span>
          </div>
          {item.spread && (
            <div className="text-xs text-gray-400">
              Spread: <span className="font-mono">{item.spread}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const level = item.level!;
  const isAsk = item.type === "ask";
  const priceColor = isAsk ? "text-red-400" : "text-green-400";
  const hoverColor = isAsk ? "hover:bg-red-500/10" : "hover:bg-green-500/10";

  return (
    <div
      className={`flex items-center gap-4 px-4 py-1 text-xs ${hoverColor} border-b border-gray-800 [&>div]:flex-1`}
    >
      <div className={`text-left font-mono ${priceColor}`}>{level.price}</div>
      <div className="text-right text-gray-300 font-mono">{level.size}</div>
      <div className="text-right text-gray-400 font-mono">{level.total}</div>
    </div>
  );
};

export const Orderbook: React.FC<OrderbookProps> = ({ selectedMarketId }) => {
  const drift = useDriftStore((s) => s.drift);
  const [orderbookData, setOrderbookData] =
    useState<L2WithOracleAndMarketData | null>(null);
  const [selectedGrouping, setSelectedGrouping] = useState<OrderbookGrouping>(
    DEFAULT_ORDERBOOK_GROUPING,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToCenter = useRef(false);

  const markPriceData = useMarkPriceStore(
    (s) => s.lookup[selectedMarketId.key],
  );

  const tickSizeDecimals = drift?.driftClient
    ? TRADING_UTILS.getMarketTickSizeDecimals(
        drift.driftClient,
        selectedMarketId,
      )
    : 2;

  const tickSizePrecision = drift?.driftClient
    ? TRADING_UTILS.getMarketTickSize(drift.driftClient, selectedMarketId)
    : ZERO;

  const stepSizeDecimals = drift?.driftClient
    ? TRADING_UTILS.getMarketStepSizeDecimals(
        drift.driftClient,
        selectedMarketId,
      )
    : 2;

  const tickSize = useMemo(
    () => BigNum.from(tickSizePrecision, PRICE_PRECISION_EXP),
    [tickSizePrecision],
  );

  const groupingOptions: { value: string; label: string }[] = useMemo(
    () => [
      {
        value: "1",
        label: `${tickSize
          .mul(new BN(1))
          .prettyPrint(undefined, undefined, tickSizeDecimals)}`,
      },
      {
        value: "10",
        label: `${tickSize.mul(new BN(10)).prettyPrint()}`,
      },
      {
        value: "100",
        label: `${tickSize.mul(new BN(100)).prettyPrint()}`,
      },
      {
        value: "500",
        label: `${tickSize.mul(new BN(500)).prettyPrint()}`,
      },
      {
        value: "1000",
        label: `${tickSize.mul(new BN(1000)).prettyPrint()}`,
      },
    ],
    [tickSizeDecimals, tickSize],
  );

  const handleGroupingChange = (value: string) => {
    if (drift?.orderbookManager) {
      const newGrouping = parseInt(value) as OrderbookGrouping;
      setSelectedGrouping(newGrouping);

      drift.orderbookManager.updateSubscription({
        marketId: selectedMarketId,
        grouping: newGrouping,
      });
    }
  };

  useEffect(() => {
    if (!drift) return;

    // Get initial orderbook data
    const initialData = drift.orderbookCache;
    if (initialData) {
      setOrderbookData(initialData);
    }

    // Subscribe to orderbook updates
    const subscription = drift.onOrderbookUpdate((newOrderbookData) => {
      setOrderbookData(newOrderbookData);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [drift]);

  const { combinedOrderbookData } = useMemo(() => {
    if (!orderbookData) {
      return { combinedOrderbookData: [], markPrice: null, spread: null };
    }

    // Process asks (sort high to low for display)
    const asksSlice = orderbookData.asks.slice(0, ORDERBOOK_MAX_LEVELS);
    const reversedAsks = [...asksSlice].reverse();

    // Calculate cumulative totals
    const processedAsks: OrderbookLevel[] = reversedAsks.map((level, index) => {
      const price = BigNum.from(level.price, PRICE_PRECISION_EXP).toNotional(
        undefined,
        undefined,
        tickSizeDecimals,
      );
      const size = BigNum.from(level.size, BASE_PRECISION_EXP).prettyPrint(
        undefined,
        undefined,
        stepSizeDecimals,
      );

      const total = reversedAsks
        .slice(index)
        .reduce((sum, l) => sum.add(l.size), ZERO);
      const totalFormatted = BigNum.from(total, BASE_PRECISION_EXP).prettyPrint(
        undefined,
        undefined,
        stepSizeDecimals,
      );

      return { price, size, total: totalFormatted };
    });

    // Process bids (sort high to low)
    const processedBids: OrderbookLevel[] = orderbookData.bids
      .slice(0, ORDERBOOK_MAX_LEVELS)
      .map((level, index) => {
        const price = BigNum.from(level.price, PRICE_PRECISION_EXP).toNotional(
          undefined,
          undefined,
          tickSizeDecimals,
        );
        const size = BigNum.from(level.size, BASE_PRECISION_EXP).prettyPrint(
          undefined,
          undefined,
          stepSizeDecimals,
        );
        const total = orderbookData.bids
          .slice(0, index + 1)
          .reduce((sum, l) => sum.add(l.size), ZERO);
        const totalFormatted = BigNum.from(
          total,
          BASE_PRECISION_EXP,
        ).prettyPrint(undefined, undefined, stepSizeDecimals);

        return { price, size, total: totalFormatted };
      });

    const currentMarkPrice = markPriceData
      ? BigNum.from(
          markPriceData.markPrice ?? ZERO,
          PRICE_PRECISION_EXP,
        ).toNotional(undefined, undefined, tickSizeDecimals)
      : null;

    const currentSpread =
      orderbookData.bestAskPrice && orderbookData.bestBidPrice
        ? BigNum.from(
            orderbookData.bestAskPrice.sub(orderbookData.bestBidPrice),
            PRICE_PRECISION_EXP,
          ).toNotional(undefined, undefined, tickSizeDecimals)
        : null;

    // Combine asks, mark price, and bids into single array
    const combinedData: OrderbookItem[] = [
      ...processedAsks.map((level) => ({
        type: "ask" as const,
        level,
      })),
      {
        type: "mark" as const,
        markPrice: currentMarkPrice ?? "",
        spread: currentSpread ?? "",
      },
      ...processedBids.map((level) => ({
        type: "bid" as const,
        level,
      })),
    ];

    return {
      combinedOrderbookData: combinedData,
      markPrice: currentMarkPrice,
      spread: currentSpread,
    };
  }, [orderbookData, markPriceData, tickSizeDecimals, stepSizeDecimals]);

  // Auto-scroll to mark price only on first render
  useEffect(() => {
    if (
      combinedOrderbookData.length > 0 &&
      scrollContainerRef.current &&
      !hasScrolledToCenter.current
    ) {
      const markPriceElement = scrollContainerRef.current.querySelector(
        '[data-mark-price="true"]',
      );
      if (markPriceElement) {
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = markPriceElement.getBoundingClientRect();

        const scrollTop =
          container.scrollTop +
          (elementRect.top - containerRect.top) -
          containerRect.height / 2 +
          elementRect.height / 2;

        container.scrollTop = scrollTop;
        hasScrolledToCenter.current = true;
      }
    }
  }, [combinedOrderbookData]);

  return (
    <Card className="h-full max-h-[700px] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpenText className="h-5 w-5 text-blue-400" />
            Order Book
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Grouping:</span>
            <FormSelect
              value={selectedGrouping.toString()}
              onValueChange={handleGroupingChange}
              options={groupingOptions}
              className="w-24"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between gap-4 px-4 py-2 text-xs font-medium text-gray-400 border-b [&>div]:flex-1 flex-shrink-0">
            <div className="text-left">Price</div>
            <div className="text-right">Size</div>
            <div className="text-right">Total</div>
          </div>

          {/* Combined Orderbook */}
          <div
            className="flex-1 overflow-y-auto min-h-0"
            ref={scrollContainerRef}
          >
            {combinedOrderbookData.map((item, index) => (
              <OrderbookRow key={`orderbook-${index}`} item={item} />
            ))}
          </div>

          {/* Loading state */}
          {!orderbookData && (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-sm text-gray-400">Loading orderbook...</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

---

## File: `ui/src/components/perps/CandleChart/CandleChart.tsx` (COMPLETE)

```typescript
"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  createChart,
  ColorType,
  Time,
  IChartApi,
  CandlestickData,
  CandlestickSeries,
  HistogramSeries,
  HistogramData,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { FormSelect } from "../../ui/form-select";
import { Button } from "../../ui/button";
import { BarChart3, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { CandleClient } from "@drift-labs/common";
import { MarketId, JsonCandle } from "@drift-labs/common";
import { UIEnv } from "@drift-labs/common";
import { CandleResolution } from "@drift-labs/sdk";

interface CandleChartProps {
  selectedMarketId: MarketId;
  className?: string;
}

interface TradingViewCandle extends CandlestickData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumeData extends HistogramData {
  time: Time;
  value: number;
  color?: string;
}

// Available timeframes for the chart
const TIMEFRAME_OPTIONS = [
  { value: "1", label: "1m", resolution: "1" as CandleResolution },
  { value: "5", label: "5m", resolution: "5" as CandleResolution },
  { value: "15", label: "15m", resolution: "15" as CandleResolution },
  { value: "60", label: "1h", resolution: "60" as CandleResolution },
  { value: "240", label: "4h", resolution: "240" as CandleResolution },
  { value: "1440", label: "1d", resolution: "1440" as CandleResolution },
];

const DEFAULT_RESOLUTION: CandleResolution = "15";
const DEFAULT_CANDLE_COUNT = 500;

export const CandleChart: React.FC<CandleChartProps> = ({
  selectedMarketId,
  className = "",
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const candleClientRef = useRef<CandleClient | null>(null);
  const subscriptionKeyRef = useRef<string | null>(null);

  const [resolution, setResolution] = useState<CandleResolution>(DEFAULT_RESOLUTION);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candleData, setCandleData] = useState<JsonCandle[]>([]);
  const [hoveredCandle, setHoveredCandle] = useState<TradingViewCandle | null>(null);
  const [hoveredVolume, setHoveredVolume] = useState<VolumeData | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Create UIEnv - using mainnet as configured in useSetupDrift
  const env = useMemo(() => UIEnv.createMainnet(), []);

  const formatPrice = useCallback((price: number) => {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }, []);

  const formatVolume = useCallback((volume: number) => {
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(2) + "M";
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(2) + "K";
    }
    return volume.toFixed(2);
  }, []);

  const formatTime = useCallback((timestamp: Time) => {
    const date = new Date((timestamp as number) * 1000);
    return date.toLocaleString();
  }, []);

  // Initialize CandleClient
  const candleClient = useMemo(() => {
    if (!candleClientRef.current) {
      candleClientRef.current = new CandleClient();
    }
    return candleClientRef.current;
  }, []);

  // Transform JsonCandle to TradingView OHLC format
  const transformCandleData = useCallback(
    (candles: JsonCandle[]): TradingViewCandle[] => {
      return candles.map((candle) => ({
        time: candle.ts as Time,
        open: candle.fillOpen,
        high: candle.fillHigh,
        low: candle.fillLow,
        close: candle.fillClose,
      }));
    },
    [],
  );

  // Transform volume data
  const transformVolumeData = useCallback(
    (candles: JsonCandle[]): VolumeData[] => {
      return candles.map((candle) => ({
        time: candle.ts as Time,
        value: candle.baseVolume,
        color:
          candle.fillClose >= candle.fillOpen
            ? "rgba(34, 197, 94, 0.3)"
            : "rgba(239, 68, 68, 0.3)",
      }));
    },
    [],
  );

  // Initialize chart
  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current) return;

    const chartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#d1d5db",
      },
      grid: {
        vertLines: { color: "rgba(107, 114, 128, 0.2)" },
        horzLines: { color: "rgba(107, 114, 128, 0.2)" },
      },
      rightPriceScale: {
        borderColor: "rgba(107, 114, 128, 0.3)",
      },
      timeScale: {
        borderColor: "rgba(107, 114, 128, 0.3)",
        timeVisible: true,
        secondsVisible: false,
      },
    };

    const chart = createChart(chartContainerRef.current, chartOptions);
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setHoveredCandle(null);
        setHoveredVolume(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as
        | TradingViewCandle
        | undefined;
      const volumeData = param.seriesData.get(volumeSeries) as
        | VolumeData
        | undefined;

      setHoveredCandle(candleData || null);
      setHoveredVolume(volumeData || null);
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const { width, height } = chartContainerRef.current.getBoundingClientRect();
        chart.applyOptions({ width, height });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
    };
  }, []);

  // Fetch historical candles (initial load)
  const fetchCandles = useCallback(async () => {
    if (!candleClient) return;

    setIsLoading(true);
    setError(null);

    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const fromTs = nowSeconds - DEFAULT_CANDLE_COUNT * parseInt(resolution) * 60;
      const toTs = nowSeconds;

      const fetchConfig = {
        env,
        marketId: selectedMarketId,
        resolution,
        fromTs,
        toTs,
      };

      const candles = await candleClient.fetch(fetchConfig);
      setCandleData(candles);

      if (
        candleSeriesRef.current &&
        volumeSeriesRef.current &&
        candles.length > 0
      ) {
        const transformedCandles = transformCandleData(candles);
        const transformedVolume = transformVolumeData(candles);

        candleSeriesRef.current.setData(transformedCandles);
        volumeSeriesRef.current.setData(transformedVolume);
      }
    } catch (err) {
      console.error("Failed to fetch candles:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch candle data",
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    candleClient,
    env,
    selectedMarketId,
    resolution,
    transformCandleData,
    transformVolumeData,
  ]);

  // Fetch more historical candles when scrolling left
  const fetchMoreHistoricalCandles = useCallback(
    async (earliestTimestamp: number) => {
      if (!candleClient || isLoadingMore) return;

      setIsLoadingMore(true);

      try {
        const toTs = earliestTimestamp;
        const fromTs = toTs - DEFAULT_CANDLE_COUNT * parseInt(resolution) * 60;

        const fetchConfig = {
          env,
          marketId: selectedMarketId,
          resolution,
          fromTs,
          toTs,
        };

        const newCandles = await candleClient.fetch(fetchConfig);

        if (newCandles.length > 0) {
          setCandleData((prevCandles) => {
            const existingTimestamps = new Set(prevCandles.map((c) => c.ts));
            const uniqueNewCandles = newCandles.filter(
              (c) => !existingTimestamps.has(c.ts),
            );
            const mergedCandles = [...uniqueNewCandles, ...prevCandles].sort(
              (a, b) => a.ts - b.ts,
            );
            return mergedCandles;
          });

          if (candleSeriesRef.current && volumeSeriesRef.current) {
            setCandleData((currentCandles) => {
              const transformedCandles = transformCandleData(currentCandles);
              const transformedVolume = transformVolumeData(currentCandles);

              if (candleSeriesRef.current && volumeSeriesRef.current) {
                candleSeriesRef.current.setData(transformedCandles);
                volumeSeriesRef.current.setData(transformedVolume);
              }

              return currentCandles;
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch more historical candles:", err);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [
      candleClient,
      env,
      selectedMarketId,
      resolution,
      transformCandleData,
      transformVolumeData,
      isLoadingMore,
    ],
  );

  // Subscribe to real-time updates
  const subscribeToUpdates = useCallback(() => {
    if (!candleClient) return;

    if (subscriptionKeyRef.current) {
      candleClient.unsubscribe(subscriptionKeyRef.current);
    }

    const subscriptionKey = `${selectedMarketId.key}-${resolution}`;
    subscriptionKeyRef.current = subscriptionKey;

    const subscriptionConfig = {
      env,
      marketId: selectedMarketId,
      resolution,
    };

    candleClient
      .subscribe(subscriptionConfig, subscriptionKey)
      .then(() => {
        candleClient.on(
          subscriptionKey,
          "candle-update",
          (newCandle: JsonCandle) => {
            setCandleData((prevCandles) => {
              const updatedCandles = [...prevCandles];
              const existingIndex = updatedCandles.findIndex(
                (c) => c.ts === newCandle.ts,
              );

              if (existingIndex >= 0) {
                updatedCandles[existingIndex] = newCandle;
              } else {
                updatedCandles.push(newCandle);
                updatedCandles.sort((a, b) => a.ts - b.ts);
              }

              if (candleSeriesRef.current && volumeSeriesRef.current) {
                const transformedCandle = transformCandleData([newCandle])[0];
                const transformedVolume = transformVolumeData([newCandle])[0];

                candleSeriesRef.current.update(transformedCandle);
                volumeSeriesRef.current.update(transformedVolume);
              }

              return updatedCandles;
            });
          },
        );
      })
      .catch((err) => {
        console.error("Failed to subscribe to candle updates:", err);
      });
  }, [
    candleClient,
    env,
    selectedMarketId,
    resolution,
    transformCandleData,
    transformVolumeData,
  ]);

  const handleResolutionChange = useCallback((newResolution: string) => {
    const resolutionOption = TIMEFRAME_OPTIONS.find(
      (opt) => opt.value === newResolution,
    );
    if (resolutionOption) {
      setResolution(resolutionOption.resolution);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    fetchCandles();
  }, [fetchCandles]);

  useEffect(() => {
    const cleanup = initializeChart();
    return cleanup;
  }, [initializeChart]);

  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);

  useEffect(() => {
    subscribeToUpdates();
    return () => {
      if (subscriptionKeyRef.current && candleClient) {
        candleClient.unsubscribe(subscriptionKeyRef.current);
      }
    };
  }, [subscribeToUpdates, candleClient]);

  // Subscribe to visible time range changes for scroll-based loading
  useEffect(() => {
    if (!chartRef.current || candleData.length === 0) return;

    const chart = chartRef.current;

    const handleVisibleTimeRangeChange = () => {
      const visibleLogicalRange = chart.timeScale().getVisibleLogicalRange();

      if (visibleLogicalRange && visibleLogicalRange.from <= 5) {
        const earliestTimestamp = Math.min(...candleData.map((c) => c.ts));
        fetchMoreHistoricalCandles(earliestTimestamp);
      }
    };

    chart
      .timeScale()
      .subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

    return () => {
      if (chartRef.current) {
        try {
          chartRef.current
            .timeScale()
            .unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
        } catch (error) {
          console.warn(
            "Failed to unsubscribe from visible time range changes:",
            error,
          );
        }
      }
    };
  }, [candleData, fetchMoreHistoricalCandles]);

  useEffect(() => {
    return () => {
      if (candleClientRef.current) {
        candleClientRef.current.unsubscribeAll();
      }
    };
  }, [candleClient]);

  return (
    <Card className={`h-full ${className}`}>
      {/* ... JSX for chart header, OHLC tooltip, loading states, error states, chart container ... */}
    </Card>
  );
};
```

---

## File: `ui/src/stores/OraclePriceStore.ts` (COMPLETE)

```typescript
import { OraclePriceData } from "@drift-labs/sdk";
import { MarketId, OraclePriceLookup } from "@drift-labs/common";
import { produce } from "immer";
import { create } from "zustand";

export interface OraclePriceStore {
  set: (x: (s: OraclePriceStore) => void) => void;
  get: () => OraclePriceStore;
  lookup: OraclePriceLookup;
  getOraclePrice: (marketId: MarketId) => OraclePriceData;
}

export const useOraclePriceStore = create<OraclePriceStore>((set, get) => ({
  set: (fn) => set(produce(fn)),
  get: () => get(),
  lookup: {},
  getOraclePrice: (marketId: MarketId) => {
    const { lookup } = get();
    return lookup[marketId.key];
  },
}));
```

---

## File: `ui/src/stores/MarkPriceStore.ts` (COMPLETE)

```typescript
import { MarkPriceLookup } from "@drift-labs/common";
import { produce } from "immer";
import { create } from "zustand";

export interface MarkPriceStore {
  set: (x: (s: MarkPriceStore) => void) => void;
  get: () => MarkPriceStore;
  lookup: MarkPriceLookup;
}

export const useMarkPriceStore = create<MarkPriceStore>((set, get) => ({
  set: (fn) => set(produce(fn)),
  get: () => get(),
  lookup: {},
}));
```

---

## File: `ui/src/stores/UserAccountDataStore.ts` (COMPLETE)

```typescript
import {
  EnhancedAccountData,
  UserAccountCache,
  UserAccountLookup,
} from "@drift-labs/common";
import { produce } from "immer";
import { create } from "zustand";
import { useDriftStore } from "./DriftStore";
import {
  RevenueShareAccount,
  RevenueShareEscrowAccount,
} from "@drift-labs/sdk";

export interface UserAccountDataStore {
  set: (x: (s: UserAccountDataStore) => void) => void;
  get: () => UserAccountDataStore;
  lookup: UserAccountLookup;
  activeSubAccountId: number | undefined;
  setActiveSubAccountId: (subAccountId: number | undefined) => void;
  getCurrentAccount: () => EnhancedAccountData | undefined;
  revenueShareEscrow: RevenueShareEscrowAccount | undefined;
  revenueShareAccount: RevenueShareAccount | undefined;
}

export const useUserAccountDataStore = create<UserAccountDataStore>(
  (set, get) => ({
    set: (fn) => set(produce(fn)),
    get: () => get(),
    lookup: {},
    activeSubAccountId: undefined,
    revenueShareEscrow: undefined,
    revenueShareAccount: undefined,
    setActiveSubAccountId: (subAccountId: number | undefined) => {
      get().set((s) => {
        s.activeSubAccountId = subAccountId;
      });
    },
    getCurrentAccount: () => {
      const { activeSubAccountId, lookup } = get();
      const drift = useDriftStore.getState().drift;

      if (drift === undefined) return undefined;
      if (activeSubAccountId === undefined) return undefined;

      return lookup[
        UserAccountCache.getUserAccountKey(activeSubAccountId, drift.authority)
      ];
    },
  }),
);
```

---

## File: `ui/src/app/data/components/MarketDataTableRow.tsx` (COMPLETE)

```typescript
"use client";

import React, { useEffect, useRef, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { useGetPerpMarketTickSizeDecimals } from "@/hooks/markets/useGetPerpMarketTickSizeDecimals";
import { BigNum, BN, PRICE_PRECISION_EXP } from "@drift-labs/sdk";
import { MarketId, MarketKey } from "@drift-labs/common";
import { cn } from "@/lib/utils";
import { useDriftStore } from "@/stores/DriftStore";

interface MarketDataTableRowProps {
  marketKey: MarketKey;
  markData?: {
    markPrice?: BN;
    bestBid?: BN;
    bestAsk?: BN;
    lastUpdateSlot: number;
  };
  oracleData?: {
    price?: BN;
    slot?: BN;
  };
  marketSymbol: string;
  isSelected?: boolean;
}

interface BlinkingCellProps {
  children: React.ReactNode;
  value: BN | string | number | undefined;
  className?: string;
}

const BlinkingCell: React.FC<BlinkingCellProps> = ({
  children,
  value,
  className,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value && prevValueRef.current !== undefined) {
      setIsBlinking(true);
      const timer = setTimeout(() => setIsBlinking(false), 100);
      return () => clearTimeout(timer);
    }
    prevValueRef.current = value;
  }, [value]);

  return (
    <TableCell className={className}>
      <span
        className={cn(
          isBlinking &&
            "animate-pulse opacity-30 transition-opacity duration-100",
        )}
      >
        {children}
      </span>
    </TableCell>
  );
};

export const MarketDividerRow: React.FC<{ title: string }> = ({ title }) => {
  return (
    <TableRow>
      <TableCell
        colSpan={9}
        className="bg-black font-semibold text-center py-3 border-y-2 border-gray-300 dark:border-gray-600"
      >
        {title}
      </TableCell>
    </TableRow>
  );
};

export const MarketDataTableRow: React.FC<MarketDataTableRowProps> = ({
  marketKey,
  markData,
  oracleData,
  marketSymbol,
  isSelected = false,
}) => {
  const pollingDlob = useDriftStore((s) => s.drift?.pollingDlob);
  const marketId = MarketId.getMarketIdFromKey(marketKey);

  const tickSizeDecimals = useGetPerpMarketTickSizeDecimals(
    marketId.marketIndex,
  );

  let spread = "N/A";

  if (markData) {
    const bid = parseFloat(markData.bestBid?.toString() || "0");
    const ask = parseFloat(markData.bestAsk?.toString() || "0");
    if (bid && ask) {
      spread = (((ask - bid) / bid) * 100).toFixed(4) + "%";
    }
  }

  const formatPrice = (price: BN | undefined) => {
    if (!price) return "N/A";
    return BigNum.from(price, PRICE_PRECISION_EXP).toNotional(
      undefined,
      undefined,
      tickSizeDecimals,
    );
  };

  const pollingInfo = pollingDlob?.getPollingIntervalForMarket(marketKey);

  return (
    <TableRow
      key={marketKey}
      className={cn(
        isSelected &&
          "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700",
      )}
    >
      <TableCell className="font-mono text-sm text-gray-500">
        {marketId.marketIndex}
      </TableCell>
      <TableCell className="font-medium">{marketSymbol}</TableCell>
      <BlinkingCell value={markData?.markPrice}>
        {formatPrice(markData?.markPrice)}
      </BlinkingCell>
      <BlinkingCell value={oracleData?.price}>
        {formatPrice(oracleData?.price)}
      </BlinkingCell>
      <BlinkingCell value={markData?.bestBid}>
        {formatPrice(markData?.bestBid)}
      </BlinkingCell>
      <BlinkingCell value={markData?.bestAsk}>
        {formatPrice(markData?.bestAsk)}
      </BlinkingCell>
      <BlinkingCell value={spread} className="text-gray-400">
        {spread}
      </BlinkingCell>
      <TableCell className={`font-mono text-sm`}>
        {isSelected ? "Websocket" : `${pollingInfo?.intervalMultiplier}s`}
      </TableCell>
      <BlinkingCell value={markData?.lastUpdateSlot}>
        {markData?.lastUpdateSlot || "N/A"}
      </BlinkingCell>
    </TableRow>
  );
};
```

---

## File: `ui/src/app/perps/page.tsx` (COMPLETE)

```typescript
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { TrendingUp, AlertCircle, DollarSign } from "lucide-react";
import { useDriftStore } from "@/stores/DriftStore";
import { useMarkPriceStore } from "@/stores/MarkPriceStore";
import { useOraclePriceStore } from "@/stores/OraclePriceStore";
import { PerpTradeForm } from "../../components/perps/PerpTradeForm/PerpTradeForm";
import { PositionsTable } from "../../components/perps/PositionsTable/PositionsTable";
import { OpenOrdersTable } from "../../components/perps/OpenOrdersTable/OpenOrdersTable";
import { Orderbook } from "../../components/perps/Orderbook";
import { CandleChart } from "../../components/perps/CandleChart";
import { FormSelect } from "../../components/ui/form-select";
import { DEFAULT_PERP_MARKET_INDEX } from "../../constants/defaultMarkets";
import { MarketId, TRADING_UTILS } from "@drift-labs/common";
import { BigNum, PRICE_PRECISION_EXP, ZERO } from "@drift-labs/sdk";

export default function PerpsPage() {
  const { connected } = useWallet();
  const drift = useDriftStore((s) => s.drift);
  const perpMarketConfigs = useDriftStore((s) => s.getPerpMarketConfigs());
  const [selectedMarketIndex, setSelectedMarketIndex] = useState<number>(
    DEFAULT_PERP_MARKET_INDEX,
  );

  const selectedMarketId = useMemo(
    () => MarketId.createPerpMarket(selectedMarketIndex),
    [selectedMarketIndex],
  );

  const markPriceData = useMarkPriceStore(
    (s) => s.lookup[selectedMarketId.key],
  );
  const oraclePriceData = useOraclePriceStore(
    (s) => s.lookup[selectedMarketId.key],
  );
  const selectedMarketConfig = perpMarketConfigs.find(
    (config) => config.marketIndex === selectedMarketIndex,
  );

  const tickSizeDecimals = drift?.driftClient
    ? TRADING_UTILS.getMarketTickSizeDecimals(
        drift.driftClient,
        MarketId.createPerpMarket(selectedMarketIndex),
      )
    : 0;

  // Update AuthorityDrift's selectedTradeMarket when selection changes
  useEffect(() => {
    if (drift) {
      drift.updateSelectedTradeMarket(selectedMarketId);
    }

    return () => {
      if (drift) {
        drift.updateSelectedTradeMarket(null);
      }
    };
  }, [drift, selectedMarketId]);

  // ... renders: Market selector, Mark Price, Oracle Price, CandleChart, Orderbook, 
  //     PerpTradeForm, PositionsTable, OpenOrdersTable
}
```

---

## Summary: How Each Data Type Is Handled

### 1. OrderBook (L2/DLOB) Data

**Source:** `AuthorityDrift` from `@drift-labs/common`

**Key APIs:**
- `drift.orderbookCache` → `L2WithOracleAndMarketData` (initial snapshot)
- `drift.onOrderbookUpdate(callback)` → subscribes to real-time L2 updates
- `drift.orderbookManager.updateSubscription({ marketId, grouping })` → change grouping
- `drift.updateSelectedTradeMarket(marketId)` → tells AuthorityDrift which market to subscribe to (uses websocket for selected, polling for others)
- `drift.pollingDlob.getPollingIntervalForMarket(marketKey)` → get polling interval info

**Data shape:** `L2WithOracleAndMarketData` from `@drift-labs/common`:
```typescript
{
  asks: Array<{ price: BN, size: BN }>,
  bids: Array<{ price: BN, size: BN }>,
  bestAskPrice: BN,
  bestBidPrice: BN,
  // ... oracle and market metadata
}
```

**Grouping:** `OrderbookGrouping` (1, 10, 100, 500, 1000 tick multiples)

**Price formatting:** Uses `BigNum.from(price, PRICE_PRECISION_EXP).toNotional()` and `BigNum.from(size, BASE_PRECISION_EXP).prettyPrint()`

### 2. Price Chart / Candle Data (OHLCV)

**Source:** `CandleClient` from `@drift-labs/common`

**Key APIs:**
- `const candleClient = new CandleClient()` — standalone client, no dependency on AuthorityDrift
- `candleClient.fetch({ env, marketId, resolution, fromTs, toTs })` → returns `JsonCandle[]`
- `candleClient.subscribe({ env, marketId, resolution }, subscriptionKey)` → subscribe to real-time updates
- `candleClient.on(subscriptionKey, "candle-update", callback)` → listen for new/updated candles
- `candleClient.unsubscribe(subscriptionKey)` / `candleClient.unsubscribeAll()`

**Environment:** `UIEnv.createMainnet()` from `@drift-labs/common`

**Data shape:** `JsonCandle` from `@drift-labs/common`:
```typescript
{
  ts: number,        // unix timestamp (seconds)
  fillOpen: number,  // open price
  fillHigh: number,  // high price
  fillLow: number,   // low price
  fillClose: number, // close price
  baseVolume: number // volume
}
```

**Resolutions:** `CandleResolution` from `@drift-labs/sdk`: `"1"`, `"5"`, `"15"`, `"60"`, `"240"`, `"1440"`

**Chart library:** `lightweight-charts` v5 with `CandlestickSeries` and `HistogramSeries` (volume)

### 3. Recent Trades / Fills

**Not implemented in the template.** The drift-ui-template does **not** include a RecentTrades panel or fill history component. There are no hooks like `useRecentTrades` or `useDLOB`.

For fills data, you would need to use:
- **`DriftClient.getOrderFillEventsForUser()`** from `@drift-labs/sdk`
- **DLOB Server API** at `https://dlob.drift.trade` for public trade history
- **`EventSubscriber`** from the SDK for real-time fill events

### 4. Mark Prices & Oracle Prices (real-time)

**Source:** `AuthorityDrift` cached data + event subscriptions

**Mark prices** (`MarkPriceLookup`):
- `drift.markPriceCache` → initial data
- `drift.onMarkPricesUpdate(callback)` → real-time updates
- Contains: `markPrice`, `bestBid`, `bestAsk`, `lastUpdateSlot`

**Oracle prices** (`OraclePriceLookup`):
- `drift.oraclePriceCache` → initial data
- `drift.onOraclePricesUpdate(callback)` → real-time updates
- Contains: `price`, `slot`

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@drift-labs/common` | ^1.0.14 | `AuthorityDrift`, `CandleClient`, `MarketId`, `TRADING_UTILS`, `UIEnv`, `OrderbookGrouping`, `L2WithOracleAndMarketData`, `JsonCandle` |
| `@drift-labs/sdk` | 2.146.0-beta.12 | `DriftClient`, `BigNum`, `BN`, `PRICE_PRECISION_EXP`, `BASE_PRECISION_EXP`, `CandleResolution`, `MarketType`, `PerpMarketConfig`, `SpotMarketConfig` |
| `lightweight-charts` | ^5.0.8 | TradingView-style candle charts |
| `zustand` | ^5.0.7 | State management for stores |
| `immer` | ^10.1.1 | Immutable state updates in zustand |

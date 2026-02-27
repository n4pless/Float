/**
 * useSetupDrift — Core hook that sets up the DriftClient and
 * syncs all data into Zustand stores.
 *
 * Modeled after drift-ui-template's useSetupDrift pattern:
 *  - Creates client when wallet connects
 *  - Subscribes to protocol state
 *  - Runs a unified sync loop that pushes updates to stores
 *  - Cleans up on wallet disconnect
 *
 * This replaces the old per-hook polling (useAccountState 5s,
 * usePositions 3s, useOpenOrders 3s, useBalance 15s) with a
 * single 1.5s sync cycle for all data.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { DriftTradingClient } from '../sdk/drift-client-wrapper';
import { useDriftStore } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';

const SYNC_INTERVAL = 1500; // ms — unified sync cycle
const BALANCE_INTERVAL = 10000; // ms — less frequent for on-chain balance

export function useSetupDrift(
  wallet: WalletContextState,
  readOnlyCallbacks?: { pauseReadOnly: () => void; restoreReadOnly: () => void },
) {
  const clientRef = useRef<DriftTradingClient | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPriceRef = useRef<number>(0);

  const {
    setClient,
    setSubscribed,
    setUserInitialized,
    setLoading,
    setError,
    updateMarketData,
    setAccountState,
    setPositions,
    setOpenOrders,
    setSolBalance,
    setUsdcBalance,
    setAccountSpotBalances,
    reset,
    selectedMarket,
  } = useDriftStore.getState();

  /* ── Sync market data from SDK ── */
  const syncMarketData = useCallback(() => {
    const client = clientRef.current;
    if (!client?.isSubscribed) return;

    const market = useDriftStore.getState().selectedMarket;
    const oraclePrice = client.getMarkPrice(market);
    const fundingRate = client.getFundingRate(market);
    const openInterest = client.getOpenInterest(market);

    if (oraclePrice > 0) {
      lastPriceRef.current = oraclePrice;

      updateMarketData({
        oraclePrice,
        markPrice: oraclePrice, // For AMM, mark ≈ oracle
        fundingRate,
        openInterest,
      });
    }
  }, []);

  /* ── Sync user data from SDK ── */
  const syncUserData = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.isSubscribed) return;

    try {
      // Account state
      const state = await client.getAccountState();
      setAccountState(state);

      // Positions
      const positions = await client.getPositions();
      setPositions(positions);

      // Open orders
      const orders = client.getOpenOrders();
      setOpenOrders(orders);

      // Spot balances (deposits/borrows inside Drift account)
      const spotBalances = await client.getSpotBalances();
      setAccountSpotBalances(spotBalances);
    } catch (err) {
      // Silently ignore sync errors — stale data is better than no data
      console.debug('[sync] user data error:', (err as Error).message);
    }
  }, []);

  /* ── Sync balances (less frequent RPC call) ── */
  const syncBalances = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.isSubscribed) return;

    try {
      const sol = await client.getBalance();
      setSolBalance(sol);
    } catch {}

    try {
      const usdc = await client.getUsdcBalance(DRIFT_CONFIG.usdc.mint);
      setUsdcBalance(usdc);
    } catch {}
  }, []);

  /* ── Setup / Teardown on wallet change ── */
  useEffect(() => {
    const pubkeyStr = wallet.publicKey?.toString();

    if (!wallet.connected || !wallet.publicKey) {
      // Disconnect
      if (clientRef.current) {
        clientRef.current.disconnect().catch(() => {});
        clientRef.current = null;
      }
      if (syncRef.current) clearInterval(syncRef.current);
      if (balanceSyncRef.current) clearInterval(balanceSyncRef.current);
      syncRef.current = null;
      balanceSyncRef.current = null;
      lastPriceRef.current = 0;

      // Reset user-specific state but restore read-only client for market data
      const market = useDriftStore.getState().selectedMarket;
      const priceHistory = useDriftStore.getState().priceHistory;
      const recentTrades = useDriftStore.getState().recentTrades;
      reset();
      useDriftStore.setState({ selectedMarket: market, priceHistory, recentTrades });

      // Restore read-only client so orderbook + prices stay visible
      readOnlyCallbacks?.restoreReadOnly();
      return;
    }

    // Connect
    let cancelled = false;
    let newClient: DriftTradingClient | null = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Pause read-only sync while we set up the real client
        readOnlyCallbacks?.pauseReadOnly();

        const client = new DriftTradingClient({
          rpcUrl: DRIFT_CONFIG.rpc,
          driftProgramId: DRIFT_CONFIG.driftProgram,
          wallet: wallet as any,
        });
        newClient = client;

        await client.initialize();

        if (cancelled) {
          client.disconnect().catch(() => {});
          return;
        }

        // Tear down old client — but DON'T disconnect the read-only client
        if (clientRef.current) {
          clientRef.current.disconnect().catch(() => {});
        }
        clientRef.current = client;

        // Update store
        setClient(client);
        setSubscribed(true);
        setUserInitialized(client.isUserInitialized);
        setError(null);

        // Initial sync
        syncMarketData();
        await syncUserData();
        await syncBalances();

        // Start sync loops
        if (syncRef.current) clearInterval(syncRef.current);
        syncRef.current = setInterval(() => {
          syncMarketData();
          syncUserData();
        }, SYNC_INTERVAL);

        if (balanceSyncRef.current) clearInterval(balanceSyncRef.current);
        balanceSyncRef.current = setInterval(syncBalances, BALANCE_INTERVAL);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? String(err));
          // Restore read-only client so market data stays visible
          readOnlyCallbacks?.restoreReadOnly();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (newClient && newClient !== clientRef.current) {
        newClient.disconnect().catch(() => {});
      }
    };
  }, [wallet.publicKey?.toString(), wallet.connected]);

  /* ── Force refresh (called after trades/deposits) ── */
  const forceRefresh = useCallback(async () => {
    syncMarketData();
    await syncUserData();
    await syncBalances();
  }, [syncMarketData, syncUserData, syncBalances]);

  return { forceRefresh };
}

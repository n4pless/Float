/**
 * useReadOnlyDrift — Initializes a read-only DriftClient on app mount
 * (no wallet required) so that market data, oracle prices, the order book,
 * and recent trades are visible to visitors who haven't connected a wallet.
 *
 * When a real wallet connects, useSetupDrift replaces the read-only client.
 * When the wallet disconnects, useSetupDrift calls restoreReadOnly() to
 * fall back to this read-only client instead of blanking the screen.
 */
import { useEffect, useRef, useCallback } from 'react';
import { Keypair } from '@solana/web3.js';
import { DriftTradingClient, WalletLike } from '../sdk/drift-client-wrapper';
import { useDriftStore } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';

const SYNC_INTERVAL = 2000; // ms

/**
 * Creates a dummy WalletLike from a random Keypair.
 * The read-only client never signs transactions.
 */
function makeDummyWallet(): WalletLike {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey,
    signTransaction: async () => { throw new Error('Read-only — cannot sign'); },
    signAllTransactions: async () => { throw new Error('Read-only — cannot sign'); },
  };
}

export function useReadOnlyDrift() {
  const clientRef = useRef<DriftTradingClient | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const {
    setClient,
    setSubscribed,
    updateMarketData,
  } = useDriftStore.getState();

  const syncMarketData = useCallback(() => {
    const client = clientRef.current;
    if (!client?.isSubscribed) return;

    const market = useDriftStore.getState().selectedMarket;
    const oraclePrice = client.getMarkPrice(market);
    const fundingRate = client.getFundingRate(market);
    const openInterest = client.getOpenInterest(market);

    if (oraclePrice > 0) {
      updateMarketData({ oraclePrice, markPrice: oraclePrice, fundingRate, openInterest });
    }
  }, []);

  const startSyncLoop = useCallback(() => {
    if (syncRef.current) clearInterval(syncRef.current);
    syncRef.current = setInterval(syncMarketData, SYNC_INTERVAL);
  }, [syncMarketData]);

  const stopSyncLoop = useCallback(() => {
    if (syncRef.current) {
      clearInterval(syncRef.current);
      syncRef.current = null;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const dummyWallet = makeDummyWallet();
        const client = new DriftTradingClient({
          rpcUrl: DRIFT_CONFIG.rpc,
          driftProgramId: DRIFT_CONFIG.driftProgram,
          wallet: dummyWallet,
        });

        await client.initialize();

        if (!mountedRef.current) {
          client.disconnect().catch(() => {});
          return;
        }

        clientRef.current = client;

        // Only set store if a real wallet hasn't already connected
        const currentClient = useDriftStore.getState().client;
        if (!currentClient) {
          setClient(client);
          setSubscribed(true);
          syncMarketData();
          startSyncLoop();
        }

        console.log('[read-only] DriftClient connected — market data available without wallet');
      } catch (err) {
        console.warn('[read-only] Failed to init read-only client:', err);
      }
    })();

    return () => {
      mountedRef.current = false;
      stopSyncLoop();
      if (clientRef.current) {
        clientRef.current.disconnect().catch(() => {});
        clientRef.current = null;
      }
    };
  }, []);

  /**
   * Restore the read-only client to the store (called when wallet disconnects).
   */
  const restoreReadOnly = useCallback(() => {
    const roClient = clientRef.current;
    if (roClient?.isSubscribed) {
      setClient(roClient);
      setSubscribed(true);
      syncMarketData();
      startSyncLoop();
    }
  }, [syncMarketData, startSyncLoop]);

  /**
   * Pause the read-only sync (called when wallet connects and takes over).
   */
  const pauseReadOnly = useCallback(() => {
    stopSyncLoop();
  }, [stopSyncLoop]);

  return { restoreReadOnly, pauseReadOnly };
}

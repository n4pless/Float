import { useState, useEffect, useCallback } from 'react';
import {
  DriftTradingClient,
  AccountState,
  UserPosition,
} from '../sdk/drift-client-wrapper';
import type { Order } from '../sdk/drift-client-wrapper';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import DRIFT_CONFIG from '../config';

/* ── Client hook ─────────────────────────────────── */

export function useDriftClient(walletContext: WalletContextState | null) {
  const [client, setClient] = useState<DriftTradingClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userReady, setUserReady] = useState(false);

  useEffect(() => {
    if (!walletContext?.publicKey) {
      setClient(prev => {
        if (prev) prev.disconnect().catch(() => {});
        return null;
      });
      setLoading(false);
      setUserReady(false);
      return;
    }

    let cancelled = false;
    let newClient: DriftTradingClient | null = null;
    (async () => {
      try {
        setLoading(true);
        const c = new DriftTradingClient({
          rpcUrl: DRIFT_CONFIG.rpc,
          driftProgramId: DRIFT_CONFIG.driftProgram,
          wallet: walletContext as any,
        });
        newClient = c;
        await c.initialize();
        if (!cancelled) {
          setClient(prev => {
            if (prev) prev.disconnect().catch(() => {});
            return c;
          });
          setUserReady(c.isUserInitialized);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) { setError(err.message ?? String(err)); setClient(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (newClient) newClient.disconnect().catch(() => {});
    };
  }, [walletContext?.publicKey?.toString()]);

  return { client, loading, error, userReady, setUserReady };
}

/* ── Account state hook ─────────────────────────── */

export function useAccountState(client: DriftTradingClient | null) {
  const [state, setState] = useState<AccountState | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    try { setState(await client.getAccountState()); } catch { /* noop */ }
  }, [client]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { accountState: state, refresh };
}

/* ── Positions hook ──────────────────────────────── */

export function usePositions(client: DriftTradingClient | null) {
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!client) return;
    try {
      setLoading(true);
      setPositions(await client.getPositions());
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [client]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 3_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { positions, loading, refetch };
}

/* ── Open orders hook ────────────────────────────── */

export function useOpenOrders(client: DriftTradingClient | null) {
  const [orders, setOrders] = useState<Order[]>([]);

  const refetch = useCallback(() => {
    if (!client) { setOrders([]); return; }
    try {
      setOrders(client.getOpenOrders());
    } catch { /* noop */ }
  }, [client]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 3_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { orders, refetch };
}

/* ── Balance hook ────────────────────────────────── */

export function useBalance(client: DriftTradingClient | null) {
  const [balance, setBalance] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    if (!client) return;
    try { setBalance(await client.getBalance()); } catch { /* noop */ }
  }, [client]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 15_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { balance, refetch };
}

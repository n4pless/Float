/**
 * useTradeSubscriber — Recent Trades are populated via two paths:
 *
 *   1. **Direct capture** — drift-client-wrapper calls addRecentTrade()
 *      immediately after every successful placeAndTakePerpOrder (instant).
 *
 *   2. **Position-change detection** — the wrapper's _refreshAllUserAccounts()
 *      (runs every 8 s) compares each user's perp position to the previous
 *      snapshot and emits a trade when it changes. This catches fills from
 *      ANY user (e.g. another trader or the filler bot) at zero extra RPC cost.
 *
 * This hook is kept as a mount-point so App.tsx still calls it, but the
 * heavy lifting now lives inside the wrapper to avoid the flaky poller.
 */
import { useEffect } from 'react';
import { useDriftStore, selectClient } from '../stores/useDriftStore';

export function useTradeSubscriber() {
  const client = useDriftStore(selectClient);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);

  useEffect(() => {
    if (!client || !isSubscribed) return;
    console.log('[trade-sub] Trade detection active (direct capture + position-change)');
  }, [client, isSubscribed]);
}

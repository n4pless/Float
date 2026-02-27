/**
 * useTradeSubscriber — Subscribes to on-chain Drift fill events via
 * the SDK's EventSubscriber. Parses OrderActionRecord events, filters
 * for fills, and pushes them into the Zustand store's recentTrades[].
 *
 * Works with both the read-only client (no wallet) and the wallet-connected
 * client — ensures Recent Trades and Trade History are always populated.
 *
 * Uses WebSocket log subscription for real-time fills, falling back
 * to polling if websocket isn't available.
 */
import { useEffect, useRef } from 'react';
import {
  EventSubscriber,
  isVariant,
  PRICE_PRECISION,
  BASE_PRECISION,
} from '@drift-labs/sdk';
import { useDriftStore, selectClient } from '../stores/useDriftStore';

const MAX_EVENTS = 4096;

export function useTradeSubscriber() {
  const client = useDriftStore(selectClient);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);
  const subscriberRef = useRef<EventSubscriber | null>(null);
  const seenFillsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!client || !isSubscribed) return;

    let cancelled = false;
    let eventSub: EventSubscriber | null = null;

    (async () => {
      try {
        const driftClient = client.getDriftClient();
        const connection = client.getConnection();
        const program = driftClient.program;

        if (!program) {
          console.warn('[trade-sub] DriftClient program not ready');
          return;
        }

        eventSub = new EventSubscriber(connection as any, program as any, {
          eventTypes: ['OrderActionRecord'],
          maxEventsPerType: MAX_EVENTS,
          orderBy: 'blockchain',
          orderDir: 'desc',
          commitment: 'confirmed',
          logProviderConfig: { type: 'websocket' },
        });

        if (cancelled) return;

        const ok = await eventSub.subscribe();
        if (!ok || cancelled) {
          console.warn('[trade-sub] EventSubscriber.subscribe() returned false, trying polling...');
          // Try polling fallback
          if (eventSub) {
            try { await eventSub.unsubscribe(); } catch {}
          }
          eventSub = new EventSubscriber(connection as any, program as any, {
            eventTypes: ['OrderActionRecord'],
            maxEventsPerType: MAX_EVENTS,
            orderBy: 'blockchain',
            orderDir: 'desc',
            commitment: 'confirmed',
            logProviderConfig: {
              type: 'polling',
              frequency: 2000,
            },
          });
          if (cancelled) return;
          await eventSub.subscribe();
        }

        subscriberRef.current = eventSub;
        console.log('[trade-sub] EventSubscriber active — listening for fills');

        // Process any existing buffered events
        processBufferedEvents(eventSub, seenFillsRef.current);

        // Listen for new events
        eventSub.eventEmitter.on('newEvent', (event: any) => {
          if (cancelled) return;
          processFillEvent(event, seenFillsRef.current);
        });
      } catch (err) {
        console.error('[trade-sub] Failed to start EventSubscriber:', err);
        // Fallback: start a simple polling loop that reads events
        if (!cancelled) {
          startPollingFallback(client, seenFillsRef.current, () => cancelled);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (eventSub) {
        eventSub.unsubscribe().catch(() => {});
      }
      subscriberRef.current = null;
    };
  }, [client, isSubscribed]);
}

/**
 * Process a single OrderActionRecord event — filter for fills and push to store.
 */
function processFillEvent(
  event: any,
  seen: Set<string>,
) {
  try {
    if (event.eventType !== 'OrderActionRecord') return;

    const record = event as any; // WrappedEvent<'OrderActionRecord'>

    // Only process fills
    if (!isVariant(record.action, 'fill')) return;

    // Deduplicate by fillRecordId + txSig
    const fillKey = `${record.fillRecordId?.toString() ?? ''}-${record.txSig ?? ''}`;
    if (seen.has(fillKey)) return;
    seen.add(fillKey);

    // Keep dedup set bounded
    if (seen.size > 10000) {
      const arr = Array.from(seen);
      arr.splice(0, arr.length - 5000);
      seen.clear();
      arr.forEach((k) => seen.add(k));
    }

    // Parse fill data
    const basePrecision = BASE_PRECISION.toNumber();
    const pricePrecision = PRICE_PRECISION.toNumber();

    const baseAmountFilled = record.baseAssetAmountFilled
      ? record.baseAssetAmountFilled.toNumber()
      : 0;
    const quoteAmountFilled = record.quoteAssetAmountFilled
      ? record.quoteAssetAmountFilled.toNumber()
      : 0;

    if (baseAmountFilled === 0) return; // skip zero-fill events

    // Calculate price: quote / base, adjusted for precision
    const price =
      quoteAmountFilled > 0 && baseAmountFilled > 0
        ? (quoteAmountFilled / baseAmountFilled) * (basePrecision / pricePrecision)
        : record.oraclePrice
          ? record.oraclePrice.toNumber() / pricePrecision
          : 0;

    if (price <= 0) return;

    // Size in USD
    const sizeUsd = quoteAmountFilled / pricePrecision;

    // Direction: taker's direction determines the reported side
    const side: 'buy' | 'sell' = record.takerOrderDirection
      ? isVariant(record.takerOrderDirection, 'long')
        ? 'buy'
        : 'sell'
      : 'buy';

    // Timestamp: record.ts is a BN in seconds
    const ts = record.ts ? record.ts.toNumber() * 1000 : Date.now();

    // Fees
    const takerFee = record.takerFee ? record.takerFee.toNumber() / pricePrecision : 0;
    const makerFee = record.makerFee ? record.makerFee.toNumber() / pricePrecision : 0;

    const trade = {
      price,
      size: sizeUsd,
      side,
      ts,
      txSig: record.txSig ?? undefined,
      taker: record.taker?.toString(),
      maker: record.maker?.toString(),
      takerFee,
      makerFee,
      fillId: record.fillRecordId?.toString(),
      marketIndex: record.marketIndex,
    };

    useDriftStore.getState().addRecentTrade(trade);
  } catch (err) {
    console.debug('[trade-sub] Error processing fill event:', err);
  }
}

/**
 * Process already-buffered events from EventSubscriber on startup.
 */
function processBufferedEvents(eventSub: EventSubscriber, seen: Set<string>) {
  try {
    const events = eventSub.getEventsArray('OrderActionRecord');
    for (const event of events) {
      processFillEvent(event as any, seen);
    }
  } catch (err) {
    console.debug('[trade-sub] Error processing buffered events:', err);
  }
}

/**
 * Fallback: poll for recent transaction signatures and parse logs manually.
 * Used when EventSubscriber fails entirely (e.g., RPC doesn't support logsSubscribe).
 */
function startPollingFallback(
  client: NonNullable<ReturnType<typeof useDriftStore.getState>['client']>,
  seen: Set<string>,
  isCancelled: () => boolean,
) {
  console.log('[trade-sub] Starting polling fallback for trade events');

  const poll = async () => {
    if (isCancelled()) return;

    try {
      const driftClient = client.getDriftClient();
      const connection = client.getConnection();
      const programId = driftClient.program.programId;

      // Get recent signatures for the Drift program
      const sigs = await connection.getSignaturesForAddress(programId, { limit: 25 });

      for (const sigInfo of sigs) {
        if (isCancelled()) return;
        if (seen.has(sigInfo.signature)) continue;
        seen.add(sigInfo.signature);

        try {
          const tx = await connection.getTransaction(sigInfo.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });

          if (!tx?.meta?.logMessages) continue;

          // Look for fill events in logs (Drift emits "Program log: OrderActionRecord" events)
          const logs = tx.meta.logMessages;
          const hasFill = logs.some(
            (l) => l.includes('OrderActionRecord') || l.includes('fill'),
          );

          if (hasFill) {
            // Try to parse via the SDK's parseLogs
            try {
              const { parseLogs } = await import('@drift-labs/sdk');
              const parsed = parseLogs(driftClient.program as any, logs);
              for (const event of parsed) {
                processFillEvent(
                  { ...event, txSig: sigInfo.signature, slot: tx.slot } as any,
                  seen,
                );
              }
            } catch {
              // parseLogs not available or failed — skip
            }
          }
        } catch {
          // Individual tx fetch failed — skip
        }
      }
    } catch (err) {
      console.debug('[trade-sub] Polling fallback error:', err);
    }
  };

  // Initial poll
  poll();

  // Then poll every 5 seconds
  const interval = setInterval(poll, 5000);

  // Store cleanup (will be cancelled by useEffect cleanup)
  const checkCancel = setInterval(() => {
    if (isCancelled()) {
      clearInterval(interval);
      clearInterval(checkCancel);
    }
  }, 1000);
}

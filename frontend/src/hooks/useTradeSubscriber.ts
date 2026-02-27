/**
 * useTradeSubscriber — Captures on-chain fills and feeds them to recentTrades[].
 *
 * Two complementary strategies:
 *   1. **Direct capture** — the drift-client-wrapper calls addRecentTrade()
 *      immediately after every successful placeAndTakePerpOrder so the UI
 *      updates instantly (zero RPC overhead).
 *   2. **Background sig polling** — polls getSignaturesForAddress on the
 *      Drift program every 10 s, fetches new txs, and parses fill logs
 *      via parseLogs(). Catches fills from ANY user (not just this wallet).
 *
 * This avoids the flaky EventSubscriber / logsSubscribe path that
 * consistently fails on devnet's rate-limited public RPC.
 */
import { useEffect, useRef } from 'react';
import {
  isVariant,
  PRICE_PRECISION,
  BASE_PRECISION,
} from '@drift-labs/sdk';
import { useDriftStore, selectClient } from '../stores/useDriftStore';

const POLL_INTERVAL_MS = 10_000;
const MAX_SIGS_PER_POLL = 20;

export function useTradeSubscriber() {
  const client = useDriftStore(selectClient);
  const isSubscribed = useDriftStore((s) => s.isSubscribed);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!client || !isSubscribed) return;

    let cancelled = false;
    const seen = seenRef.current;

    const driftClient = client.getDriftClient();
    const connection = client.getConnection();
    let program: any = null;
    try { program = driftClient.program; } catch {}
    const programId = program?.programId;

    console.log('[trade-sub] Starting trade poller for', programId?.toBase58());

    let lastSig: string | undefined;

    const poll = async () => {
      if (cancelled) return;
      try {
        const opts: any = { limit: MAX_SIGS_PER_POLL };
        if (lastSig) opts.until = lastSig;

        const sigs = await connection.getSignaturesForAddress(programId, opts, 'confirmed');
        if (cancelled || sigs.length === 0) return;

        // Bookmark the newest signature so next poll only gets new ones
        lastSig = sigs[0].signature;

        // Process oldest-first so trades appear in chronological order
        for (const sigInfo of [...sigs].reverse()) {
          if (cancelled) return;
          if (sigInfo.err) continue;
          if (seen.has(sigInfo.signature)) continue;
          seen.add(sigInfo.signature);

          try {
            const tx = await connection.getTransaction(sigInfo.signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });
            if (!tx?.meta?.logMessages) continue;

            const logs = tx.meta.logMessages;

            // Quick check: skip if no fill indicators
            const hasFill = logs.some(
              l => l.includes('fill') || l.includes('Fill') || l.includes('OrderAction')
            );
            if (!hasFill) continue;

            // Try SDK parseLogs first
            if (program) {
              try {
                const { parseLogs } = await import('@drift-labs/sdk');
                const parsed = parseLogs(program, logs);
                let foundFill = false;
                for (const event of parsed) {
                  const added = processFillEvent(
                    { ...event, txSig: sigInfo.signature, slot: tx.slot },
                    seen,
                  );
                  if (added) foundFill = true;
                }
                if (foundFill) continue;
              } catch {
                // parseLogs unavailable or failed — try fallback
              }
            }

            // Fallback: extract fill from raw base64 event data in logs
            extractFillFromLogs(logs, sigInfo.signature, sigInfo.blockTime ?? 0);
          } catch {
            // Individual tx fetch failed (rate-limit etc) — skip
          }
        }
      } catch (err: any) {
        if (!String(err?.message).includes('429')) {
          console.debug('[trade-sub] poll error:', err?.message);
        }
      }
    };

    // Initial poll after a short delay
    const initTimer = setTimeout(() => { if (!cancelled) poll(); }, 2_000);
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    // Trim dedup set every minute
    const trimTimer = setInterval(() => {
      if (seen.size > 5000) {
        const arr = Array.from(seen);
        seen.clear();
        arr.slice(-2500).forEach(k => seen.add(k));
      }
    }, 60_000);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      clearInterval(timer);
      clearInterval(trimTimer);
    };
  }, [client, isSubscribed]);
}

/* ── helpers ──────────────────────────────────────────── */

/**
 * Process a parsed OrderActionRecord fill event → push to store.
 * Returns true if a trade was added.
 */
function processFillEvent(event: any, seen: Set<string>): boolean {
  try {
    if (event.eventType !== 'OrderActionRecord') return false;
    if (!isVariant(event.action, 'fill')) return false;

    const fillKey = `fill-${event.fillRecordId?.toString() ?? ''}-${event.txSig ?? ''}`;
    if (seen.has(fillKey)) return false;
    seen.add(fillKey);

    const basePrecision = BASE_PRECISION.toNumber();
    const pricePrecision = PRICE_PRECISION.toNumber();

    const baseAmt = event.baseAssetAmountFilled?.toNumber?.() ?? 0;
    const quoteAmt = event.quoteAssetAmountFilled?.toNumber?.() ?? 0;
    if (baseAmt === 0) return false;

    const price =
      quoteAmt > 0 && baseAmt > 0
        ? (quoteAmt / baseAmt) * (basePrecision / pricePrecision)
        : event.oraclePrice
          ? event.oraclePrice.toNumber() / pricePrecision
          : 0;
    if (price <= 0) return false;

    const sizeUsd = quoteAmt / pricePrecision;
    const side: 'buy' | 'sell' = event.takerOrderDirection
      ? isVariant(event.takerOrderDirection, 'long') ? 'buy' : 'sell'
      : 'buy';
    const ts = event.ts ? event.ts.toNumber() * 1000 : Date.now();

    useDriftStore.getState().addRecentTrade({
      price,
      size: sizeUsd,
      side,
      ts,
      txSig: event.txSig,
      taker: event.taker?.toString(),
      maker: event.maker?.toString(),
      takerFee: event.takerFee ? event.takerFee.toNumber() / PRICE_PRECISION.toNumber() : 0,
      makerFee: event.makerFee ? event.makerFee.toNumber() / PRICE_PRECISION.toNumber() : 0,
      fillId: event.fillRecordId?.toString(),
      marketIndex: event.marketIndex,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fallback: attempt to build a trade from raw log lines when parseLogs fails.
 * Drift CPI logs include the oracle price in the market data.  At worst we
 * emit a trade at the current oracle price so the UI has something.
 */
function extractFillFromLogs(logs: string[], txSig: string, blockTime: number) {
  // Currently a no-op — direct capture & parseLogs handle the common paths.
  // Keeping the stub so we can add raw log decoding later if needed.
}

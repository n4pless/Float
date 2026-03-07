import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { ArrowLeft, Shield, ShieldOff, RefreshCw, Lock, Unlock, AlertTriangle } from 'lucide-react';
import {
  fetchGame,
  GameAccount,
  buildPauseIx,
  buildUnpauseIx,
  PREDICTION_PROGRAM_ID,
  gamePDA,
} from '../prediction/client';

/* ─── Authorised admin wallet ─── */
const ADMIN_WALLET = 'Fm4q9C7kzzEZkFk3ihzA1VVQJRE1LK8kMiZ99Y94mcd';

interface AdminPageProps {
  onBack: () => void;
}

export function AdminPage({ onBack }: AdminPageProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();

  const [game, setGame] = useState<GameAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [txPending, setTxPending] = useState(false);
  const [txResult, setTxResult] = useState<{ ok: boolean; msg: string } | null>(null);

  /* ─── Fetch game state ─── */
  const refreshGame = useCallback(async () => {
    setLoading(true);
    try {
      const g = await fetchGame(connection);
      setGame(g);
    } catch (e) {
      console.error('Failed to fetch game:', e);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    refreshGame();
  }, [refreshGame]);

  /* ─── Admin check ─── */
  const isAdmin =
    wallet.publicKey ? wallet.publicKey.toBase58() === ADMIN_WALLET : false;

  /* ─── Send pause / unpause tx ─── */
  const sendAdminTx = useCallback(
    async (action: 'pause' | 'unpause') => {
      if (!wallet.publicKey || !wallet.signTransaction) return;
      setTxPending(true);
      setTxResult(null);
      try {
        const ix = action === 'pause'
          ? buildPauseIx(wallet.publicKey)
          : buildUnpauseIx(wallet.publicKey);

        const tx = new Transaction().add(ix);
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const signed = await wallet.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, 'confirmed');

        setTxResult({ ok: true, msg: `${action === 'pause' ? 'Paused' : 'Unpaused'} successfully! Tx: ${sig.slice(0, 12)}…` });
        await refreshGame();
      } catch (e: any) {
        console.error(`Admin ${action} failed:`, e);
        setTxResult({ ok: false, msg: e?.message?.slice(0, 120) || 'Transaction failed' });
      } finally {
        setTxPending(false);
      }
    },
    [wallet, connection, refreshGame],
  );

  /* ─── Helpers ─── */
  const fmt = (lamports: number) => (lamports / 1e9).toFixed(4);
  const [gamePub] = gamePDA();

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg text-txt-0 overflow-auto">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-drift-panel border-b border-drift-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-drift-border/40 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-txt-2" />
        </button>
        <Shield className="w-5 h-5 text-accent" />
        <span className="text-lg font-bold">Admin Panel</span>
        <span className="ml-auto text-xs text-txt-3 font-mono">
          Program: {PREDICTION_PROGRAM_ID.toBase58().slice(0, 8)}…
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start p-6 gap-6 max-w-xl mx-auto w-full">
        {/* Wallet status */}
        <div className="w-full rounded-xl bg-drift-panel border border-drift-border p-5">
          <h3 className="text-sm font-semibold text-txt-2 mb-3">Wallet</h3>
          {wallet.publicKey ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-bull" />
              <span className="font-mono text-sm">{wallet.publicKey.toBase58()}</span>
            </div>
          ) : (
            <button
              onClick={() => setVisible(true)}
              className="px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Connect Wallet
            </button>
          )}

          {wallet.publicKey && game && !isAdmin && (
            <div className="mt-3 flex items-start gap-2 text-bear text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Connected wallet is not the admin. Admin: <span className="font-mono">{game.admin.toBase58().slice(0, 16)}…</span>
              </span>
            </div>
          )}

          {isAdmin && (
            <div className="mt-3 flex items-center gap-2 text-bull text-xs font-semibold">
              <Shield className="w-4 h-4" />
              Admin access granted
            </div>
          )}
        </div>

        {/* Game state */}
        <div className="w-full rounded-xl bg-drift-panel border border-drift-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-txt-2">Game State</h3>
            <button
              onClick={refreshGame}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-drift-border/40 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-txt-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading && !game ? (
            <div className="text-txt-3 text-sm animate-pulse">Loading…</div>
          ) : game ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-txt-3 text-xs">Status</span>
                <div className={`font-bold ${game.paused ? 'text-bear' : 'text-bull'}`}>
                  {game.paused ? '⏸ Paused' : '▶ Active'}
                </div>
              </div>
              <div>
                <span className="text-txt-3 text-xs">Current Epoch</span>
                <div className="font-mono">{game.currentEpoch}</div>
              </div>
              <div>
                <span className="text-txt-3 text-xs">Interval</span>
                <div className="font-mono">{game.intervalSeconds}s</div>
              </div>
              <div>
                <span className="text-txt-3 text-xs">Min Bet</span>
                <div className="font-mono">{fmt(game.minBetAmount)} SOL</div>
              </div>
              <div>
                <span className="text-txt-3 text-xs">Treasury Fee</span>
                <div className="font-mono">{game.treasuryFee / 100}%</div>
              </div>
              <div>
                <span className="text-txt-3 text-xs">Genesis</span>
                <div className="font-mono">
                  {game.genesisStart ? '✓' : '✗'} Start / {game.genesisLock ? '✓' : '✗'} Lock
                </div>
              </div>
              <div className="col-span-2">
                <span className="text-txt-3 text-xs">Game PDA</span>
                <div className="font-mono text-xs truncate">{gamePub.toBase58()}</div>
              </div>
              <div className="col-span-2">
                <span className="text-txt-3 text-xs">Admin</span>
                <div className="font-mono text-xs truncate">{game.admin.toBase58()}</div>
              </div>
              <div className="col-span-2">
                <span className="text-txt-3 text-xs">Operator</span>
                <div className="font-mono text-xs truncate">{game.operator.toBase58()}</div>
              </div>
              <div className="col-span-2">
                <span className="text-txt-3 text-xs">Treasury</span>
                <div className="font-mono text-xs truncate">{game.treasury.toBase58()}</div>
              </div>
            </div>
          ) : (
            <div className="text-bear text-sm">Game account not found</div>
          )}
        </div>

        {/* Admin actions */}
        {isAdmin && game && (
          <div className="w-full rounded-xl bg-drift-panel border border-drift-border p-5">
            <h3 className="text-sm font-semibold text-txt-2 mb-4">Admin Actions</h3>

            <div className="flex gap-3">
              <button
                onClick={() => sendAdminTx('pause')}
                disabled={txPending || game.paused}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  game.paused
                    ? 'bg-drift-border/30 text-txt-3 cursor-not-allowed'
                    : 'bg-bear/90 hover:bg-bear text-white'
                }`}
              >
                <Lock className="w-4 h-4" />
                {txPending ? 'Sending…' : 'Pause Predictions'}
              </button>

              <button
                onClick={() => sendAdminTx('unpause')}
                disabled={txPending || !game.paused}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  !game.paused
                    ? 'bg-drift-border/30 text-txt-3 cursor-not-allowed'
                    : 'bg-bull/90 hover:bg-bull text-white'
                }`}
              >
                <Unlock className="w-4 h-4" />
                {txPending ? 'Sending…' : 'Unpause Predictions'}
              </button>
            </div>

            {/* Tx result feedback */}
            {txResult && (
              <div
                className={`mt-3 p-3 rounded-lg text-xs font-mono ${
                  txResult.ok
                    ? 'bg-bull/10 text-bull border border-bull/20'
                    : 'bg-bear/10 text-bear border border-bear/20'
                }`}
              >
                {txResult.msg}
              </div>
            )}
          </div>
        )}

        {/* Info footer */}
        <div className="text-xs text-txt-3 text-center pb-6">
          Only the admin wallet can pause/unpause the prediction market.<br />
          Access this page at <span className="font-mono">/admin</span>
        </div>
      </div>
    </div>
  );
}

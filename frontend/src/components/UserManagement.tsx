/**
 * UserManagement — Flat account dashboard.
 *
 * Create accounts, manage sub-accounts, deposit/withdraw, faucet.
 * Clean flat design — no glassmorphism, no gradients, no decorative icons.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { SubAccount, useDriftStore } from '../stores/useDriftStore';
import { useUserManagement } from '../hooks/useUserManagement';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/Dialog';

interface Props {
  forceRefresh: () => Promise<void>;
  onBack: () => void;
  trading?: {
    createAccount: (depositAmount: number) => Promise<string>;
    deposit: (amount: number) => Promise<string>;
    withdraw: (amount: number) => Promise<string>;
  };
}

/* --- Section header --- */
const SectionLabel: React.FC<{ label: string; right?: React.ReactNode }> = ({ label, right }) => (
  <div className="flex items-center justify-between px-3 py-2 border-b border-drift-border bg-drift-panel">
    <span className="text-[11px] font-medium text-txt-1 uppercase tracking-wider">{label}</span>
    {right}
  </div>
);

/* --- Stat row --- */
const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between px-3 py-1.5">
    <span className="text-[11px] text-txt-3">{label}</span>
    <span className={`text-[12px] font-semibold tabular-nums ${color ?? 'text-txt-0'}`}>{value}</span>
  </div>
);

/* --- Page header --- */
const PageHeader: React.FC<{ onBack: () => void; pubkey?: string }> = ({ onBack, pubkey }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-drift-border bg-drift-bg shrink-0">
    <button onClick={onBack} className="p-1 rounded text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-colors">
      <ArrowLeft className="w-4 h-4" />
    </button>
    <span className="text-[13px] font-semibold text-txt-0">Account</span>
    <div className="flex-1" />
    {pubkey && <span className="text-[10px] text-txt-3 font-mono">{pubkey}</span>}
    <span className="text-[10px] text-purple font-semibold">DEVNET</span>
  </div>
);

/* ================================================ */
/*  Main UserManagement component                    */
/* ================================================ */
export const UserManagement: React.FC<Props> = ({ forceRefresh, onBack, trading }) => {
  const {
    connected,
    publicKey,
    subAccounts,
    activeSubAccountId,
    isDeleting,
    showDeleteDialog,
    selectedSubAccountForDeletion,
    status,
    handleCreateAndDeposit,
    handleDeleteUser,
    openDeleteDialog,
    handleSetActiveSubAccount,
    setShowDeleteDialog,
  } = useUserManagement(forceRefresh);

  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);
  const accountState = useDriftStore((s) => s.accountState);
  const solBalance = useDriftStore((s) => s.solBalance);
  const usdcBalance = useDriftStore((s) => s.usdcBalance);

  const pubkeyStr = publicKey?.toBase58() ?? null;
  const shortPubkey = pubkeyStr ? `${pubkeyStr.slice(0, 4)}...${pubkeyStr.slice(-4)}` : '';

  /* -- Local state -- */
  const [amount, setAmount] = useState('1000');
  const [accountName, setAccountName] = useState('Main Account');
  const [loading, setLoading] = useState<string | null>(null);
  const [faucetMsg, setFaucetMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [claimsUsed, setClaimsUsed] = useState(0);

  /* -- Faucet status -- */
  useEffect(() => {
    if (!pubkeyStr) return;
    fetch(`/api/faucet-status?publicKey=${pubkeyStr}`)
      .then(r => r.json())
      .then(d => setClaimsUsed(d.claimsUsed ?? 0))
      .catch(() => {});
  }, [pubkeyStr]);

  /* -- Faucet: SOL -- */
  const handleAirdropSol = useCallback(async () => {
    if (!pubkeyStr) return;
    setLoading('sol');
    setFaucetMsg(null);
    try {
      const res = await fetch('/api/airdrop-sol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkeyStr, amount: 2 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFaucetMsg({ type: 'ok', text: `+${data.amount} SOL` });
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message });
    } finally { setLoading(null); }
  }, [pubkeyStr]);

  /* -- Faucet: USDC -- */
  const handleMintUsdc = useCallback(async () => {
    if (!pubkeyStr) return;
    setLoading('usdc');
    setFaucetMsg(null);
    try {
      const res = await fetch('/api/mint-usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkeyStr }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setClaimsUsed(data.claimsUsed ?? 0);
      setFaucetMsg({ type: 'ok', text: `+${data.amount.toLocaleString()} USDC` });
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message });
    } finally { setLoading(null); }
  }, [pubkeyStr]);

  /* -- Deposit -- */
  const handleDeposit = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !trading) return;
    setLoading('deposit');
    setFaucetMsg(null);
    try {
      await trading.deposit(amt);
      setFaucetMsg({ type: 'ok', text: `Deposited ${amt} USDC` });
    } catch (e: any) {
      setFaucetMsg({ type: 'err', text: e.message || 'Deposit failed' });
    } finally { setLoading(null); }
  }, [amount, trading]);

  /* -- Withdraw -- */
  const handleWithdraw = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !trading) return;
    setLoading('withdraw');
    setFaucetMsg(null);
    try {
      await trading.withdraw(amt);
      setFaucetMsg({ type: 'ok', text: `Withdrew ${amt} USDC` });
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('InsufficientCollateral') || msg.includes('0x1773')) {
        const free = accountState?.freeCollateral ?? 0;
        setFaucetMsg({ type: 'err', text: `Insufficient collateral. Free: $${free.toFixed(2)}` });
      } else {
        setFaucetMsg({ type: 'err', text: msg });
      }
    } finally { setLoading(null); }
  }, [amount, trading, accountState]);

  /* -- Create account -- */
  const handleCreate = useCallback(async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;
    setLoading('create');
    try {
      await handleCreateAndDeposit({ name: accountName.trim() || 'Main Account', depositAmount: amt });
    } catch {} finally { setLoading(null); }
  }, [amount, accountName, handleCreateAndDeposit]);

  const health = accountState?.health ?? 100;
  const healthColor = health > 50 ? 'text-bull' : health > 20 ? 'text-[#efa411]' : 'text-bear';

  /* ========= Not connected ========= */
  if (!connected) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-drift-bg">
        <PageHeader onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-xs">
            <p className="text-[13px] font-semibold text-txt-0">Connect Wallet</p>
            <p className="text-[11px] text-txt-3 leading-relaxed">
              Connect your Solana wallet to create an account and start trading.
            </p>
            <WalletMultiButton className="!mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  /* ========= Connected ========= */
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-drift-bg">
      <PageHeader onBack={onBack} pubkey={shortPubkey} />

      {/* -- Status toast -- */}
      {(status.type || faucetMsg) && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded text-[11px] ${
          (faucetMsg?.type ?? status.type) === 'ok' || (faucetMsg?.type ?? status.type) === 'success'
            ? 'bg-bull/8 text-bull' : 'bg-bear/8 text-bear'
        }`}>
          {faucetMsg?.text ?? status.message}
        </div>
      )}

      {/* -- Content -- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-5xl mx-auto px-4 py-4">

          {/* -- Two-column grid -- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* ==== LEFT: Wallet & Faucet ==== */}
            <div className="space-y-3">

              {/* Wallet Balances */}
              <div className="rounded border border-drift-border overflow-hidden">
                <SectionLabel label="Wallet" />
                <div className="divide-y divide-drift-border">
                  {/* SOL row */}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded bg-purple/12 flex items-center justify-center text-[10px] font-bold text-purple">◎</span>
                      <div>
                        <span className="text-[12px] text-txt-0 font-semibold tabular-nums block">
                          {solBalance != null ? solBalance.toFixed(4) : '\u2014'}
                        </span>
                        <span className="text-[9px] text-txt-3">SOL</span>
                      </div>
                    </div>
                    <button onClick={handleAirdropSol} disabled={loading === 'sol'}
                      className="px-2.5 py-1 text-[10px] font-semibold rounded bg-purple/10 text-purple hover:bg-purple/18 disabled:opacity-40 transition-colors">
                      {loading === 'sol' ? 'Sending\u2026' : '+2 SOL'}
                    </button>
                  </div>
                  {/* USDC row */}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded bg-bull/12 flex items-center justify-center text-[10px] font-bold text-bull">$</span>
                      <div>
                        <span className="text-[12px] text-txt-0 font-semibold tabular-nums block">
                          {usdcBalance != null ? usdcBalance.toLocaleString() : '\u2014'}
                        </span>
                        <span className="text-[9px] text-txt-3">USDC</span>
                      </div>
                    </div>
                    <button onClick={handleMintUsdc} disabled={loading === 'usdc' || claimsUsed >= 2}
                      className="px-2.5 py-1 text-[10px] font-semibold rounded bg-accent/10 text-accent hover:bg-accent/18 disabled:opacity-40 transition-colors">
                      {loading === 'usdc' ? 'Minting\u2026' : claimsUsed >= 2 ? 'Max' : `+1K (${2 - claimsUsed})`}
                    </button>
                  </div>
                </div>

                {/* Wallet address */}
                <div className="px-3 py-2 border-t border-drift-border">
                  <p className="text-[10px] text-txt-3 font-mono truncate">{pubkeyStr}</p>
                </div>
              </div>

              {/* Deposit / Withdraw */}
              <div className="rounded border border-drift-border overflow-hidden">
                <SectionLabel label={isUserInitialized ? 'Deposit & Withdraw' : 'Create Account'} />
                <div className="p-3 space-y-3">

                  {/* Name input --- only on create */}
                  {!isUserInitialized && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-txt-3">Account Name</label>
                      <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                        placeholder="Main Account"
                        className="w-full h-8 px-3 rounded bg-drift-bg border border-drift-border text-[11px] text-txt-0 placeholder:text-txt-3/40 outline-none focus:border-txt-3/40 transition-colors" />
                    </div>
                  )}

                  {/* Amount input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-txt-3">Amount (USDC)</label>
                    <div className="flex items-center h-8 rounded bg-drift-bg border border-drift-border focus-within:border-txt-3/40 transition-colors">
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                        placeholder="0" step="any" min="0"
                        className="flex-1 h-full px-3 bg-transparent text-[11px] text-txt-0 tabular-nums outline-none" />
                      <span className="text-[10px] text-txt-3 pr-3 font-medium">USDC</span>
                    </div>
                  </div>

                  {/* Buttons */}
                  {isUserInitialized ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleDeposit} disabled={!!loading}
                        className="h-9 rounded text-[11px] font-semibold bg-bull/10 text-bull hover:bg-bull/18 disabled:opacity-30 transition-colors">
                        {loading === 'deposit' ? 'Depositing\u2026' : 'Deposit'}
                      </button>
                      <button onClick={handleWithdraw} disabled={!!loading}
                        className="h-9 rounded text-[11px] font-semibold bg-bear/10 text-bear hover:bg-bear/18 disabled:opacity-30 transition-colors">
                        {loading === 'withdraw' ? 'Withdrawing\u2026' : 'Withdraw'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Pre-checks */}
                      {(solBalance ?? 0) < 0.01 && (
                        <p className="text-[10px] text-bear">Need SOL for fees \u2014 use +2 SOL above</p>
                      )}
                      {(usdcBalance ?? 0) <= 0 && (solBalance ?? 0) >= 0.01 && (
                        <p className="text-[10px] text-bear">Need USDC \u2014 use faucet above</p>
                      )}
                      <button onClick={handleCreate}
                        disabled={!!loading || (solBalance ?? 0) < 0.01 || (usdcBalance ?? 0) <= 0 || !(parseFloat(amount) > 0)}
                        className="w-full h-9 rounded text-[12px] font-semibold bg-accent text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                        {loading === 'create' ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating\u2026</>
                        ) : (
                          `Create & Deposit ${amount || '0'} USDC`
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ==== RIGHT: Account Stats & Sub-Accounts ==== */}
            <div className="space-y-3">

              {/* Account Overview */}
              <div className="rounded border border-drift-border overflow-hidden">
                <SectionLabel label="Account"
                  right={
                    <span className={`text-[10px] font-semibold ${isUserInitialized ? 'text-bull' : 'text-txt-3'}`}>
                      {isUserInitialized ? 'Active' : 'No Account'}
                    </span>
                  }
                />
                {isUserInitialized ? (
                  <div className="divide-y divide-drift-border">
                    <Stat label="Equity" value={`$${(accountState?.totalCollateral ?? 0).toFixed(2)}`} />
                    <Stat label="Free Collateral" value={`$${(accountState?.freeCollateral ?? 0).toFixed(2)}`} color="text-accent" />
                    <Stat label="Leverage" value={`${(accountState?.leverage ?? 0).toFixed(2)}\u00d7`} />
                    <Stat label="Unrealized P&L"
                      value={`${(accountState?.unrealizedPnl ?? 0) >= 0 ? '+' : ''}$${(accountState?.unrealizedPnl ?? 0).toFixed(2)}`}
                      color={(accountState?.unrealizedPnl ?? 0) >= 0 ? 'text-bull' : 'text-bear'} />

                    {/* Health bar */}
                    <div className="px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-txt-3">Health</span>
                        <span className={`text-[11px] font-semibold tabular-nums ${healthColor}`}>{health.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-drift-surface overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${health}%`,
                            background: health > 50 ? '#24b47e' : health > 20 ? '#efa411' : '#f84960',
                          }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-8 text-center">
                    <p className="text-[11px] text-txt-3">Create an account to start trading</p>
                  </div>
                )}
              </div>

              {/* Sub-Accounts */}
              {subAccounts.length > 0 && (
                <div className="rounded border border-drift-border overflow-hidden">
                  <SectionLabel label={`Sub-Accounts (${subAccounts.length})`} />
                  <div className="divide-y divide-drift-border">
                    {subAccounts.map((acct) => {
                      const isActive = acct.subAccountId === activeSubAccountId;
                      const canDelete = acct.openPositions === 0 && acct.spotBalances <= 1;
                      return (
                        <div key={acct.subAccountId} className="flex items-center justify-between px-3 py-2.5 gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold text-txt-0 truncate">
                                {acct.name}
                              </span>
                              <span className="text-[10px] text-txt-3">#{acct.subAccountId}</span>
                              {isActive && (
                                <span className="px-1.5 py-px text-[9px] font-bold bg-accent text-white rounded">Active</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[10px] text-txt-3 tabular-nums">
                                <span className="text-bull">$</span>{acct.totalCollateral.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-txt-3">
                                {acct.openPositions} pos
                              </span>
                              <span className="text-[10px] text-txt-3 tabular-nums">
                                P&L {(acct.unrealizedPnl ?? 0) >= 0 ? '+' : ''}{(acct.unrealizedPnl ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isActive && (
                              <button onClick={() => handleSetActiveSubAccount(acct.subAccountId)}
                                className="px-2.5 py-1 text-[10px] font-semibold rounded bg-accent/10 text-accent hover:bg-accent/18 transition-colors">
                                Switch
                              </button>
                            )}
                            <button onClick={() => canDelete && openDeleteDialog(acct.subAccountId)}
                              disabled={!canDelete}
                              className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                                canDelete ? 'bg-bear/10 text-bear hover:bg-bear/18' : 'text-txt-3 opacity-25 cursor-not-allowed'
                              }`}>
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* New sub-account (only if already initialized) */}
              {isUserInitialized && (
                <div className="rounded border border-drift-border overflow-hidden">
                  <SectionLabel label="New Sub-Account" />
                  <div className="p-3 space-y-2">
                    <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                      placeholder="Account name"
                      className="w-full h-8 px-3 rounded bg-drift-bg border border-drift-border text-[11px] text-txt-0 placeholder:text-txt-3/40 outline-none focus:border-txt-3/40 transition-colors" />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center flex-1 h-8 rounded bg-drift-bg border border-drift-border focus-within:border-txt-3/40 transition-colors">
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                          placeholder="1000" min="0"
                          className="flex-1 h-full px-3 bg-transparent text-[11px] text-txt-0 tabular-nums outline-none" />
                        <span className="text-[10px] text-txt-3 pr-3">USDC</span>
                      </div>
                      <button onClick={handleCreate}
                        disabled={!!loading || !(parseFloat(amount) > 0)}
                        className="h-8 px-4 rounded text-[11px] font-semibold bg-accent text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                        {loading === 'create' ? 'Creating\u2026' : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -- Delete Dialog -- */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-bear">Delete Sub-Account</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Delete <strong>sub-account #{selectedSubAccountForDeletion}</strong>?
            Ensure all positions are closed and collateral is withdrawn.
          </DialogDescription>
          <DialogFooter>
            <button onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}
              className="px-4 py-2 rounded text-[11px] font-semibold border border-drift-border text-txt-1 hover:bg-drift-surface transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => selectedSubAccountForDeletion !== null && handleDeleteUser(selectedSubAccountForDeletion)}
              disabled={isDeleting}
              className="px-4 py-2 rounded text-[11px] font-semibold bg-bear text-white hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1.5">
              {isDeleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</> : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

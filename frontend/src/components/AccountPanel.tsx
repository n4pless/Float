import React, { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet, Shield, Coins, ArrowDownToLine, ArrowUpFromLine, Plus, CheckCircle, Circle, AlertCircle, Droplets, Activity } from 'lucide-react';
import { useDriftStore } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';

interface Props {
  trading: {
    createAccount: (depositAmount: number) => Promise<string>;
    deposit: (amount: number) => Promise<string>;
    withdraw: (amount: number) => Promise<string>;
  };
}

export const AccountPanel: React.FC<Props> = ({ trading }) => {
  const { connected } = useWallet();

  // Store subscriptions
  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);
  const accountState = useDriftStore((s) => s.accountState);
  const solBalance = useDriftStore((s) => s.solBalance);
  const usdcBalance = useDriftStore((s) => s.usdcBalance);

  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [amount, setAmount] = useState('1000');
  const [claimsUsed, setClaimsUsed] = useState(0);

  const pubkeyStr = client
    ? (client as any).wallet?.publicKey?.toString()
    : null;

  // Fetch faucet claim status when wallet connects
  useEffect(() => {
    if (!pubkeyStr) return;
    fetch(`/api/faucet-status?publicKey=${pubkeyStr}`)
      .then(r => r.json())
      .then(d => setClaimsUsed(d.claimsUsed ?? 0))
      .catch(() => {});
  }, [pubkeyStr]);

  /* ── Faucet handlers ── */
  const handleAirdropSol = async () => {
    if (!pubkeyStr) return;
    setLoading('sol');
    setMsg(null);
    try {
      const res = await fetch('/api/airdrop-sol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkeyStr, amount: 2 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMsg({ type: 'ok', text: `Received ${data.amount} SOL!` });
    } catch (e: any) {
      setMsg({ type: 'err', text: `SOL: ${e.message}` });
    } finally {
      setLoading(null);
    }
  };

  const handleMintUsdc = async () => {
    if (!pubkeyStr) return;
    setLoading('usdc');
    setMsg(null);
    try {
      const res = await fetch('/api/mint-usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkeyStr }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setClaimsUsed(data.claimsUsed ?? 0);
      setMsg({ type: 'ok', text: `Received ${data.amount.toLocaleString()} USDC! (${data.claimsMax - data.claimsUsed} claims left)` });
    } catch (e: any) {
      setMsg({ type: 'err', text: `USDC: ${e.message}` });
    } finally {
      setLoading(null);
    }
  };

  /* ── Account handlers ── */
  const handleCreateAndDeposit = async () => {
    const amt = parseFloat(amount) || 1000;
    setLoading('create');
    setMsg(null);
    try {
      await trading.createAccount(amt);
      setMsg({ type: 'ok', text: `Account created & ${amt} USDC deposited!` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Account setup failed' });
    } finally {
      setLoading(null);
    }
  };

  const handleDeposit = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;
    setLoading('deposit');
    setMsg(null);
    try {
      await trading.deposit(amt);
      setMsg({ type: 'ok', text: `${amt} USDC deposited!` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Deposit failed' });
    } finally {
      setLoading(null);
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return;

    // Pre-check: warn if open positions may block withdrawal
    const positions = useDriftStore.getState().positions;
    const freeCollateral = accountState?.freeCollateral ?? 0;
    if (positions.length > 0 && amt > freeCollateral) {
      setMsg({
        type: 'err',
        text: `Can only withdraw up to $${freeCollateral.toFixed(2)} (free collateral). Close positions to free more.`,
      });
      return;
    }

    setLoading('withdraw');
    setMsg(null);
    try {
      await trading.withdraw(amt);
      setMsg({ type: 'ok', text: `${amt} USDC withdrawn!` });
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      if (errMsg.includes('InsufficientCollateral') || errMsg.includes('0x1773')) {
        const free = accountState?.freeCollateral ?? 0;
        setMsg({
          type: 'err',
          text: `Insufficient collateral — you have open positions. Free collateral: $${free.toFixed(2)}. Close positions first or withdraw less.`,
        });
      } else {
        setMsg({ type: 'err', text: errMsg || 'Withdraw failed' });
      }
    } finally {
      setLoading(null);
    }
  };

  /* ── Not connected ── */
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center mb-4 ring-1 ring-accent/10">
          <Wallet className="w-7 h-7 text-accent" />
        </div>
        <h3 className="text-sm font-bold text-txt-0 mb-1.5">Connect Wallet</h3>
        <p className="text-[11px] text-txt-3 text-center mb-5 max-w-[220px] leading-relaxed">
          Connect your wallet to manage your trading account
        </p>
        <WalletMultiButton className="!justify-center !rounded-xl" />
      </div>
    );
  }

  const health = accountState?.health ?? 100;
  const healthColor = health > 50 ? '#00c278' : health > 20 ? '#efa411' : '#ff575a';

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      <div className="p-3 space-y-3">

        {/* ── Message ── */}
        {msg && (
          <div className={`px-3 py-2 rounded-xl text-[11px] flex items-start gap-2 leading-relaxed ${
            msg.type === 'ok'
              ? 'bg-bull/8 text-bull border border-bull/15'
              : 'bg-bear/8 text-bear border border-bear/15'
          }`}>
            {msg.type === 'ok' ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            <span>{msg.text}</span>
          </div>
        )}

        {/* ── Wallet Balances ── */}
        <div className="rounded-xl border border-drift-border/50 bg-drift-surface/15 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-drift-border/40">
            <Coins className="w-3.5 h-3.5 text-txt-3" />
            <span className="text-[11px] font-semibold text-txt-1">Wallet</span>
          </div>

          {/* SOL */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple/30 to-purple/10 flex items-center justify-center ring-1 ring-purple/15">
                <span className="text-[10px] font-bold text-purple">◎</span>
              </div>
              <div className="leading-tight">
                <span className="text-[12px] font-semibold text-txt-0 tabular-nums block">
                  {solBalance != null ? solBalance.toFixed(4) : '—'}
                </span>
                <span className="text-[9px] text-txt-3 font-medium">SOL</span>
              </div>
            </div>
            <button onClick={handleAirdropSol} disabled={loading === 'sol'}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-purple/10 text-purple hover:bg-purple/20 disabled:opacity-50 transition-all ring-1 ring-purple/10">
              <Droplets className="w-3 h-3" />
              {loading === 'sol' ? 'Sending…' : '+2 SOL'}
            </button>
          </div>

          <div className="h-px bg-drift-border/40 mx-3" />

          {/* USDC */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/30 to-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/15">
                <span className="text-[10px] font-bold text-blue-400">$</span>
              </div>
              <div className="leading-tight">
                <span className="text-[12px] font-semibold text-txt-0 tabular-nums block">
                  {usdcBalance != null ? usdcBalance.toLocaleString() : '—'}
                </span>
                <span className="text-[9px] text-txt-3 font-medium">USDC</span>
              </div>
            </div>
            <button onClick={handleMintUsdc} disabled={loading === 'usdc' || claimsUsed >= 2}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-all ring-1 ring-accent/10">
              <Plus className="w-3 h-3" />
              {loading === 'usdc' ? 'Minting…' : claimsUsed >= 2 ? 'Max Reached' : `+1K (${2 - claimsUsed} left)`}
            </button>
          </div>
        </div>

        {/* ── Trading Account ── */}
        <div className="rounded-xl border border-drift-border/50 bg-drift-surface/15 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-drift-border/40">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-txt-3" />
              <span className="text-[11px] font-semibold text-txt-1">Trading Account</span>
            </div>
            <span className={`text-[10px] font-bold flex items-center gap-1 ${isUserInitialized ? 'text-bull' : 'text-bear'}`}>
              {isUserInitialized ? <><span className="w-1.5 h-1.5 rounded-full bg-bull inline-block" /> Active</> : <><Circle className="w-3 h-3" /> None</>}
            </span>
          </div>

          {isUserInitialized ? (
            <div className="px-3 py-3 space-y-3">
              {/* ── Stats grid ── */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Equity" value={`$${(accountState?.totalCollateral ?? 0).toFixed(2)}`} />
                <StatCard label="Available" value={`$${(accountState?.freeCollateral ?? 0).toFixed(2)}`} color="text-accent" />
                <StatCard label="Leverage" value={`${(accountState?.leverage ?? 0).toFixed(2)}×`} />
                <StatCard
                  label="Unrealized P&L"
                  value={`${(accountState?.unrealizedPnl ?? 0) >= 0 ? '+' : ''}$${(accountState?.unrealizedPnl ?? 0).toFixed(2)}`}
                  color={(accountState?.unrealizedPnl ?? 0) >= 0 ? 'text-bull' : 'text-bear'}
                />
              </div>

              {/* ── Health bar ── */}
              <div className="rounded-lg bg-drift-surface/40 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-txt-3" />
                    <span className="text-[10px] text-txt-3 font-medium">Account Health</span>
                  </div>
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: healthColor }}>
                    {health.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-drift-bg overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${health}%`,
                      background: `linear-gradient(90deg, ${healthColor}, ${healthColor}dd)`,
                      boxShadow: `0 0 8px ${healthColor}40`,
                    }}
                  />
                </div>
              </div>

              {/* ── Deposit / Withdraw ── */}
              <div className="space-y-2">
                <label className="text-[11px] text-txt-3 font-medium">Amount</label>
                <div className="flex items-center rounded-xl bg-drift-surface/60 border border-drift-border/60 hover:border-drift-border-lt focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/10 transition-all px-3 h-10">
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0" className="flex-1 text-xs bg-transparent text-txt-0 tabular-nums outline-none w-full" />
                  <span className="text-[10px] text-txt-3 ml-1.5 font-medium">USDC</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleDeposit} disabled={!!loading}
                    className="py-2.5 rounded-xl text-[11px] font-bold bg-bull/10 text-bull hover:bg-bull/15 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5 ring-1 ring-bull/15 active:scale-[0.98]">
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    {loading === 'deposit' ? 'Depositing…' : 'Deposit'}
                  </button>
                  <button onClick={handleWithdraw} disabled={!!loading}
                    className="py-2.5 rounded-xl text-[11px] font-bold bg-bear/10 text-bear hover:bg-bear/15 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5 ring-1 ring-bear/15 active:scale-[0.98]">
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                    {loading === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Account creation ── */
            <div className="px-3 py-3 space-y-3">
              <div className="space-y-2">
                <StepRow num={1} label="SOL for transaction fees" done={(solBalance ?? 0) > 0.01} />
                <StepRow num={2} label="USDC in wallet" done={(usdcBalance ?? 0) > 0} />
                <StepRow num={3} label="Create trading account" done={false} />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-txt-3 font-medium block">Initial Deposit</label>
                <div className="flex items-center rounded-xl bg-drift-surface/60 border border-drift-border/60 hover:border-drift-border-lt focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/10 transition-all px-3 h-10">
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="1000" className="flex-1 text-xs bg-transparent text-txt-0 tabular-nums outline-none w-full" />
                  <span className="text-[10px] text-txt-3 ml-1.5 font-medium">USDC</span>
                </div>

                <button onClick={handleCreateAndDeposit}
                  disabled={!!loading || (solBalance != null && solBalance < 0.01) || (usdcBalance != null && usdcBalance <= 0)}
                  className="w-full py-3 rounded-xl text-[12px] font-bold bg-gradient-to-r from-accent to-purple text-white transition-all hover:scale-[1.01] hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-accent/25 active:scale-[0.98]">
                  {loading === 'create' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating Account…
                    </span>
                  ) : (
                    'Create Account & Deposit'
                  )}
                </button>

                {solBalance != null && solBalance < 0.01 && (
                  <p className="text-[10px] text-bear text-center flex items-center justify-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> Get SOL first using the button above
                  </p>
                )}
                {usdcBalance != null && usdcBalance <= 0 && (solBalance ?? 0) >= 0.01 && (
                  <p className="text-[10px] text-bear text-center flex items-center justify-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> Get USDC first using the faucet above
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Sub-components ── */

const StatCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="rounded-lg bg-drift-surface/40 px-2.5 py-2 space-y-0.5">
    <span className="text-[9px] text-txt-3 font-medium block">{label}</span>
    <span className={`text-[13px] font-bold tabular-nums block ${color ?? 'text-txt-0'}`}>{value}</span>
  </div>
);

const StepRow: React.FC<{ num: number; label: string; done: boolean }> = ({ num, label, done }) => (
  <div className="flex items-center gap-2.5">
    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
      done ? 'bg-bull/15 text-bull ring-1 ring-bull/20' : 'bg-drift-surface text-txt-3'
    }`}>
      {done ? <CheckCircle className="w-3 h-3" /> : num}
    </div>
    <span className={`text-[11px] ${done ? 'text-txt-1 font-medium' : 'text-txt-3'}`}>{label}</span>
  </div>
);

const Row: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="flex justify-between text-[11px]">
    <span className="text-txt-3">{label}</span>
    <span className={`tabular-nums font-medium ${valueClass || 'text-txt-0'}`}>{value}</span>
  </div>
);

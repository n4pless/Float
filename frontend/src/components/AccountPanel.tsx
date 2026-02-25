import React, { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet, Shield, Coins, ArrowDownToLine, ArrowUpFromLine, Plus, CheckCircle, Circle, AlertCircle } from 'lucide-react';
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

  const pubkeyStr = client
    ? (client as any).wallet?.publicKey?.toString()
    : null;

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
        body: JSON.stringify({ publicKey: pubkeyStr, amount: 10000 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMsg({ type: 'ok', text: `Received ${data.amount.toLocaleString()} USDC!` });
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
    setLoading('withdraw');
    setMsg(null);
    try {
      await trading.withdraw(amt);
      setMsg({ type: 'ok', text: `${amt} USDC withdrawn!` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Withdraw failed' });
    } finally {
      setLoading(null);
    }
  };

  /* ── Not connected ── */
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
          <Wallet className="w-6 h-6 text-accent" />
        </div>
        <p className="text-[12px] text-txt-3 text-center mb-5 max-w-[200px]">
          Connect your wallet to manage your trading account
        </p>
        <WalletMultiButton className="!justify-center" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 py-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-txt-0">Account</h3>
            <p className="text-[10px] text-txt-3 font-mono">
              {pubkeyStr
                ? `${pubkeyStr.slice(0, 4)}…${pubkeyStr.slice(-4)}`
                : '—'}{' '}
              · Devnet
            </p>
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div className={`px-3 py-2.5 rounded-lg text-[11px] flex items-center gap-2 ${
            msg.type === 'ok'
              ? 'bg-bull/10 text-bull border border-bull/20'
              : 'bg-bear/10 text-bear border border-bear/20'
          }`}>
            {msg.type === 'ok' ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* ── Wallet Balances ── */}
        <Section icon={Coins} title="Wallet Balances">
          {/* SOL row */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-purple/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-purple">S</span>
              </div>
              <div>
                <span className="text-[12px] font-semibold text-txt-0 tabular-nums">
                  {solBalance != null ? solBalance.toFixed(4) : '—'}
                </span>
                <span className="text-[10px] text-txt-3 ml-1">SOL</span>
              </div>
            </div>
            <button
              onClick={handleAirdropSol}
              disabled={loading === 'sol'}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-all"
            >
              <Plus className="w-3 h-3" />
              {loading === 'sol' ? 'Sending…' : '2 SOL'}
            </button>
          </div>
          <div className="h-px bg-drift-border mx-3" />
          {/* USDC row */}
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-blue-400">$</span>
              </div>
              <div>
                <span className="text-[12px] font-semibold text-txt-0 tabular-nums">
                  {usdcBalance != null ? usdcBalance.toLocaleString() : '—'}
                </span>
                <span className="text-[10px] text-txt-3 ml-1">USDC</span>
              </div>
            </div>
            <button
              onClick={handleMintUsdc}
              disabled={loading === 'usdc'}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-all"
            >
              <Plus className="w-3 h-3" />
              {loading === 'usdc' ? 'Minting…' : '10K USDC'}
            </button>
          </div>
        </Section>

        {/* ── Drift Account ── */}
        <Section icon={Shield} title="Trading Account">
          <div className="px-3 py-3 space-y-3">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-txt-3">Status</span>
              <span className={`text-[11px] font-bold flex items-center gap-1 ${
                isUserInitialized ? 'text-bull' : 'text-bear'
              }`}>
                {isUserInitialized ? (
                  <><CheckCircle className="w-3 h-3" /> Active</>
                ) : (
                  <><Circle className="w-3 h-3" /> Not Created</>
                )}
              </span>
            </div>

            {isUserInitialized ? (
              <>
                {/* Account stats */}
                <div className="space-y-2 rounded-lg bg-drift-surface/30 p-3 border border-drift-border">
                  <Row
                    label="Collateral"
                    value={`$${(accountState?.totalCollateral ?? 0).toFixed(2)}`}
                  />
                  <Row
                    label="Free Collateral"
                    value={`$${(accountState?.freeCollateral ?? 0).toFixed(2)}`}
                  />
                  <Row
                    label="Leverage"
                    value={`${(accountState?.leverage ?? 0).toFixed(2)}x`}
                  />
                  <Row
                    label="Unrealized P&L"
                    value={`$${(accountState?.unrealizedPnl ?? 0).toFixed(2)}`}
                    valueClass={
                      (accountState?.unrealizedPnl ?? 0) >= 0
                        ? 'text-bull'
                        : 'text-bear'
                    }
                  />
                  {/* Health bar */}
                  <div className="pt-1">
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-txt-3">Health</span>
                      <span className="text-bull font-bold tabular-nums">
                        {(accountState?.health ?? 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-drift-bg overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${accountState?.health ?? 100}%`,
                          background:
                            'linear-gradient(90deg, #F84960 0%, #FBBF24 50%, #31D0AA 100%)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Deposit / Withdraw */}
                <div className="space-y-2.5 pt-1">
                  <label className="text-[11px] text-txt-3 font-medium">
                    Deposit / Withdraw USDC
                  </label>
                  <div className="flex items-center rounded-lg px-3 h-10 bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-accent/30 transition-all">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 text-xs bg-transparent text-txt-0 w-full"
                    />
                    <span className="text-[10px] text-txt-3 ml-1 font-medium">USDC</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeposit}
                      disabled={!!loading}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold bg-bull/10 text-bull hover:bg-bull/20 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5 border border-bull/20"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      {loading === 'deposit' ? 'Depositing…' : 'Deposit'}
                    </button>
                    <button
                      onClick={handleWithdraw}
                      disabled={!!loading}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold bg-bear/10 text-bear hover:bg-bear/20 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5 border border-bear/20"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      {loading === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* ── Account creation ── */
              <div className="space-y-3">
                <div className="space-y-2 mb-2">
                  <StepRow
                    num={1}
                    label="SOL for transaction fees"
                    done={(solBalance ?? 0) > 0.01}
                  />
                  <StepRow
                    num={2}
                    label="USDC in wallet"
                    done={(usdcBalance ?? 0) > 0}
                  />
                  <StepRow num={3} label="Create trading account" done={false} />
                </div>

                <label className="text-[11px] text-txt-3 font-medium block">
                  Initial Deposit (USDC)
                </label>
                <div className="flex items-center rounded-lg px-3 h-10 bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-accent/30 transition-all">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="1000"
                    className="flex-1 text-xs bg-transparent text-txt-0"
                  />
                  <span className="text-[10px] text-txt-3 ml-1 font-medium">USDC</span>
                </div>

                <button
                  onClick={handleCreateAndDeposit}
                  disabled={
                    !!loading ||
                    (solBalance != null && solBalance < 0.01) ||
                    (usdcBalance != null && usdcBalance <= 0)
                  }
                  className="w-full py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-accent to-purple text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
                >
                  {loading === 'create'
                    ? 'Creating Account…'
                    : 'Create Account & Deposit'}
                </button>

                {solBalance != null && solBalance < 0.01 && (
                  <p className="text-[10px] text-bear text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Click "+ 2 SOL" above to get SOL for fees
                  </p>
                )}
                {usdcBalance != null && usdcBalance <= 0 && (solBalance ?? 0) >= 0.01 && (
                  <p className="text-[10px] text-bear text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Click "+ 10K USDC" above to get test USDC
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
};

/* ── Sub-components ── */

const Section: React.FC<{
  icon: any;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, children }) => (
  <div className="rounded-xl border border-drift-border overflow-hidden bg-drift-surface/20">
    <div className="flex items-center gap-2 px-3 py-2.5 bg-drift-surface/40 border-b border-drift-border">
      <Icon className="w-3.5 h-3.5 text-txt-3" />
      <span className="text-[12px] font-semibold text-txt-0">{title}</span>
    </div>
    {children}
  </div>
);

const StepRow: React.FC<{
  num: number;
  label: string;
  done: boolean;
}> = ({ num, label, done }) => (
  <div className="flex items-center gap-2.5">
    <div
      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
        done ? 'bg-bull/20 text-bull' : 'bg-drift-surface text-txt-3'
      }`}
    >
      {done ? <CheckCircle className="w-3 h-3" /> : num}
    </div>
    <span className={`text-[11px] ${done ? 'text-txt-1 font-medium' : 'text-txt-3'}`}>
      {label}
    </span>
  </div>
);

const Row: React.FC<{
  label: string;
  value: string;
  valueClass?: string;
}> = ({ label, value, valueClass }) => (
  <div className="flex justify-between text-[11px]">
    <span className="text-txt-3">{label}</span>
    <span className={`tabular-nums font-medium ${valueClass || 'text-txt-0'}`}>
      {value}
    </span>
  </div>
);

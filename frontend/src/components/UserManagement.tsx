/**
 * UserManagement — Premium user management page.
 *
 * Create accounts, manage sub-accounts, deposit/withdraw, faucet.
 * Glassmorphism + gradient design language.
 */
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  User,
  Coins,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  Shield,
  Wallet,
  ArrowLeft,
  HelpCircle,
  Circle,
  ChevronRight,
  Sparkles,
  Loader2,
  Info,
  Zap,
  UserPlus,
  Settings,
  AlertTriangle,
} from 'lucide-react';
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
import { AccountPanel } from './AccountPanel';

interface Props {
  forceRefresh: () => Promise<void>;
  onBack: () => void;
  trading?: {
    createAccount: (depositAmount: number) => Promise<string>;
    deposit: (amount: number) => Promise<string>;
    withdraw: (amount: number) => Promise<string>;
  };
}

/* ═══════════════════════════════════════════════ */
/*  Wallet Not Connected                           */
/* ═══════════════════════════════════════════════ */
const WalletNotConnected: React.FC = () => (
  <div className="flex-1 flex items-center justify-center p-6 animate-fadeInUp">
    <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center space-y-6">
      <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/15 to-purple/10 border border-accent/10 flex items-center justify-center animate-float">
        <Wallet className="w-9 h-9 text-accent" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-txt-0 mb-2">Connect Your Wallet</h3>
        <p className="text-sm text-txt-3 leading-relaxed">
          Connect your Solana wallet to create an account, manage funds, and start trading.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {[
          { icon: Shield, label: 'Secure', cls: 'text-bull bg-bull/8 border-bull/15' },
          { icon: Zap, label: 'Instant', cls: 'text-accent bg-accent/8 border-accent/15' },
          { icon: Sparkles, label: 'Devnet', cls: 'text-purple bg-purple/8 border-purple/15' },
        ].map(t => (
          <div key={t.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold ${t.cls}`}>
            <t.icon className="w-3 h-3" />{t.label}
          </div>
        ))}
      </div>
      <WalletMultiButton className="!mx-auto" />
    </div>
  </div>
);

/* ═══════════════════════════════════════════════ */
/*  Connected Wallet Info                          */
/* ═══════════════════════════════════════════════ */
const ConnectedWalletInfo: React.FC<{ publicKey: string }> = ({ publicKey }) => (
  <GlassSection icon={Coins} title="Connected Authority" accent="text-bull" glow="from-bull/20 to-bull/5" delay={50}>
    <div className="px-5 py-4">
      <div className="rounded-xl bg-drift-bg/60 p-4 border border-drift-border/30">
        <p className="text-[10px] text-txt-3 mb-1.5 font-medium uppercase tracking-wider">Wallet Address</p>
        <p className="font-mono text-[12px] text-txt-0 break-all leading-relaxed">{publicKey}</p>
      </div>
    </div>
  </GlassSection>
);

/* ═══════════════════════════════════════════════ */
/*  Create User Form                               */
/* ═══════════════════════════════════════════════ */
const CreateUserForm: React.FC<{
  onSubmit: (params: { name: string; depositAmount: number }) => Promise<void>;
}> = ({ onSubmit }) => {
  const [name, setName] = useState('Main Account');
  const [amount, setAmount] = useState('1000');
  const [isLoading, setIsLoading] = useState(false);
  const solBalance = useDriftStore((s) => s.solBalance);
  const usdcBalance = useDriftStore((s) => s.usdcBalance);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const depositAmount = parseFloat(amount) || 0;
    if (depositAmount <= 0) return;
    setIsLoading(true);
    try { await onSubmit({ name: name.trim() || 'Main Account', depositAmount }); setAmount(''); }
    catch {} finally { setIsLoading(false); }
  };

  const hasSol = (solBalance ?? 0) >= 0.01;
  const hasUsdc = (usdcBalance ?? 0) > 0;

  return (
    <GlassSection icon={UserPlus} title="Create Account & Deposit" accent="text-accent" glow="from-accent/20 to-accent/5" delay={200}>
      <form onSubmit={handleSubmit} className="px-5 py-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Account Name */}
          <div className="space-y-2">
            <label className="text-[11px] text-txt-2 font-semibold">Account Name</label>
            <div className="flex items-center gap-2 p-1 rounded-xl bg-drift-bg/80 border border-drift-border focus-within:border-accent/40 focus-within:shadow-lg focus-within:shadow-accent/5 transition-all duration-300">
              <div className="flex items-center gap-1.5 pl-3"><User className="w-3.5 h-3.5 text-txt-3" /></div>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Account"
                className="flex-1 px-2 py-2.5 bg-transparent text-xs text-txt-0 placeholder:text-txt-3/30 focus:outline-none" />
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-[11px] text-txt-2 font-semibold">
              Deposit Amount <span className="text-bear">*</span>
            </label>
            <div className="flex items-center gap-2 p-1 rounded-xl bg-drift-bg/80 border border-drift-border focus-within:border-accent/40 focus-within:shadow-lg focus-within:shadow-accent/5 transition-all duration-300">
              <div className="flex items-center gap-1.5 pl-3"><Coins className="w-3.5 h-3.5 text-txt-3" /></div>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" step="any" min="0" required
                className="flex-1 px-2 py-2.5 bg-transparent text-xs text-txt-0 placeholder:text-txt-3/30 focus:outline-none text-right font-mono" />
              <span className="text-[10px] text-txt-3 pr-3 font-bold">USDC</span>
            </div>
            <p className="text-[10px] text-txt-3">Deposited as trading collateral</p>
          </div>
        </div>

        {/* Info box */}
        <div className="rounded-xl bg-gradient-to-r from-accent/5 to-purple/5 border border-accent/10 p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-accent/10 shrink-0"><Sparkles className="w-4 h-4 text-accent" /></div>
            <div>
              <h4 className="text-[11px] font-bold text-accent mb-2">What happens next?</h4>
              <div className="text-[10px] text-txt-2 space-y-1.5 leading-relaxed">
                {[
                  `A new Value account will be created on-chain`,
                  `${amount || '0'} USDC will be deposited as collateral`,
                  `You'll be ready to trade SOL-PERP perpetuals`,
                ].map((t, i) => (
                  <p key={i} className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/10 text-accent text-[9px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                    {t}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {!hasSol && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-bear/6 border border-bear/12">
            <AlertTriangle className="w-3.5 h-3.5 text-bear shrink-0" />
            <p className="text-[10px] text-bear">SOL required for transaction fees. Use the Account panel to airdrop SOL.</p>
          </div>
        )}
        {!hasUsdc && hasSol && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-bear/6 border border-bear/12">
            <AlertTriangle className="w-3.5 h-3.5 text-bear shrink-0" />
            <p className="text-[10px] text-bear">USDC required for deposit. Use the Account panel to mint test USDC.</p>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={isLoading || !hasSol || !hasUsdc || !(parseFloat(amount) > 0)}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent to-purple text-white text-sm font-bold hover:shadow-xl hover:shadow-accent/20 hover:translate-y-[-1px] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2">
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account...</>
          ) : (
            <><Plus className="w-4 h-4" /> Create Account & Deposit {amount || '0'} USDC</>
          )}
        </button>
      </form>
    </GlassSection>
  );
};

/* ═══════════════════════════════════════════════ */
/*  User Account Card                              */
/* ═══════════════════════════════════════════════ */
const UserAccountCard: React.FC<{
  account: SubAccount;
  isActive: boolean;
  onDelete: (id: number) => void;
  onSetActive: (id: number) => void;
}> = ({ account, isActive, onDelete, onSetActive }) => {
  const canDelete = account.openPositions === 0 && account.spotBalances <= 1;

  return (
    <div className={`rounded-xl p-4 border transition-all duration-300 hover:translate-y-[-1px] ${
      isActive
        ? 'border-accent/30 bg-gradient-to-r from-accent/5 to-accent/2 shadow-lg shadow-accent/5'
        : 'border-drift-border/30 bg-drift-bg/40 hover:border-drift-border/50 hover:shadow-md'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
            isActive ? 'bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/15' : 'bg-drift-surface/40 border border-drift-border/20'
          }`}>
            <User className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-txt-3'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-txt-0 truncate">{account.name} (#{account.subAccountId})</span>
              {isActive && (
                <span className="shrink-0 px-2 py-0.5 text-[9px] font-bold bg-gradient-to-r from-accent to-accent/80 text-white rounded-md">Active</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-txt-3 flex items-center gap-1">
                <Coins className="w-3 h-3" />${account.totalCollateral.toFixed(2)}
              </span>
              <span className="text-[10px] text-txt-3 flex items-center gap-1">
                <Settings className="w-3 h-3" />{account.openPositions} position{account.openPositions !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isActive && (
            <button onClick={() => onSetActive(account.subAccountId)}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg border border-accent/20 text-accent bg-accent/5 hover:bg-accent/10 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all">
              <CheckCircle className="w-3 h-3" /> Activate
            </button>
          )}
          <button onClick={() => canDelete && onDelete(account.subAccountId)} disabled={!canDelete}
            title={canDelete ? 'Delete this account' : `Cannot delete: ${account.openPositions} position(s) open`}
            className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg transition-all ${
              canDelete ? 'border border-bear/20 text-bear bg-bear/5 hover:bg-bear/10 hover:border-bear/30' : 'border border-drift-border/20 text-txt-3 opacity-30 cursor-not-allowed'
            }`}>
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════ */
/*  Existing Accounts                              */
/* ═══════════════════════════════════════════════ */
const ExistingAccounts: React.FC<{
  accounts: SubAccount[];
  activeSubAccountId: number;
  onDelete: (id: number) => void;
  onSetActive: (id: number) => void;
}> = ({ accounts, activeSubAccountId, onDelete, onSetActive }) => {
  if (accounts.length === 0) return null;
  return (
    <GlassSection icon={User} title={`Accounts (${accounts.length})`} accent="text-yellow" glow="from-yellow/20 to-yellow/5" delay={300}>
      <div className="px-5 py-4 space-y-3">
        {accounts.map((account) => (
          <UserAccountCard key={account.subAccountId} account={account} isActive={activeSubAccountId === account.subAccountId} onDelete={onDelete} onSetActive={onSetActive} />
        ))}
      </div>
    </GlassSection>
  );
};

/* ═══════════════════════════════════════════════ */
/*  Help Section                                   */
/* ═══════════════════════════════════════════════ */
const HelpSection: React.FC = () => (
  <GlassSection icon={HelpCircle} title="Quick Help" delay={400}>
    <div className="px-5 py-4 space-y-3">
      {[
        { icon: Coins, text: 'Ensure you have sufficient USDC balance in your wallet', color: 'text-accent' },
        { icon: Zap, text: 'SOL is required for transaction gas fees', color: 'text-bull' },
        { icon: Shield, text: 'Deposited funds serve as collateral for trading', color: 'text-purple' },
        { icon: Wallet, text: 'Deposit more or withdraw from the Account panel', color: 'text-accent' },
        { icon: AlertTriangle, text: 'Deleting an account is permanent and closes all positions', color: 'text-bear' },
      ].map((item, i) => (
        <div key={i} className="flex items-start gap-3 group">
          <div className={`shrink-0 p-1.5 rounded-lg bg-drift-surface/30 ${item.color} group-hover:scale-110 transition-transform`}>
            <item.icon className="w-3 h-3" />
          </div>
          <p className="text-[11px] text-txt-3 leading-relaxed pt-0.5">{item.text}</p>
        </div>
      ))}
    </div>
  </GlassSection>
);

/* ═══════════════════════════════════════════════ */
/*  Delete Confirmation Dialog                     */
/* ═══════════════════════════════════════════════ */
const DeleteConfirmation: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: number | null;
  isDeleting: boolean;
  onConfirm: () => void;
}> = ({ open, onOpenChange, subAccountId, isDeleting, onConfirm }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-bear/10"><Trash2 className="w-4 h-4 text-bear" /></div>
          <DialogTitle className="text-bear">Delete User Account</DialogTitle>
        </div>
      </DialogHeader>
      <DialogDescription>
        Are you sure you want to delete <strong>sub-account #{subAccountId}</strong>? Please ensure:{' '}
        <br /><br />
        <span className="flex items-center gap-1.5 mb-1"><Circle className="w-2 h-2 text-txt-3" /> All open positions are closed</span>
        <span className="flex items-center gap-1.5"><Circle className="w-2 h-2 text-txt-3" /> All collateral is withdrawn to your wallet</span>
      </DialogDescription>
      <DialogFooter>
        <button onClick={() => onOpenChange(false)} disabled={isDeleting}
          className="px-4 py-2.5 rounded-xl text-[11px] font-bold border border-drift-border text-txt-1 hover:bg-drift-surface transition-all disabled:opacity-50">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={isDeleting}
          className="px-4 py-2.5 rounded-xl text-[11px] font-bold bg-gradient-to-r from-bear to-bear/80 text-white hover:shadow-lg hover:shadow-bear/20 transition-all disabled:opacity-50 flex items-center gap-1.5">
          {isDeleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...</> : 'Delete Account'}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/* ═══════════════════════════════════════════════ */
/*  Glass Section wrapper                          */
/* ═══════════════════════════════════════════════ */
const GlassSection: React.FC<{
  icon: any;
  title: string;
  accent?: string;
  glow?: string;
  delay?: number;
  children: React.ReactNode;
}> = ({ icon: Icon, title, accent, glow, delay = 0, children }) => (
  <div className="glass-card rounded-xl overflow-hidden animate-fadeInUp" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-drift-border/30">
      <div className={`p-1.5 rounded-lg bg-gradient-to-br ${glow || 'from-drift-surface/40 to-drift-surface/20'} ${accent || 'text-txt-3'}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-sm font-bold text-txt-0">{title}</span>
    </div>
    {children}
  </div>
);

/* ═══════════════════════════════════════════════ */
/*  Main UserManagement component                  */
/* ═══════════════════════════════════════════════ */
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

  if (!connected) {
    return (
      <div className="h-screen flex flex-col bg-drift-bg">
        <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 py-3 bg-drift-bg/80 backdrop-blur-xl border-b border-drift-border">
          <button onClick={onBack} className="p-1.5 rounded-lg text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20"><User className="w-4 h-4 text-accent" /></div>
            <h1 className="text-sm sm:text-base font-bold text-txt-0">User Management</h1>
          </div>
        </div>
        <WalletNotConnected />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-drift-bg">
      {/* ─── Sticky Header ─── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 py-3 bg-drift-bg/80 backdrop-blur-xl border-b border-drift-border">
        <button onClick={onBack} className="p-1.5 rounded-lg text-txt-2 hover:text-txt-0 hover:bg-drift-surface transition-all"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20"><User className="w-4 h-4 text-accent" /></div>
          </div>
          <h1 className="text-sm sm:text-base font-bold text-txt-0">User Management</h1>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple/8 border border-purple/15">
          <Shield className="w-3 h-3 text-purple" />
          <span className="text-[10px] text-purple font-bold uppercase tracking-wide">Devnet</span>
        </div>
      </div>

      {/* ─── Scrollable Content ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* Hero */}
          <div className="relative rounded-2xl overflow-hidden animate-fadeInUp">
            <div className="absolute inset-0 mesh-gradient opacity-60" />
            <div className="absolute inset-0 noise-overlay" />
            <div className="absolute top-0 right-0 w-56 h-56 rounded-full bg-accent/5 blur-[60px] -translate-y-1/3 translate-x-1/4 animate-pulseGlow" />
            <div className="relative z-10 p-6 sm:p-8">
              <div className="flex items-start gap-5">
                <div className="relative shrink-0 animate-float">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-accent/15 to-purple/10 border border-accent/10 shadow-2xl shadow-accent/5">
                    <User className="w-8 h-8 text-accent" />
                  </div>
                </div>
                <div className="space-y-3 pt-1">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-txt-0 tracking-tight">User Management</h2>
                    <p className="text-sm text-txt-2 mt-2 leading-relaxed max-w-lg">
                      Create your Value account, manage sub-accounts, and deposit USDC to start trading perpetuals.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {subAccounts.length > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold text-bull bg-bull/8 border-bull/15">
                        <CheckCircle className="w-3 h-3" />{subAccounts.length} Account{subAccounts.length > 1 ? 's' : ''}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold text-accent bg-accent/8 border-accent/15">
                      <Sparkles className="w-3 h-3" />SOL-PERP
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status message */}
          {status.type && (
            <div className={`flex items-center gap-2.5 p-4 rounded-xl text-sm animate-scaleIn ${
              status.type === 'success' ? 'bg-bull/8 border border-bull/15 text-bull' : 'bg-bear/8 border border-bear/15 text-bear'
            }`}>
              {status.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <p className="flex-1 text-[12px]">{status.message}</p>
            </div>
          )}

          {/* Connected Wallet */}
          <ConnectedWalletInfo publicKey={publicKey?.toBase58() || ''} />

          {/* Account Panel — Faucet, Deposit/Withdraw */}
          {trading && (
            <GlassSection icon={Wallet} title="Account & Balances" accent="text-accent" glow="from-accent/20 to-accent/5" delay={100}>
              <div className="max-h-[500px] overflow-y-auto">
                <AccountPanel trading={trading} />
              </div>
            </GlassSection>
          )}

          {/* Create Account Form */}
          <CreateUserForm onSubmit={handleCreateAndDeposit} />

          {/* Existing Accounts */}
          <ExistingAccounts accounts={subAccounts} activeSubAccountId={activeSubAccountId} onDelete={openDeleteDialog} onSetActive={handleSetActiveSubAccount} />

          {/* Help */}
          <HelpSection />
        </div>
      </div>

      {/* Delete Dialog */}
      <DeleteConfirmation
        open={showDeleteDialog} onOpenChange={setShowDeleteDialog}
        subAccountId={selectedSubAccountForDeletion} isDeleting={isDeleting}
        onConfirm={() => selectedSubAccountForDeletion !== null && handleDeleteUser(selectedSubAccountForDeletion)}
      />
    </div>
  );
};

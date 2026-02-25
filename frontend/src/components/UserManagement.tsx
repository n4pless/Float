/**
 * UserManagement — Full user management page.
 *
 * Adapted from drift-ui-template's /user page:
 *  - Connected wallet info
 *  - Create account & deposit form
 *  - Existing sub-account cards (with active / delete actions)
 *  - Delete confirmation dialog
 *  - Help section
 *
 * Styled to match the trading UI's dark theme with lucide-react icons.
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
  ChevronLeft,
  HelpCircle,
  Circle,
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

interface Props {
  forceRefresh: () => Promise<void>;
  onBack: () => void;
}

/* ─────────────────────────────────────────────────── */
/*  Wallet Not Connected                               */
/* ─────────────────────────────────────────────────── */

const WalletNotConnected: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-20 px-4">
    <div className="rounded-xl border border-drift-border bg-drift-surface/20 p-8 max-w-md w-full text-center">
      <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
        <AlertCircle className="w-7 h-7 text-accent" />
      </div>
      <h3 className="text-base font-bold text-txt-0 mb-2">Wallet Not Connected</h3>
      <p className="text-[12px] text-txt-3 mb-6 leading-relaxed">
        Please connect your Solana wallet to create an account and deposit funds.
      </p>
      <WalletMultiButton className="!mx-auto" />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────── */
/*  Connected Wallet Info                              */
/* ─────────────────────────────────────────────────── */

const ConnectedWalletInfo: React.FC<{ publicKey: string }> = ({ publicKey }) => (
  <Section icon={Coins} title="Connected Authority" accent="text-bull">
    <div className="px-4 py-4">
      <div className="rounded-lg bg-drift-bg p-3.5 border border-drift-border">
        <p className="text-[10px] text-txt-3 mb-1 font-medium">Wallet Address</p>
        <p className="font-mono text-[12px] text-txt-0 break-all">{publicKey}</p>
      </div>
    </div>
  </Section>
);

/* ─────────────────────────────────────────────────── */
/*  Create User Form                                   */
/* ─────────────────────────────────────────────────── */

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
    try {
      await onSubmit({ name: name.trim() || 'Main Account', depositAmount });
      setAmount('');
    } catch {
      // Error handled in hook
    } finally {
      setIsLoading(false);
    }
  };

  const hasSol = (solBalance ?? 0) >= 0.01;
  const hasUsdc = (usdcBalance ?? 0) > 0;

  return (
    <Section icon={Plus} title="Create Account & Deposit" accent="text-accent">
      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Account Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-txt-3 font-medium">Account Name</label>
            <div className="flex items-center rounded-lg px-3 h-10 bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-accent/30 transition-all">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main Account"
                className="flex-1 text-xs bg-transparent text-txt-0"
              />
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-txt-3 font-medium">
              Deposit Amount <span className="text-bear">*</span>
            </label>
            <div className="flex items-center rounded-lg px-3 h-10 bg-drift-surface border border-drift-border hover:border-drift-border-lt focus-within:border-accent/30 transition-all">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="any"
                min="0"
                required
                className="flex-1 text-xs bg-transparent text-txt-0"
              />
              <span className="text-[10px] text-txt-3 ml-1 font-medium">USDC</span>
            </div>
            <p className="text-[10px] text-txt-3">Deposit USDC as trading collateral</p>
          </div>
        </div>

        {/* Info box */}
        <div className="rounded-lg bg-accent/5 border border-accent/15 p-3.5">
          <div className="flex items-start gap-2.5">
            <Plus className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div>
              <h4 className="text-[11px] font-bold text-accent mb-1.5">What happens next?</h4>
              <div className="text-[10px] text-txt-2 space-y-1 leading-relaxed">
                <p>• A new Drift account will be created for you</p>
                <p>• {amount || '0'} USDC will be deposited as collateral</p>
                <p>• You'll be able to trade SOL-PERP perpetuals</p>
              </div>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {!hasSol && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bear/10 border border-bear/20">
            <AlertCircle className="w-3.5 h-3.5 text-bear shrink-0" />
            <p className="text-[10px] text-bear">SOL required for transaction fees. Use the Account panel to airdrop SOL.</p>
          </div>
        )}
        {!hasUsdc && hasSol && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bear/10 border border-bear/20">
            <AlertCircle className="w-3.5 h-3.5 text-bear shrink-0" />
            <p className="text-[10px] text-bear">USDC required for deposit. Use the Account panel to mint test USDC.</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !hasSol || !hasUsdc || !(parseFloat(amount) > 0)}
          className="w-full py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-accent to-purple text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating Account...
            </span>
          ) : (
            `Create Account & Deposit ${amount || '0'} USDC`
          )}
        </button>
      </form>
    </Section>
  );
};

/* ─────────────────────────────────────────────────── */
/*  User Account Card                                  */
/* ─────────────────────────────────────────────────── */

const UserAccountCard: React.FC<{
  account: SubAccount;
  isActive: boolean;
  onDelete: (id: number) => void;
  onSetActive: (id: number) => void;
}> = ({ account, isActive, onDelete, onSetActive }) => {
  const canDelete = account.openPositions === 0 && account.spotBalances <= 1; // 1 for USDC that could be 0

  return (
    <div
      className={`rounded-lg p-4 border transition-all ${
        isActive
          ? 'border-accent/40 bg-accent/5'
          : 'border-drift-border bg-drift-bg hover:border-drift-border-lt'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-drift-surface flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-txt-2" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-txt-0">
                  {account.name} (#{account.subAccountId})
                </span>
                {isActive && (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-accent text-white rounded-md">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[10px] text-txt-3 mt-0.5">
                Collateral: ${account.totalCollateral.toFixed(2)} · {account.openPositions} position{account.openPositions !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isActive && (
            <button
              onClick={() => onSetActive(account.subAccountId)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-all"
            >
              <CheckCircle className="w-3 h-3" />
              Set Active
            </button>
          )}
          <button
            onClick={() => canDelete && onDelete(account.subAccountId)}
            disabled={!canDelete}
            title={
              canDelete
                ? 'Delete this account'
                : `Cannot delete: ${account.openPositions} position(s) open`
            }
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
              canDelete
                ? 'border border-bear/30 text-bear hover:bg-bear/10'
                : 'border border-drift-border text-txt-3 opacity-40 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────── */
/*  Existing Accounts                                  */
/* ─────────────────────────────────────────────────── */

const ExistingAccounts: React.FC<{
  accounts: SubAccount[];
  activeSubAccountId: number;
  onDelete: (id: number) => void;
  onSetActive: (id: number) => void;
}> = ({ accounts, activeSubAccountId, onDelete, onSetActive }) => {
  if (accounts.length === 0) return null;

  return (
    <Section icon={User} title="Existing User Accounts" accent="text-yellow-400">
      <div className="px-4 py-3 space-y-2.5">
        {accounts.map((account) => (
          <UserAccountCard
            key={account.subAccountId}
            account={account}
            isActive={activeSubAccountId === account.subAccountId}
            onDelete={onDelete}
            onSetActive={onSetActive}
          />
        ))}
      </div>
    </Section>
  );
};

/* ─────────────────────────────────────────────────── */
/*  Help Section                                       */
/* ─────────────────────────────────────────────────── */

const HelpSection: React.FC = () => (
  <Section icon={HelpCircle} title="Need Help?">
    <div className="px-4 py-3 space-y-2 text-[11px] text-txt-3 leading-relaxed">
      <p>• Make sure you have sufficient USDC balance in your wallet</p>
      <p>• The transaction will require SOL for gas fees</p>
      <p>• Your deposited funds will be used as collateral for trading</p>
      <p>• You can deposit more funds or withdraw from the Account panel</p>
      <p className="text-bear">• ⚠ Deleting a user account is permanent and will close all positions</p>
    </div>
  </Section>
);

/* ─────────────────────────────────────────────────── */
/*  Delete Confirmation Dialog                         */
/* ─────────────────────────────────────────────────── */

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
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-bear" />
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
        <button
          onClick={() => onOpenChange(false)}
          disabled={isDeleting}
          className="px-4 py-2 rounded-lg text-[11px] font-bold border border-drift-border text-txt-1 hover:bg-drift-surface transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="px-4 py-2 rounded-lg text-[11px] font-bold bg-bear text-white hover:bg-bear/90 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {isDeleting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Deleting...
            </>
          ) : (
            'Delete Account'
          )}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/* ─────────────────────────────────────────────────── */
/*  Section wrapper                                    */
/* ─────────────────────────────────────────────────── */

const Section: React.FC<{
  icon: any;
  title: string;
  accent?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, accent, children }) => (
  <div className="rounded-xl border border-drift-border overflow-hidden bg-drift-surface/10">
    <div className="flex items-center gap-2 px-4 py-3 bg-drift-surface/30 border-b border-drift-border">
      <Icon className={`w-4 h-4 ${accent || 'text-txt-3'}`} />
      <span className="text-[13px] font-semibold text-txt-0">{title}</span>
    </div>
    {children}
  </div>
);

/* ─────────────────────────────────────────────────── */
/*  Main UserManagement component                      */
/* ─────────────────────────────────────────────────── */

export const UserManagement: React.FC<Props> = ({ forceRefresh, onBack }) => {
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
        <div className="h-12 flex items-center px-4 border-b border-drift-border bg-drift-panel/80 backdrop-blur-sm">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12px] text-txt-2 hover:text-txt-0 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Trading
          </button>
        </div>
        <WalletNotConnected />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-drift-bg">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-drift-border bg-drift-panel/80 backdrop-blur-sm shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-txt-2 hover:text-txt-0 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Trading
        </button>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          <span className="text-[12px] font-medium text-txt-2">Devnet</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {/* Page header */}
          <div className="mb-2">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <User className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-txt-0">User Management</h1>
                <p className="text-[12px] text-txt-3">
                  Create a new Drift account and make your first deposit to start trading.
                </p>
              </div>
            </div>
          </div>

          {/* Status message */}
          {status.type && (
            <div
              className={`rounded-lg p-3.5 flex items-start gap-2.5 text-[12px] ${
                status.type === 'success'
                  ? 'bg-bull/10 border border-bull/20 text-bull'
                  : 'bg-bear/10 border border-bear/20 text-bear'
              }`}
            >
              {status.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <p>{status.message}</p>
            </div>
          )}

          {/* Connected Wallet */}
          <ConnectedWalletInfo publicKey={publicKey?.toBase58() || ''} />

          {/* Create Account Form */}
          <CreateUserForm onSubmit={handleCreateAndDeposit} />

          {/* Existing Accounts */}
          <ExistingAccounts
            accounts={subAccounts}
            activeSubAccountId={activeSubAccountId}
            onDelete={openDeleteDialog}
            onSetActive={handleSetActiveSubAccount}
          />

          {/* Help */}
          <HelpSection />
        </div>
      </div>

      {/* Delete Dialog */}
      <DeleteConfirmation
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        subAccountId={selectedSubAccountForDeletion}
        isDeleting={isDeleting}
        onConfirm={() =>
          selectedSubAccountForDeletion !== null &&
          handleDeleteUser(selectedSubAccountForDeletion)
        }
      />
    </div>
  );
};

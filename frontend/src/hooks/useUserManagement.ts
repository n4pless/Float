/**
 * useUserManagement — Hook for managing Drift sub-accounts.
 *
 * Modeled after drift-ui-template's useUserManagement hook:
 *   - List existing sub-accounts
 *   - Create new accounts with initial deposit
 *   - Delete accounts (with pre-checks)
 *   - Switch active sub-account
 *   - Status messages for operations
 */
import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { useDriftStore, SubAccount } from '../stores/useDriftStore';

export interface UserManagementStatus {
  type: 'success' | 'error' | null;
  message: string;
}

export function useUserManagement(forceRefresh: () => Promise<void>) {
  const { connected, publicKey } = useWallet();

  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);
  const subAccounts = useDriftStore((s) => s.subAccounts);
  const activeSubAccountId = useDriftStore((s) => s.activeSubAccountId);
  const setSubAccounts = useDriftStore((s) => s.setSubAccounts);
  const setActiveSubAccountId = useDriftStore((s) => s.setActiveSubAccountId);
  const setUserInitialized = useDriftStore((s) => s.setUserInitialized);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedSubAccountForDeletion, setSelectedSubAccountForDeletion] = useState<number | null>(null);
  const [status, setStatus] = useState<UserManagementStatus>({ type: null, message: '' });

  /* ── Sync sub-accounts list ── */
  const syncSubAccounts = useCallback(async () => {
    if (!client) return;
    try {
      const accounts = await client.getUserSubAccounts();
      setSubAccounts(accounts);
    } catch (err) {
      console.warn('[useUserManagement] syncSubAccounts failed:', err);
    }
  }, [client, setSubAccounts]);

  // Sync on mount and when client changes
  useEffect(() => {
    if (client && isUserInitialized) {
      syncSubAccounts();
    }
  }, [client, isUserInitialized, syncSubAccounts]);

  /* ── Create Account & Deposit ── */
  const handleCreateAndDeposit = useCallback(
    async (params: { name: string; depositAmount: number }) => {
      if (!client || !connected) return;

      const toastId = toast.loading('Creating Account', {
        description: `Setting up "${params.name}" with ${params.depositAmount} USDC`,
      });

      try {
        // Find next available sub-account ID
        const nextId = subAccounts.length > 0
          ? Math.max(...subAccounts.map(a => a.subAccountId)) + 1
          : 0;

        const txSig = await client.initializeSubAccount(
          nextId,
          params.name,
          params.depositAmount,
        );

        setUserInitialized(true);
        toast.success('Account Created', {
          id: toastId,
          description: `"${params.name}" created with ${params.depositAmount} USDC`,
          action: {
            label: 'View',
            onClick: () => window.open(`https://explorer.solana.com/tx/${txSig}?cluster=devnet`, '_blank'),
          },
          duration: 5000,
        });

        setStatus({
          type: 'success',
          message: `Successfully created "${params.name}" and deposited ${params.depositAmount} USDC`,
        });

        await syncSubAccounts();
        await forceRefresh();
      } catch (err: any) {
        toast.error('Account Creation Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        setStatus({
          type: 'error',
          message: err.message || 'Account creation failed',
        });
      }
    },
    [client, connected, subAccounts, setUserInitialized, syncSubAccounts, forceRefresh],
  );

  /* ── Delete Account ── */
  const handleDeleteUser = useCallback(
    async (subAccountId: number) => {
      if (!client || !connected) return;

      setIsDeleting(true);
      setStatus({ type: null, message: '' });

      const toastId = toast.loading(`Deleting Sub-Account #${subAccountId}`);

      try {
        const txSig = await client.deleteSubAccount(subAccountId);

        toast.success('Account Deleted', {
          id: toastId,
          description: `Sub-account #${subAccountId} removed`,
          action: {
            label: 'View',
            onClick: () => window.open(`https://explorer.solana.com/tx/${txSig}?cluster=devnet`, '_blank'),
          },
          duration: 5000,
        });

        setStatus({
          type: 'success',
          message: `Successfully deleted sub-account #${subAccountId}`,
        });

        setShowDeleteDialog(false);
        setSelectedSubAccountForDeletion(null);

        await syncSubAccounts();
        await forceRefresh();
      } catch (err: any) {
        toast.error('Delete Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        setStatus({
          type: 'error',
          message: `Failed to delete sub-account #${subAccountId}: ${err.message}`,
        });
      } finally {
        setIsDeleting(false);
      }
    },
    [client, connected, syncSubAccounts, forceRefresh],
  );

  /* ── Open Delete Dialog ── */
  const openDeleteDialog = useCallback((subAccountId: number) => {
    setSelectedSubAccountForDeletion(subAccountId);
    setShowDeleteDialog(true);
  }, []);

  /* ── Switch Active Sub-Account ── */
  const handleSetActiveSubAccount = useCallback(
    async (subAccountId: number) => {
      if (!client) return;

      try {
        await client.switchActiveSubAccount(subAccountId);
        setActiveSubAccountId(subAccountId);
        setStatus({
          type: 'success',
          message: `Switched to sub-account #${subAccountId}`,
        });
        await forceRefresh();
      } catch (err: any) {
        toast.error('Switch Failed', {
          description: err.message?.slice(0, 120) || 'Unknown error',
        });
      }
    },
    [client, setActiveSubAccountId, forceRefresh],
  );

  return {
    // State
    connected,
    publicKey,
    isUserInitialized,
    subAccounts,
    activeSubAccountId,
    isDeleting,
    showDeleteDialog,
    selectedSubAccountForDeletion,
    status,

    // Actions
    handleCreateAndDeposit,
    handleDeleteUser,
    openDeleteDialog,
    handleSetActiveSubAccount,
    setShowDeleteDialog,
    setStatus,
    syncSubAccounts,
  };
}

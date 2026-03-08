/**
 * useTrading — Hook for executing trades with sonner toast notifications.
 *
 * Modeled after drift-ui-template's usePerpTrading hook + toastUtils.ts:
 *  - Uses sonner toast library (same as template)
 *  - Supports market and limit orders
 *  - Shows toasts for order lifecycle (submitting → confirmed / failed)
 *  - Triggers store refresh after execution
 */
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useDriftStore } from '../stores/useDriftStore';

const EXPLORER_URL = 'https://explorer.solana.com/tx';

type OrderSide = 'long' | 'short';
type OrderType = 'market' | 'limit';

interface TradeParams {
  marketIndex: number;
  side: OrderSide;
  sizeBase: number;
  leverage: number;
  orderType: OrderType;
  limitPrice?: number;
  reduceOnly?: boolean;
  slippageBps?: number;
}

function txLink(txSig: string) {
  return `${EXPLORER_URL}/${txSig}?cluster=devnet`;
}

export function useTrading(forceRefresh: () => Promise<void>) {
  const loadingRef = useRef(false);

  const executeTrade = useCallback(
    async (params: TradeParams): Promise<string> => {
      const { client } = useDriftStore.getState();

      if (!client) throw new Error('Client not connected');
      if (loadingRef.current) throw new Error('Trade already in progress');

      loadingRef.current = true;
      const sideLabel = params.side === 'long' ? 'Long' : 'Short';
      const typeLabel = params.orderType === 'market' ? 'Market' : 'Limit';

      const toastId = toast.loading(`Placing ${sideLabel} ${typeLabel} Order`, {
        description: `${params.sizeBase.toFixed(4)} SOL @ ${
          params.orderType === 'limit' && params.limitPrice
            ? `$${params.limitPrice.toFixed(2)}`
            : 'Market'
        }`,
      });

      try {
        const txSig = await client.openPosition(
          params.marketIndex,
          params.side,
          params.sizeBase,
          params.leverage,
          params.orderType,
          params.limitPrice,
          params.slippageBps,
        );

        toast.success(`${sideLabel} ${typeLabel} Order Placed`, {
          id: toastId,
          description: `Tx: ${txSig.slice(0, 8)}…${txSig.slice(-4)}`,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 5000,
        });

        await forceRefresh();
        setTimeout(() => forceRefresh(), 2000);
        return txSig;
      } catch (err: any) {
        toast.error(`${sideLabel} Order Failed`, {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      } finally {
        loadingRef.current = false;
      }
    },
    [forceRefresh],
  );

  const closePosition = useCallback(
    async (marketIndex: number): Promise<string> => {
      const { client } = useDriftStore.getState();
      if (!client) throw new Error('Client not connected');

      const toastId = toast.loading('Closing Position');

      try {
        const txSig = await client.closePosition(marketIndex);

        toast.success('Position Closed', {
          id: toastId,
          description: `Tx: ${txSig.slice(0, 8)}…${txSig.slice(-4)}`,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 5000,
        });

        await forceRefresh();
        setTimeout(() => forceRefresh(), 2000);
        return txSig;
      } catch (err: any) {
        toast.error('Close Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      }
    },
    [forceRefresh],
  );

  const cancelOrder = useCallback(
    async (orderId: number): Promise<string> => {
      const { client } = useDriftStore.getState();
      if (!client) throw new Error('Client not connected');

      const toastId = toast.loading(`Cancelling Order #${orderId}`);

      try {
        const txSig = await client.cancelOrder(orderId);

        toast.success('Order Cancelled', {
          id: toastId,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 4000,
        });

        await forceRefresh();
        return txSig;
      } catch (err: any) {
        toast.error('Cancel Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      }
    },
    [forceRefresh],
  );

  const deposit = useCallback(
    async (amount: number, spotMarketIndex = 0): Promise<string> => {
      const { client } = useDriftStore.getState();
      if (!client) throw new Error('Client not connected');

      const symbol = spotMarketIndex === 1 ? 'SOL' : 'USDC';
      const toastId = toast.loading(`Depositing ${amount.toLocaleString()} ${symbol}`);

      try {
        const txSig = await client.depositCollateral(amount, spotMarketIndex);

        toast.success(`${amount.toLocaleString()} ${symbol} Deposited`, {
          id: toastId,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 5000,
        });

        await forceRefresh();
        return txSig;
      } catch (err: any) {
        toast.error('Deposit Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      }
    },
    [forceRefresh],
  );

  const withdraw = useCallback(
    async (amount: number, spotMarketIndex = 0): Promise<string> => {
      const { client } = useDriftStore.getState();
      if (!client) throw new Error('Client not connected');

      const symbol = spotMarketIndex === 1 ? 'SOL' : 'USDC';
      const toastId = toast.loading(`Withdrawing ${amount.toLocaleString()} ${symbol}`);

      try {
        const txSig = await client.withdrawCollateral(amount, spotMarketIndex);

        toast.success(`${amount.toLocaleString()} ${symbol} Withdrawn`, {
          id: toastId,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 5000,
        });

        await forceRefresh();
        return txSig;
      } catch (err: any) {
        toast.error('Withdraw Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      }
    },
    [forceRefresh],
  );

  const createAccount = useCallback(
    async (depositAmount: number): Promise<string> => {
      const { client, setUserInitialized } = useDriftStore.getState();
      if (!client) throw new Error('Client not connected');

      const toastId = toast.loading('Creating Account', {
        description: `Setting up account with ${depositAmount.toLocaleString()} USDC`,
      });

      try {
        const txSig = await client.initializeAndDeposit(depositAmount);

        setUserInitialized(true);
        toast.success('Account Created', {
          id: toastId,
          description: `Deposited ${depositAmount.toLocaleString()} USDC`,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 5000,
        });

        await forceRefresh();
        return txSig;
      } catch (err: any) {
        toast.error('Account Creation Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      }
    },
    [forceRefresh],
  );

  const closeLimitPosition = useCallback(
    async (marketIndex: number, sizeBase: number, limitPrice: number): Promise<string> => {
      const { client } = useDriftStore.getState();
      if (!client) throw new Error('Client not connected');

      const toastId = toast.loading('Placing Limit Close Order', {
        description: `${sizeBase.toFixed(4)} SOL @ $${limitPrice.toFixed(2)}`,
      });

      try {
        const txSig = await client.closeLimitPosition(marketIndex, sizeBase, limitPrice);

        toast.success('Limit Close Order Placed', {
          id: toastId,
          description: `Tx: ${txSig.slice(0, 8)}…${txSig.slice(-4)}`,
          action: {
            label: 'View',
            onClick: () => window.open(txLink(txSig), '_blank'),
          },
          duration: 5000,
        });

        await forceRefresh();
        setTimeout(() => forceRefresh(), 2000);
        return txSig;
      } catch (err: any) {
        toast.error('Limit Close Failed', {
          id: toastId,
          description: err.message?.slice(0, 120) || 'Unknown error',
          duration: 6000,
        });
        throw err;
      }
    },
    [forceRefresh],
  );

  return {
    executeTrade,
    closePosition,
    closeLimitPosition,
    cancelOrder,
    deposit,
    withdraw,
    createAccount,
  };
}

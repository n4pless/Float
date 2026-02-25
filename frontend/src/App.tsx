import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Toaster } from 'sonner';
import DRIFT_CONFIG from './config';
import { useDriftStore } from './stores/useDriftStore';
import { useSetupDrift } from './hooks/useSetupDrift';
import { useTrading } from './hooks/useTrading';
import { Header } from './components/Header';
import { MarketBar } from './components/MarketBar';
import { PriceChart } from './components/PriceChart';
import { OrderBook } from './components/OrderBook';
import { RecentTrades } from './components/RecentTrades';
import { TradeForm } from './components/TradeForm';
import { AccountPanel } from './components/AccountPanel';
import { BottomPanel } from './components/BottomPanel';
import { UserManagement } from './components/UserManagement';
import '@solana/wallet-adapter-react-ui/styles.css';

type Page = 'trade' | 'user';

function TradingApp() {
  const wallet = useWallet();

  // Core setup: connects SDK, syncs all data into Zustand stores
  const { forceRefresh } = useSetupDrift(wallet);

  // Trading actions with toast notifications
  const trading = useTrading(forceRefresh);

  // Store subscriptions (minimal selectors for re-renders)
  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);

  const [currentPage, setCurrentPage] = useState<Page>('trade');
  const [limitPrice, setLimitPrice] = useState<number | undefined>(undefined);
  const [sideTab, setSideTab] = useState<'trade' | 'account'>('trade');

  // Auto-switch to account tab when wallet connects but account isn't ready
  useEffect(() => {
    if (client && !isUserInitialized) setSideTab('account');
  }, [client, isUserInitialized]);

  const handlePriceClick = (price: number) => setLimitPrice(price);

  const handleSwitchAccount = useCallback(
    async (subAccountId: number) => {
      try {
        await client?.switchActiveSubAccount(subAccountId);
        useDriftStore.getState().setActiveSubAccountId(subAccountId);
        forceRefresh();
      } catch (err) {
        console.error('Failed to switch sub-account', err);
      }
    },
    [client, forceRefresh],
  );

  return (
    <div className="h-screen flex flex-col bg-drift-bg">
      <Header
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onSwitchAccount={handleSwitchAccount}
      />

      {currentPage === 'user' ? (
        <UserManagement
          forceRefresh={forceRefresh}
          onBack={() => setCurrentPage('trade')}
        />
      ) : (
        <>
          <MarketBar />

          {/* Main content area */}
          <div className="flex-1 flex min-h-0 gap-px bg-drift-border">
            {/* Left: Chart + Bottom panel */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-[3] min-h-0 bg-drift-bg">
                <PriceChart />
              </div>
              <div className="flex-[2] min-h-0 bg-drift-bg border-t border-drift-border">
                <BottomPanel trading={trading} />
              </div>
            </div>

            {/* Middle: Order Book + Recent Trades */}
            <div className="w-[280px] flex flex-col shrink-0">
              <div className="flex-1 min-h-0 bg-drift-bg">
                <OrderBook onPriceClick={handlePriceClick} />
              </div>
              <div className="flex-1 min-h-0 bg-drift-bg border-t border-drift-border">
                <RecentTrades />
              </div>
            </div>

            {/* Right: Trade / Account tabs */}
            <div className="w-[320px] shrink-0 flex flex-col bg-drift-bg">
              {/* Tab bar */}
              <div className="flex shrink-0 border-b border-drift-border">
                <button
                  onClick={() => setSideTab('trade')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-all ${
                    sideTab === 'trade'
                      ? 'text-txt-0 border-b-2 border-accent bg-accent/5'
                      : 'text-txt-3 hover:text-txt-1 hover:bg-drift-surface/50'
                  }`}
                >
                  Trade
                </button>
                <button
                  onClick={() => setSideTab('account')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-all relative ${
                    sideTab === 'account'
                      ? 'text-txt-0 border-b-2 border-accent bg-accent/5'
                      : 'text-txt-3 hover:text-txt-1 hover:bg-drift-surface/50'
                  }`}
                >
                  Account
                  {!isUserInitialized && client && (
                    <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-bear animate-pulse" />
                  )}
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0">
                {sideTab === 'trade' ? (
                  <TradeForm
                    trading={trading}
                    initialLimitPrice={limitPrice}
                    onSwitchToAccount={() => setSideTab('account')}
                  />
                ) : (
                  <AccountPanel trading={trading} />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sonner toast notifications — matches drift-ui-template */}
      <Toaster position="bottom-right" theme="dark" richColors />
    </div>
  );
}

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={DRIFT_CONFIG.rpc}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <TradingApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

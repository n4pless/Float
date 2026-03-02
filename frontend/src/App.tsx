import React, { useMemo, useState, useCallback } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Toaster } from 'sonner';
import { BarChart2, BookOpen, ArrowRightLeft, Wallet as WalletIcon } from 'lucide-react';
import DRIFT_CONFIG from './config';
import { useDriftStore } from './stores/useDriftStore';
import { useSetupDrift } from './hooks/useSetupDrift';
import { useTrading } from './hooks/useTrading';
import { useReadOnlyDrift } from './hooks/useReadOnlyDrift';
import { useTradeSubscriber } from './hooks/useTradeSubscriber';
import { Header, type Page } from './components/Header';
import { MarketBar } from './components/MarketBar';
import { InfoPage } from './pages/InfoPage';
import { InsuranceFundPage } from './pages/InsuranceFundPage';
import { LivePositionsPage } from './pages/LivePositionsPage';
import { PriceChart } from './components/PriceChart';
import { OrderBook } from './components/OrderBook';
import { RecentTrades } from './components/RecentTrades';
import { TradeForm } from './components/TradeForm';
import { AccountPanel } from './components/AccountPanel';
import { BottomPanel } from './components/BottomPanel';
import { UserManagement } from './components/UserManagement';
import '@solana/wallet-adapter-react-ui/styles.css';

function TradingApp() {
  const wallet = useWallet();

  // Read-only client — provides market data without wallet
  const { pauseReadOnly, restoreReadOnly } = useReadOnlyDrift();

  // Core setup: connects SDK, syncs all data into Zustand stores
  const { forceRefresh } = useSetupDrift(wallet, { pauseReadOnly, restoreReadOnly });

  // Trading actions with toast notifications
  const trading = useTrading(forceRefresh);

  // Subscribe to on-chain fill events for Recent Trades + Trade History
  useTradeSubscriber();

  // Store subscriptions (minimal selectors for re-renders)
  const client = useDriftStore((s) => s.client);
  const isUserInitialized = useDriftStore((s) => s.isUserInitialized);

  const [currentPage, setCurrentPage] = useState<Page>('trade');
  const [limitPrice, setLimitPrice] = useState<number | undefined>(undefined);

  // Mobile view tab: which panel to show on small screens
  type MobileView = 'chart' | 'book' | 'trade' | 'account';
  const [mobileView, setMobileView] = useState<MobileView>('chart');

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
    <div className="h-screen w-screen max-w-[100vw] flex flex-col overflow-x-hidden bg-drift-bg">
      <Header
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onSwitchAccount={handleSwitchAccount}
      />

      {currentPage === 'learn' ? (
        <InfoPage onBack={() => setCurrentPage('trade')} />
      ) : currentPage === 'insurance' ? (
        <InsuranceFundPage onBack={() => setCurrentPage('trade')} />
      ) : currentPage === 'positions' ? (
        <LivePositionsPage onBack={() => setCurrentPage('trade')} />
      ) : currentPage === 'user' ? (
        <UserManagement
          forceRefresh={forceRefresh}
          onBack={() => setCurrentPage('trade')}
          trading={trading}
        />
      ) : (
        <>
          <MarketBar />

          {/* ── Mobile bottom tab bar (lg:hidden) ── */}
          <div className="flex lg:hidden items-center shrink-0 border-b border-drift-border bg-drift-panel">
            {([
              { key: 'chart' as MobileView, label: 'Chart', icon: BarChart2 },
              { key: 'book' as MobileView, label: 'Book', icon: BookOpen },
              { key: 'trade' as MobileView, label: 'Trade', icon: ArrowRightLeft },
              { key: 'account' as MobileView, label: 'Account', icon: WalletIcon },
            ]).map(t => {
              const Icon = t.icon;
              const active = mobileView === t.key;
              return (
                <button key={t.key} onClick={() => setMobileView(t.key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors relative border-b-2 -mb-px ${
                    active ? 'text-txt-0 border-txt-0' : 'text-txt-3 border-transparent'}`}>
                  <Icon className="w-4 h-4" />
                  {t.label}
                  {t.key === 'account' && !isUserInitialized && client && (
                    <span className="absolute top-1 right-1/4 w-1.5 h-1.5 rounded-full bg-bear animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Mobile content (lg:hidden) ── */}
          <div className="flex-1 flex flex-col min-h-0 lg:hidden">
            {mobileView === 'chart' && (
              <>
                <div className="flex-[3] min-h-0 bg-drift-bg">
                  <PriceChart />
                </div>
                <div className="flex-[2] min-h-0 bg-drift-bg border-t border-drift-border">
                  <BottomPanel trading={trading} />
                </div>
              </>
            )}
            {mobileView === 'book' && (
              <div className="flex-1 flex flex-col min-h-0 bg-drift-bg">
                <div className="flex-1 min-h-0">
                  <OrderBook onPriceClick={(p) => { handlePriceClick(p); setMobileView('trade'); }} />
                </div>
                <div className="flex-1 min-h-0 border-t border-drift-border">
                  <RecentTrades />
                </div>
              </div>
            )}
            {mobileView === 'trade' && (
              <div className="flex-1 min-h-0 overflow-auto bg-drift-bg">
                <TradeForm
                  trading={trading}
                  initialLimitPrice={limitPrice}
                  onSwitchToAccount={() => setMobileView('account')}
                />
              </div>
            )}
            {mobileView === 'account' && (
              <div className="flex-1 min-h-0 overflow-auto bg-drift-bg">
                <AccountPanel trading={trading} />
              </div>
            )}
          </div>

          {/* ── Desktop layout (hidden on mobile, visible lg+) ── */}
          <div className="hidden lg:flex flex-1 min-h-0 gap-px bg-drift-border">
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
            <div className="w-[260px] xl:w-[280px] shrink-0 flex flex-col min-h-0 bg-drift-bg overflow-hidden">
              <div className="flex-[3] min-h-0 overflow-hidden">
                <OrderBook onPriceClick={handlePriceClick} />
              </div>
              <div className="flex-[2] min-h-0 border-t border-drift-border overflow-hidden">
                <RecentTrades />
              </div>
            </div>

            {/* Right: Trade Form */}
            <div className="w-[280px] xl:w-[300px] shrink-0 bg-drift-bg overflow-y-auto custom-scrollbar">
              <TradeForm
                trading={trading}
                initialLimitPrice={limitPrice}
                onSwitchToAccount={() => setCurrentPage('user')}
              />
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

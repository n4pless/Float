import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Toaster } from 'sonner';
import { BarChart2, BookOpen, ArrowRightLeft, Wallet as WalletIcon, Shield, TrendingUp, List } from 'lucide-react';
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
import { TickerBar } from './components/TickerBar';
import { UserManagement } from './components/UserManagement';
import '@solana/wallet-adapter-react-ui/styles.css';

/* ─── URL ↔ Market sync helpers ─── */
const SYMBOL_TO_INDEX: Record<string, number> = {};
const INDEX_TO_SYMBOL: Record<number, string> = {};
for (const [idx, m] of Object.entries(DRIFT_CONFIG.markets)) {
  SYMBOL_TO_INDEX[m.symbol.toUpperCase()] = +idx;
  INDEX_TO_SYMBOL[+idx] = m.symbol;
}

function marketFromPath(): number | null {
  const path = window.location.pathname.replace(/^\/+/, '').toUpperCase();
  if (!path) return null;
  return SYMBOL_TO_INDEX[path] ?? null;
}

function pushMarketUrl(idx: number) {
  const sym = INDEX_TO_SYMBOL[idx];
  if (sym) window.history.pushState(null, '', `/${sym}`);
}

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

  // URL ↔ market sync: parse initial path and listen for browser back/forward
  const selectedMarket = useDriftStore((s) => s.selectedMarket);
  const setSelectedMarket = useDriftStore((s) => s.setSelectedMarket);

  useEffect(() => {
    const initial = marketFromPath();
    if (initial != null && initial !== useDriftStore.getState().selectedMarket) {
      setSelectedMarket(initial);
    } else if (initial == null) {
      // No market in URL → set URL to current market
      pushMarketUrl(useDriftStore.getState().selectedMarket);
    }
    const handlePopState = () => {
      const mi = marketFromPath();
      if (mi != null) setSelectedMarket(mi);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // When market changes (via MarketBar picker), update URL
  useEffect(() => {
    pushMarketUrl(selectedMarket);
  }, [selectedMarket]);

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

          {/* ── Mobile trade sub-tabs (lg:hidden) ── */}
          <div className="flex lg:hidden items-center shrink-0 border-b border-drift-border bg-drift-panel">
            {([
              { key: 'chart' as MobileView, label: 'Chart', icon: TrendingUp },
              { key: 'book' as MobileView, label: 'Book', icon: List },
              { key: 'trade' as MobileView, label: 'Trade', icon: ArrowRightLeft },
              { key: 'account' as MobileView, label: 'Balance', icon: WalletIcon },
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
          <div className="hidden lg:flex flex-col flex-1 min-h-0">
            {/* Top row: Chart | OrderBook | Trades | Order Entry */}
            <div className="flex flex-1 min-h-0">
              {/* Chart (flex ~52%) */}
              <div className="flex-1 min-w-0 bg-drift-bg border-r border-drift-border">
                <PriceChart />
              </div>

              {/* OrderBook (~18%) */}
              <div className="w-[220px] xl:w-[240px] shrink-0 bg-drift-bg border-r border-drift-border overflow-hidden">
                <OrderBook onPriceClick={handlePriceClick} />
              </div>

              {/* Recent Trades (~12%) */}
              <div className="w-[180px] xl:w-[200px] shrink-0 bg-drift-bg border-r border-drift-border overflow-hidden">
                <RecentTrades />
              </div>

              {/* Order Entry (fixed 280px) */}
              <div className="w-[280px] shrink-0 bg-drift-bg overflow-y-auto custom-scrollbar">
                <TradeForm
                  trading={trading}
                  initialLimitPrice={limitPrice}
                  onSwitchToAccount={() => setCurrentPage('user')}
                />
              </div>
            </div>

            {/* Bottom Panel (full width) */}
            <div className="h-[200px] xl:h-[220px] shrink-0 bg-drift-bg border-t border-drift-border">
              <BottomPanel trading={trading} />
            </div>

            {/* Ticker Bar */}
            <TickerBar />
          </div>
        </>
      )}

      {/* ── Mobile bottom page nav ── */}
      <nav className="sm:hidden shrink-0 flex items-center border-t border-drift-border bg-drift-panel">
        {([
          { page: 'trade' as Page, label: 'Trade', icon: ArrowRightLeft },
          { page: 'positions' as Page, label: 'Positions', icon: BarChart2 },
          { page: 'insurance' as Page, label: 'Insurance', icon: Shield },
          { page: 'user' as Page, label: 'Account', icon: WalletIcon },
          { page: 'learn' as Page, label: 'Learn', icon: BookOpen },
        ]).map(t => {
          const Icon = t.icon;
          const active = currentPage === t.page;
          return (
            <button
              key={t.page}
              onClick={() => setCurrentPage(t.page)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? 'text-accent' : 'text-txt-3'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

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

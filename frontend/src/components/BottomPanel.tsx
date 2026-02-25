import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Layers, ClipboardList, Wallet, Clock, History, X, Wifi } from 'lucide-react';
import { useDriftStore } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';

interface Props {
  trading: {
    closePosition: (marketIndex: number) => Promise<string>;
    cancelOrder: (orderId: number) => Promise<string>;
  };
}

type Tab = 'positions' | 'orders' | 'balances' | 'orderHistory' | 'tradeHistory';

const TAB_ICONS: Record<Tab, any> = {
  positions: Layers,
  orders: ClipboardList,
  balances: Wallet,
  orderHistory: Clock,
  tradeHistory: History,
};

export const BottomPanel: React.FC<Props> = ({ trading }) => {
  const { connected } = useWallet();
  const [tab, setTab] = useState<Tab>('positions');
  const [closingIdx, setClosingIdx] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Store subscriptions
  const positions = useDriftStore((s) => s.positions);
  const openOrders = useDriftStore((s) => s.openOrders);
  const solBalance = useDriftStore((s) => s.solBalance);
  const usdcBalance = useDriftStore((s) => s.usdcBalance);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);

  const handleClose = async (mi: number) => {
    try {
      setClosingIdx(mi);
      await trading.closePosition(mi);
    } catch (e) { console.error(e); }
    finally { setClosingIdx(null); }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      setCancellingId(orderId);
      await trading.cancelOrder(orderId);
    } catch (e) { console.error(e); }
    finally { setCancellingId(null); }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'positions', label: 'Positions', count: positions.length },
    { key: 'orders', label: 'Orders', count: openOrders.length },
    { key: 'balances', label: 'Balances' },
    { key: 'orderHistory', label: 'Order History' },
    { key: 'tradeHistory', label: 'Trade History' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center shrink-0 px-2 border-b border-drift-border">
        {tabs.map(t => {
          const Icon = TAB_ICONS[t.key];
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium relative transition-all ${
                tab === t.key ? 'text-txt-0' : 'text-txt-3 hover:text-txt-2'}`}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {(t.count ?? 0) > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${
                  tab === t.key ? 'bg-accent/15 text-accent' : 'bg-drift-surface text-txt-2'}`}>
                  {t.count}
                </span>
              )}
              {tab === t.key && <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!connected ? (
          <Empty icon={Wallet} text="Connect wallet to start trading" />
        ) : tab === 'positions' ? (
          positions.length === 0 ? <Empty icon={Layers} text="No open positions" /> : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-drift-surface/30">
                  {['Market','Side','Size','Entry Price','Mark Price','P&L','Liq. Price',''].map(h => (
                    <th key={h} className={`px-3 py-2 font-medium text-txt-3 ${h === '' ? 'text-center' : h === 'Market' || h === 'Side' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => {
                  const m = DRIFT_CONFIG.markets[pos.marketIndex as keyof typeof DRIFT_CONFIG.markets];
                  const long = pos.direction === 'LONG';
                  return (
                    <tr key={pos.marketIndex} className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-accent to-purple flex items-center justify-center">
                            <span className="text-[8px] font-bold text-white">{m?.symbol?.[0] ?? 'P'}</span>
                          </div>
                          <span className="font-semibold text-txt-0">{m?.symbol ?? `PERP-${pos.marketIndex}`}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                          long ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                          {pos.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">{pos.baseAssetAmount.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1">${pos.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1">${pos.markPrice.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={`font-semibold ${pos.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-2">
                        {pos.liquidationPrice > 0 ? `$${pos.liquidationPrice.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => handleClose(pos.marketIndex)}
                          disabled={closingIdx === pos.marketIndex}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-bear/10 text-bear hover:bg-bear/20 transition-all disabled:opacity-50 mx-auto">
                          <X className="w-3 h-3" />
                          {closingIdx === pos.marketIndex ? '…' : 'Close'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : tab === 'orders' ? (
          openOrders.length === 0 ? <Empty icon={ClipboardList} text="No open orders" /> : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-drift-surface/30">
                  {['Market','Side','Type','Size','Price','Filled',''].map(h => (
                    <th key={h} className={`px-3 py-2 font-medium text-txt-3 ${h === '' ? 'text-center' : h === 'Market' || h === 'Side' || h === 'Type' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openOrders.map(order => {
                  const m = DRIFT_CONFIG.markets[order.marketIndex as keyof typeof DRIFT_CONFIG.markets];
                  const isLong = 'long' in order.direction;
                  const basePrec = 1e9;
                  const pricePrec = 1e6;
                  const sizeBase = order.baseAssetAmount.toNumber() / basePrec;
                  const filledBase = order.baseAssetAmountFilled.toNumber() / basePrec;
                  const priceVal = order.price.toNumber() / pricePrec;
                  const orderTypeStr = 'market' in order.orderType ? 'Market'
                    : 'limit' in order.orderType ? 'Limit'
                    : 'triggerMarket' in order.orderType ? 'Stop Market'
                    : 'triggerLimit' in order.orderType ? 'Stop Limit'
                    : 'oracle' in order.orderType ? 'Oracle' : 'Unknown';
                  return (
                    <tr key={order.orderId} className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-txt-0">{m?.symbol ?? `PERP-${order.marketIndex}`}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                          isLong ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-txt-2 text-[10px] font-medium">{orderTypeStr}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">{sizeBase.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1">{priceVal > 0 ? `$${priceVal.toFixed(2)}` : 'Market'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-2">{filledBase.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => handleCancelOrder(order.orderId)}
                          disabled={cancellingId === order.orderId}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-bear/10 text-bear hover:bg-bear/20 transition-all disabled:opacity-50 mx-auto">
                          <X className="w-3 h-3" />
                          {cancellingId === order.orderId ? '…' : 'Cancel'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : tab === 'balances' ? (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-drift-surface/30">
                {['Asset','Deposits','Borrows','Net Balance','Value (USD)'].map(h => (
                  <th key={h} className={`px-3 py-2 font-medium text-txt-3 ${h === 'Asset' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <BalanceRow sym="SOL" color="#9945FF" bal={solBalance ?? 0} price={oraclePrice > 0 ? oraclePrice : 178.42} />
              <BalanceRow sym="USDC" color="#2775CA" bal={usdcBalance ?? 0} price={1} icon="$" />
            </tbody>
          </table>
        ) : (
          <Empty icon={tab === 'orderHistory' ? Clock : History} text={
            tab === 'orderHistory' ? 'No order history' :
            'No trade history'
          } />
        )}
      </div>

      {/* Status bar */}
      <div className="h-7 flex items-center justify-between px-4 shrink-0 bg-drift-panel/50 border-t border-drift-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-bull" />
            <span className="text-[10px] text-txt-2 font-medium">Connected</span>
          </div>
          <span className="text-[10px] text-txt-3">RPC: Devnet</span>
        </div>
        <span className="text-[10px] text-txt-3 font-mono">v1.0.0</span>
      </div>
    </div>
  );
};

/* ── helpers ──────────────────────────────── */

const Empty: React.FC<{ icon: any; text: string }> = ({ icon: Icon, text }) => (
  <div className="flex flex-col items-center justify-center h-full gap-2">
    <Icon className="w-5 h-5 text-txt-3/50" />
    <span className="text-[11px] text-txt-3">{text}</span>
  </div>
);

const BalanceRow: React.FC<{ sym: string; color: string; bal: number; price: number; icon?: string }> = ({ sym, color, bal, price, icon }) => (
  <tr className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
    <td className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] text-white font-bold" style={{ background: color }}>
          {icon ?? sym[0]}
        </div>
        <span className="font-semibold text-txt-0">{sym}</span>
      </div>
    </td>
    <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">{bal.toFixed(4)}</td>
    <td className="px-3 py-2.5 text-right tabular-nums text-txt-2">0.0000</td>
    <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">{bal.toFixed(4)}</td>
    <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">${(bal * price).toFixed(2)}</td>
  </tr>
);

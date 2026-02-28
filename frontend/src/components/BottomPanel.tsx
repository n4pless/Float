import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Layers, ClipboardList, Wallet, Clock, History, X, Wifi, Bot, Activity, ArrowDownToLine } from 'lucide-react';
import { SolanaLogo } from './icons/SolanaLogo';
import { useDriftStore, selectRecentTrades, selectBotPositions, selectAmmStats } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';

interface Props {
  trading: {
    closePosition: (marketIndex: number) => Promise<string>;
    cancelOrder: (orderId: number) => Promise<string>;
  };
}

type Tab = 'positions' | 'orders' | 'balances' | 'bots' | 'orderHistory' | 'tradeHistory';

const TAB_ICONS: Record<Tab, any> = {
  positions: Layers,
  orders: ClipboardList,
  balances: Wallet,
  bots: Bot,
  orderHistory: Clock,
  tradeHistory: History,
};

export const BottomPanel: React.FC<Props> = ({ trading }) => {
  const { connected } = useWallet();
  const [tab, setTab] = useState<Tab>('positions');
  const [closingIdx, setClosingIdx] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);

  // Client for settle PnL
  const client = useDriftStore((s) => s.client);

  // Store subscriptions
  const positions = useDriftStore((s) => s.positions);
  const openOrders = useDriftStore((s) => s.openOrders);
  const accountSpotBalances = useDriftStore((s) => s.accountSpotBalances);
  const accountState = useDriftStore((s) => s.accountState);
  const oraclePrice = useDriftStore((s) => s.oraclePrice);
  const recentTrades = useDriftStore(selectRecentTrades);
  const botPositions = useDriftStore(selectBotPositions);
  const ammStats = useDriftStore(selectAmmStats);

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

  const handleSettlePnl = async () => {
    if (!client || settling) return;
    try {
      setSettling(true);
      await client.settleAllPnl();
    } catch (e) { console.error('[settle]', e); }
    finally { setSettling(false); }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'positions', label: 'Positions', count: positions.length },
    { key: 'orders', label: 'Orders', count: openOrders.length },
    { key: 'balances', label: 'Balances' },
    { key: 'bots', label: 'Bot Monitor', count: botPositions.filter(b => b.direction !== 'FLAT').length },
    { key: 'orderHistory', label: 'Order History' },
    { key: 'tradeHistory', label: 'Trade History', count: recentTrades.length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center shrink-0 px-1 sm:px-2 border-b border-drift-border overflow-x-auto">
        {tabs.map(t => {
          const Icon = TAB_ICONS[t.key];
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2.5 text-[10px] sm:text-[11px] font-medium relative transition-all whitespace-nowrap ${
                tab === t.key ? 'text-txt-0' : 'text-txt-3 hover:text-txt-2'}`}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.replace('Trade History','Trades').replace('Order History','History')}</span>
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
            <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[640px]">
              <thead>
                <tr className="bg-drift-surface/30">
                  {['Market','Side','Size','Entry Price','Mark Price','Total P&L','Liq. Price',''].map(h => (
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
                          <div className="w-5 h-5 rounded-md bg-black/40 flex items-center justify-center">
                            <SolanaLogo size={14} />
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
                        {(() => {
                          const totalPnl = pos.unrealizedPnl + (pos.settledPnl ?? 0);
                          return (
                            <div>
                              <span className={`font-semibold ${totalPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                              </span>
                              {pos.settledPnl !== 0 && (
                                <div className="text-[9px] text-txt-3 mt-0.5">
                                  {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)} unsettled
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
            </div>
          )
        ) : tab === 'orders' ? (
          openOrders.length === 0 ? <Empty icon={ClipboardList} text="No open orders" /> : (
            <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[560px]">
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
            </div>
          )
        ) : tab === 'balances' ? (
          accountSpotBalances.length === 0 ? <Empty icon={Wallet} text="No account balances — deposit to see balances" /> : (
          <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[400px]">
            <thead>
              <tr className="bg-drift-surface/30">
                {['Asset','Deposits','Borrows','Net Balance','Value (USD)'].map(h => (
                  <th key={h} className={`px-3 py-2 font-medium text-txt-3 ${h === 'Asset' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accountSpotBalances.map((sb) => (
                <AccountBalanceRow
                  key={sb.marketIndex}
                  sym={sb.symbol}
                  color={sb.symbol === 'USDC' ? '#2775CA' : sb.symbol === 'SOL' ? '#9945FF' : '#888'}
                  deposits={sb.deposits}
                  borrows={sb.borrows}
                  netBalance={sb.netBalance}
                  valueUsd={sb.valueUsd}
                  icon={sb.symbol === 'USDC' ? '$' : undefined}
                />
              ))}
              {/* Unrealized PnL row */}
              {positions.length > 0 && (
                <tr className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] text-white font-bold bg-yellow/40">⚡</div>
                      <span className="font-semibold text-txt-1">Unrealized PnL</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-txt-3" colSpan={2}>
                    <span className="text-[10px] text-txt-3">{positions.length} open position{positions.length > 1 ? 's' : ''}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={handleSettlePnl}
                      disabled={settling || !client}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-accent/10 text-accent hover:bg-accent/20 transition-all disabled:opacity-50"
                    >
                      <ArrowDownToLine className="w-3 h-3" />
                      {settling ? 'Settling…' : 'Settle'}
                    </button>
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                    (accountState?.unrealizedPnl ?? 0) >= 0 ? 'text-bull' : 'text-bear'
                  }`}>
                    {(accountState?.unrealizedPnl ?? 0) >= 0 ? '+' : ''}
                    ${(accountState?.unrealizedPnl ?? 0).toFixed(2)}
                  </td>
                </tr>
              )}
              {/* Total Equity summary row */}
              <tr className="bg-drift-surface/20">
                <td className="px-3 py-2.5">
                  <span className="font-bold text-txt-0 text-[11.5px]">Total Equity</span>
                </td>
                <td colSpan={3} className="px-3 py-2.5 text-right">
                  <span className="text-[10px] text-txt-3">Free: ${(accountState?.freeCollateral ?? 0).toFixed(2)}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-txt-0 text-[11.5px]">
                  ${(accountState?.totalCollateral ?? 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
          )
        ) : tab === 'bots' ? (
          botPositions.length === 0 && !ammStats ? <Empty icon={Bot} text="No bot data — waiting for account sync" /> : (
            <div className="overflow-x-auto">
            {/* ── AMM Liquidity Stats ── */}
            {ammStats && (
              <div className="px-3 py-2.5 border-b border-drift-border/50 bg-drift-surface/10">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[11px] font-semibold text-txt-0">AMM Liquidity Pool</span>
                  <span className="text-[9px] text-txt-3 ml-1">SOL-PERP</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-4 gap-y-1.5">
                  <AmmStat label="Net Position" value={
                    ammStats.netDirection === 'FLAT' ? 'FLAT' :
                    `${ammStats.netPosition.toFixed(4)} SOL`
                  } color={ammStats.netDirection === 'LONG' ? 'text-bull' : ammStats.netDirection === 'SHORT' ? 'text-bear' : 'text-txt-3'}
                    sub={ammStats.netDirection !== 'FLAT' ? ammStats.netDirection : undefined} />
                  <AmmStat label="Liquidity (√k)" value={ammStats.sqrtK.toFixed(2)} />
                  <AmmStat label="Long Spread" value={`${ammStats.longSpread.toFixed(2)} bps`}
                    color="text-bull" />
                  <AmmStat label="Short Spread" value={`${ammStats.shortSpread.toFixed(2)} bps`}
                    color="text-bear" />
                  <AmmStat label="Total Fees" value={`$${ammStats.totalFee.toFixed(2)}`}
                    color="text-accent" />
                  <AmmStat label="Long OI" value={`${ammStats.longOI.toFixed(4)} SOL`} color="text-bull" />
                  <AmmStat label="Short OI" value={`${ammStats.shortOI.toFixed(4)} SOL`} color="text-bear" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-4 gap-y-1.5 mt-1.5">
                  <AmmStat label="Peg" value={`$${ammStats.pegMultiplier.toFixed(2)}`} />
                  <AmmStat label="Base Reserve" value={`${ammStats.baseReserve.toFixed(2)}`} />
                  <AmmStat label="Quote Reserve" value={`${ammStats.quoteReserve.toFixed(2)}`} />
                  <AmmStat label="Base Spread" value={`${ammStats.baseSpread.toFixed(2)} bps`} />
                  <AmmStat label="Max Spread" value={`${ammStats.maxSpread.toFixed(2)} bps`} />
                  <AmmStat label="Funding Rate" value={`${ammStats.lastFundingRate.toFixed(6)}`} />
                  <AmmStat label="Net Fees" value={`$${ammStats.totalFeeMinusDistributions.toFixed(2)}`}
                    color={ammStats.totalFeeMinusDistributions >= 0 ? 'text-bull' : 'text-bear'} />
                </div>
              </div>
            )}
            <table className="w-full text-[11px] min-w-[640px]">
              <thead>
                <tr className="bg-drift-surface/30">
                  {['Bot','Wallet','Side','Size (SOL)','Entry','Mark','P&L','Orders'].map(h => (
                    <th key={h} className={`px-3 py-2 font-medium text-txt-3 ${
                      h === 'Bot' || h === 'Wallet' || h === 'Side' ? 'text-left' : 'text-right'
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {botPositions.map((bot, i) => {
                  const isLong = bot.direction === 'LONG';
                  const isShort = bot.direction === 'SHORT';
                  const isFlat = bot.direction === 'FLAT';
                  const botColors: Record<string, string> = {
                    Admin: 'from-yellow-500 to-orange-500',
                    Filler: 'from-blue-500 to-cyan-500',
                    Liquidator: 'from-red-500 to-pink-500',
                    Maker: 'from-green-500 to-emerald-500',
                  };
                  return (
                    <tr key={`${bot.walletAddress}-${bot.marketIndex}-${i}`} className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${botColors[bot.botName] ?? 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                            <span className="text-[8px] font-bold text-white">{bot.botName[0]}</span>
                          </div>
                          <span className="font-semibold text-txt-0">{bot.botName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <a
                          href={`https://solscan.io/account/${bot.walletAddress}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-accent hover:underline font-mono"
                          title={bot.walletAddress}
                        >
                          {bot.walletAddress.slice(0, 4)}…{bot.walletAddress.slice(-4)}
                        </a>
                      </td>
                      <td className="px-3 py-2.5">
                        {isFlat ? (
                          <span className="px-2 py-1 rounded-md text-[10px] font-semibold bg-drift-surface text-txt-3">FLAT</span>
                        ) : (
                          <span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                            isLong ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                            {bot.direction}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">
                        {isFlat ? '—' : bot.baseAssetAmount.toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1">
                        {isFlat ? '—' : `$${bot.entryPrice.toFixed(2)}`}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1">
                        ${bot.markPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {isFlat ? (
                          <span className="text-txt-3">—</span>
                        ) : (
                          <span className={`font-semibold ${bot.unrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                            {bot.unrealizedPnl >= 0 ? '+' : ''}{bot.unrealizedPnl.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {bot.openOrders > 0 ? (
                          <span className="px-2 py-1 rounded-md text-[10px] font-semibold bg-accent/10 text-accent">
                            {bot.openOrders}
                          </span>
                        ) : (
                          <span className="text-txt-3">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )
        ) : tab === 'tradeHistory' ? (
          recentTrades.length === 0 ? <Empty icon={History} text="No trade history" /> : (
            <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[560px]">
              <thead>
                <tr className="bg-drift-surface/30">
                  {['Time','Market','Side','Price','Size (USD)','Fee','Tx'].map(h => (
                    <th key={h} className={`px-3 py-2 font-medium text-txt-3 ${h === 'Time' || h === 'Market' || h === 'Side' || h === 'Tx' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t, i) => {
                  const time = new Date(t.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const date = new Date(t.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const m = t.marketIndex != null ? DRIFT_CONFIG.markets[t.marketIndex as keyof typeof DRIFT_CONFIG.markets] : null;
                  const isBuy = t.side === 'buy';
                  const fee = (t.takerFee ?? 0) + (t.makerFee ?? 0);
                  return (
                    <tr key={`${t.fillId ?? ''}-${t.ts}-${i}`} className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
                      <td className="px-3 py-2.5 text-txt-2">
                        <div className="flex flex-col">
                          <span className="tabular-nums">{time}</span>
                          <span className="text-[9px] text-txt-3">{date}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <SolanaLogo size={13} />
                          <span className="font-semibold text-txt-0">{m?.symbol ?? 'SOL-PERP'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                          isBuy ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${isBuy ? 'text-bull' : 'text-bear'}`}>
                        ${t.price.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">
                        ${t.size.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-3">
                        {fee > 0 ? `$${fee.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {t.txSig ? (
                          <a
                            href={`https://solscan.io/tx/${t.txSig}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-accent hover:underline font-mono truncate max-w-[80px] inline-block"
                            title={t.txSig}
                          >
                            {t.txSig.slice(0, 8)}…
                          </a>
                        ) : (
                          <span className="text-txt-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )
        ) : (
          <Empty icon={Clock} text="No order history" />
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

const AmmStat: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color, sub }) => (
  <div className="flex flex-col">
    <span className="text-[9px] text-txt-3 uppercase tracking-wider">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={`text-[11px] font-semibold tabular-nums ${color ?? 'text-txt-1'}`}>{value}</span>
      {sub && <span className={`text-[8px] font-semibold ${color ?? 'text-txt-3'}`}>{sub}</span>}
    </div>
  </div>
);

const AccountBalanceRow: React.FC<{
  sym: string; color: string; deposits: number; borrows: number;
  netBalance: number; valueUsd: number; icon?: string;
}> = ({ sym, color, deposits, borrows, netBalance, valueUsd, icon }) => (
  <tr className="hover:bg-drift-surface/30 transition-colors border-b border-drift-border/50">
    <td className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] text-white font-bold" style={{ background: color }}>
          {icon ?? sym[0]}
        </div>
        <span className="font-semibold text-txt-0">{sym}</span>
      </div>
    </td>
    <td className="px-3 py-2.5 text-right tabular-nums text-bull font-medium">{deposits > 0 ? deposits.toFixed(4) : '—'}</td>
    <td className="px-3 py-2.5 text-right tabular-nums text-bear">{borrows > 0 ? borrows.toFixed(4) : '—'}</td>
    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${netBalance >= 0 ? 'text-txt-1' : 'text-bear'}`}>
      {netBalance.toFixed(4)}
    </td>
    <td className="px-3 py-2.5 text-right tabular-nums text-txt-1 font-medium">${valueUsd.toFixed(2)}</td>
  </tr>
);

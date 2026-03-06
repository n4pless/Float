import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, CandlestickData, Time, LineData, CandlestickSeries, HistogramSeries, LineSeries, CreatePriceLineOptions } from 'lightweight-charts';
import { useDriftStore, selectOraclePrice, selectSelectedMarket } from '../stores/useDriftStore';
import DRIFT_CONFIG from '../config';
import { BarChart2, RefreshCw } from 'lucide-react';

const TF = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
const TF_TO_BINANCE: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1D': '1d',
};

const TF_TO_CC: Record<string, { endpoint: string; aggregate: number }> = {
  '1m': { endpoint: 'histominute', aggregate: 1 },
  '5m': { endpoint: 'histominute', aggregate: 5 },
  '15m': { endpoint: 'histominute', aggregate: 15 },
  '1h': { endpoint: 'histohour', aggregate: 1 },
  '4h': { endpoint: 'histohour', aggregate: 4 },
  '1D': { endpoint: 'histoday', aggregate: 1 },
};

interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchFromBinance(tf: string, limit: number, binanceSymbol = 'SOLUSDT'): Promise<Candle[]> {
  const interval = TF_TO_BINANCE[tf] || '1m';
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function fetchFromCryptoCompare(tf: string, limit: number, ccSymbol = 'SOL'): Promise<Candle[]> {
  const cc = TF_TO_CC[tf] || { endpoint: 'histominute', aggregate: 1 };
  const url = `https://min-api.cryptocompare.com/data/v2/${cc.endpoint}?fsym=${ccSymbol}&tsym=USD&limit=${limit}&aggregate=${cc.aggregate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CryptoCompare API error: ${res.status}`);
  const json = await res.json();
  if (json.Response !== 'Success') throw new Error(json.Message || 'Data error');
  return json.Data.Data
    .map((k: any) => ({
      time: k.time as number,
      open: k.open as number,
      high: k.high as number,
      low: k.low as number,
      close: k.close as number,
      volume: (k.volumefrom || 0) as number,
    }))
    .filter((c: Candle) => c.open > 0 && c.high > 0);
}

/**
 * Fetch candle data — tries Binance first, falls back to CryptoCompare.
 * Symbols are configurable per market.
 */
async function fetchCandles(tf: string, limit = 300, binanceSymbol = 'SOLUSDT', ccSymbol = 'SOL'): Promise<Candle[]> {
  try {
    return await fetchFromBinance(tf, limit, binanceSymbol);
  } catch (e) {
    console.warn('[chart] Binance unavailable, falling back to CryptoCompare:', e);
  }
  return await fetchFromCryptoCompare(tf, limit, ccSymbol);
}

/**
 * PriceChart — SOL/USD chart using external reference candles for history
 * + live Float oracle price overlay from the on-chain Drift protocol.
 * Historical candles sourced from Binance/CryptoCompare as reference data.
 * The live price (green/red close) always reflects Float's oracle.
 */
export const PriceChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [tf, setTf] = useState<string>('15m');
  const [chartMode, setChartMode] = useState<'candle' | 'line'>('candle');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentPrice = useDriftStore(selectOraclePrice);
  const selectedMarket = useDriftStore(selectSelectedMarket);
  const positions = useDriftStore((s) => s.positions);
  const candlesRef = useRef<Candle[]>([]);

  // Resolve market config for chart symbol routing
  const marketCfg = DRIFT_CONFIG.markets[selectedMarket] ?? DRIFT_CONFIG.markets[0];
  const binanceSymbol = marketCfg.binanceSymbol ?? 'SOLUSDT';
  const ccSymbol = marketCfg.ccSymbol ?? 'SOL';

  // Fetch candles when timeframe or market changes
  const loadCandles = useCallback(async (timeframe: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCandles(timeframe, 300, binanceSymbol, ccSymbol);
      setCandles(data);
      candlesRef.current = data;
    } catch (err: any) {
      setError(err.message || 'Failed to load chart data');
      console.warn('[chart] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [binanceSymbol, ccSymbol]);

  useEffect(() => {
    loadCandles(tf);
    // Refresh candles periodically (every 30s for live updates)
    const iv = setInterval(() => loadCandles(tf), 30_000);
    return () => clearInterval(iv);
  }, [tf, loadCandles]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#75798a',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(150,159,175,0.2)', width: 1, style: 3, labelBackgroundColor: '#1c1c24' },
        horzLine: { color: 'rgba(150,159,175,0.2)', width: 1, style: 3, labelBackgroundColor: '#1c1c24' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.10)',
        scaleMargins: { top: 0.1, bottom: 0.15 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.10)',
        timeVisible: true,
        secondsVisible: tf === '1m',
        rightOffset: 5,
        barSpacing: 8,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update timeScale secondsVisible when tf changes
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ secondsVisible: tf === '1m' });
  }, [tf]);

  // Update series data when candles/mode changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    // Remove old series
    if (candleSeriesRef.current) { chart.removeSeries(candleSeriesRef.current); candleSeriesRef.current = null; }
    if (lineSeriesRef.current) { chart.removeSeries(lineSeriesRef.current); lineSeriesRef.current = null; }
    if (volumeSeriesRef.current) { chart.removeSeries(volumeSeriesRef.current); volumeSeriesRef.current = null; }

    if (chartMode === 'candle') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#24b47e',
        downColor: '#f84960',
        borderUpColor: '#24b47e',
        borderDownColor: '#f84960',
        wickUpColor: '#24b47e',
        wickDownColor: '#f84960',
      });

      const candleData: CandlestickData[] = candles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candleData);
      candleSeriesRef.current = candleSeries;

      // Volume histogram
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      const volData = candles.map(c => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(36,180,126,0.15)' : 'rgba(248,73,96,0.15)',
      }));
      volumeSeries.setData(volData);
      volumeSeriesRef.current = volumeSeries;
    } else {
      // Line mode
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#969faf',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: '#f4f4f6',
        priceLineColor: '#969faf',
      });
      const lineData: LineData[] = candles.map(c => ({
        time: c.time as Time,
        value: c.close,
      }));
      lineSeries.setData(lineData);
      lineSeriesRef.current = lineSeries;
    }

    chart.timeScale().fitContent();
  }, [candles, chartMode]);

  // Live update: update the last candle with current oracle price
  useEffect(() => {
    if (currentPrice <= 0 || candles.length === 0) return;
    const last = candles[candles.length - 1];

    if (chartMode === 'candle' && candleSeriesRef.current) {
      candleSeriesRef.current.update({
        time: last.time as Time,
        open: last.open,
        high: Math.max(last.high, currentPrice),
        low: Math.min(last.low, currentPrice),
        close: currentPrice,
      });
    } else if (chartMode === 'line' && lineSeriesRef.current) {
      lineSeriesRef.current.update({
        time: last.time as Time,
        value: currentPrice,
      });
    }
  }, [currentPrice]);

  // Show entry and liquidation price lines for the active position
  const entryLineRef = useRef<any>(null);
  const liqLineRef = useRef<any>(null);

  useEffect(() => {
    const series = candleSeriesRef.current || lineSeriesRef.current;
    if (!series) return;

    // Remove old lines
    try { if (entryLineRef.current) series.removePriceLine(entryLineRef.current); } catch { /* ok */ }
    try { if (liqLineRef.current) series.removePriceLine(liqLineRef.current); } catch { /* ok */ }
    entryLineRef.current = null;
    liqLineRef.current = null;

    // Find position for selectedMarket
    const pos = positions.find(p => p.marketIndex === selectedMarket);
    if (!pos || pos.baseAssetAmount === 0) return;

    // Entry price line
    if (pos.entryPrice > 0) {
      entryLineRef.current = series.createPriceLine({
        price: pos.entryPrice,
        color: '#5c8ae6',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `Entry $${pos.entryPrice.toFixed(2)}`,
      } as CreatePriceLineOptions);
    }

    // Liquidation price line
    if (pos.liquidationPrice > 0) {
      liqLineRef.current = series.createPriceLine({
        price: pos.liquidationPrice,
        color: '#f84960',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `Liq $${pos.liquidationPrice.toFixed(2)}`,
      } as CreatePriceLineOptions);
    }
  }, [positions, chartMode, candles]);

  // OHLC display for last candle
  const last = candles.length > 0 ? candles[candles.length - 1] : null;
  const change = last ? ((last.close - last.open) / last.open * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-drift-bg border border-drift-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0 border-b border-drift-border">
        <div className="flex items-center gap-2">
          {/* Timeframe buttons */}
          <div className="flex items-center gap-0.5">
            {TF.map(t => (
              <button key={t} onClick={() => setTf(t)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors
                  ${tf === t ? 'bg-drift-active text-txt-0' : 'text-txt-3 hover:text-txt-1'}`}
              >{t}</button>
            ))}
          </div>

          <div className="w-px h-3.5 bg-drift-border" />

          {/* Chart mode toggle */}
          <div className="flex items-center gap-0.5">
            <button onClick={() => setChartMode('candle')}
              className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors
                ${chartMode === 'candle' ? 'bg-drift-active text-txt-0' : 'text-txt-3 hover:text-txt-1'}`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setChartMode('line')}
              className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors
                ${chartMode === 'line' ? 'bg-drift-active text-txt-0' : 'text-txt-3 hover:text-txt-1'}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 12L6 6L10 9L14 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="w-px h-3.5 bg-drift-border" />

          <span className="text-[11px] text-txt-2">
            {marketCfg.symbol} <span className="text-txt-3 ml-1">Oracle</span>
          </span>

          {loading && <RefreshCw className="w-3 h-3 text-txt-3 animate-spin" />}
        </div>

        {/* OHLC display */}
        {last && (
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-txt-3">O <span className="text-txt-1 tabular-nums font-mono">{last.open.toFixed(2)}</span></span>
            <span className="text-txt-3">H <span className="text-bull tabular-nums font-mono">{last.high.toFixed(2)}</span></span>
            <span className="text-txt-3">L <span className="text-bear tabular-nums font-mono">{last.low.toFixed(2)}</span></span>
            <span className="text-txt-3">C <span className={`tabular-nums font-mono ${last.close >= last.open ? 'text-bull' : 'text-bear'}`}>{(currentPrice > 0 ? currentPrice : last.close).toFixed(2)}</span></span>
            <span className={`tabular-nums font-mono ${change >= 0 ? 'text-bull' : 'text-bear'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Chart container — always mounted so chart can initialize immediately */}
      <div className="flex-1 relative">
        <div ref={chartContainerRef} className="absolute inset-0" />
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-drift-bg/90">
            <div className="text-center">
              <BarChart2 className="w-8 h-8 text-txt-3 mx-auto mb-2" />
              <span className="text-xs text-bear">{error}</span>
              <button onClick={() => loadCandles(tf)} className="block mx-auto mt-2 text-xs text-txt-1 hover:text-txt-0 transition-colors duration-150">
                Retry
              </button>
            </div>
          </div>
        )}
        {!error && loading && candles.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-drift-bg/90">
            <div className="text-center">
              <RefreshCw className="w-6 h-6 text-txt-3 mx-auto mb-2 animate-spin" />
              <span className="text-xs text-txt-2">Loading {marketCfg.symbol} chart…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

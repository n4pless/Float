/**
 * LandingPage — Product selector with two cards: Predictions & Perps Trading.
 */
import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Timer, ArrowRight, Zap, Shield,
  BarChart2, Target, LineChart, Activity,
  ArrowUpRight, ArrowDownRight, Globe,
} from 'lucide-react';

interface Props {
  onSelectPerps: () => void;
  onSelectPrediction: () => void;
}

export const LandingPage: React.FC<Props> = ({ onSelectPerps, onSelectPrediction }) => {
  const [hovered, setHovered] = useState<'perps' | 'prediction' | null>(null);
  const [solPrice, setSolPrice] = useState(0);

  // Live SOL price for the ticker
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/solusdt@trade');
      ws.onmessage = e => {
        try { setSolPrice(parseFloat(JSON.parse(e.data).p)); } catch {}
      };
    } catch {}
    return () => { ws?.close(); };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto relative" style={{ background: '#0C0D18' }}>

      {/* Subtle grid background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
        {/* Radial glow behind logo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-20"
          style={{ background: 'radial-gradient(ellipse at center, rgba(46,236,194,0.15) 0%, rgba(155,125,255,0.08) 40%, transparent 70%)' }}
        />
      </div>

      {/* ═══ Hero ═══ */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-12 sm:pt-20 pb-6 px-4">
        {/* Logo */}
        <div className="relative mb-5">
          <img src="/float-logo-v2.svg" alt="Float" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(46,236,194,0.12), 0 4px 16px rgba(0,0,0,0.4)' }} />
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#2EECC2] border-2 border-[#0C0D18] animate-pulse" />
        </div>

        <h1 className="text-[32px] sm:text-[42px] font-extrabold tracking-tight text-center leading-tight">
          <span className="text-white">Float</span>
          <span className="bg-gradient-to-r from-[#2EECC2] to-[#9b7dff] bg-clip-text text-transparent"> Exchange</span>
        </h1>
        <p className="text-[14px] sm:text-[16px] mt-3 text-center max-w-lg leading-relaxed" style={{ color: '#6B6B80' }}>
          Trade perpetual futures or predict price movements — fully on-chain on Solana devnet.
        </p>

        {/* Live price ticker */}
        {solPrice > 0 && (
          <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="w-2 h-2 rounded-full bg-[#2EECC2] animate-pulse" />
            <span className="text-[12px] font-mono font-semibold text-white/70">SOL/USD</span>
            <span className="text-[13px] font-mono font-bold text-white">${solPrice.toFixed(2)}</span>
            <Activity className="w-3 h-3 text-[#2EECC2]/60" />
          </div>
        )}
      </div>

      {/* ═══ Cards ═══ */}
      <div className="relative z-10 flex flex-col lg:flex-row items-stretch justify-center gap-5 sm:gap-6 px-5 sm:px-8 pb-12 max-w-5xl mx-auto w-full">

        {/* ── Perps Trading Card ── */}
        <button
          onClick={onSelectPerps}
          onMouseEnter={() => setHovered('perps')}
          onMouseLeave={() => setHovered(null)}
          className={`group w-full lg:flex-1 lg:max-w-[480px] rounded-2xl border transition-all duration-300 text-left overflow-hidden ${
            hovered === 'perps'
              ? 'border-accent/50 scale-[1.015]'
              : 'border-white/[0.06] hover:border-accent/30'
          }`}
          style={{
            background: hovered === 'perps'
              ? 'linear-gradient(145deg, rgba(76,139,245,0.06) 0%, rgba(19,17,28,0.95) 50%)'
              : 'rgba(19,17,28,0.8)',
            boxShadow: hovered === 'perps'
              ? '0 16px 60px rgba(76,139,245,0.12), 0 4px 20px rgba(0,0,0,0.3)'
              : '0 4px 20px rgba(0,0,0,0.2)',
          }}
        >
          {/* Accent bar */}
          <div className="h-1 bg-gradient-to-r from-accent via-accent/80 to-purple" />

          <div className="p-6 sm:p-8">
            {/* Header row */}
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/15 transition-colors group-hover:shadow-[0_0_24px_rgba(76,139,245,0.12)]">
                <LineChart className="w-7 h-7 text-accent" />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase" style={{ background: 'rgba(76,139,245,0.08)', color: '#4C8BF5' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                Devnet
              </div>
            </div>

            <h2 className="text-[22px] sm:text-[24px] font-extrabold text-white mb-2 tracking-tight">Perpetuals Exchange</h2>
            <p className="text-[13px] sm:text-[14px] leading-relaxed mb-6" style={{ color: '#6B6B80' }}>
              Trade SOL, BTC, ETH perpetual futures with up to 20x leverage on Solana devnet.
            </p>

            {/* Stats row */}
            <div className="flex items-center gap-4 sm:gap-6 mb-6 p-3 sm:p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#4A4A5E' }}>Leverage</div>
                <div className="text-[16px] sm:text-[18px] font-extrabold text-white font-mono">20x</div>
              </div>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#4A4A5E' }}>Markets</div>
                <div className="text-[16px] sm:text-[18px] font-extrabold text-white font-mono">3+</div>
              </div>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#4A4A5E' }}>Settlement</div>
                <div className="text-[16px] sm:text-[18px] font-extrabold text-accent font-mono">Instant</div>
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { icon: Zap, label: 'Low Fees' },
                { icon: BarChart2, label: 'Up to 20x' },
                { icon: Shield, label: 'Non-Custodial' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <f.icon className="w-3 h-3 text-accent/60" />
                  <span className="text-[11px] font-semibold" style={{ color: '#6B6B80' }}>{f.label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[14px] transition-all duration-300 ${
              hovered === 'perps' ? 'bg-accent text-white shadow-[0_4px_20px_rgba(76,139,245,0.3)]' : 'bg-accent/10 text-accent'
            }`}>
              <span>Launch Trading</span>
              <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${hovered === 'perps' ? 'translate-x-0.5' : ''}`} />
            </div>
          </div>
        </button>

        {/* ── Predictions Card ── */}
        <button
          onClick={onSelectPrediction}
          onMouseEnter={() => setHovered('prediction')}
          onMouseLeave={() => setHovered(null)}
          className={`group w-full lg:flex-1 lg:max-w-[480px] rounded-2xl border transition-all duration-300 text-left overflow-hidden ${
            hovered === 'prediction'
              ? 'border-[#2EECC2]/50 scale-[1.015]'
              : 'border-white/[0.06] hover:border-[#2EECC2]/30'
          }`}
          style={{
            background: hovered === 'prediction'
              ? 'linear-gradient(145deg, rgba(46,236,194,0.06) 0%, rgba(19,17,28,0.95) 50%)'
              : 'rgba(19,17,28,0.8)',
            boxShadow: hovered === 'prediction'
              ? '0 16px 60px rgba(46,236,194,0.10), 0 4px 20px rgba(0,0,0,0.3)'
              : '0 4px 20px rgba(0,0,0,0.2)',
          }}
        >
          {/* Accent bar */}
          <div className="h-1 bg-gradient-to-r from-[#2EECC2] via-[#2EECC2]/80 to-[#FF5F94]" />

          <div className="p-6 sm:p-8">
            {/* Header row */}
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#2EECC2]/10 flex items-center justify-center group-hover:bg-[#2EECC2]/15 transition-colors group-hover:shadow-[0_0_24px_rgba(46,236,194,0.12)]">
                <Target className="w-7 h-7 text-[#2EECC2]" />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase" style={{ background: 'rgba(46,236,194,0.08)', color: '#2EECC2' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#2EECC2]" />
                Devnet
              </div>
            </div>

            <h2 className="text-[22px] sm:text-[24px] font-extrabold text-white mb-2 tracking-tight">Price Predictions</h2>
            <p className="text-[13px] sm:text-[14px] leading-relaxed mb-6" style={{ color: '#6B6B80' }}>
              Predict if SOL goes UP or DOWN each round. Bet from the pool, winner takes all.
            </p>

            {/* UP / DOWN visual */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 flex items-center gap-3 p-3 sm:p-4 rounded-xl" style={{ background: 'rgba(46,236,194,0.05)', border: '1px solid rgba(46,236,194,0.1)' }}>
                <div className="w-10 h-10 rounded-xl bg-[#2EECC2]/10 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-5 h-5 text-[#2EECC2]" />
                </div>
                <div>
                  <div className="text-[14px] sm:text-[16px] font-extrabold text-[#2EECC2]">UP</div>
                  <div className="text-[10px] font-medium" style={{ color: '#4A4A5E' }}>Bull wins</div>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-3 p-3 sm:p-4 rounded-xl" style={{ background: 'rgba(255,95,148,0.05)', border: '1px solid rgba(255,95,148,0.1)' }}>
                <div className="w-10 h-10 rounded-xl bg-[#FF5F94]/10 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="w-5 h-5 text-[#FF5F94]" />
                </div>
                <div>
                  <div className="text-[14px] sm:text-[16px] font-extrabold text-[#FF5F94]">DOWN</div>
                  <div className="text-[10px] font-medium" style={{ color: '#4A4A5E' }}>Bear wins</div>
                </div>
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { icon: Timer, label: '5min Rounds' },
                { icon: TrendingUp, label: 'SOL/USD' },
                { icon: Globe, label: 'Pyth Oracle' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <f.icon className="w-3 h-3 text-[#2EECC2]/60" />
                  <span className="text-[11px] font-semibold" style={{ color: '#6B6B80' }}>{f.label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[14px] transition-all duration-300 ${
              hovered === 'prediction' ? 'text-[#0C0D18] shadow-[0_4px_20px_rgba(46,236,194,0.3)]' : 'bg-[#2EECC2]/10 text-[#2EECC2]'
            }`}
              style={hovered === 'prediction' ? { background: 'linear-gradient(135deg, #2EECC2, #1DE8A8)' } : undefined}
            >
              <span>Start Predicting</span>
              <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${hovered === 'prediction' ? 'translate-x-0.5' : ''}`} />
            </div>
          </div>
        </button>
      </div>

      {/* ═══ Footer ═══ */}
      <div className="relative z-10 text-center pb-8 mt-auto">
        {/* Discord CTA */}
        <a
          href="https://discord.gg/ydwDdnBq5S"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 mb-5 rounded-xl text-[13px] font-semibold transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_4px_20px_rgba(88,101,242,0.25)]"
          style={{ background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.2)', color: '#8B9BFF' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
          </svg>
          Join our Discord
        </a>

        <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: '#4A4A5E' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2EECC2] animate-pulse" />
            <span className="font-medium">Solana Devnet</span>
          </div>
          <span className="w-px h-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <span>Fully On-chain</span>
          <span className="w-px h-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <span>Pyth Oracle</span>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;

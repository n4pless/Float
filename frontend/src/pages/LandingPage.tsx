/**
 * LandingPage — Product selector with two cards: Predictions & Perps Trading.
 */
import React, { useState } from 'react';
import {
  TrendingUp, Timer, ArrowRight, Zap, Shield,
  BarChart2, Target, Flame, LineChart,
} from 'lucide-react';

interface Props {
  onSelectPerps: () => void;
  onSelectPrediction: () => void;
}

export const LandingPage: React.FC<Props> = ({ onSelectPerps, onSelectPrediction }) => {
  const [hovered, setHovered] = useState<'perps' | 'prediction' | null>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-drift-bg overflow-auto">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-16 sm:pt-24 pb-8 px-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-purple flex items-center justify-center shadow-lg shadow-accent/15 mb-6">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4L12 22L22 4" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-[28px] sm:text-[36px] font-extrabold text-txt-0 tracking-tight text-center">
          Value Exchange
        </h1>
        <p className="text-[14px] sm:text-[16px] text-txt-2 mt-2 text-center max-w-md">
          Choose your platform — trade perpetual futures or predict price movements.
        </p>
      </div>

      {/* Cards */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-6 px-5 pb-20 max-w-3xl mx-auto w-full">

        {/* ── Perps Trading Card ── */}
        <button
          onClick={onSelectPerps}
          onMouseEnter={() => setHovered('perps')}
          onMouseLeave={() => setHovered(null)}
          className={`group w-full sm:w-[320px] rounded-2xl border transition-all duration-200 text-left overflow-hidden ${
            hovered === 'perps'
              ? 'border-accent/60 shadow-[0_0_32px_rgba(76,139,245,0.12)] scale-[1.02]'
              : 'border-drift-border/60 hover:border-accent/40'
          } bg-drift-panel`}
        >
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-r from-accent via-accent/70 to-purple" />

          <div className="p-6">
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/15 transition-colors">
              <LineChart className="w-6 h-6 text-accent" />
            </div>

            <h2 className="text-[20px] font-bold text-txt-0 mb-1.5">Perps Trading</h2>
            <p className="text-[13px] text-txt-2 leading-relaxed mb-5">
              Trade perpetual futures with up to 20x leverage on SOL, BTC, ETH and more.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {[
                { icon: Zap, label: 'Low Fees' },
                { icon: BarChart2, label: 'Up to 20x' },
                { icon: Shield, label: 'On-chain' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-drift-surface/80 border border-drift-border/40">
                  <f.icon className="w-3 h-3 text-accent/70" />
                  <span className="text-[10px] font-semibold text-txt-1">{f.label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-2 text-accent font-semibold text-[13px] group-hover:gap-3 transition-all">
              <span>Launch Trading</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </button>

        {/* ── Predictions Card ── */}
        <button
          onClick={onSelectPrediction}
          onMouseEnter={() => setHovered('prediction')}
          onMouseLeave={() => setHovered(null)}
          className={`group w-full sm:w-[320px] rounded-2xl border transition-all duration-200 text-left overflow-hidden ${
            hovered === 'prediction'
              ? 'border-bull/50 shadow-[0_0_32px_rgba(0,210,106,0.10)] scale-[1.02]'
              : 'border-drift-border/60 hover:border-bull/30'
          } bg-drift-panel`}
        >
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-r from-bull via-bull/70 to-yellow" />

          <div className="p-6">
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-bull/10 flex items-center justify-center mb-4 group-hover:bg-bull/15 transition-colors">
              <Target className="w-6 h-6 text-bull" />
            </div>

            <h2 className="text-[20px] font-bold text-txt-0 mb-1.5">Predictions</h2>
            <p className="text-[13px] text-txt-2 leading-relaxed mb-5">
              Predict SOL price — bet UP or DOWN each round and win from the pool. PancakeSwap-style.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {[
                { icon: Flame, label: '5min Rounds' },
                { icon: TrendingUp, label: 'SOL/USD' },
                { icon: Timer, label: 'On-chain' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-drift-surface/80 border border-drift-border/40">
                  <f.icon className="w-3 h-3 text-bull/70" />
                  <span className="text-[10px] font-semibold text-txt-1">{f.label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-2 text-bull font-semibold text-[13px] group-hover:gap-3 transition-all">
              <span>Start Predicting</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </button>
      </div>

      {/* Footer text */}
      <div className="text-center pb-8">
        <div className="flex items-center justify-center gap-2 text-[11px] text-txt-3">
          <div className="w-1.5 h-1.5 rounded-full bg-bull" />
          <span>Solana Devnet</span>
          <span className="w-px h-3 bg-drift-border" />
          <span>Fully On-chain</span>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;

import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Shield,
  Zap,
  Lock,
  Coins,
  Layers,
  Cpu,
  TrendingUp,
  Eye,
  Target,
  ChevronRight,
} from 'lucide-react';
import { DocsPage } from './DocsPage';
import { FeaturesPage } from './FeaturesPage';

type InfoView = 'hub' | 'docs' | 'features';

/* ═══════════════════════════════════════════════════
   QUICK-ACCESS CARDS DATA
   ═══════════════════════════════════════════════════ */

const DOCS_HIGHLIGHTS = [
  { icon: Layers, label: 'Architecture' },
  { icon: TrendingUp, label: 'Trading' },
  { icon: Eye, label: 'Oracles' },
  { icon: Shield, label: 'Liquidation' },
  { icon: Cpu, label: 'Keeper Bots' },
  { icon: Zap, label: 'Filler Bot' },
];

const FEATURES_HIGHLIGHTS = [
  { icon: TrendingUp, label: 'Graduation Perps' },
  { icon: Cpu, label: 'Open Market Making' },
  { icon: Lock, label: 'Arcium Privacy' },
  { icon: Coins, label: 'Revenue Sharing' },
];

/* ═══════════════════════════════════════════════════
   INFO PAGE — KNOWLEDGE HUB
   ═══════════════════════════════════════════════════ */

export const InfoPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [view, setView] = useState<InfoView>('hub');

  /* ── Sub-pages ── */
  if (view === 'docs') {
    return <DocsPage onBack={() => setView('hub')} backLabel="Knowledge Hub" />;
  }
  if (view === 'features') {
    return <FeaturesPage onBack={() => setView('hub')} backLabel="Knowledge Hub" />;
  }

  /* ── Hub landing ── */
  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden bg-drift-bg relative">
      {/* ═══ Mesh Gradient Background ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-25%] left-[-10%] w-[55%] h-[55%] rounded-full bg-accent/[0.035] blur-[120px] animate-[pulseGlow_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple/[0.04] blur-[100px] animate-[pulseGlow_10s_ease-in-out_infinite_2s]" />
        <div className="absolute top-[30%] right-[15%] w-[25%] h-[25%] rounded-full bg-bull/[0.02] blur-[80px] animate-[pulseGlow_12s_ease-in-out_infinite_4s]" />
        {/* Noise texture */}
        <div className="absolute inset-0 opacity-[0.015] noise-overlay" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 sm:px-10 py-10 sm:py-16">
        {/* ═══ Back to Trading ═══ */}
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-[12px] text-txt-3 hover:text-txt-1 transition-all duration-200 mb-14 animate-[fadeIn_0.4s_ease]"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Trading
        </button>

        {/* ═══ Hero ═══ */}
        <div className="text-center mb-16 animate-[fadeInUp_0.6s_ease]">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/15 via-purple/10 to-accent/5 border border-white/[0.06] mb-7 shadow-2xl shadow-accent/10 animate-[float_6s_ease-in-out_infinite] backdrop-blur-sm">
            <BookOpen className="w-9 h-9 text-accent drop-shadow-[0_0_12px_rgba(76,148,255,0.3)]" />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-accent/20 bg-accent/[0.06] backdrop-blur-sm mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10.5px] font-semibold text-accent uppercase tracking-widest">Learn &amp; Explore</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight">
            <span className="bg-gradient-to-r from-txt-0 via-accent to-purple bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradientShift_8s_ease_infinite]">
              Knowledge Hub
            </span>
          </h1>
          <p className="text-[15px] sm:text-base text-txt-2 max-w-xl mx-auto leading-relaxed">
            Everything you need to know about Value Exchange — from deep technical
            documentation to the upcoming features that set us apart.
          </p>
        </div>

        {/* ═══ Dual Cards ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-20">

          {/* ── Documentation Card ── */}
          <button
            onClick={() => setView('docs')}
            className="group relative text-left p-[1px] rounded-2xl bg-gradient-to-br from-accent/40 via-accent/10 to-transparent hover:from-accent/60 hover:via-accent/25 transition-all duration-500 animate-[fadeInUp_0.5s_ease_0.15s_both]"
          >
            <div className="relative h-full rounded-2xl bg-drift-panel/80 backdrop-blur-xl p-7 sm:p-8 overflow-hidden">
              {/* Background glow */}
              <div className="absolute -top-10 -right-10 w-48 h-48 bg-accent/[0.04] rounded-full blur-[60px] group-hover:bg-accent/[0.08] transition-all duration-700" />
              <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5 flex items-center justify-center border border-accent/20 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-accent/15 transition-all duration-300">
                    <FileText className="w-7 h-7 text-accent" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-txt-0 group-hover:text-accent transition-colors duration-300">Documentation</h2>
                    <p className="text-[11px] text-txt-3 uppercase tracking-widest font-semibold mt-0.5">Technical Guides &amp; References</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-[13px] text-txt-2 leading-relaxed mb-6">
                  Deep dive into how Value works — architecture, trading mechanics, oracle
                  systems, liquidation engine, and complete keeper bot setup guides.
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-5 mb-6 py-3 px-4 rounded-xl bg-drift-surface/20 border border-drift-border/20">
                  <div className="text-center flex-1">
                    <div className="text-xl font-bold text-accent">14</div>
                    <div className="text-[9px] text-txt-3 uppercase tracking-widest font-medium">Topics</div>
                  </div>
                  <div className="w-px h-8 bg-drift-border/30" />
                  <div className="text-center flex-1">
                    <div className="text-xl font-bold text-accent">3</div>
                    <div className="text-[9px] text-txt-3 uppercase tracking-widest font-medium">Categories</div>
                  </div>
                  <div className="w-px h-8 bg-drift-border/30" />
                  <div className="text-center flex-1">
                    <div className="text-xl font-bold text-accent">8</div>
                    <div className="text-[9px] text-txt-3 uppercase tracking-widest font-medium">Bot Guides</div>
                  </div>
                </div>

                {/* Mini highlights */}
                <div className="flex flex-wrap gap-2 mb-7">
                  {DOCS_HIGHLIGHTS.map(({ icon: Icon, label }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-accent/[0.06] text-accent/80 border border-accent/10">
                      <Icon className="w-3 h-3" />
                      {label}
                    </span>
                  ))}
                </div>

                {/* CTA */}
                <div className="flex items-center gap-2 text-[14px] font-bold text-accent group-hover:gap-3 transition-all duration-300">
                  Explore Documentation
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>

          {/* ── Features Card ── */}
          <button
            onClick={() => setView('features')}
            className="group relative text-left p-[1px] rounded-2xl bg-gradient-to-br from-purple/40 via-purple/10 to-transparent hover:from-purple/60 hover:via-purple/25 transition-all duration-500 animate-[fadeInUp_0.5s_ease_0.3s_both]"
          >
            <div className="relative h-full rounded-2xl bg-drift-panel/80 backdrop-blur-xl p-7 sm:p-8 overflow-hidden">
              {/* Background glow */}
              <div className="absolute -top-10 -right-10 w-48 h-48 bg-purple/[0.04] rounded-full blur-[60px] group-hover:bg-purple/[0.08] transition-all duration-700" />
              <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple/15 to-purple/5 flex items-center justify-center border border-purple/20 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-purple/15 transition-all duration-300">
                    <Sparkles className="w-7 h-7 text-purple" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-txt-0 group-hover:text-purple transition-colors duration-300">Upcoming Features</h2>
                    <p className="text-[11px] text-txt-3 uppercase tracking-widest font-semibold mt-0.5">What Makes Us Different</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-[13px] text-txt-2 leading-relaxed mb-6">
                  Discover what sets Value apart — graduation perps, open market making,
                  Arcium-powered private trades, revenue sharing, and our complete roadmap.
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-5 mb-6 py-3 px-4 rounded-xl bg-drift-surface/20 border border-drift-border/20">
                  <div className="text-center flex-1">
                    <div className="text-xl font-bold text-purple">7</div>
                    <div className="text-[9px] text-txt-3 uppercase tracking-widest font-medium">Sections</div>
                  </div>
                  <div className="w-px h-8 bg-drift-border/30" />
                  <div className="text-center flex-1">
                    <div className="text-xl font-bold text-purple">4</div>
                    <div className="text-[9px] text-txt-3 uppercase tracking-widest font-medium">Core Features</div>
                  </div>
                  <div className="w-px h-8 bg-drift-border/30" />
                  <div className="text-center flex-1">
                    <div className="text-xl font-bold text-purple">5</div>
                    <div className="text-[9px] text-txt-3 uppercase tracking-widest font-medium">Phases</div>
                  </div>
                </div>

                {/* Mini highlights */}
                <div className="flex flex-wrap gap-2 mb-7">
                  {FEATURES_HIGHLIGHTS.map(({ icon: Icon, label }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-purple/[0.06] text-purple/80 border border-purple/10">
                      <Icon className="w-3 h-3" />
                      {label}
                    </span>
                  ))}
                </div>

                {/* CTA */}
                <div className="flex items-center gap-2 text-[14px] font-bold text-purple group-hover:gap-3 transition-all duration-300">
                  Discover Features
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* ═══ Bottom Highlights — Exchange Pillars ═══ */}
        <div className="animate-[fadeInUp_0.5s_ease_0.5s_both]">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold text-txt-3 uppercase tracking-[0.15em]">Exchange Pillars</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { icon: Zap, color: 'bull', title: 'Fast Fills', desc: 'Keeper-powered execution' },
              { icon: Shield, color: 'accent', title: 'Self-Custody', desc: 'Your keys, your funds' },
              { icon: Lock, color: 'purple', title: 'Private Trades', desc: 'Arcium MPC integration' },
              { icon: Coins, color: 'yellow', title: 'Revenue Share', desc: 'Earn from every trade' },
            ].map(({ icon: Icon, color, title, desc }, i) => (
              <div
                key={title}
                className={`group text-center p-5 rounded-xl border border-drift-border/20 bg-drift-surface/[0.06] backdrop-blur-sm hover:bg-drift-surface/15 hover:border-${color}/20 transition-all duration-300`}
              >
                <div className={`w-10 h-10 mx-auto mb-3 rounded-xl bg-${color}/10 flex items-center justify-center border border-${color}/15 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-5 h-5 text-${color}`} />
                </div>
                <div className="text-[12px] font-semibold text-txt-0 mb-0.5">{title}</div>
                <div className="text-[10px] text-txt-3">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Footer ═══ */}
        <div className="mt-16 pt-8 border-t border-drift-border/20 text-center animate-[fadeIn_0.5s_ease_0.7s_both]">
          <p className="text-[11px] text-txt-3">
            Value Exchange — The Decentralized Perpetual Futures Exchange on Solana
          </p>
        </div>
      </div>
    </div>
  );
};

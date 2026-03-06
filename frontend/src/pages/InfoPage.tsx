import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DocsPage } from './DocsPage';
import { FeaturesPage } from './FeaturesPage';

type InfoView = 'hub' | 'docs' | 'features';

export const InfoPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [view, setView] = useState<InfoView>('hub');

  if (view === 'docs') {
    return <DocsPage onBack={() => setView('hub')} backLabel="Knowledge Hub" />;
  }
  if (view === 'features') {
    return <FeaturesPage onBack={() => setView('hub')} backLabel="Knowledge Hub" />;
  }

  return (
    <div className="flex-1 w-full min-h-0 overflow-y-auto bg-drift-bg">
      <div className="w-full max-w-3xl mx-auto px-6 py-8">

        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[11px] text-txt-3 hover:text-txt-1 transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Trading
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-txt-0 mb-1">Knowledge Hub</h1>
          <p className="text-[13px] text-txt-2">
            Documentation, guides, and upcoming features for Float Exchange.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">

          {/* Documentation */}
          <button
            onClick={() => setView('docs')}
            className="text-left rounded border border-drift-border hover:border-txt-3/30 transition-colors overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-drift-border bg-drift-panel">
              <span className="text-[11px] font-medium text-txt-1 uppercase tracking-wider">Documentation</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12px] text-txt-2 leading-relaxed">
                How Float works &mdash; architecture, trading mechanics, oracle system, liquidation engine, and keeper bot guides.
              </p>
              <div className="flex items-center gap-4 text-[10px] text-txt-3">
                <span><span className="text-txt-0 font-semibold">14</span> Topics</span>
                <span><span className="text-txt-0 font-semibold">3</span> Categories</span>
                <span><span className="text-txt-0 font-semibold">8</span> Bot Guides</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Architecture', 'Trading', 'Oracles', 'Liquidation', 'Keeper Bots', 'Filler Bot'].map(t => (
                  <span key={t} className="px-2 py-0.5 rounded text-[10px] text-accent bg-accent/8 border border-accent/12">{t}</span>
                ))}
              </div>
              <span className="text-[12px] font-semibold text-accent">Explore Documentation &rarr;</span>
            </div>
          </button>

          {/* Features */}
          <button
            onClick={() => setView('features')}
            className="text-left rounded border border-drift-border hover:border-txt-3/30 transition-colors overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-drift-border bg-drift-panel">
              <span className="text-[11px] font-medium text-txt-1 uppercase tracking-wider">Upcoming Features</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12px] text-txt-2 leading-relaxed">
                What sets Float apart &mdash; graduation perps, open market making, Arcium-powered private trades, and revenue sharing.
              </p>
              <div className="flex items-center gap-4 text-[10px] text-txt-3">
                <span><span className="text-txt-0 font-semibold">7</span> Sections</span>
                <span><span className="text-txt-0 font-semibold">4</span> Core Features</span>
                <span><span className="text-txt-0 font-semibold">5</span> Phases</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Graduation Perps', 'Open Market Making', 'Arcium Privacy', 'Revenue Sharing'].map(t => (
                  <span key={t} className="px-2 py-0.5 rounded text-[10px] text-purple bg-purple/8 border border-purple/12">{t}</span>
                ))}
              </div>
              <span className="text-[12px] font-semibold text-purple">Discover Features &rarr;</span>
            </div>
          </button>
        </div>

        {/* Pillars */}
        <div className="mb-10">
          <div className="text-[10px] font-semibold text-txt-3 uppercase tracking-wider mb-3">Exchange Pillars</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { title: 'Fast Fills', desc: 'Keeper-powered execution', color: 'text-bull' },
              { title: 'Self-Custody', desc: 'Your keys, your funds', color: 'text-accent' },
              { title: 'Private Trades', desc: 'Arcium MPC integration', color: 'text-purple' },
              { title: 'Revenue Share', desc: 'Earn from every trade', color: 'text-[#efa411]' },
            ].map(({ title, desc, color }) => (
              <div key={title} className="rounded border border-drift-border px-3 py-3">
                <div className={`text-[12px] font-semibold ${color} mb-0.5`}>{title}</div>
                <div className="text-[10px] text-txt-3">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-drift-border text-center">
          <p className="text-[10px] text-txt-3">
            Float Exchange &mdash; Decentralized Perpetual Futures on Solana
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Home,
  BookOpen,
  Cpu,
  Rocket,
  Shield,
  Zap,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
  Copy,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Layers,
  Globe,
  FileText,
  Settings,
  Terminal,
  BarChart3,
  Lock,
  Gauge,
  Network,
  Sparkles,
  GitBranch,
  Eye,
  Bot,
  Coins,
  Award,
} from 'lucide-react';

/* ─── Section IDs ─── */
type SectionId =
  | 'home'
  | 'how-it-works'
  | 'how-trading'
  | 'how-orderbook'
  | 'how-oracle'
  | 'how-liquidation'
  | 'keeper-overview'
  | 'keeper-filler'
  | 'keeper-liquidator'
  | 'keeper-jit'
  | 'keeper-setup'
  | 'keeper-config'
  | 'keeper-running'
  | 'keeper-rewards';

/* ─── Sidebar tree structure ─── */
interface SidebarGroup {
  title: string;
  icon: React.FC<{ className?: string }>;
  items: { id: SectionId; label: string }[];
}

const SIDEBAR: SidebarGroup[] = [
  {
    title: 'Getting Started',
    icon: Home,
    items: [{ id: 'home', label: 'Home & Roadmap' }],
  },
  {
    title: 'How Float Works',
    icon: BookOpen,
    items: [
      { id: 'how-it-works', label: 'Overview' },
      { id: 'how-trading', label: 'Trading Mechanics' },
      { id: 'how-orderbook', label: 'Decentralized Orderbook' },
      { id: 'how-oracle', label: 'Oracle System' },
      { id: 'how-liquidation', label: 'Liquidation Engine' },
    ],
  },
  {
    title: 'Keeper Bots',
    icon: Cpu,
    items: [
      { id: 'keeper-overview', label: 'What Are Keeper Bots?' },
      { id: 'keeper-filler', label: 'Filler Bot' },
      { id: 'keeper-liquidator', label: 'Liquidator Bot' },
      { id: 'keeper-jit', label: 'JIT Maker Bot' },
      { id: 'keeper-setup', label: 'Setup Guide' },
      { id: 'keeper-config', label: 'Configuration Reference' },
      { id: 'keeper-running', label: 'Running & Monitoring' },
      { id: 'keeper-rewards', label: 'Rewards & Incentives' },
    ],
  },
];

/* ─── Copyable code block ─── */
function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-4 rounded border border-drift-border bg-[#0a0a0c] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-drift-border bg-drift-panel">
        <span className="text-[10px] font-mono text-txt-3">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] text-txt-3 hover:text-txt-0 transition-colors px-2 py-0.5 rounded hover:bg-drift-surface"
        >
          {copied ? <Check className="w-3 h-3 text-bull" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] font-mono leading-[1.7] text-txt-1">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ─── Reusable doc components ─── */
function H1({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl sm:text-2xl font-bold text-txt-0 tracking-tight">{children}</h1>
      <div className="mt-2 h-px bg-drift-border" />
    </div>
  );
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg sm:text-xl font-semibold text-txt-0 mt-10 mb-3">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold text-txt-0 mt-6 mb-2">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] leading-[1.75] text-txt-1 mb-4">{children}</p>;
}
function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'tip';
  children: React.ReactNode;
}) {
  const accent = {
    info: { border: 'border-l-blue-400', bg: 'bg-blue-500/[0.04]', text: 'text-blue-300', icon: 'ℹ️' },
    warning: { border: 'border-l-yellow', bg: 'bg-yellow/[0.04]', text: 'text-yellow', icon: '⚠️' },
    tip: { border: 'border-l-bull', bg: 'bg-bull/[0.04]', text: 'text-bull', icon: '💡' },
  };
  const s = accent[type];
  return (
    <div className={`my-4 rounded border border-drift-border border-l-[3px] ${s.border} ${s.bg} overflow-hidden`}>
      <div className="px-3 py-3">
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${s.text}`}>{s.icon} {type}</div>
        <div className="text-[12px] leading-[1.7] text-txt-1">{children}</div>
      </div>
    </div>
  );
}

function ConfigTable({
  rows,
}: {
  rows: { field: string; type: string; desc: string; def?: string }[];
}) {
  return (
    <div className="my-4 overflow-x-auto rounded border border-drift-border">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-drift-panel text-txt-2">
            <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wider">Field</th>
            <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wider">Type</th>
            <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wider">Description</th>
            <th className="text-left px-3 py-2 font-medium text-[10px] uppercase tracking-wider">Default</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-drift-border hover:bg-drift-surface/20 transition-colors">
              <td className="px-3 py-2 font-mono text-accent text-[11px]">{r.field}</td>
              <td className="px-3 py-2 text-txt-3 font-mono text-[10px]">{r.type}</td>
              <td className="px-3 py-2 text-txt-1">{r.desc}</td>
              <td className="px-3 py-2 text-txt-2 font-mono text-[10px]">{r.def || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoadmapPhase({
  phase,
  title,
  description,
  items,
  status,
  eta,
}: {
  phase: string;
  title: string;
  description: string;
  items: { text: string; done: boolean }[];
  status: 'completed' | 'in-progress' | 'upcoming';
  eta?: string;
}) {
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  const statusStyle = {
    completed: 'text-bull border-bull/30 bg-bull/5',
    'in-progress': 'text-yellow border-yellow/30 bg-yellow/5',
    upcoming: 'text-txt-2 border-drift-border bg-drift-surface/30',
  };
  const dotColor = {
    completed: 'bg-bull shadow-[0_0_8px_rgba(52,211,153,.4)]',
    'in-progress': 'bg-yellow shadow-[0_0_8px_rgba(239,164,17,.35)]',
    upcoming: 'bg-drift-active',
  };
  const barColor = {
    completed: 'bg-bull',
    'in-progress': 'bg-yellow',
    upcoming: 'bg-drift-active',
  };

  return (
    <div className="relative pl-10 pb-12 last:pb-0 group">
      {/* timeline line */}
      <div className="absolute left-[13px] top-3 bottom-0 w-px bg-gradient-to-b from-drift-border to-transparent group-last:hidden" />
      {/* timeline dot */}
      <div className={`absolute left-[7px] top-1.5 w-[14px] h-[14px] rounded-full border-[2.5px] border-drift-bg z-10 ${dotColor[status]}`} />

      {/* Phase label row */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-[11px] font-bold text-txt-3 uppercase tracking-widest">{phase}</span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle[status]}`}>
          {status === 'completed' ? 'Completed' : status === 'in-progress' ? 'In Progress' : 'Upcoming'}
        </span>
        {eta && <span className="text-[10px] text-txt-3 ml-auto">{eta}</span>}
      </div>

      {/* Title + description */}
      <h3 className="text-base font-semibold text-txt-0 mb-1">{title}</h3>
      <p className="text-[12px] text-txt-2 leading-relaxed mb-3">{description}</p>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 rounded-full bg-drift-surface overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor[status]}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] font-mono text-txt-2 shrink-0">{doneCount}/{items.length}</span>
      </div>

      {/* Checklist */}
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px]">
            {item.done ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-bull shrink-0" />
            ) : status === 'upcoming' ? (
              <Circle className="w-3.5 h-3.5 mt-0.5 text-txt-3 shrink-0" />
            ) : (
              <Clock className="w-3.5 h-3.5 mt-0.5 text-yellow/60 shrink-0" />
            )}
            <span className={item.done ? 'text-txt-2 line-through decoration-txt-3' : 'text-txt-1'}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Stat card ─── */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string; icon: React.FC<{ className?: string }> }) {
  return (
    <div className="px-3 py-2.5 rounded border border-drift-border">
      <div className="text-[10px] text-txt-3 uppercase tracking-wider font-medium">{label}</div>
      <div className="text-[14px] font-bold text-txt-0 leading-snug">{value}</div>
      {sub && <div className="text-[10px] text-txt-3 mt-px">{sub}</div>}
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({
  title,
  desc,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="px-4 py-3 rounded border border-drift-border">
      <h3 className="text-[12px] font-semibold text-txt-0 mb-1">{title}</h3>
      <p className="text-[11px] text-txt-2 leading-relaxed">{desc}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CONTENT SECTIONS
   ═══════════════════════════════════════════════════ */

function HomeSection() {
  return (
    <div>
      {/* ── Hero ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-bull bg-bull/8 border border-bull/15 px-2 py-0.5 rounded">Live on Devnet</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-txt-0 tracking-tight leading-snug mb-2">
          The Decentralized Perpetual Futures Exchange
        </h1>
        <p className="text-[13px] text-txt-2 leading-relaxed max-w-2xl mb-4">
          Float is a fully on-chain perpetual futures DEX built on Solana.
          Sub-second execution, decentralized order matching, and community-powered liquidity.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="http://95.217.193.241:5174" className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-accent text-white text-[12px] font-semibold hover:brightness-110 transition-colors">
            Launch App
            <ArrowRight className="w-3. h-3.5" />
          </a>
        </div>
      </div>

      {/* ── Live Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard icon={BarChart3} label="Markets" value="1" sub="SOL-PERP" />
        <StatCard icon={Gauge} label="Max Leverage" value="10x" sub="Cross-margin" />
        <StatCard icon={Zap} label="Execution" value="~400ms" sub="On-chain settlement" />
        <StatCard icon={Bot} label="Keeper Bots" value="2" sub="Filler · Liquidator" />
      </div>

      {/* ── Why Float ── */}
      <H2>Why Float?</H2>
      <P>
        Centralized exchanges hold your funds, control your data, and can freeze accounts at will.
        Float puts you in control — every trade settles directly on the Solana blockchain.
      </P>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent/[0.06] flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-[13px] font-semibold text-txt-0">Self-Custody</span>
          </div>
          <p className="text-[12.5px] text-txt-2 leading-relaxed">
            Your funds never leave your wallet. Trade directly from your Solana wallet with no deposits to a centralized entity.
          </p>
        </div>
        <div className="p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent/[0.06] flex items-center justify-center">
              <Eye className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-[13px] font-semibold text-txt-0">Full Transparency</span>
          </div>
          <p className="text-[12.5px] text-txt-2 leading-relaxed">
            Every order, fill, and liquidation is verifiable on-chain. No hidden fees, no painted volume, no opaque liquidation engines.
          </p>
        </div>
        <div className="p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent/[0.06] flex items-center justify-center">
              <Network className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-[13px] font-semibold text-txt-0">Distributed Infrastructure</span>
          </div>
          <p className="text-[12.5px] text-txt-2 leading-relaxed">
            Keeper bots, the DLOB server, and oracle feeds can all be run by anyone. No single point of failure can take down the exchange.
          </p>
        </div>
        <div className="p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent/[0.06] flex items-center justify-center">
              <Coins className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-[13px] font-semibold text-txt-0">Earn by Participating</span>
          </div>
          <p className="text-[12.5px] text-txt-2 leading-relaxed">
            Run keeper bots to earn a share of trading fees. Fillers earn ~10% of taker fees with zero capital risk.
          </p>
        </div>
      </div>

      {/* ── How it fits together (mini architecture) ── */}
      <H2>Architecture at a Glance</H2>
      <P>
        Float's stack is composed of modular, independently-operable components:
      </P>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10 overflow-x-auto">
        <div className="flex flex-col gap-3 text-[12px] font-mono min-w-[400px]">
          {/* Trader row */}
          <div className="flex items-center gap-2">
            <span className="w-28 text-right text-txt-2">Trader</span>
            <ArrowRight className="w-3 h-3 text-txt-3" />
            <span className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent border border-accent/20">Frontend UI</span>
            <ArrowRight className="w-3 h-3 text-txt-3" />
            <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Float Program</span>
          </div>
          {/* Oracle row */}
          <div className="flex items-center gap-2">
            <span className="w-28 text-right text-txt-2">Binance Feed</span>
            <ArrowRight className="w-3 h-3 text-txt-3" />
            <span className="px-3 py-1.5 rounded-lg bg-yellow/10 text-yellow border border-yellow/20">Oracle Updater</span>
            <ArrowRight className="w-3 h-3 text-txt-3" />
            <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Float Program</span>
          </div>
          {/* Keeper row */}
          <div className="flex items-center gap-2">
            <span className="w-28 text-right text-txt-2">DLOB Server</span>
            <ArrowRight className="w-3 h-3 text-txt-3" />
            <span className="px-3 py-1.5 rounded-lg bg-bull/10 text-bull border border-bull/20">Keeper Bots</span>
            <ArrowRight className="w-3 h-3 text-txt-3" />
            <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Float Program</span>
          </div>
          {/* Validator */}
          <div className="flex items-center gap-2 pt-2 border-t border-drift-border mt-1">
            <span className="w-28 text-right text-txt-3">Base layer</span>
            <ArrowRight className="w-3 h-3 text-transparent" />
            <span className="px-3 py-1.5 rounded-lg bg-drift-surface text-txt-1 border border-drift-border flex-1 text-center">
              Solana Validator &nbsp;·&nbsp; Custom RPC &nbsp;·&nbsp; On-chain State
            </span>
          </div>
        </div>
      </div>

      {/* ── Key Numbers ── */}
      <H2>Key Numbers</H2>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="text-center p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="text-2xl font-bold text-txt-0 mb-0.5">0.1%</div>
          <div className="text-[10px] text-txt-3 uppercase tracking-wider font-medium">Taker Fee</div>
        </div>
        <div className="text-center p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="text-2xl font-bold text-txt-0 mb-0.5">0.02%</div>
          <div className="text-[10px] text-txt-3 uppercase tracking-wider font-medium">Maker Fee</div>
        </div>
        <div className="text-center p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
          <div className="text-2xl font-bold text-txt-0 mb-0.5">$0</div>
          <div className="text-[10px] text-txt-3 uppercase tracking-wider font-medium">Min Deposit</div>
        </div>
      </div>

      {/* ── Roadmap ── */}
      <H2>Roadmap</H2>
      <P>
        Float is being built in public. Here's where we are and where we're headed.
        Each milestone is tracked with individual tasks so you can see exactly what's done and what's next.
      </P>

      {/* Progress overview bar */}
      <div className="mb-6 p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <div className="flex items-center justify-between text-[11px] text-txt-2 mb-2">
          <span className="font-medium text-txt-1">Overall Progress</span>
          <span className="font-mono text-bull">15 / 40 tasks</span>
        </div>
        <div className="h-2 rounded-full bg-drift-bg overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-bull to-bull/60" style={{ width: '38%' }} />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-txt-3">
          <span>Phase 1 — Done</span>
          <span>Phase 2 — Active</span>
          <span>Phase 3–4 — Planned</span>
        </div>
      </div>

      <div className="mt-6 ml-1">
        <RoadmapPhase
          phase="Phase 1"
          title="Core Exchange Infrastructure"
          description="Build the foundational on-chain exchange with a working trading UI, order matching, and price feeds."
          status="completed"
          eta="Completed Feb 2026"
          items={[
            { text: 'Custom Solana validator deployment on Hetzner dedicated server', done: true },
            { text: 'Float Protocol smart contract deployment and initialization', done: true },
            { text: 'SOL-PERP perpetual futures market (10x max leverage)', done: true },
            { text: 'Real-time Binance oracle price feed (~10s refresh)', done: true },
            { text: 'DLOB (Decentralized Limit Order Book) server with REST + WebSocket API', done: true },
            { text: 'Filler bot for decentralized order matching', done: true },
            { text: 'Professional trading UI — charts, orderbook, trade form, position management', done: true },
            { text: 'Wallet adapter integration (Phantom, Solflare, Backpack)', done: true },
            { text: 'Mobile-responsive trading interface', done: true },
            { text: 'Devnet deployed and publicly accessible', done: true },
          ]}
        />
        <RoadmapPhase
          phase="Phase 2"
          title="Stability & Production Readiness"
          description="Harden infrastructure reliability, fix outstanding service issues, and prepare for public access."
          status="in-progress"
          eta="Target: Q1 2026"
          items={[
            { text: 'Liquidator bot for protocol health and bankrupt account handling', done: true },
            { text: 'Auto-derisking auction for liquidated positions', done: true },
            { text: 'Trade event subscriber for real-time trade history', done: true },
            { text: 'Documentation site (this page!)', done: true },
            { text: 'Keeper bot guide for community onboarding', done: true },
            { text: 'Fund liquidator keeper wallet (fix rent/init errors)', done: false },
            { text: 'Dedicated RPC endpoint — fix DLOB timeouts and oracle reliability', done: false },
            { text: 'Production build — vite build + nginx reverse proxy + HTTPS', done: false },
            { text: 'Custom domain with SSL certificate', done: false },
            { text: 'USDC devnet faucet so testers can self-serve collateral', done: false },
            { text: 'JIT (Just-in-Time) auction maker bot for deeper liquidity', done: false },
            { text: 'Advanced order types — Stop Loss, Take Profit', done: false },
            { text: 'Account history and PnL tracking', done: false },
          ]}
        />
        <RoadmapPhase
          phase="Phase 3"
          title="Multi-Market Expansion"
          description="Scale to multiple markets, introduce spot trading, and build the insurance fund for systemic safety."
          status="upcoming"
          eta="Target: Q2 2026"
          items={[
            { text: 'BTC-PERP perpetual futures market', done: false },
            { text: 'ETH-PERP perpetual futures market', done: false },
            { text: 'Additional perp markets (community-voted)', done: false },
            { text: 'Spot trading markets with on-chain settlement', done: false },
            { text: 'Insurance fund and staking mechanism', done: false },
            { text: 'Portfolio margin for capital-efficient cross-market trading', done: false },
            { text: 'Trailing stop orders', done: false },
            { text: 'Sub-account management UI', done: false },
          ]}
        />
        <RoadmapPhase
          phase="Phase 4"
          title="Ecosystem & Governance"
          description="Transition to community governance, launch the token, and prepare for mainnet."
          status="upcoming"
          eta="Target: Q3–Q4 2026"
          items={[
            { text: 'Mainnet deployment with real Pyth oracles and security audit', done: false },
            { text: 'Governance token launch and fair distribution', done: false },
            { text: 'DAO-driven market listings and parameter adjustments', done: false },
            { text: 'Public REST/WebSocket API with documentation', done: false },
            { text: 'TypeScript SDK for third-party integrations', done: false },
            { text: 'Trading competitions and leaderboard', done: false },
            { text: 'Cross-chain bridge integration', done: false },
            { text: 'White-label exchange deployment toolkit', done: false },
            { text: 'Mobile native app (iOS / Android)', done: false },
          ]}
        />
      </div>

      {/* ── Get Involved CTA ── */}
      <div className="mt-10 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/[0.06] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-base font-bold text-txt-0 mb-1">Get Involved</h3>
            <p className="text-[13px] text-txt-2 leading-relaxed mb-3">
              Float is community-powered. The easiest way to contribute is to run a keeper bot —
              you'll earn fees while helping provide liquidity to every trader on the exchange.
              No coding required, just follow the setup guide.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-1.5 text-[12px] text-txt-1">
                <Award className="w-3.5 h-3.5 text-bull" />
                Earn ~10% of taker fees as a Filler
              </div>
              <span className="text-txt-3">·</span>
              <div className="inline-flex items-center gap-1.5 text-[12px] text-txt-1">
                <Shield className="w-3.5 h-3.5 text-yellow" />
                Earn liquidation fees as a Liquidator
              </div>
              <span className="text-txt-3">·</span>
              <div className="inline-flex items-center gap-1.5 text-[12px] text-txt-1">
                <Target className="w-3.5 h-3.5 text-blue-400" />
                Earn spread as a JIT Maker
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorksOverview() {
  return (
    <div>
      <H1>How Float Works</H1>
      <P>
        Float is a perpetual futures decentralized exchange (DEX) running entirely on the Solana blockchain.
        Unlike centralized exchanges, Float has no custodians, no intermediaries, and no central point of failure.
        Trades are matched, executed, and settled on-chain through a system of smart contracts and keeper bots.
      </P>

      <H2>Architecture Overview</H2>
      <P>
        The exchange is composed of several key components that work together to create a seamless trading experience:
      </P>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6">
        <FeatureCard
          icon={Layers}
          title="Float Protocol (On-Chain)"
          desc="The core smart contract that manages positions, collateral, liquidations, and settlement. All state lives on-chain."
        />
        <FeatureCard
          icon={BookOpen}
          title="DLOB Server"
          desc="An off-chain orderbook that indexes on-chain orders and serves them to the UI and bots for fast matching."
        />
        <FeatureCard
          icon={Cpu}
          title="Keeper Bots"
          desc="Automated bots that fill orders, liquidate unhealthy accounts, and provide liquidity through JIT auctions."
        />
        <FeatureCard
          icon={TrendingUp}
          title="Oracle System"
          desc="Feeds real-time market prices into the blockchain to enable accurate pricing, funding rates, and margin calculations."
        />
      </div>

      <H2>How a Trade Flows</H2>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <ol className="space-y-4 text-[13px] text-txt-1">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">1</span>
            <div><strong className="text-txt-0">Place Order</strong> — You submit a market or limit order through the UI. The order is sent to the Float smart contract on Solana.</div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">2</span>
            <div><strong className="text-txt-0">DLOB Indexes</strong> — The DLOB server picks up your on-chain order and adds it to its local orderbook, broadcasting it to connected clients.</div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">3</span>
            <div><strong className="text-txt-0">Filler Bot Matches</strong> — A keeper filler bot detects that your order crosses with another order (or is fillable at the oracle price for market orders) and submits a fill transaction.</div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">4</span>
            <div><strong className="text-txt-0">JIT Auction (Optional)</strong> — For market orders, a 5-second JIT auction runs where maker bots can offer a better price than the oracle. This ensures tight spreads.</div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">5</span>
            <div><strong className="text-txt-0">Settlement</strong> — The smart contract updates both accounts' positions, applies fees, and settles the trade on-chain. Your position and PnL are immediately reflected.</div>
          </li>
        </ol>
      </div>
    </div>
  );
}

function HowTrading() {
  return (
    <div>
      <H1>Trading Mechanics</H1>
      <P>
        Float supports perpetual futures trading with up to 20x leverage. Unlike traditional futures contracts
        that expire, perpetual futures have no expiration date and use a funding rate mechanism to keep prices
        anchored to the underlying spot price.
      </P>

      <H2>Order Types</H2>
      <H3>Market Orders</H3>
      <P>
        Market orders execute immediately at the best available price. When you place a market order, it enters
        a short JIT (Just-in-Time) auction where maker bots compete to fill your order at a price better than
        or equal to the oracle price. This typically results in minimal slippage.
      </P>

      <H3>Limit Orders</H3>
      <P>
        Limit orders sit on the decentralized orderbook until they are matched with a crossing order or cancelled.
        Your limit order is stored on-chain and indexed by the DLOB server. When a matching order arrives,
        a filler bot executes the trade. You pay no taker fees on limit fills — only maker fees.
      </P>

      <H2>Leverage & Margin</H2>
      <P>
        Float uses a cross-margin system where your entire account balance is used as collateral for all positions.
        The maximum leverage is 20x, meaning you can open a position worth 20 times your collateral.
      </P>
      <Callout type="warning">
        Higher leverage means higher risk. A 20x leveraged position will be liquidated if the price moves ~5%
        against you. Always use appropriate position sizing and risk management.
      </Callout>

      <H2>Funding Rate</H2>
      <P>
        Funding rates are periodic payments between long and short traders. When the perpetual price is above the
        oracle (spot) price, longs pay shorts. When below, shorts pay longs. This mechanism keeps the perpetual
        price anchored to the real market price. Funding is calculated and applied every hour.
      </P>

      <H2>Fees</H2>
      <ConfigTable
        rows={[
          { field: 'Taker Fee', type: '%', desc: 'Charged when taking liquidity (market orders)', def: '0.1%' },
          { field: 'Maker Fee', type: '%', desc: 'Charged/rebated when providing liquidity (limit orders)', def: '0.02%' },
          { field: 'Filler Reward', type: '%', desc: 'Portion of taker fee paid to the keeper who fills the order', def: '~10% of taker fee' },
          { field: 'Liquidation Fee', type: '%', desc: 'Fee charged on liquidated positions', def: '1%' },
        ]}
      />
    </div>
  );
}

function HowOrderbook() {
  return (
    <div>
      <H1>Decentralized Orderbook</H1>
      <P>
        The DLOB (Decentralized Limit Order Book) is the backbone of Float's order matching system. Unlike
        centralized exchanges where the orderbook lives on a private server, Float's orders are stored on-chain
        and indexed by a public server that anyone can run.
      </P>

      <H2>How the DLOB Works</H2>
      <P>
        When you place a limit order, the order is written to the Solana blockchain via the Float smart contract.
        The DLOB server subscribes to on-chain events and maintains a real-time mirror of all open orders,
        sorted by price and time priority. This enables fast lookups for the UI while keeping all state on-chain.
      </P>

      <H3>Order Priority</H3>
      <P>
        Orders are matched using a price-time priority algorithm. At the same price level, earlier orders get
        filled first. The filler bot that submits the matching transaction earns a portion of the taker fee
        as a reward for providing the matching service.
      </P>

      <H2>DLOB Server</H2>
      <P>
        The DLOB server is an off-chain indexer that provides a REST and WebSocket API for querying the orderbook.
        It reads on-chain state and serves it in a format optimized for the trading UI. Anyone can run their own
        DLOB server — it requires only an RPC connection and Redis.
      </P>

      <Callout type="tip">
        You can run your own DLOB server to have a private view of the orderbook. This is useful for building
        custom trading strategies or running keeper bots with lower latency.
      </Callout>
    </div>
  );
}

function HowOracle() {
  return (
    <div>
      <H1>Oracle System</H1>
      <P>
        Oracles are the bridge between real-world market data and the on-chain smart contracts. Float uses an
        oracle system that feeds real-time prices from centralized exchanges (like Binance) into the Solana
        blockchain, enabling accurate pricing for trades, margin calculations, and liquidations.
      </P>

      <H2>How Oracles Work</H2>
      <P>
        An oracle updater service fetches the current SOL/USD price from Binance every 10 seconds and pushes
        it to an on-chain price account via the <code className="text-accent bg-drift-surface px-1.5 py-0.5 rounded text-[12px]">updatePrelaunchOracle</code> instruction.
        The Float smart contract reads this oracle account to determine current prices for:
      </P>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Mark price for position PnL calculation</li>
        <li>Margin requirements and free collateral</li>
        <li>Funding rate calculations</li>
        <li>Liquidation triggers</li>
        <li>AMM peg adjustments</li>
      </ul>

      <H2>Oracle Safety</H2>
      <P>
        The oracle includes a <code className="text-accent bg-drift-surface px-1.5 py-0.5 rounded text-[12px]">lastUpdateSlot</code> field
        that the protocol checks to ensure the price data is recent. If the oracle becomes stale (hasn't been
        updated in several slots), the protocol pauses trading to prevent trades at stale prices.
      </P>
      <Callout type="info">
        Oracle manipulation is prevented by using the median of recent price updates and by having
        on-chain confidence intervals. Large sudden price changes are smoothed to prevent flash-crash liquidations.
      </Callout>
    </div>
  );
}

function HowLiquidation() {
  return (
    <div>
      <H1>Liquidation Engine</H1>
      <P>
        Liquidation is the process of closing positions that no longer have sufficient collateral to maintain
        their margin requirements. Float's liquidation engine is decentralized — anyone can run a liquidator bot
        to earn rewards for keeping the protocol healthy.
      </P>

      <H2>How Liquidation Works</H2>
      <P>
        Every account has a maintenance margin requirement based on the size and risk of its positions.
        When an account's collateral falls below this requirement (due to price movements or accumulated
        losses), it becomes eligible for liquidation.
      </P>

      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <ol className="space-y-3 text-[13px] text-txt-1">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-bear/10 flex items-center justify-center text-xs font-bold text-bear">1</span>
            <div><strong className="text-txt-0">Monitor</strong> — Liquidator bots continuously scan all user accounts, checking if their collateral is below maintenance margin.</div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-bear/10 flex items-center justify-center text-xs font-bold text-bear">2</span>
            <div><strong className="text-txt-0">Liquidate</strong> — When an account is eligible, the bot submits a liquidation transaction. The protocol transfers the position from the bankrupt account to the liquidator's account at a discount.</div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-bear/10 flex items-center justify-center text-xs font-bold text-bear">3</span>
            <div><strong className="text-txt-0">Derisk</strong> — The liquidator bot then closes the inherited position through an auction mechanism, ideally at a profit due to the liquidation fee discount.</div>
          </li>
        </ol>
      </div>

      <H2>Liquidation Fee</H2>
      <P>
        A 1% liquidation fee is charged on the position being liquidated. This fee incentivizes liquidator bots
        to maintain active monitoring and ensures unhealthy accounts are cleaned up promptly. The fee is split
        between the liquidator and the insurance fund.
      </P>
    </div>
  );
}

function KeeperOverview() {
  return (
    <div>
      <H1>What Are Keeper Bots?</H1>
      <P>
        Keeper bots are the backbone of Float's decentralized trading infrastructure. They are automated programs
        that perform essential exchange operations — matching orders, liquidating bankrupt accounts, and providing
        liquidity. In return, they earn a portion of trading fees.
      </P>

      <Callout type="tip">
        Running a keeper bot is the best way to earn passive income while contributing to Float's liquidity
        and health. No trading capital at risk (for filler bots) — you earn fees simply by matching orders.
      </Callout>

      <H2>Types of Keeper Bots</H2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-6">
        <FeatureCard
          icon={Zap}
          title="Filler Bot"
          desc="Matches and fills crossing orders on the decentralized orderbook. Earns ~10% of taker fees with zero capital risk."
        />
        <FeatureCard
          icon={Shield}
          title="Liquidator Bot"
          desc="Monitors accounts and liquidates positions below maintenance margin. Earns liquidation fees for keeping the protocol healthy."
        />
        <FeatureCard
          icon={Target}
          title="JIT Maker Bot"
          desc="Participates in Just-in-Time auctions to fill market orders at better-than-oracle prices. Requires trading capital."
        />
      </div>

      <H2>Why Run a Keeper Bot?</H2>
      <ul className="space-y-3 text-[14px] text-txt-1 mb-6">
        <li className="flex items-start gap-3">
          <DollarSign className="w-4 h-4 text-bull shrink-0 mt-0.5" />
          <div><strong className="text-txt-0">Earn Fees</strong> — Filler bots earn a reward for every order they match. Liquidator bots earn a fee on every liquidation.</div>
        </li>
        <li className="flex items-start gap-3">
          <Shield className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div><strong className="text-txt-0">Low Risk</strong> — Filler bots don't take on any market risk. They simply match orders and earn fees.</div>
        </li>
        <li className="flex items-start gap-3">
          <Globe className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div><strong className="text-txt-0">Support the Exchange</strong> — Every keeper bot adds to Float's liquidity and reliability, making it a better exchange for everyone.</div>
        </li>
        <li className="flex items-start gap-3">
          <Cpu className="w-4 h-4 text-purple shrink-0 mt-0.5" />
          <div><strong className="text-txt-0">Set and Forget</strong> — Once configured, keeper bots run 24/7 with minimal maintenance required.</div>
        </li>
      </ul>
    </div>
  );
}

function KeeperFiller() {
  return (
    <div>
      <H1>Filler Bot</H1>
      <P>
        The Filler bot is the most accessible keeper bot. It watches for crossing orders on the decentralized orderbook
        and submits fill transactions to match them. When successful, the filler earns a portion of the taker fee
        as a reward — with zero market risk.
      </P>

      <H2>How It Works</H2>
      <P>
        The filler bot maintains a local copy of the DLOB (Decentralized Limit Order Book) by subscribing to
        on-chain account updates. Every polling interval (typically 6 seconds), it checks for orders that cross
        and can be filled. When it finds a match, it submits a fill transaction to the Float smart contract.
      </P>

      <H3>What Gets Filled</H3>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Market orders waiting for a JIT auction to complete</li>
        <li>Limit orders that cross with opposing orders</li>
        <li>Trigger orders (stop-loss, take-profit) whose trigger price is reached</li>
      </ul>

      <H2>Revenue Model</H2>
      <P>
        Fillers earn approximately 10% of the taker fee for each successful fill. On a $10,000 trade with a 0.1%
        taker fee ($10), the filler earns ~$1. With high trading volume, this adds up to meaningful passive income.
      </P>

      <H3>Common Errors</H3>
      <ConfigTable
        rows={[
          { field: 'OrderDoesNotExist', type: 'error', desc: 'Outcompeted — order was already filled by another filler', def: 'Normal' },
          { field: 'OrderNotTriggerable', type: 'error', desc: 'Outcompeted — trigger order was already triggered', def: 'Normal' },
          { field: 'RevertFill', type: 'error', desc: 'Outcompeted — order was already filled by another filler', def: 'Normal' },
        ]}
      />
      <Callout type="info">
        Don't worry about these errors — they simply mean another filler matched the order before you.
        In a healthy network, competition between fillers is expected and keeps fills fast.
      </Callout>
    </div>
  );
}

function KeeperLiquidator() {
  return (
    <div>
      <H1>Liquidator Bot</H1>
      <P>
        The Liquidator bot is critical for protocol health. It monitors all user accounts and liquidates positions
        that fall below maintenance margin requirements. In return for this service, the liquidator earns a
        liquidation fee.
      </P>

      <H2>How It Works</H2>
      <P>
        Every 5 seconds, the liquidator bot iterates over all user accounts registered in the system. For each
        account, it calculates the margin ratio by comparing the account's collateral to its position requirements.
        If an account is undercollateralized, the bot submits a liquidation transaction.
      </P>

      <H3>Lifecycle of a Liquidation</H3>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <div className="space-y-3 text-[13px] text-txt-1">
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">1</span>
            <div><strong className="text-txt-0">Detection</strong> — Bot detects user's free collateral has dropped below zero (maintenance margin breached)</div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">2</span>
            <div><strong className="text-txt-0">Position Takeover</strong> — Bot takes over the user's position at a discount (liquidation fee). The position is transferred to the liquidator's account.</div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">3</span>
            <div><strong className="text-txt-0">Auto-Derisk</strong> — If auto-derisking is enabled, the bot immediately places an auction order to close the inherited position, locking in profit from the liquidation discount.</div>
          </div>
        </div>
      </div>

      <H2>Capital Requirements</H2>
      <P>
        Unlike the filler bot, the liquidator requires collateral deposited into a Float account. This collateral
        is used to take over liquidated positions. The <code className="text-accent bg-drift-surface px-1.5 py-0.5 rounded text-[12px]">maxPositionTakeoverPctOfCollateral</code> setting
        controls how much of the liquidator's collateral can be used per liquidation (default 50%).
      </P>
      <Callout type="warning">
        Running a liquidator bot involves risk. You will temporarily hold the liquidated position until it is
        derisked. If the market moves against you faster than the derisking auction, you could take a loss.
        Start with a small amount of collateral.
      </Callout>
    </div>
  );
}

function KeeperJit() {
  return (
    <div>
      <H1>JIT Maker Bot</H1>
      <P>
        The JIT (Just-in-Time) Maker bot participates in the JIT auction system to provide liquidity for market
        orders. When a trader places a market order, a short auction runs where JIT makers can offer a fill price
        better than or equal to the oracle price. This results in tighter spreads for traders and profit opportunities for makers.
      </P>

      <H2>How JIT Auctions Work</H2>
      <P>
        When a market order is placed, the protocol starts a 5-second auction. During this window, JIT maker bots
        can submit bids to fill the order. The maker offering the best price wins the auction and fills the order.
        The maker earns the spread between their fill price and the oracle price (minus fees).
      </P>

      <H2>Risk Profile</H2>
      <P>
        JIT maker bots take on directional risk — they are effectively market-making. The bot maintains bid and ask
        prices and will accumulate inventory (positions) as it fills orders. Proper risk management is essential:
      </P>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Set maximum position sizes to limit exposure</li>
        <li>Use the <code className="text-accent bg-drift-surface px-1.5 py-0.5 rounded text-[12px]">TARGET_LEVERAGE_PER_ACCOUNT</code> constant to cap leverage</li>
        <li>Monitor your PnL and adjust spread parameters as needed</li>
        <li>Consider running multiple sub-accounts to isolate market risk</li>
      </ul>

      <Callout type="warning">
        The JIT Maker bot requires significant capital and understanding of market-making risks. It is recommended
        for experienced users only. Start with small sizes and conservative spreads.
      </Callout>
    </div>
  );
}

function KeeperSetup() {
  return (
    <div>
      <H1>Keeper Bot Setup Guide</H1>
      <P>
        This guide walks you through setting up and running keeper bots for the Float exchange. You'll be
        earning fees in no time.
      </P>

      <H2>Prerequisites</H2>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Node.js v18+ and Yarn package manager</li>
        <li>A Solana wallet keypair (JSON file)</li>
        <li>SOL for transaction fees (~2 SOL recommended)</li>
        <li>For liquidator/JIT bots: USDC collateral</li>
      </ul>

      <H2>Step 1: Clone the Repository</H2>
      <CodeBlock code={`git clone https://github.com/your-org/float-keeper-bots.git
cd float-keeper-bots`} />

      <H2>Step 2: Install Dependencies</H2>
      <CodeBlock code={`yarn install
yarn build`} />

      <H2>Step 3: Generate a Keypair</H2>
      <P>
        If you don't already have a Solana keypair, generate one:
      </P>
      <CodeBlock code={`solana-keygen new --no-bip39-passphrase -o keys/keeper-keypair.json
solana address -k keys/keeper-keypair.json`} />

      <H2>Step 4: Fund Your Wallet</H2>
      <P>Fund your keeper wallet with SOL for transaction fees:</P>
      <CodeBlock code={`# Transfer SOL from another wallet
solana transfer <KEEPER_PUBKEY> 2 --from <FUNDING_KEYPAIR> -u <RPC_URL>

# For liquidator/JIT bots, also deposit USDC collateral
# Contact the Float team for devnet USDC`} />

      <H2>Step 5: Create Config File</H2>
      <P>
        Create a YAML configuration file for your keeper bot. Start with the filler bot — it's the simplest
        and requires no capital.
      </P>

      <H3>Filler Bot Config</H3>
      <CodeBlock
        lang="yaml"
        code={`global:
  driftEnv: devnet
  endpoint: http://<FLOAT_RPC_URL>:8899
  wsEndpoint: ws://<FLOAT_RPC_URL>:8900
  keeperPrivateKey: # set KEEPER_PRIVATE_KEY env var
  initUser: true
  websocket: true
  debug: true
  subaccounts:
    - 0
  txSenderType: retry
  txRetryTimeoutMs: 30000

enabledBots:
  - filler

botConfigs:
  filler:
    botId: "my-filler"
    dryRun: false
    fillerPollingInterval: 6000
    metricsPort: 9464
    revertOnFailure: true
    simulateTxForCUEstimate: true`}
      />

      <H3>Liquidator Bot Config</H3>
      <CodeBlock
        lang="yaml"
        code={`global:
  driftEnv: devnet
  endpoint: http://<FLOAT_RPC_URL>:8899
  wsEndpoint: ws://<FLOAT_RPC_URL>:8900
  keeperPrivateKey: # set KEEPER_PRIVATE_KEY env var
  initUser: true
  websocket: true
  debug: true
  subaccounts:
    - 0
  txSenderType: retry
  txRetryTimeoutMs: 30000

enabledBots:
  - liquidator

botConfigs:
  liquidator:
    botId: "my-liquidator"
    dryRun: false
    metricsPort: 9466
    disableAutoDerisking: false
    perpMarketIndicies:
      - 0
    spotMarketIndicies:
      - 0
    maxSlippageBps: 50
    deriskAuctionDurationSlots: 100
    maxPositionTakeoverPctOfCollateral: 0.5
    notifyOnLiquidation: true
    spotDustValueThreshold: 10`}
      />

      <H2>Step 6: Set Environment Variables</H2>
      <CodeBlock code={`export KEEPER_PRIVATE_KEY=/path/to/keys/keeper-keypair.json
export DRIFT_PROGRAM_ID=EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE
export USDC_MINT=G1RCxqcc1DpLUnprWdxdZ9DsstmYmxhekZffJKNi5ths`} />

      <H2>Step 7: Initialize User Account</H2>
      <P>
        The first time you run the bot, set <code className="text-accent bg-drift-surface px-1.5 py-0.5 rounded text-[12px]">initUser: true</code> in
        your config. This creates a Float user account for your keypair. After the first run, you can set it to false.
      </P>

      <H2>Step 8: Deposit Collateral (Liquidator/JIT Only)</H2>
      <P>For bots that require collateral:</P>
      <CodeBlock code={`# Deposit 10,000 USDC
yarn run dev --config-file=my-config.yaml --force-deposit 10000`} />

      <H2>Step 9: Run the Bot</H2>
      <CodeBlock code={`yarn run dev --config-file=my-config.yaml`} />

      <Callout type="tip">
        For production deployments, use <code className="text-accent">pm2</code> to keep the bot running:
        <div className="mt-2 font-mono text-xs">
          pm2 start lib/index.js --name my-filler -- --config-file=my-config.yaml
        </div>
      </Callout>
    </div>
  );
}

function KeeperConfig() {
  return (
    <div>
      <H1>Configuration Reference</H1>
      <P>Complete reference for all YAML configuration fields.</P>

      <H2>Global Configuration</H2>
      <ConfigTable
        rows={[
          { field: 'global.driftEnv', type: 'string', desc: 'Network environment', def: 'devnet' },
          { field: 'global.endpoint', type: 'string', desc: 'RPC endpoint URL', def: '—' },
          { field: 'global.wsEndpoint', type: 'string', desc: 'WebSocket endpoint URL', def: 'derived from endpoint' },
          { field: 'global.keeperPrivateKey', type: 'string', desc: 'Path to keypair JSON or comma-separated bytes', def: 'KEEPER_PRIVATE_KEY env' },
          { field: 'global.initUser', type: 'bool', desc: 'Initialize Float user account on first run', def: 'false' },
          { field: 'global.websocket', type: 'bool', desc: 'Use WebSocket for account updates', def: 'false' },
          { field: 'global.debug', type: 'bool', desc: 'Enable debug-level logging', def: 'false' },
          { field: 'global.subaccounts', type: 'number[]', desc: 'Which sub-account IDs to load', def: '[0]' },
          { field: 'global.txSenderType', type: 'string', desc: 'Transaction sender: fast, retry, while-valid', def: 'fast' },
          { field: 'global.metricsPort', type: 'number', desc: 'Prometheus metrics port', def: '9464' },
        ]}
      />

      <H2>Filler Bot Configuration</H2>
      <ConfigTable
        rows={[
          { field: 'botId', type: 'string', desc: 'Unique identifier for this bot instance', def: 'filler' },
          { field: 'dryRun', type: 'bool', desc: 'If true, simulate but don\'t send transactions', def: 'false' },
          { field: 'fillerPollingInterval', type: 'number', desc: 'Milliseconds between fill attempts', def: '6000' },
          { field: 'metricsPort', type: 'number', desc: 'Prometheus metrics port for this bot', def: '9464' },
          { field: 'revertOnFailure', type: 'bool', desc: 'Revert transaction on fill failure', def: 'true' },
          { field: 'simulateTxForCUEstimate', type: 'bool', desc: 'Simulate tx to estimate compute units', def: 'true' },
        ]}
      />

      <H2>Liquidator Bot Configuration</H2>
      <ConfigTable
        rows={[
          { field: 'botId', type: 'string', desc: 'Unique identifier for this bot instance', def: 'liquidator' },
          { field: 'dryRun', type: 'bool', desc: 'If true, simulate but don\'t send transactions', def: 'false' },
          { field: 'disableAutoDerisking', type: 'bool', desc: 'Disable automatic position closing after liquidation', def: 'false' },
          { field: 'perpMarketIndicies', type: 'number[]', desc: 'Which perp markets to liquidate (null = all)', def: 'all' },
          { field: 'spotMarketIndicies', type: 'number[]', desc: 'Which spot markets to liquidate (null = all)', def: 'all' },
          { field: 'maxSlippageBps', type: 'number', desc: 'Max slippage in basis points when derisking', def: '50' },
          { field: 'deriskAuctionDurationSlots', type: 'number', desc: 'Duration of derisk auction in slots', def: '100' },
          { field: 'maxPositionTakeoverPctOfCollateral', type: 'number', desc: 'Max % of collateral to use per liquidation', def: '0.5' },
          { field: 'notifyOnLiquidation', type: 'bool', desc: 'Send notification on successful liquidation', def: 'false' },
          { field: 'spotDustValueThreshold', type: 'number', desc: 'USD threshold to sweep dust spot balances', def: '10' },
        ]}
      />

      <H2>JIT Maker Bot Configuration</H2>
      <ConfigTable
        rows={[
          { field: 'botId', type: 'string', desc: 'Unique identifier for this bot instance', def: 'jitMaker' },
          { field: 'dryRun', type: 'bool', desc: 'If true, simulate but don\'t send transactions', def: 'false' },
          { field: 'subaccounts', type: 'number[]', desc: 'Sub-accounts to use for JIT making', def: '[0]' },
          { field: 'perpMarketIndicies', type: 'number[]', desc: 'Which perp markets to make in', def: '—' },
          { field: 'marketType', type: 'string', desc: 'PERP or SPOT', def: 'PERP' },
          { field: 'targetLeverage', type: 'number', desc: 'Target leverage per account', def: '1' },
        ]}
      />
    </div>
  );
}

function KeeperRunning() {
  return (
    <div>
      <H1>Running & Monitoring</H1>
      <P>
        Once your keeper bot is configured, here's how to run it effectively in production.
      </P>

      <H2>Running with PM2</H2>
      <P>
        PM2 is a process manager that keeps your bot running 24/7, auto-restarts on crashes, and provides
        log management.
      </P>
      <CodeBlock code={`# Install PM2 globally
npm install -g pm2

# Start your filler bot
pm2 start lib/index.js --name float-filler -- --config-file=filler.config.yaml

# Start your liquidator bot
pm2 start lib/index.js --name float-liquidator -- --config-file=liquidator.config.yaml

# Save the process list (auto-restore on server reboot)
pm2 save
pm2 startup`} />

      <H2>Monitoring Commands</H2>
      <CodeBlock code={`# View all running bots
pm2 list

# View real-time logs
pm2 logs float-filler
pm2 logs float-liquidator

# Monitor CPU/memory
pm2 monit

# Restart a bot
pm2 restart float-filler

# Stop a bot
pm2 stop float-filler`} />

      <H2>Prometheus Metrics</H2>
      <P>
        Each bot exposes Prometheus metrics on its configured port. You can scrape these with Prometheus
        and visualize them in Grafana.
      </P>
      <CodeBlock code={`# Check metrics
curl http://localhost:9464/metrics  # filler
curl http://localhost:9466/metrics  # liquidator`} />

      <H2>Health Checks</H2>
      <P>
        Each keeper bot also runs a health check HTTP server (default port 8888). The health endpoint returns
        200 if the bot is running and healthy.
      </P>
      <CodeBlock code={`curl http://localhost:8888/health`} />
      <Callout type="tip">
        Set <code className="text-accent">HEALTH_CHECK_PORT</code> as an environment variable if running multiple
        bots on the same machine. Each bot needs a unique health check port.
      </Callout>

      <H2>Log Analysis</H2>
      <P>Key log messages to look for:</P>
      <ConfigTable
        rows={[
          { field: 'Liquidation tick completed', type: 'info', desc: 'Normal liquidator cycle, shows users checked and liquidatable count' },
          { field: 'free collateral: $X', type: 'info', desc: 'Liquidator\'s available collateral for liquidations' },
          { field: 'Users: N checked, M liquidatable', type: 'info', desc: 'Number of on-chain users scanned and how many need liquidation' },
          { field: 'SufficientCollateral', type: 'error', desc: 'Normal — target user recovered collateral before liquidation tx landed' },
          { field: 'EADDRINUSE', type: 'error', desc: 'Port conflict — change metricsPort or HEALTH_CHECK_PORT' },
        ]}
      />
    </div>
  );
}

function KeeperRewards() {
  return (
    <div>
      <H1>Rewards & Incentives</H1>
      <P>
        Float's keeper bot ecosystem is designed to reward participants who contribute to the exchange's
        liquidity and reliability. Here's how each bot type generates revenue.
      </P>

      <H2>Filler Bot Revenue</H2>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10 bg-gradient-to-r from-bull/5 to-transparent">
        <div className="text-lg font-bold text-bull mb-1">~10% of Taker Fees</div>
        <p className="text-[13px] text-txt-1">
          For every order you successfully fill, you earn approximately 10% of the taker fee. On a $10,000 trade
          with a 0.1% taker fee, that's ~$1 per fill in rewards.
        </p>
      </div>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Zero capital requirement — you only need SOL for transaction fees</li>
        <li>No market risk — you never hold positions</li>
        <li>Revenue scales linearly with trading volume</li>
        <li>Competition with other fillers reduces per-fill reward but ensures fast execution</li>
      </ul>

      <H2>Liquidator Bot Revenue</H2>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10 bg-gradient-to-r from-yellow/5 to-transparent">
        <div className="text-lg font-bold text-yellow mb-1">Liquidation Fee Discount</div>
        <p className="text-[13px] text-txt-1">
          You acquire liquidated positions at a discount to market price (the liquidation fee). If you derisk
          immediately, the spread between your acquisition price and market price is your profit.
        </p>
      </div>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Requires USDC collateral deposited into your Float account</li>
        <li>Revenue is event-driven — more liquidations during volatile markets</li>
        <li>Auto-derisking minimizes holding risk</li>
        <li>Recommended starting capital: $10,000+ USDC</li>
      </ul>

      <H2>JIT Maker Bot Revenue</H2>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10 bg-gradient-to-r from-blue-400/5 to-transparent">
        <div className="text-lg font-bold text-blue-400 mb-1">Market-Making Spread</div>
        <p className="text-[13px] text-txt-1">
          Earn the bid-ask spread by filling market orders through JIT auctions. Revenue depends on spread width,
          fill rate, and position management.
        </p>
      </div>
      <ul className="list-disc space-y-1.5 text-[13.5px] text-txt-1 pl-5 mb-4">
        <li>Requires significant capital and market-making experience</li>
        <li>Directional risk — active position management needed</li>
        <li>Highest potential revenue, but also highest risk</li>
        <li>Recommended for experienced traders/market makers</li>
      </ul>

      <H2>Getting Started Checklist</H2>
      <div className="my-4 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <div className="space-y-2.5 text-[13px] text-txt-1">
          {[
            'Set up a dedicated server (VPS or local machine)',
            'Generate a dedicated Solana keypair for the bot',
            'Fund the bot wallet with 2+ SOL for transaction fees',
            'Create a YAML config file for your chosen bot type',
            'Set environment variables (KEEPER_PRIVATE_KEY, DRIFT_PROGRAM_ID)',
            'Run with --init-user on first start to create the Float account',
            'For liquidator/JIT: deposit USDC collateral via --force-deposit',
            'Start the bot with PM2 for production reliability',
            'Monitor logs and metrics to ensure healthy operation',
          ].map((item, i) => (
            <label key={i} className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" className="mt-1 accent-bull" />
              <span className="group-hover:text-txt-0 transition-colors">{item}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN DOCS PAGE
   ═══════════════════════════════════════════════════ */

interface DocsPageProps {
  onBack?: () => void;
  backLabel?: string;
}

export const DocsPage: React.FC<DocsPageProps> = ({ onBack, backLabel }) => {
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Getting Started': true,
    'How Float Works': true,
    'Keeper Bots': true,
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleGroup = (title: string) =>
    setExpandedGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const navigateTo = (id: SectionId) => {
    setActiveSection(id);
    setMobileSidebarOpen(false);
    const el = document.getElementById('docs-content');
    el?.scrollTo(0, 0);
  };

  const sectionContent: Record<SectionId, React.ReactNode> = {
    home: <HomeSection />,
    'how-it-works': <HowItWorksOverview />,
    'how-trading': <HowTrading />,
    'how-orderbook': <HowOrderbook />,
    'how-oracle': <HowOracle />,
    'how-liquidation': <HowLiquidation />,
    'keeper-overview': <KeeperOverview />,
    'keeper-filler': <KeeperFiller />,
    'keeper-liquidator': <KeeperLiquidator />,
    'keeper-jit': <KeeperJit />,
    'keeper-setup': <KeeperSetup />,
    'keeper-config': <KeeperConfig />,
    'keeper-running': <KeeperRunning />,
    'keeper-rewards': <KeeperRewards />,
  };

  const allSections = SIDEBAR.flatMap((g) => g.items);
  const currentIdx = allSections.findIndex((s) => s.id === activeSection);
  const prev = currentIdx > 0 ? allSections[currentIdx - 1] : null;
  const next = currentIdx < allSections.length - 1 ? allSections[currentIdx + 1] : null;

  /* ── Shared sidebar nav tree (rendered in both desktop & mobile sidebars) ── */
  const sidebarNav = (
    <div className="py-4 px-3">
      {SIDEBAR.map((group) => {
        const Icon = group.icon;
        const expanded = expandedGroups[group.title] !== false;
        return (
          <div key={group.title} className="mb-2">
            <button
              onClick={() => toggleGroup(group.title)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-txt-3
                hover:text-txt-1 hover:bg-drift-surface/40 rounded-lg transition-colors"
            >
              <Icon className="w-3.5 h-3.5 text-txt-3" />
              <span className="flex-1 text-left">{group.title}</span>
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            {expanded && (
              <div className="mt-1 ml-3 space-y-0.5 border-l border-drift-border/50 pl-0">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateTo(item.id)}
                    className={`relative w-full text-left px-3 py-1.5 text-[12.5px] rounded-r-md transition-all ml-px ${
                      activeSection === item.id
                        ? 'bg-accent/[0.08] text-accent font-medium border-l-2 border-accent -ml-px'
                        : 'text-txt-2 hover:text-txt-1 hover:bg-drift-surface/25'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const sidebarHeader = (
    <div className="flex items-center gap-2.5 px-5 py-5 border-b border-drift-border/60 shrink-0">
      <div className="w-7 h-7 rounded-lg bg-accent/[0.08] flex items-center justify-center">
        <FileText className="w-3.5 h-3.5 text-accent" />
      </div>
      <div>
        <span className="text-sm font-bold text-txt-0 block leading-tight">Float Docs</span>
        <span className="text-[10px] text-txt-3">Documentation & Guides</span>
      </div>
    </div>
  );

  const sidebarFooter = onBack ? (
    <div className="p-3 border-t border-drift-border/50 shrink-0">
      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-medium
          text-txt-2 hover:text-txt-0 bg-drift-surface/50 hover:bg-drift-surface rounded-lg transition-all border border-drift-border/30 hover:border-drift-border/60"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {backLabel || 'Back to Trading'}
      </button>
    </div>
  ) : null;

  return (
    <div className="flex-1 w-full min-h-0 flex overflow-hidden bg-drift-bg">
      {/* ═══ Desktop sidebar — in normal document flow, hidden below lg ═══ */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-drift-panel border-r border-drift-border">
        {sidebarHeader}
        <nav className="flex-1 overflow-y-auto">{sidebarNav}</nav>
        {sidebarFooter}
      </aside>

      {/* ═══ Mobile sidebar — fixed overlay, only rendered when open ═══ */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-drift-panel border-r border-drift-border lg:hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-drift-border shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-txt-0">Float Docs</span>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1 rounded hover:bg-drift-surface text-txt-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto">{sidebarNav}</nav>
            {sidebarFooter}
          </aside>
        </>
      )}

      {/* ═══ Main content area ═══ */}
      <main className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
        {/* Mobile top bar with hamburger — hidden at lg+ */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-drift-border bg-drift-panel/50 shrink-0 lg:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-drift-surface text-txt-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xs text-txt-2 truncate">
            {allSections.find((s) => s.id === activeSection)?.label || 'Docs'}
          </span>
        </div>

        {/* Scrollable content */}
        <div id="docs-content" className="flex-1 w-full overflow-y-auto overflow-x-hidden">
          <div className="w-full px-6 sm:px-10 lg:px-14 xl:px-16 py-8 sm:py-12">
            {sectionContent[activeSection]}

            {/* Prev / Next navigation */}
            <div className="flex items-stretch gap-3 mt-16 pt-8 border-t border-drift-border/40">
              {prev ? (
                <button
                  onClick={() => navigateTo(prev.id)}
                  className="flex-1 flex flex-col items-start gap-1 p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10 hover:bg-drift-surface/30 hover:border-accent/20 transition-all group text-left"
                >
                  <span className="flex items-center gap-1.5 text-[10px] text-txt-3 uppercase tracking-wider font-medium">
                    <ArrowLeft className="w-3 h-3" />
                    Previous
                  </span>
                  <span className="text-[13px] font-medium text-txt-1 group-hover:text-accent transition-colors">{prev.label}</span>
                </button>
              ) : (
                <div className="flex-1" />
              )}
              {next ? (
                <button
                  onClick={() => navigateTo(next.id)}
                  className="flex-1 flex flex-col items-end gap-1 p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10 hover:bg-drift-surface/30 hover:border-accent/20 transition-all group text-right"
                >
                  <span className="flex items-center gap-1.5 text-[10px] text-txt-3 uppercase tracking-wider font-medium">
                    Next
                    <ChevronRight className="w-3 h-3" />
                  </span>
                  <span className="text-[13px] font-medium text-txt-1 group-hover:text-accent transition-colors">{next.label}</span>
                </button>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
  Rocket,
  Zap,
  Shield,
  Coins,
  Users,
  Bot,
  Lock,
  Eye,
  Award,
  TrendingUp,
  Layers,
  DollarSign,
  Target,
  Globe,
  FileText,
  Activity,
  BarChart3,
  Sparkles,
  GitBranch,
  ArrowUpRight,
  Shuffle,
  CheckCircle2,
  Circle,
  Clock,
} from 'lucide-react';

/* ─── Section IDs ─── */
type SectionId =
  | 'overview'
  | 'graduation-perps'
  | 'open-market-making'
  | 'arcium-privacy'
  | 'revenue-sharing'
  | 'comparison'
  | 'roadmap';

/* ─── Sidebar tree ─── */
interface SidebarGroup {
  title: string;
  icon: React.FC<{ className?: string }>;
  items: { id: SectionId; label: string }[];
}

const SIDEBAR: SidebarGroup[] = [
  {
    title: 'Introduction',
    icon: Sparkles,
    items: [{ id: 'overview', label: 'Why Float Is Different' }],
  },
  {
    title: 'Core Features',
    icon: Rocket,
    items: [
      { id: 'graduation-perps', label: 'Graduation Perps' },
      { id: 'open-market-making', label: 'Open Market Making' },
      { id: 'arcium-privacy', label: 'Arcium Private Trades' },
      { id: 'revenue-sharing', label: 'Revenue Sharing' },
    ],
  },
  {
    title: 'At a Glance',
    icon: BarChart3,
    items: [
      { id: 'comparison', label: 'Feature Comparison' },
      { id: 'roadmap', label: 'Roadmap' },
    ],
  },
];

const allSections = SIDEBAR.flatMap((g) => g.items);

/* ─── Reusable components ─── */
function H1({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl sm:text-3xl font-bold text-txt-0 tracking-tight">{children}</h1>
      <div className="mt-3 h-px bg-gradient-to-r from-accent/30 via-drift-border to-transparent" />
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
    <div className={`my-5 rounded-lg border border-drift-border/30 border-l-[3px] ${s.border} ${s.bg} overflow-hidden`}>
      <div className="px-4 py-3.5">
        <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${s.text}`}>{s.icon} {type}</div>
        <div className="text-[13px] leading-[1.7] text-txt-1/85">{children}</div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  accent: accentColor,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  desc: string;
  accent?: string;
}) {
  return (
    <div className="group p-4 rounded-xl border border-drift-border/40 bg-drift-surface/10 hover:bg-drift-surface/20 hover:border-accent/20 transition-all duration-200">
      <div className={`w-9 h-9 rounded-lg ${accentColor || 'bg-accent/[0.06]'} flex items-center justify-center mb-3`}>
        <Icon className="w-4.5 h-4.5 text-accent" />
      </div>
      <h3 className="text-[13px] font-semibold text-txt-0 mb-1">{title}</h3>
      <p className="text-[12.5px] text-txt-2 leading-relaxed">{desc}</p>
    </div>
  );
}

function FlowStep({ step, title, desc, last }: { step: number; title: string; desc: string; last?: boolean }) {
  return (
    <div className="relative pl-10 pb-8 last:pb-0">
      {!last && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-gradient-to-b from-accent/30 to-transparent" />}
      <div className="absolute left-[7px] top-1 w-[18px] h-[18px] rounded-full bg-accent/10 border-2 border-accent/40 flex items-center justify-center">
        <span className="text-[9px] font-bold text-accent">{step}</span>
      </div>
      <h4 className="text-[13px] font-semibold text-txt-0 mb-1">{title}</h4>
      <p className="text-[12.5px] text-txt-2 leading-relaxed">{desc}</p>
    </div>
  );
}

function SplitRow({ label, pct, color, desc }: { label: string; pct: string; color: string; desc: string }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-drift-border/20 last:border-0">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
        <span className="text-[13px] font-bold text-white">{pct}</span>
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-txt-0">{label}</div>
        <div className="text-[12px] text-txt-2">{desc}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CONTENT SECTIONS
   ═══════════════════════════════════════════════════ */

function OverviewSection() {
  return (
    <div>
      {/* Hero */}
      <div className="relative mb-8 -mx-5 sm:-mx-10 -mt-8 sm:-mt-14 px-5 sm:px-10 pt-10 sm:pt-14 pb-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-accent/[0.02] blur-[120px] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
              <Sparkles className="w-3 h-3" />
              Upcoming Features
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-txt-0 tracking-tight leading-[1.1] mb-4">
            What Makes Float<br />
            <span className="bg-gradient-to-r from-accent via-blue-400 to-accent bg-clip-text text-transparent">
              Different From Everything Else
            </span>
          </h1>
          <p className="text-[15px] sm:text-base text-txt-2 leading-relaxed max-w-2xl mb-6">
            Float isn't just another perps DEX. We're building the exchange that should already exist —
            combining a token launchpad, open market making, optional privacy, and direct
            revenue sharing that pays participants from every trade fee.
          </p>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <FeatureCard
          icon={Rocket}
          title="Graduation Perps"
          desc="Tokens launch on our launchpad and automatically graduate into full perpetual futures markets. Launch → Leverage."
        />
        <FeatureCard
          icon={Bot}
          title="Open Market Making"
          desc="Anyone can run a Keeper bot — Maker, Filler, or Liquidator — to earn real fees from every trade."
        />
        <FeatureCard
          icon={Shield}
          title="Arcium Private Trades"
          desc="Optional encrypted trade execution via multi-party computation. No front-running, no leaking your strategy."
        />
        <FeatureCard
          icon={Coins}
          title="Revenue Sharing"
          desc="50% of all exchange fees go directly to participants. Real yield, on-chain, automatic — straight from the revenue we generate."
        />
      </div>

      <Callout type="tip">
        These features are designed to work together as a flywheel: more keepers → better execution → more traders → more fees → more revenue shared → more keepers.
      </Callout>
    </div>
  );
}

function GraduationPerpsSection() {
  return (
    <div>
      <H1>Graduation Perps</H1>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
          <Rocket className="w-3 h-3" />
          Launchpad → Perpetuals Pipeline
        </span>
      </div>

      <H2>The Problem</H2>
      <P>
        On most launchpads — Pump.fun, Jupiter Launch, etc. — a token launches, hype peaks, and then
        there's nowhere for serious traders to go. No derivatives market, no leverage, no shorts.
        The token either pumps or dumps with no way to express a directional view beyond spot.
      </P>

      <H2>The Solution</H2>
      <P>
        Float introduces <strong className="text-txt-0">Graduation Perps</strong> — a pipeline where
        tokens that hit critical mass on our launchpad automatically graduate into a full perpetual
        futures market.
      </P>

      <H3>How It Works</H3>
      <div className="my-6">
        <FlowStep
          step={1}
          title="Launch Phase"
          desc="A project launches their token on Float's integrated launchpad — bonding curve, fair launch, or seed round."
        />
        <FlowStep
          step={2}
          title="Metrics Gate"
          desc="Once a token hits graduation thresholds (e.g., $500K market cap, 1,000+ holders, sustained volume), it becomes eligible."
        />
        <FlowStep
          step={3}
          title="Perp Market Creation"
          desc="Float deploys a new perpetual market with a Prelaunch Oracle seeded from the spot price, initial AMM liquidity from protocol reserves, and conservative margin requirements that relax as the market matures."
        />
        <FlowStep
          step={4}
          title="Live Trading"
          desc="Traders can now go long or short with leverage on a token that was just a launchpad meme 48 hours ago."
          last
        />
      </div>

      <H2>Why This Matters</H2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <FeatureCard
          icon={Target}
          title="For Projects"
          desc="Your token gets a derivatives market — institutional-grade infrastructure — without begging a CEX for a listing."
        />
        <FeatureCard
          icon={TrendingUp}
          title="For Traders"
          desc="Short the overvalued hype tokens. Hedge your spot bags. Express any view with leverage."
        />
        <FeatureCard
          icon={Globe}
          title="For the Ecosystem"
          desc="Capital efficiency goes up. Price discovery improves. Float becomes the destination for every new Solana token."
        />
      </div>

      <Callout type="info">
        No other exchange offers a direct pipeline from token launch to leveraged perpetual trading.
      </Callout>
    </div>
  );
}

function OpenMarketMakingSection() {
  return (
    <div>
      <H1>Open Market Making</H1>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-bull/10 text-bull border border-bull/20">
          <Bot className="w-3 h-3" />
          Keeper Bot Access for Everyone
        </span>
      </div>

      <H2>The Problem</H2>
      <P>
        On centralized exchanges, market making is a closed club — you need millions in capital,
        a co-located server, and a relationship with the exchange. On most DEXs, the AMM does
        everything and regular users can't participate in the spread.
      </P>

      <H2>The Solution</H2>
      <P>
        Float opens up market making to anyone through our <strong className="text-txt-0">Keeper Bot system</strong>.
        Three specialized bots power the exchange, and anyone can run them to earn fees:
      </P>

      <div className="my-6 overflow-x-auto rounded-xl border border-drift-border/50 shadow-sm shadow-black/10">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-drift-surface/60 text-txt-2">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">Bot</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">Earnings</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-drift-border/30 hover:bg-drift-surface/20 transition-colors">
              <td className="px-4 py-3 font-semibold text-accent flex items-center gap-2"><Bot className="w-3.5 h-3.5" />Maker Bot</td>
              <td className="px-4 py-3 text-txt-1">Places resting limit orders on both sides of the book, providing liquidity and tightening spreads</td>
              <td className="px-4 py-3 text-bull font-medium">Maker rebates + revenue share</td>
            </tr>
            <tr className="border-t border-drift-border/30 hover:bg-drift-surface/20 transition-colors bg-drift-surface/[0.06]">
              <td className="px-4 py-3 font-semibold text-accent flex items-center gap-2"><Zap className="w-3.5 h-3.5" />Filler Bot</td>
              <td className="px-4 py-3 text-txt-1">Matches and executes incoming orders against the orderbook and AMM</td>
              <td className="px-4 py-3 text-bull font-medium">Filler incentive fees + revenue share</td>
            </tr>
            <tr className="border-t border-drift-border/30 hover:bg-drift-surface/20 transition-colors">
              <td className="px-4 py-3 font-semibold text-accent flex items-center gap-2"><Shield className="w-3.5 h-3.5" />Liquidator Bot</td>
              <td className="px-4 py-3 text-txt-1">Monitors under-collateralized positions and liquidates them to keep the system solvent</td>
              <td className="px-4 py-3 text-bull font-medium">Liquidation bonus + revenue share</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H3>How Users Participate</H3>
      <div className="my-6">
        <FlowStep step={1} title="Run a Bot" desc="Deploy one of our open-source keeper bots with your own capital. Configuration is straightforward: pick a market, set your risk parameters, point it at an RPC." />
        <FlowStep step={2} title="Earn Fees" desc="Every fill, every liquidation, every spread captured pays you directly in real-time." />
        <FlowStep step={3} title="Earn Revenue Share" desc="On top of direct fees, keepers earn a share of exchange revenue proportional to their contribution — so you profit from the exchange's overall success." last />
      </div>

      <Callout type="tip">
        More keepers = tighter spreads = better execution for traders = more volume = more fees for everyone. It's a positive-sum flywheel.
      </Callout>
    </div>
  );
}

function ArciumPrivacySection() {
  return (
    <div>
      <H1>Arcium Private Trades</H1>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <Lock className="w-3 h-3" />
          Optional · Powered by Arcium MPC
        </span>
      </div>

      <H2>The Problem</H2>
      <P>
        Every trade on Solana is public. Your entries, exits, and position sizes — all visible
        on-chain. MEV bots front-run you. Competitors see your strategy. Large traders can't build
        positions without moving the market against themselves.
      </P>

      <H2>The Solution</H2>
      <P>
        Float integrates <strong className="text-txt-0">Arcium's confidential computing network</strong> as
        an optional privacy layer for perpetual trades. When enabled, your order details are shielded
        from the public mempool while settlement remains fully on-chain.
      </P>

      <H3>Trade Flow</H3>
      <div className="my-6 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <FlowStep step={1} title="Submit Encrypted Order" desc="Trader submits an order with price, size, and direction encrypted. No public mempool exposure." />
        <FlowStep step={2} title="Secure Enclave Matching" desc="Arcium's MPC (Multi-Party Computation) nodes decrypt and match the order inside a secure enclave — no single node sees the full data." />
        <FlowStep step={3} title="On-chain Settlement" desc="The matched trade result is sent to the Float smart contract. Settlement hits Solana as normal." />
        <FlowStep step={4} title="Public Sees Result Only" desc="Observers see 'Position changed' — but not the order price, size, or direction that led to it." last />
      </div>

      <H2>Who Needs This?</H2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <FeatureCard
          icon={DollarSign}
          title="Whales"
          desc="Build large positions without signaling your intent to the entire market."
        />
        <FeatureCard
          icon={Eye}
          title="Funds & Desks"
          desc="Execute strategy without leaking alpha. Your PnL and positions stay private."
        />
        <FeatureCard
          icon={Shield}
          title="Anyone"
          desc="Toggle privacy on any trade. No special setup — just a switch in the UI."
        />
      </div>

      <Callout type="info">
        Arcium mode is fully optional. Standard trades work exactly like any other perps DEX — fast, transparent, on-chain. Privacy is a toggle, not a requirement.
      </Callout>
    </div>
  );
}

function RevenueSharingSection() {
  return (
    <div>
      <H1>Revenue Sharing</H1>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-yellow/10 text-yellow border border-yellow/20">
          <Coins className="w-3 h-3" />
          Direct Fee Distribution via Smart Contract
        </span>
      </div>

      <H2>The Problem</H2>
      <P>
        On most exchanges, users generate all the volume and the exchange keeps all the profit.
        Even exchanges with "governance tokens" rarely share actual revenue — you get voting rights
        on proposals nobody reads.
      </P>

      <H2>The Solution</H2>
      <P>
        Float distributes exchange revenue directly to participants via smart contract.
        No token to buy, no governance theater — the revenue generated from every trade
        is split and distributed on-chain, automatically.
      </P>

      <H2>Fee Split Model</H2>
      <P>Every trade on Float generates fees. Those fees are split three ways:</P>
      <div className="my-6 p-5 rounded-xl border border-drift-border/40 bg-drift-surface/10">
        <div className="text-[11px] text-txt-3 uppercase tracking-wider font-semibold mb-4">Example: $10 Trade Fee</div>
        <SplitRow label="Participants & Holders" pct="50%" color="bg-bull" desc="$5.00 — Distributed pro-rata to all participants automatically" />
        <SplitRow label="Protocol Treasury" pct="30%" color="bg-accent" desc="$3.00 — Operations, development, and growth" />
        <SplitRow label="Keeper Rewards" pct="20%" color="bg-yellow" desc="$2.00 — Maker, Filler, and Liquidator bots that powered the trade" />
      </div>

      <H3>How It Works</H3>
      <div className="my-6">
        <FlowStep step={1} title="Fee Collection" desc="Every trade's fee is collected by the Float program on-chain." />
        <FlowStep step={2} title="Automatic Split" desc="The smart contract splits fees into three buckets in real-time — no manual intervention, no multisig needed." />
        <FlowStep step={3} title="Holder Distribution" desc="The 50% holder share accrues in a reward pool, claimable anytime." />
        <FlowStep step={4} title="Claim or Compound" desc="Participants can claim their share at any time, or let it compound in the pool." last />
      </div>

      <H2>Earning Revenue</H2>
      <div className="my-6 overflow-x-auto rounded-xl border border-drift-border/50 shadow-sm shadow-black/10">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-drift-surface/60 text-txt-2">
              <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">Method</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">How</th>
              <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider">Who</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-drift-border/30 hover:bg-drift-surface/20 transition-colors">
              <td className="px-4 py-3 font-semibold text-accent flex items-center gap-2"><Bot className="w-3.5 h-3.5" />Keeping</td>
              <td className="px-4 py-3 text-txt-1">Run a Maker, Filler, or Liquidator bot — earn revenue proportional to your activity</td>
              <td className="px-4 py-3 text-txt-2">Bot operators, technical users</td>
            </tr>
            <tr className="border-t border-drift-border/30 hover:bg-drift-surface/20 transition-colors bg-drift-surface/[0.06]">
              <td className="px-4 py-3 font-semibold text-accent flex items-center gap-2"><Coins className="w-3.5 h-3.5" />Holding</td>
              <td className="px-4 py-3 text-txt-1">Participate in the exchange — earn a share of the 50% fee pool automatically</td>
              <td className="px-4 py-3 text-txt-2">Anyone, fully passive</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H2>The Flywheel</H2>
      <div className="my-6 p-5 rounded-xl border border-accent/20 bg-accent/[0.03]">
        <div className="flex flex-wrap items-center justify-center gap-3 text-[12px] font-medium text-txt-1">
          <span className="px-3 py-1.5 rounded-lg bg-drift-surface/40 border border-drift-border/30">More Keepers</span>
          <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-drift-surface/40 border border-drift-border/30">Better Execution</span>
          <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-drift-surface/40 border border-drift-border/30">More Traders</span>
          <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-drift-surface/40 border border-drift-border/30">More Fees</span>
          <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-drift-surface/40 border border-drift-border/30">More Revenue Shared</span>
          <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-accent">↻ Repeat</span>
        </div>
      </div>

      <H3>Smart Contract Guarantees</H3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
        <FeatureCard icon={Lock} title="Smart Contract Enforced" desc="Revenue splits are hardcoded in the program. No one can change the ratio or redirect funds." />
        <FeatureCard icon={GitBranch} title="On-chain Distribution" desc="Fee splits enforced by the program — not by a team multisig or a promise." />
        <FeatureCard icon={Eye} title="Fully Transparent" desc="Every fee, every split, every distribution is verifiable on-chain by anyone." />
        <FeatureCard icon={Zap} title="No Lock-ups" desc="Keepers receive revenue as they work. Participants receive fees as they accrue. No vesting." />
      </div>

      <Callout type="tip">
        Real yield — not emissions, not inflationary rewards, actual exchange revenue distributed directly to participants.
      </Callout>
    </div>
  );
}

function ComparisonSection() {
  const features = [
    { feature: 'Graduation Perps (Launch → Perp)', float: true, drift: false, jupiter: false, hyper: false, dydx: false },
    { feature: 'Open Keeper Market Making', float: true, drift: 'partial', jupiter: false, hyper: false, dydx: false },
    { feature: 'Optional Private Trades (Arcium)', float: true, drift: false, jupiter: false, hyper: false, dydx: false },
    { feature: 'Revenue-Sharing Equity Token', float: true, drift: false, jupiter: false, hyper: false, dydx: false },
    { feature: 'On-chain Fee Distribution', float: true, drift: false, jupiter: false, hyper: false, dydx: false },
    { feature: 'Permissionless Perp Listings', float: true, drift: false, jupiter: false, hyper: false, dydx: false },
  ];

  const check = (val: boolean | string) => {
    if (val === true) return <CheckCircle2 className="w-4 h-4 text-bull" />;
    if (val === 'partial') return <span className="text-[10px] text-yellow font-semibold">Partial</span>;
    return <span className="text-txt-3">—</span>;
  };

  return (
    <div>
      <H1>Feature Comparison</H1>
      <P>How Float stacks up against the biggest names in perps trading.</P>
      <div className="my-6 overflow-x-auto rounded-xl border border-drift-border/50 shadow-sm shadow-black/10">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-drift-surface/60 text-txt-2">
              <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider min-w-[200px]">Feature</th>
              <th className="text-center px-3 py-3 font-bold text-[11px] uppercase tracking-wider text-accent">Float</th>
              <th className="text-center px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Drift</th>
              <th className="text-center px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Jupiter</th>
              <th className="text-center px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">Hyperliquid</th>
              <th className="text-center px-3 py-3 font-semibold text-[11px] uppercase tracking-wider">dYdX</th>
            </tr>
          </thead>
          <tbody>
            {features.map((row, i) => (
              <tr key={i} className={`border-t border-drift-border/30 hover:bg-drift-surface/20 transition-colors ${i % 2 === 0 ? '' : 'bg-drift-surface/[0.06]'}`}>
                <td className="px-4 py-3 text-txt-1 font-medium">{row.feature}</td>
                <td className="px-3 py-3 text-center">{check(row.float)}</td>
                <td className="px-3 py-3 text-center">{check(row.drift)}</td>
                <td className="px-3 py-3 text-center">{check(row.jupiter)}</td>
                <td className="px-3 py-3 text-center">{check(row.hyper)}</td>
                <td className="px-3 py-3 text-center">{check(row.dydx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoadmapSection() {
  return (
    <div>
      <H1>Roadmap</H1>
      <P>Our phased approach to building the exchange that should already exist.</P>

      <div className="my-8">
        <RoadmapPhase
          phase="Phase 1"
          title="Foundation"
          target="Q1 2026"
          status="in-progress"
          items={[
            { text: 'Core perps exchange live on devnet', done: true },
            { text: 'Maker, Filler, Liquidator bots operational', done: true },
            { text: 'Frontend trading UI', done: true },
            { text: 'DLOB server & orderbook', done: true },
            { text: 'Oracle system & price feeds', done: true },
          ]}
        />
        <RoadmapPhase
          phase="Phase 2"
          title="Graduation Perps"
          target="Q2 2026"
          status="upcoming"
          items={[
            { text: 'Integrated token launchpad', done: false },
            { text: 'Bonding curve & fair launch mechanics', done: false },
            { text: 'Automated perp market creation pipeline', done: false },
            { text: 'Prelaunch oracle seeding from spot price', done: false },
            { text: 'Graduation threshold configuration', done: false },
          ]}
        />
        <RoadmapPhase
          phase="Phase 3"
          title="Revenue Sharing"
          target="Q2 2026"
          status="upcoming"
          items={[
            { text: 'Fee-split smart contract (50/30/20)', done: false },
            { text: 'Keeper reward distribution system', done: false },
            { text: 'Participant claim/compound interface', done: false },
            { text: 'Revenue dashboard & analytics', done: false },
          ]}
        />
        <RoadmapPhase
          phase="Phase 4"
          title="Arcium Integration"
          target="Q3 2026"
          status="upcoming"
          items={[
            { text: 'Arcium MPC network integration', done: false },
            { text: 'Encrypted order submission', done: false },
            { text: 'Private trade toggle in UI', done: false },
            { text: 'MEV-protected execution path', done: false },
          ]}
        />
        <RoadmapPhase
          phase="Phase 5"
          title="Mainnet Launch"
          target="Q3 2026"
          status="upcoming"
          items={[
            { text: 'Full mainnet deployment', done: false },
            { text: 'Open keeper onboarding', done: false },
            { text: 'Public revenue sharing launch', done: false },
            { text: 'Multi-market support', done: false },
          ]}
          last
        />
      </div>
    </div>
  );
}

function RoadmapPhase({
  phase,
  title,
  target,
  items,
  status,
  last,
}: {
  phase: string;
  title: string;
  target: string;
  items: { text: string; done: boolean }[];
  status: 'completed' | 'in-progress' | 'upcoming';
  last?: boolean;
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
    <div className="relative pl-10 pb-12 last:pb-0">
      {!last && <div className="absolute left-[13px] top-3 bottom-0 w-px bg-gradient-to-b from-drift-border to-transparent" />}
      <div className={`absolute left-[7px] top-1.5 w-[14px] h-[14px] rounded-full border-[2.5px] border-drift-bg z-10 ${dotColor[status]}`} />

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-[11px] font-bold text-txt-3 uppercase tracking-widest">{phase}</span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle[status]}`}>
          {status === 'completed' ? 'Completed' : status === 'in-progress' ? 'In Progress' : 'Upcoming'}
        </span>
        <span className="text-[10px] text-txt-3 ml-auto">{target}</span>
      </div>

      <h3 className="text-base font-semibold text-txt-0 mb-2">{title}</h3>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 rounded-full bg-drift-surface overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor[status]}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] font-mono text-txt-2 shrink-0">{doneCount}/{items.length}</span>
      </div>

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

/* ═══════════════════════════════════════════════════
   SECTION CONTENT MAP
   ═══════════════════════════════════════════════════ */

const sectionContent: Record<SectionId, React.ReactNode> = {
  overview: <OverviewSection />,
  'graduation-perps': <GraduationPerpsSection />,
  'open-market-making': <OpenMarketMakingSection />,
  'arcium-privacy': <ArciumPrivacySection />,
  'revenue-sharing': <RevenueSharingSection />,
  comparison: <ComparisonSection />,
  roadmap: <RoadmapSection />,
};

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export const FeaturesPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SIDEBAR.map((g) => [g.title, true])),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleGroup = (title: string) =>
    setOpenGroups((p) => ({ ...p, [title]: !p[title] }));

  const navigateTo = (id: SectionId) => {
    setActiveSection(id);
    setMobileSidebarOpen(false);
    document.getElementById('features-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentIdx = allSections.findIndex((s) => s.id === activeSection);
  const prev = currentIdx > 0 ? allSections[currentIdx - 1] : null;
  const next = currentIdx < allSections.length - 1 ? allSections[currentIdx + 1] : null;

  /* Sidebar nav (shared between desktop & mobile drawer) */
  const sidebarNav = (
    <div className="py-3 space-y-0.5">
      {SIDEBAR.map((group) => {
        const GroupIcon = group.icon;
        const open = openGroups[group.title] ?? true;
        return (
          <div key={group.title}>
            <button
              onClick={() => toggleGroup(group.title)}
              className="w-full flex items-center gap-2 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-wider text-txt-2 hover:text-txt-0 transition-colors"
            >
              <GroupIcon className="w-3.5 h-3.5 text-txt-3" />
              <span className="flex-1 text-left">{group.title}</span>
              {open ? <ChevronDown className="w-3 h-3 text-txt-3" /> : <ChevronRight className="w-3 h-3 text-txt-3" />}
            </button>
            {open && (
              <div className="ml-4 border-l border-drift-border/30 space-y-px">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateTo(item.id)}
                    className={`w-full text-left pl-5 pr-4 py-1.5 text-[12px] transition-all duration-150 rounded-r-md ${
                      activeSection === item.id
                        ? 'text-accent font-medium bg-accent/[0.06] border-l-2 border-accent -ml-px'
                        : 'text-txt-2 hover:text-txt-0 hover:bg-drift-surface/30'
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

  const sidebarFooter = (
    <div className="p-4 border-t border-drift-border/30">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[12px] text-txt-2 hover:text-txt-0 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Trading
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-drift-bg">
      {/* ═══ Desktop sidebar (hidden on mobile) ═══ */}
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-drift-border bg-drift-panel/40 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-drift-border shrink-0">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-txt-0">Upcoming Features</span>
        </div>
        <nav className="flex-1 overflow-y-auto">{sidebarNav}</nav>
        {sidebarFooter}
      </aside>

      {/* ═══ Mobile sidebar drawer ═══ */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-[280px] z-50 flex flex-col bg-drift-panel border-r border-drift-border lg:hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-drift-border shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-txt-0">Features</span>
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
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-drift-border bg-drift-panel/50 shrink-0 lg:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-drift-surface text-txt-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xs text-txt-2 truncate">
            {allSections.find((s) => s.id === activeSection)?.label || 'Features'}
          </span>
        </div>

        <div id="features-content" className="flex-1 w-full overflow-y-auto overflow-x-hidden">
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

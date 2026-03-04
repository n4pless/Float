# Backpack Exchange Trading UI — Complete Design System Prompt

Recreate a professional crypto perpetual futures trading interface modeled after Backpack Exchange (backpack.exchange). Follow every specification below exactly. The result should feel like a dark, dense, professional-grade trading terminal.

---

## GLOBAL DESIGN TOKENS

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-page` | `#0D0D12` | Page/app background — near-black with a slight cool blue undertone |
| `--bg-surface` | `#14141B` | Cards, panels, sidebars — one step lighter than page |
| `--bg-elevated` | `#1C1C27` | Hover states, active tabs, input fields |
| `--bg-input` | `#1A1A24` | Input fields, dropdowns |
| `--border-subtle` | `#232334` | Panel dividers, card borders — barely visible |
| `--border-active` | `#3A3A52` | Active/focused borders |
| `--text-primary` | `#E8E8ED` | Primary text, numbers, headings — off-white |
| `--text-secondary` | `#6B6B80` | Labels, captions, muted info — medium gray with cool tint |
| `--text-muted` | `#4A4A5E` | Disabled text, timestamps |
| `--green-primary` | `#00D26A` | Buy button, positive P&L, bid prices, green candles |
| `--green-bg` | `#00D26A1A` | Green tinted row backgrounds in orderbook (10% opacity) |
| `--red-primary` | `#FF4D6A` | Sell button, negative P&L, ask prices, red candles |
| `--red-bg` | `#FF4D6A1A` | Red tinted row backgrounds in orderbook (10% opacity) |
| `--blue-accent` | `#4C8BF5` | Links, slider thumb, active indicators |
| `--yellow-badge` | `#F0B90B` | Badges like leverage pill "10x" |

### Typography

| Element | Font | Weight | Size | Color |
|---------|------|--------|------|-------|
| App font stack | `"Inter", -apple-system, "Segoe UI", sans-serif` | — | — | — |
| Nav links | Inter | 500 (medium) | 14px | `--text-secondary`, white on hover/active |
| Market pair (header) | Inter | 600 (semibold) | 16px | `--text-primary` |
| Live price (header) | Inter | 600 | 20px | `--green-primary` (if up) or `--red-primary` (if down) |
| Stat labels ("24H High") | Inter | 400 | 11px | `--text-secondary`, uppercase, letter-spacing 0.5px |
| Stat values | Inter | 500 | 13px | `--text-primary` |
| Orderbook prices | `"IBM Plex Mono", "SF Mono", monospace` | 400 | 12px | `--green-primary` for bids, `--red-primary` for asks |
| Orderbook quantities | Monospace | 400 | 12px | `--text-primary` |
| Section headers ("Book", "Trades") | Inter | 600 | 13px | `--text-primary` |
| Tab labels (Chart/Depth/Margin) | Inter | 500 | 13px | `--text-secondary`, white when active |
| Input values | Monospace | 400 | 14px | `--text-primary` |
| Input labels | Inter | 400 | 12px | `--text-secondary` |
| Button text | Inter | 600 | 14px | White |
| Bottom tab row (Balances, Positions...) | Inter | 500 | 13px | `--text-secondary`, white when active with underline |
| Ticker bar (bottom) | Monospace | 400 | 11px | `--text-secondary` for names, `--green-primary` for positive % |

### Spacing & Sizing

- Base spacing unit: 4px grid. All spacing uses multiples: 4, 8, 12, 16, 20, 24, 32px.
- Panel gaps: 1px solid `--border-subtle` borders separate all major panels (not gaps/margins).
- Internal panel padding: 12px on all sides.
- Input fields: height 36px, padding 8px 12px, border-radius 4px, background `--bg-input`, border 1px `--border-subtle`.
- Buttons: height 40px, border-radius 6px, no border, full-width within their container.
- Border radius: 0px on panels (sharp edges), 4px on inputs, 6px on buttons, 12px on badges/pills.

---

## PAGE LAYOUT (4-Panel Grid)

The entire viewport is divided into a fixed grid. No scrolling on the main page — each panel scrolls independently if needed.

```
┌──────────────────────────────────────────────────────────────────┐
│  TOP NAV BAR (full width, 48px tall)                             │
├──────────────────────┬──────────┬──────────┬─────────────────────┤
│  MARKET HEADER BAR (full width, 48px tall)                       │
├──────────────────────┬──────────┬──────────┬─────────────────────┤
│                      │          │          │                     │
│   CHART PANEL        │  ORDER   │  TRADES  │   ORDER ENTRY       │
│   (flex: ~52%)       │  BOOK    │  FEED    │   PANEL             │
│                      │  (~18%)  │  (~12%)  │   (fixed ~280px)    │
│   Contains:          │          │          │                     │
│   - TradingView      │          │          │                     │
│     chart            │          │          │                     │
│   - Drawing tools    │          │          │                     │
│     sidebar (left)   │          │          │                     │
│                      │          │          │                     │
├──────────────────────┴──────────┴──────────┴─────────────────────┤
│  BOTTOM PANEL: Tabs — Balances | Positions | Open Orders | etc.  │
├──────────────────────────────────────────────────────────────────┤
│  TICKER BAR (full width, 28px, scrolling)                        │
└──────────────────────────────────────────────────────────────────┘
```

### Width Ratios
- Chart panel: ~52% of viewport
- Orderbook: ~18%
- Recent trades: ~12%
- Order entry: fixed 280px right column

### Panel Borders
All panels are separated by 1px `--border-subtle` lines. No gaps, no shadows, no rounded corners on panels. The entire layout feels like one seamless terminal.

---

## 1. TOP NAVIGATION BAR

- Height: 48px. Background: `--bg-surface`. Bottom border: 1px `--border-subtle`.
- Left side: Logo (red circular icon + "Backpack" in white, 16px semibold). Then nav links: **Spot**, **Futures**, **Lend**, **Vault**, **More** (with dropdown chevron). Spacing between links: 24px. Active link: white text. Inactive: `--text-secondary`.
- Center: Search bar — pill-shaped input, ~240px wide, `--bg-elevated` background, placeholder "Search markets" with magnifying glass icon left, keyboard shortcut hint "/" on the right as a small bordered pill.
- Right side: "Log in" text link (`--text-secondary`) + "Sign up" button (white background, black text, 32px height, border-radius 6px, padding 8px 16px).

---

## 2. MARKET HEADER BAR

- Height: 48px. Background: `--bg-surface`. Bottom border: 1px `--border-subtle`.
- Left cluster: Token icon (SOL logo, 24px circle) + pair name **"SOL/USD"** (16px semibold white) + leverage badge **"10x"** (tiny pill, `--yellow-badge` background, black text, font 10px bold, border-radius 10px, padding 2px 6px) + dropdown chevron + current price **"89.69"** in 20px semibold `--green-primary`.
- Right cluster: Four stat blocks in a horizontal row, each with label on top (11px uppercase `--text-secondary`) and value below (13px `--text-primary`):
  - "24H Change" → "+5.77 +6.87%" in `--green-primary`
  - "24H High" → "91.39"
  - "24H Low" → "82.49"
  - "24H Volume (USD)" → "7,456,684.29"
- Spacing between stat blocks: 32px.

---

## 3. CHART PANEL (Left)

- Sub-tabs at top: **Chart** (active, white text with subtle bottom border), **Depth**, **Margin**, **Market Info** — all 13px medium weight, 32px tab height, separated by 16px.
- Below tabs: Toolbar row — timeframe selector ("5m" active in bordered pill), drawing tool icons, indicator dropdowns ("Indicators", "OL", "TE"), chart setting icons (crosshair, settings gear, camera, expand). All icons 18px, `--text-secondary`, white on hover.
- Chart area: TradingView-style candlestick chart. Black background (`--bg-page`). Green candles (`--green-primary` body), red candles (`--red-primary` body). Thin wicks. Price axis on right with horizontal grid lines at major levels (very faint, `#1A1A24`). Current price shown as a highlighted label on the right axis — green pill with white text.
- Volume bars at bottom of chart: small bars, green for up candles, red for down, very low opacity (~30%).
- Left sidebar: Vertical icon toolbar for drawing tools (trendline, horizontal line, fib, rectangle, text, etc.). Icons 20px, spaced 8px apart, `--text-secondary`.
- Bottom of chart: Time axis. Timeframe shortcuts: "All 1y 6m 3m 1m 5d 1d" as small text buttons. Timezone display. "% log auto" toggle buttons.

---

## 4. ORDERBOOK PANEL (Center-Left)

- Header: "Book" tab active (13px semibold white), with three small icon buttons to toggle view mode (both sides, bids only, asks only) — 16px square icons.
- Increment selector: "- 0.01 +" stepper control in top right of panel.
- Column headers: "Price (USD)", "Size (SOL)", "Total (SOL)" — 11px `--text-secondary`, right-aligned.
- Rows: ~15 visible asks (red) on top, spread in the middle, ~15 bids (green) on bottom.
  - Price column: monospace 12px, `--red-primary` for asks, `--green-primary` for bids.
  - Size and Total columns: monospace 12px, `--text-primary`.
  - Row height: 22px. No visible row borders.
  - **Depth visualization**: Each row has a horizontal fill bar behind the numbers. Asks get a `--red-bg` fill from right to left proportional to cumulative depth. Bids get a `--green-bg` fill from right to left. This is the signature visual element — the colored bars must be clearly visible but not overpower the text.
- Spread row (center): Current price in large text (20px semibold), `--green-primary` or `--red-primary` depending on last direction. Shows mid-market or last traded price.
- Bottom: Bid/ask percentage bar — a full-width bar split green (left, "53%") and red (right, "47%") showing order weight.

---

## 5. RECENT TRADES PANEL (Center-Right)

- Header: "Trades" tab (13px semibold).
- Column headers: "Price (USD)", "Qty (SOL)", then timestamp — 11px `--text-secondary`.
- Rows: Monospace 12px. Price colored green or red based on trade direction. Quantity in `--text-primary`. Timestamp in `--text-muted` (format "HH:MM:SS").
- Row height: 22px. Newest trade at top. Panel scrolls independently.

---

## 6. ORDER ENTRY PANEL (Right Column, Fixed 280px)

- **Buy/Sell Toggle**: Two buttons spanning full width. "Buy" on left — `--green-primary` background, white text, active state. "Sell" on right — when active becomes `--red-primary` background. Inactive button is `--bg-elevated` with `--text-secondary`. Height: 40px each, border-radius 6px, no gap between them (they share a middle edge).
- **Order Type Tabs**: Below buy/sell — "Limit" (active, underlined or highlighted), "Market", "Conditional" as text tabs + dropdown chevron on Conditional. 13px medium weight, spaced 16px apart.
- **Balance Display**: Right-aligned small text showing "Balance" label + amount. 12px `--text-secondary`.
- **Price Input**:
  - Label "Price" top-left, "Mid" and "BBO" as small clickable text buttons top-right (12px `--text-secondary`).
  - Input field: full width, 36px height, `--bg-input`, monospace font, right-aligned value. Small green USDC circle icon on the right edge of the input.
  - Value displayed: "89.77" in 14px monospace.
- **Quantity Input**:
  - Label "Quantity" top-left.
  - Input field: same style, with "0" placeholder.
  - Below: A slider track (full width, 4px height, `--bg-elevated` track, `--blue-accent` filled portion, `--blue-accent` circular thumb 12px). Labels "0" on left and "100%" on right in 11px `--text-muted`.
- **Order Value**:
  - Label "Order value" top-left.
  - Input field: same style, green USDC icon right, value "0".
- **Action Buttons**:
  - "Sign up to trade" — full width, 40px, `--bg-elevated` background, white text, border-radius 6px.
  - "Log in to trade" — full width, 40px, transparent background, white text, subtle border.
- **Post Only / IOC**: Two small checkbox options below. 12px `--text-secondary`. "Post Only" and "IOC" as labels with small square checkboxes.
- **Market Reputation**: Section at bottom. "Market Reputation" label (12px semibold). Token icon + "SOL" + "Neutral" badge (gray pill). Below: a level bar — "Level 1 $0" on left, "Level 2 $20" on right, with a progress indicator.

---

## 7. BOTTOM PANEL (Tabbed Data)

- Tab bar: Full width, 40px height, `--bg-surface`. Tabs: **Balances** (active, white text, subtle bottom highlight), **Positions**, **Open Orders**, **Borrows**, **TWAP**, **Fill History**, **Order History**, **Position History**, **Funding History**. 13px medium weight, spaced 20px apart. Active tab has a 2px `--green-primary` or white bottom border.
- Content area: Table format below (not visible in current screenshot since no positions are open). Row height 36px, alternating row backgrounds between `--bg-surface` and `--bg-page` for readability.

---

## 8. BOTTOM TICKER BAR

- Height: 28px. Background: `--bg-surface`. Top border: 1px `--border-subtle`.
- Left: Fire emoji icon + "Top Movers" label in 11px `--text-secondary`.
- Scrolling content: Horizontal auto-scrolling marquee of trading pairs. Format: "PAIR-PERP $PRICE (CHANGE%)" — pair name in `--text-secondary`, price in `--text-primary`, change percentage in `--green-primary` for positive. Monospace font 11px. Pairs separated by 24px spacing. Smooth continuous scroll left animation.

---

## INTERACTION STATES

- **Hover on orderbook row**: Row background brightens slightly to `--bg-elevated`. Cumulative depth visualization shows up to that price level.
- **Hover on nav links**: Color transitions from `--text-secondary` to white, 150ms ease.
- **Active input**: Border changes to `--border-active`, subtle box-shadow: `0 0 0 1px --blue-accent` at 20% opacity.
- **Button hover**: Brightness filter 1.1 on green/red buttons. Background change on neutral buttons.
- **Tab transitions**: Active tab gets bottom border, color change — transition 150ms.

---

## CRITICAL DESIGN RULES

1. **No rounded panel corners** — The terminal feel comes from hard 0px radius on all panel edges. Only inputs (4px), buttons (6px), and badges (12px) get rounding.
2. **Monospace for all numbers** — Every price, quantity, percentage, and amount uses monospace font. This keeps columns aligned and feels professional.
3. **1px borders, never shadows** — Panels are separated by hairline borders, never drop shadows or elevation effects.
4. **Color discipline** — Green ONLY for buys/bids/positive. Red ONLY for sells/asks/negative. Blue ONLY for interactive accents (slider, links). Yellow ONLY for badges. Never mix these semantic meanings.
5. **Dense but readable** — Row heights are 22px in orderbook, 36px in data tables. Padding is minimal (8-12px). Every pixel is used for information.
6. **Independent panel scrolling** — Each panel (chart, orderbook, trades, bottom table) scrolls independently. The overall page never scrolls.
7. **Dark-on-dark layering** — Background colors step up in brightness: page → surface → elevated → input. The differences are subtle (only 5-8% lightness increments) creating depth without contrast.

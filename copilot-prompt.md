# Copilot Prompt — Redesign Prediction Market UI (PancakeSwap Style)

Redesign my SOL (Solana) prediction market page at `/prediction` to closely match the UI/UX of PancakeSwap's BNB Prediction Market (https://pancakeswap.finance/prediction?token=BNB). Here is exactly what I need:

---

## 1. Overall Layout & Theme

- **Dark theme** with a deep purple/dark blue gradient background (similar to `#1E1D2B` → `#27262C`).
- The main content area is a **horizontal scrollable card carousel** showing prediction rounds flowing left to right.
- Cards represent rounds in a timeline: Expired → Expired → **LIVE** → **Next** → Later → Later.
- The LIVE round should be visually centred/prominent. Users can scroll left to see past rounds and right to see upcoming ones.
- Use a clean sans-serif font (Inter, DM Sans, or similar).

## 2. Top Bar / Header

- **Left side**: A live price ticker showing the current SOL/USD price with the Solana logo, updating in real-time. If you support multiple tokens, show them side by side (e.g., SOL, BTC, ETH) with small logos and live prices.
- **Centre**: Navigation arrows (left/right chevrons) to scroll between rounds, with a small decorative icon between them.
- **Right side**: A countdown timer showing time remaining in the current LIVE round (format: `MM:SS` with a `5m` label). Next to it, icon buttons for: History (clock/reverse icon), Help (?), Leaderboard (trophy), and Settings (gear).

## 3. Round Cards — General Structure

Each round card should be a **dark card** (`#1E1D2B` or similar) with rounded corners (`border-radius: 16px`), a subtle border, and consistent sizing (roughly 280–320px wide). Every card shows:

- **Top row**: Round status label on the left (e.g., "Expired", "LIVE", "Next", "Later") and the round number on the right (e.g., `#12345`) in a muted colour.
- **Centre section**: The outcome or action area (varies by state — see below).
- **Bottom section**: Payout multipliers for both UP and DOWN.

## 4. Card States — Detailed Specs

### a) Expired Cards
- Muted/dimmed appearance (lower opacity or desaturated).
- Show the **winning direction** in a coloured banner:
  - **UP** = teal/green banner (`#31D0AA`) with text "UP" and the payout multiplier (e.g., "2.13x Payout").
  - **DOWN** = pink/magenta banner (`#ED4B9E`) with the same format.
- Below the banner, show:
  - `CLOSED PRICE: $XXX.XXXX` (large, in the winning direction's colour).
  - A small badge showing the price delta (e.g., `↑ $0.2668` in green or `↓ $-0.2448` in pink).
  - `Locked Price: $XXX.XXXX` (smaller, muted text).
  - `Prize Pool: X.XXXX SOL` (smaller, muted text).
- At the very bottom, show the losing direction's payout multiplier in muted text (e.g., "1.89x Payout DOWN").
- If the user participated, show their P&L on the card (green for profit, pink for loss).

### b) LIVE Card (Active Round)
- **Highlighted border**: A glowing blue/purple animated border or a brighter border colour to make it stand out from all other cards.
- Status label: A green dot + "LIVE" text in bold with the round number.
- Show the winning direction banner (UP or DOWN) based on current price vs locked price.
- Centre area:
  - `LAST PRICE` label.
  - The current SOL price in **large bold text** updating in real-time.
  - A delta badge showing how much the price has moved since lock (e.g., `↓ $-0.0907` in pink).
- Below:
  - `Locked Price: $XXX.XXXX`
  - `Prize Pool: X.XXXX SOL`
- Bottom: Both payout multipliers (UP payout and DOWN payout) in their respective colours.
- **No action buttons** — this card is view-only.

### c) Next Card (Accepting Bets)
- Status label: A pulsing circle + "Next" text with the round number.
- Show the current leading direction banner (UP or DOWN) with payout multiplier.
- Centre area:
  - `Prize Pool: X.XXXX SOL`
- Two large action buttons stacked vertically:
  - **"Enter UP"** — teal/green background (`#31D0AA`), white text, rounded, full-width.
  - **"Enter DOWN"** — pink/magenta background (`#ED4B9E`), white text, rounded, full-width.
- Bottom: Both payout multipliers.

### d) Later Cards
- Very dark/muted appearance, almost greyed out.
- Status label: A grey circle + "Later" text with the round number.
- Show "UP" and "DOWN" text in muted grey.
- Centre shows: `Entry starts ~XX:XX` countdown.
- No action buttons, no price data.

## 5. Colour System

| Element | Colour |
|---|---|
| Background | `#27262C` to `#1E1D2B` gradient |
| Card background | `#353547` or `#1E1D2B` |
| UP / Bullish | `#31D0AA` (teal/green) |
| DOWN / Bearish | `#ED4B9E` (pink/magenta) |
| LIVE card border | `#7645D9` (purple glow) |
| Muted text | `#8C8CA1` |
| Primary text | `#F4EEFF` |
| Price positive delta | `#31D0AA` |
| Price negative delta | `#ED4B9E` |

## 6. Bottom Bar

- A toggle switch or tab bar at the bottom-left to switch between a "TradingView Chart" and a price oracle chart (e.g., "Pyth Chart" or "Switchboard Chart" — whatever oracle your Solana app uses).
- Bottom-right: A trust badge like "Market Data — SECURED WITH PYTH" (or your oracle provider) with their logo.

## 7. Interactions & Animations

- Cards should have a smooth horizontal scroll/swipe with snap-to-card behaviour.
- The LIVE card border should have a subtle pulse or glow animation.
- Price updates should have a brief flash/highlight animation when the value changes.
- Payout multipliers should update smoothly as the prize pool changes.
- The "Enter UP" and "Enter DOWN" buttons should have hover states (slight brightness increase).
- The countdown timer should tick down smoothly.

## 8. Responsive Behaviour

- On desktop: Show 4–5 cards visible at once with horizontal scroll.
- On mobile: Show 1 card at a time with swipe navigation and dot indicators.
- The top bar should collapse into a compact layout on mobile.

## 9. Important UX Details

- The carousel should auto-scroll to keep the LIVE round in view when a new round starts.
- When a round transitions (Next → LIVE, LIVE → Expired), animate the card state change.
- Show a brief "Calculating..." state between rounds.
- If the user has placed a bet, show a small "ENTERED" badge on the relevant card.
- Past rounds with uncollected winnings should show a "Collect Winnings" button.

## 10. Tech Notes

- This is for a **Solana-based prediction market** — use SOL instead of BNB for all currency displays.
- Prices come from a Solana oracle (Pyth Network or Switchboard). Replace all references to Chainlink with the appropriate Solana oracle.
- Wallet connection is via Solana wallets (Phantom, Solflare, etc.) — not MetaMask.
- Keep all existing smart contract / program integration logic, just restyle the frontend.

---

**Reference**: PancakeSwap Prediction Market at https://pancakeswap.finance/prediction?token=BNB — match this visual style as closely as possible while adapting it for Solana.

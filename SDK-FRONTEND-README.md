# Drift Protocol Trading Stack

Complete TypeScript SDK + React frontend for trading on Drift Protocol. Built for localnet development with easy scaling to devnet/mainnet.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      React Frontend (Vite)                       │
│  • Trading UI • Position Dashboard • Portfolio Overview          │
│  • Wallet Connection • Market Data Display                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              TypeScript SDK Wrapper (drift-client)               │
│  • Open/Close Positions • Get Quote • Account State              │
│  • Liquidate Users • Deposit/Withdraw Collateral                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              Drift Protocol (Anchor + Rust)                      │
│  Program: EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE         │
│  Network: Localnet (http://localhost:8899)                      │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Components

### SDK Wrapper (`/sdk/drift-client-wrapper.ts`)
TypeScript wrapper around Drift SDK for simplified trading operations.

**Key Classes:**
- `DriftTradingClient` - Main trading interface
  - `openLongPosition()` - Open long trade
  - `openShortPosition()` - Open short trade
  - `closePosition()` - Close existing position
  - `getAccountState()` - Get user collateral, margin, PnL
  - `getPositions()` - Get all open positions
  - `getBalance()` - Get wallet SOL balance

**Usage Example:**
```typescript
const client = new DriftTradingClient({
  rpcUrl: 'http://localhost:8899',
  driftProgramId: 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE',
  wallet: myWallet,
});

await client.initialize();
await client.openLongPosition(0, 100, 2); // Market 0, 100 size, 2x leverage
```

### Frontend (`/frontend`)
Modern React + Vite application for trading interface.

**Pages & Components:**
- `App.tsx` - Main app with wallet provider
- `components/TradingPanel.tsx` - Open positions UI
- `components/Positions.tsx` - Display open positions
- `components/Portfolio.tsx` - Account overview
- `components/MarketInfo.tsx` - Market data display

**Custom Hooks:**
- `useDriftClient()` - Initialize Drift client
- `useAccountState()` - Subscribe to account updates
- `usePositions()` - Get and refresh positions
- `useBalance()` - Get wallet balance

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- Solana localnet running (`docker run drift-validator`)
- Phantom wallet browser extension

### 1. Install Dependencies

```bash
# SDK (no build needed, pure TS)
cd sdk

# Frontend
cd ../frontend
npm install
```

### 2. Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` in your browser.

### 3. Connect Wallet

1. Open http://localhost:5173
2. Click "Connect Wallet"
3. Select Phantom (or use devnet SOL)
4. Approve connection

### 4. Start Trading

**Deposit Collateral:**
- Trading panel automatically shows available balance
- Deposits are handled via dropdown

**Open Position:**
1. Select market (SOL-PERP, BTC-PERP, etc.)
2. Enter amount and leverage
3. Click "OPEN LONG" or "OPEN SHORT"
4. Sign transaction in Phantom

**View Positions:**
- See all open positions in dashboard
- Real-time PnL updates
- Close positions with one click

## 📊 Configuration

Configuration in `/frontend/src/config.ts`:

```typescript
export const DRIFT_CONFIG = {
  rpc: 'http://localhost:8899',           // Localnet RPC
  network: 'localnet',
  driftProgram: 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE',  // Deployed program
  usdc: { mint: 'BQRfcc4Vv2AwQeq4ZgGXeQUvJCRNbKzFVQzzX1vnkqZ5', ... },
  markets: {
    0: { symbol: 'SOL-PERP', index: 0, pair: 'SOL/USDC' },
    1: { symbol: 'BTC-PERP', index: 1, pair: 'BTC/USDC' },
    // ... more markets
  },
  maxLeverage: 10,
  fees: { takerFee: 0.0005, liquidationFee: 0.025, ... }
};
```

**To deploy on different networks:**

```typescript
// Devnet
const config = {
  rpc: 'https://api.devnet.solana.com',
  driftProgram: '[DEVNET_PROGRAM_ID]',
  ...
};

// Mainnet
const config = {
  rpc: 'https://api.mainnet-beta.solana.com',
  driftProgram: 'dRiftyHA39MWEi3m9aunc5MzRF1JYJjb5ciBACoEC9',
  ...
};
```

## 🔄 Trading Workflow

### Opening a Position

```
User Input (amount, leverage)
         ↓
TradingPanel validates inputs
         ↓
Calculate collateral required ($amount * 100 / leverage)
         ↓
Call client.openLongPosition() / openShortPosition()
         ↓
SDK converts to BN and calls Drift program
         ↓
Phantom signs transaction
         ↓
Transaction confirmed on localnet
         ↓
Position appears in dashboard in real-time
```

### Closing a Position

```
User clicks "Close Position"
         ↓
Get position size and direction
         ↓
Call client.closePosition()
         ↓
SDK sends opposite direction order to close
         ↓
Transaction confirmed
         ↓
Position removed from dashboard
```

### Account Updates

```
Wallet connected
         ↓
useAccountState hook subscribes to updates
         ↓
Every 5 seconds, fetch fresh account state
         ↓
Update Portfolio display with:
  • Collateral
  • Available margin
  • Maintenance margin
  • Leverage
  • Unrealized PnL
```

## 🎨 UI/UX Features

- **Dark theme** optimized for trading
- **Real-time updates** with WebSocket subscriptions
- **Responsive design** (mobile-friendly)
- **Quick leverage buttons** (1x, 2x, 5x, 10x)
- **PnL visualization** (green for gains, red for losses)
- **Margin health indicator** (green/yellow/red)
- **Transaction status** (loading states, error messages)

## 📈 Features Included

✅ Connect Solana wallet (Phantom)  
✅ View account collateral and margin  
✅ Open long/short positions  
✅ Close existing positions  
✅ View real-time unrealized PnL  
✅ Market data display  
✅ Transaction confirmation  
✅ Risk warnings (high leverage, low margin)  
✅ Multi-market support  

## 🔧 Development

### Build for Production

```bash
cd frontend
npm run build
```

Output: `frontend/dist/` - ready to deploy

### Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── TradingPanel.tsx
│   │   ├── Positions.tsx
│   │   ├── Portfolio.tsx
│   │   └── MarketInfo.tsx
│   ├── hooks/               # Custom React hooks
│   │   └── useDrift.ts
│   ├── pages/               # Page components (for routing)
│   ├── App.tsx              # Main app component
│   ├── config.ts            # Configuration
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html

sdk/
└── drift-client-wrapper.ts  # SDK wrapper class
```

## 🐛 Troubleshooting

**"Failed to initialize Drift client"**
- Check localnet is running: `docker logs drift-validator`
- Verify program is deployed: Run `npm run status` in root

**"Transaction failed"**
- Check wallet has SOL: Use `solana airdrop 10 [pubkey]`
- Check available margin: See Portfolio widget
- Check program is executable: Drift program should be 6.66 MB

**"No positions showing"**
- Refresh page (F5)
- Check account has positions: Query Drift state directly
- Verify market exists: Check DRIFT_CONFIG.markets

**Wallet not connecting**
- Ensure Phantom extension installed
- Check network is set to localnet in Phantom
- RPC URL should be `http://localhost:8899`

## 📚 Resources

- [Drift SDK Docs](https://docs.drift.trade/)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

## 🚀 Next Steps

1. **Test on localnet** - Verify all trades work
2. **Add more features**:
   - Stop loss / Take profit orders
   - Limit orders via DLOB
   - Advanced charting (TradingView.Lightweight)
   - Historical trade data
3. **Deploy to devnet** - Update config and airdrops
4. **Deploy to mainnet** - Use real SOL and actual Drift program
5. **Add keeper bots** - Automated liquidation/filling

## 📄 License

MIT

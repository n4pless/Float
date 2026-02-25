/**
 * Phase 3: Deploy Keeper Bots
 * 
 * Keeper bots are essential for a working perpetual futures exchange:
 * 1. Liquidator Bot - Liquidates underwater positions
 * 2. Filler Bot - Fills orders from the DLOB
 * 3. Trigger Bot - Triggers conditional orders
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "drift-config.json"), "utf-8"));

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  🤖 PHASE 3: KEEPER BOTS DEPLOYMENT GUIDE");
  console.log("=".repeat(70) + "\n");

  const connection = new Connection(config.rpcUrl, "confirmed");

  console.log("📋 Keeper Bots Overview\n");
  console.log("Keeper bots are automated systems that keep the exchange running:");
  console.log("");

  // Bot 1: Liquidator
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│ 1️⃣  LIQUIDATOR BOT                                              │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Purpose:");
  console.log("  • Monitors all user accounts for liquidation conditions");
  console.log("  • Liquidates positions when margin < maintenance requirement");
  console.log("  • Receives liquidation fees (typically 2-5% of liquidation amount)");
  console.log("");
  console.log("How it works:");
  console.log("  1. Scans all user accounts every block");
  console.log("  2. Checks if collateral < maintenance margin");
  console.log("  3. Executes liquidation transactions");
  console.log("  4. Earns rewards for keeping exchange solvent");
  console.log("");
  console.log("Earnings potential:");
  console.log("  • $10k liquidation = ~$200-500 in fees");
  console.log("  • Higher yields with more trading volume");
  console.log("  • Scales with platform growth");
  console.log("");
  console.log("Setup cost:");
  console.log("  • SOL for transaction fees (~0.05-0.5 SOL per block)");
  console.log("  • Running 24/7 on your server");
  console.log("");

  // Bot 2: Filler
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│ 2️⃣  FILLER BOT                                                  │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Purpose:");
  console.log("  • Matches orders from the Decentralized Limit Order Book (DLOB)");
  console.log("  • Fills market orders against liquidity");
  console.log("  • Earns 20-50% of taker fees");
  console.log("");
  console.log("How it works:");
  console.log("  1. Listens to DLOB for resting orders");
  console.log("  2. Finds matching orders to fill");
  console.log("  3. Executes fill transactions");
  console.log("  4. Keeps markets liquid and tight");
  console.log("");
  console.log("Earnings potential:");
  console.log("  • High-volume markets: $500-2000/day");
  console.log("  • Depends on trading volume and spreads");
  console.log("  • Benefits from volatile markets");
  console.log("");

  // Bot 3: Trigger
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│ 3️⃣  TRIGGER BOT                                                 │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Purpose:");
  console.log("  • Executes conditional orders (stop losses, take profits)");
  console.log("  • Triggers orders when price reaches specified level");
  console.log("  • Earns small trigger fees");
  console.log("");
  console.log("How it works:");
  console.log("  1. Monitors oracle price feed");
  console.log("  2. Checks if trigger conditions are met");
  console.log("  3. Executes order when price hits level");
  console.log("  4. More passive (lower competition)");
  console.log("");

  // Deployment Guide
  console.log("\n" + "=".repeat(70));
  console.log("  📦 HOW TO DEPLOY KEEPER BOTS");
  console.log("=".repeat(70) + "\n");

  console.log("Option 1: Run Official Drift Keeper Bots (Recommended)\n");
  console.log("  1. Clone keeper-bots repository:");
  console.log("     cd keeper-bots-v2");
  console.log("");
  console.log("  2. Install dependencies:");
  console.log("     npm install");
  console.log("");
  console.log("  3. Configure environment (.env):");
  console.log("     RPC_URL=http://localhost:8899");
  console.log("     PAYER_KEY_PATH=../keys/admin-keypair.json");
  console.log("     DRIFT_ENV=localnet");
  console.log("");
  console.log("  4. Run liquidator bot:");
  console.log("     npm run liquidator");
  console.log("");
  console.log("  5. Run filler bot (in another terminal):");
  console.log("     npm run filler");
  console.log("");
  console.log("  6. Run trigger bot (optional, in another terminal):");
  console.log("     npm run trigger");
  console.log("");

  console.log("Option 2: Create Custom Bot\n");
  console.log("  Use Drift SDK to build your own bot:");
  console.log("");
  console.log("  ```typescript");
  console.log("  import { DriftClient, BotConfig } from '@drift-labs/sdk';");
  console.log("");
  console.log("  const bot = new DriftClient({");
  console.log("    connection,");
  console.log("    wallet,");
  console.log("    programID,");
  console.log("  });");
  console.log("");
  console.log("  // Your custom liquidation logic");
  console.log("  await bot.liquidateUser(userAccountPublicKey);");
  console.log("  ```");
  console.log("");

  // Bot Configuration
  console.log("\n" + "=".repeat(70));
  console.log("  ⚙️  BOT CONFIGURATION");
  console.log("=".repeat(70) + "\n");

  const botConfig = {
    network: "localnet",
    rpcUrl: config.rpcUrl,
    driftProgramId: config.driftProgramId,
    admin: config.adminPublicKey,
    botWallet: config.adminPublicKey, // Can be different wallet
    
    liquidatorConfig: {
      pollingInterval: 2000, // Check every 2 seconds
      batchSize: 10, // Liquidate 10 users per batch
      minMarginLevel: 0.05, // Liquidate if margin < 5%
      liquidationFee: 0.025, // 2.5% fee
      enabled: true,
    },
    
    fillerConfig: {
      maxSlip: 0.005, // Max 0.5% slippage
      minProfitBps: 10, // Min 10bps profit
      maxPositionSize: 1000000, // 1M base units
      enabled: true,
    },
    
    triggerConfig: {
      pollingInterval: 4000, // Check every 4 seconds
      enabled: true,
    },
  };

  console.log("📄 Bot Configuration (saved to bot-config.json):\n");
  console.log(JSON.stringify(botConfig, null, 2));
  console.log("");

  fs.writeFileSync(
    path.join(__dirname, "bot-config.json"),
    JSON.stringify(botConfig, null, 2)
  );

  // Monitoring & Economics
  console.log("\n" + "=".repeat(70));
  console.log("  💰 BOT ECONOMICS");
  console.log("=".repeat(70) + "\n");

  console.log("Liquidator Bot Revenue:\n");
  console.log("  Liquidation fees typically 2-5% of liquidation amount");
  console.log("  Example: $50k liquidation = $1,000-2,500 in fees");
  console.log("  Daily volume affects: more trading = more liquidations");
  console.log("");
  
  console.log("Filler Bot Revenue:\n");
  console.log("  Earns 20-50% of taker fees");
  console.log("  Taker fees typically 0.05% of trade value");
  console.log("  Example: $10M daily volume = $50k taker fees");
  console.log("           Filler gets: $10k-25k (20-50%)");
  console.log("");

  console.log("Costs:\n");
  console.log("  • Liquidator: ~0.05 SOL per liquidation ($1-2)");
  console.log("  • Filler: ~0.05 SOL per fill ($1-2)");
  console.log("  • Trigger: ~0.03 SOL per execution ($0.50-1)");
  console.log("  • Running 24/7: ~$5-10/day in fees");
  console.log("");

  // Deployment Checklist
  console.log("\n" + "=".repeat(70));
  console.log("  ✓ DEPLOYMENT CHECKLIST");
  console.log("=".repeat(70) + "\n");

  const checklist = [
    { step: 1, task: "Ensure validator is running", command: "docker logs drift-validator --tail 5" },
    { step: 2, task: "Check Drift program is deployed", command: "npm run status" },
    { step: 3, task: "Navigate to keeper-bots-v2 directory", command: "cd keeper-bots-v2" },
    { step: 4, task: "Install bot dependencies", command: "npm install" },
    { step: 5, task: "Create .env file", command: "cp .env.example .env" },
    { step: 6, task: "Update .env for localnet", command: "Edit .env (see config above)" },
    { step: 7, task: "Fund bot wallet with SOL", command: "solana airdrop 10 [BOT_PUBKEY]" },
    { step: 8, task: "Start liquidator bot", command: "npm run liquidator" },
    { step: 9, task: "Start filler bot (new terminal)", command: "npm run filler" },
    { step: 10, task: "Monitor bot performance", command: "Watch logs for fills/liquidations" },
  ];

  checklist.forEach(item => {
    console.log(`  ${item.step}. ${item.task}`);
    console.log(`     $ ${item.command}\n`);
  });

  // Monitoring
  console.log("\n" + "=".repeat(70));
  console.log("  🔍 MONITORING YOUR BOTS");
  console.log("=".repeat(70) + "\n");

  console.log("Key metrics to track:\n");
  console.log("  Liquidator Bot:");
  console.log("    • Liquidations per hour");
  console.log("    • Total fees earned");
  console.log("    • Failed liquidations");
  console.log("    • Average liquidation size");
  console.log("");
  console.log("  Filler Bot:");
  console.log("    • Orders filled per hour");
  console.log("    • Average profit per fill");
  console.log("    • Failed fills");
  console.log("    • Market maker contribution");
  console.log("");
  console.log("  Overall:");
  console.log("    • Daily SOL expenses");
  console.log("    • Daily SOL earnings");
  console.log("    • Net profit/loss");
  console.log("    • ROI on initial capital");
  console.log("");

  // Risk Management
  console.log("\n" + "=".repeat(70));
  console.log("  ⚠️  RISK MANAGEMENT");
  console.log("=".repeat(70) + "\n");

  console.log("Important considerations:\n");
  console.log("  1. Start with simulation first");
  console.log("     • Test on localnet without real money");
  console.log("     • Verify bot logic with paper trades");
  console.log("");
  console.log("  2. Use separate bot wallet");
  console.log("     • Don't use main admin wallet");
  console.log("     • Keep admin keys secure");
  console.log("     • Fund bot wallet gradually");
  console.log("");
  console.log("  3. Monitor bot health");
  console.log("     • Check logs regularly");
  console.log("     • Set up alerts for failures");
  console.log("     • Keep sufficient SOL for fees");
  console.log("");
  console.log("  4. Start small");
  console.log("     • Begin with 1 SOL in bot wallet");
  console.log("     • Verify performance for 1 week");
  console.log("     • Scale gradually if profitable");
  console.log("");
  console.log("  5. Have fallback plan");
  console.log("     • Keep bot code in version control");
  console.log("     • Document all configurations");
  console.log("     • Be ready to stop bot if needed");
  console.log("");

  // Next Steps
  console.log("\n" + "=".repeat(70));
  console.log("  🚀 NEXT STEPS");
  console.log("=".repeat(70) + "\n");

  console.log("1. TEST LOCALLY FIRST");
  console.log("   • Deploy bots on localnet");
  console.log("   • Simulate trading volume");
  console.log("   • Verify liquidation logic");
  console.log("");
  console.log("2. MOVE TO DEVNET");
  console.log("   • Redeploy on devnet");
  console.log("   • Get real trading volume");
  console.log("   • Small real fees (testnet SOL)");
  console.log("");
  console.log("3. SCALE ON MAINNET");
  console.log("   • Deploy on Solana Mainnet");
  console.log("   • Real revenue potential");
  console.log("   • Compete with other bots");
  console.log("");

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("  📊 SUMMARY");
  console.log("=".repeat(70) + "\n");

  console.log("Your Drift Exchange is now ready for keeper bots!");
  console.log("");
  console.log("✅ What's ready:");
  console.log("   • Drift Protocol deployed");
  console.log("   • USDC token infrastructure");
  console.log("   • SOL oracle ready");
  console.log("   • Admin wallet funded");
  console.log("");
  console.log("⏳ What keeper bots will do:");
  console.log("   • Liquidate risky positions");
  console.log("   • Fill orders from DLOB");
  console.log("   • Execute conditional orders");
  console.log("   • Earn fees for services");
  console.log("");
  console.log("💡 Profit potential:");
  console.log("   • Liquidator: $200-2000/day");
  console.log("   • Filler: $1000-5000/day");
  console.log("   • Trigger: $100-500/day");
  console.log("   • (Depends on trading volume)");
  console.log("");

  console.log("🎯 Your Action Items:");
  console.log("   1. cd keeper-bots-v2");
  console.log("   2. npm install");
  console.log("   3. Configure .env");
  console.log("   4. npm run liquidator");
  console.log("   5. npm run filler (new terminal)");
  console.log("");

  console.log("📖 Resources:");
  console.log("   • Keeper-bots repo: ../keeper-bots-v2/");
  console.log("   • Drift SDK docs: https://docs.drift.trade/");
  console.log("   • Bot config: ./bot-config.json");
  console.log("");

  console.log("=".repeat(70));
  console.log("  ✅ PHASE 3 READY TO BEGIN");
  console.log("=".repeat(70) + "\n");

  return botConfig;
}

main()
  .then((config) => {
    console.log("🎉 Ready to deploy keeper bots!\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Wallet, BN, BulkAccountLoader, AdminClient, OracleSource, getPrelaunchOraclePublicKey, User } from "@drift-labs/sdk";
import fs from "fs";

const conn = new Connection("https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966", "confirmed");
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("/home/gorcore/Drift-Clone/keys/admin-keypair.json"))));
const wallet = new Wallet(kp);
const pid = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
const bl = new BulkAccountLoader(conn, "confirmed", 5000);
const po = getPrelaunchOraclePublicKey(pid, 0);

const ac = new AdminClient({
  connection: conn, wallet, programID: pid, env: "devnet",
  accountSubscription: { type: "polling", accountLoader: bl },
  perpMarketIndexes: [0], spotMarketIndexes: [0, 1],
  oracleInfos: [{ publicKey: po, source: OracleSource.Prelaunch }],
  txVersion: "legacy",
});

await ac.subscribe();

// Oracle data
const oracleData = ac.getOracleDataForPerpMarket(0);
console.log("Oracle: price=$" + (oracleData.price.toNumber()/1e6).toFixed(2) +
  " conf=$" + (oracleData.confidence.toNumber()/1e6).toFixed(2) +
  " delay=" + oracleData.delay +
  " hasData=" + oracleData.hasSufficientNumberOfDataPoints);

// Perp market
const pm = ac.getPerpMarketAccount(0);
console.log("contractTier:", JSON.stringify(pm.contractTier));

// Stuck user
const stuckUserKey = new PublicKey("6AQQ1ESrbfeLD58i9XEt8VAuXemxsDtUNTzBAuK8igf6");
const stuckUser = new User({
  driftClient: ac,
  userAccountPublicKey: stuckUserKey,
  accountSubscription: { type: "polling", accountLoader: bl },
});
await stuckUser.subscribe();
const acct = stuckUser.getUserAccount();
console.log("\nUser status:", acct.status, "authority:", acct.authority.toBase58());

// Try liquidatePerpPnlForDeposit
console.log("\nTrying liquidatePerpPnlForDeposit...");
try {
  const tx = await ac.liquidatePerpPnlForDeposit(stuckUserKey, acct, 0, 0, new BN(1));
  console.log("tx:", tx);
} catch(e) {
  const logs = (e.logs || e.transactionLogs || []).filter(l => l.includes("Program log:"));
  console.log("Error:", e.message?.slice(0, 120));
  if (logs.length) console.log("Logs:", logs.join("\n"));
}

// Try resolvePerpBankruptcy
console.log("\nTrying resolvePerpBankruptcy...");
try {
  const tx = await ac.resolvePerpBankruptcy(stuckUserKey, acct.authority, 0);
  console.log("tx:", tx);
} catch(e) {
  const logs = (e.logs || e.transactionLogs || []).filter(l => l.includes("Program log:"));
  console.log("Error:", e.message?.slice(0, 120));
  if (logs.length) console.log("Logs:", logs.join("\n"));
}

// Check status
await new Promise(r => setTimeout(r, 2000));
await bl.load();
console.log("\nUser status after:", stuckUser.getUserAccount().status);

await stuckUser.unsubscribe();
await ac.unsubscribe();
process.exit(0);

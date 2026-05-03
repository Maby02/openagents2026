import { MockMarketSource } from "../src/markets/mock.ts";

const src = new MockMarketSource();

// 1. listMarkets returns the seeded markets — expect a diverse set spanning
//    prediction markets, DeFi events, and crypto events.
const open = await src.listMarkets({ status: "open" });
console.log(`open markets: ${open.length}`);
if (open.length < 3) {
  console.error(`FAIL: expected at least 3 seeded markets, got ${open.length}`);
  process.exit(1);
}
const categories = new Set(open.map((m) => m.category));
console.log(`categories: ${[...categories].join(", ")}`);

// 2. Repeated calls advance history (the random walk ticks).
for (let i = 0; i < 5; i++) {
  await src.listMarkets();
}
const after = await src.getMarket("btc-100k");
console.log(`btc-100k history points after 6 ticks: ${after.history.length}`);
if (after.history.length < 6) {
  console.error(`FAIL: expected >=6 history points, got ${after.history.length}`);
  process.exit(1);
}

// 3. Prices stay in (0,1) and sum to ~1.
const sum = after.currentPrices.reduce((a, b) => a + b, 0);
console.log(`btc-100k current prices sum: ${sum.toFixed(4)}`);
if (Math.abs(sum - 1) > 1e-9) {
  console.error(`FAIL: price sum drift, got ${sum}`);
  process.exit(1);
}

// 4. getMarket accepts both bare id and full URI.
const byUri = await src.getMarket("mock://market/fed-cut");
const byBare = await src.getMarket("fed-cut");
if (byUri.id !== byBare.id) {
  console.error(`FAIL: id resolution mismatch`);
  process.exit(1);
}

// 5. Returned markets are clones — mutating them shouldn't pollute internal state.
const m = await src.getMarket("eth-staking-spike");
m.currentPrices[0] = 999;
const m2 = await src.getMarket("eth-staking-spike");
if (m2.currentPrices[0] === 999) {
  console.error("FAIL: market mutation leaked into internal state");
  process.exit(1);
}

console.log("\nMOCK SOURCE OK");

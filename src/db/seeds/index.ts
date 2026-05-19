import "dotenv/config";
import db from "../../config/db";
import { seed_history } from "../schema/seed-history.schema";
import { eq } from "drizzle-orm";

// import seed001 from "./001-ledger-platform-chart";


type Seed = {
  id: string;
  name: string;
  run: () => Promise<void>;
  dependsOn?: string[];
  alwaysRun?: boolean;
};

/**
 * Determine which seeds to run based on environment
 *
 * E2E Test Seeds (003):
 * - Only run when NODE_ENV=test OR E2E_TEST=true
 * - These seeds populate test assets and blockchains for E2E testing
 * - Should NOT run in development or production
 *
 * Production Seeds (001, 002):
 * - Run in all environments
 */
const isE2EEnvironment = process.env.NODE_ENV === "test" || process.env.E2E_TEST === "true";

const seeds: Seed[] = [
  // seed001,
];

if (isE2EEnvironment) console.log("E2E mode detected - including E2E test asset seeds");

async function hasRun(id: string) {
  const rows = await db.select().from(seed_history).where(eq(seed_history.id, id)).limit(1);

  return rows.length > 0;
}

async function markRun(id: string, name: string) {
  await db.insert(seed_history).values({ id, name }).onConflictDoNothing();
}

async function main() {
  const byId = new Map(seeds.map((s) => [s.id, s]));
  for (const s of seeds) {
    if (!s.dependsOn) continue;
    for (const dep of s.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(`Seed "${s.id}" depends on missing seed "${dep}"`);
      }
    }
  }

  for (const seed of seeds) {
    const already = await hasRun(seed.id);
    if (already && !seed.alwaysRun) {
      console.log(`Skipping ${seed.id} (${seed.name}) — already ran`);
      continue;
    }

    console.log(`Running ${seed.id} (${seed.name})`);
    try {
      await seed.run();
      await markRun(seed.id, seed.name);
      console.log(`Done ${seed.id}`);
    } catch (e) {
      console.error(`Failed ${seed.id}:`, e);
      process.exit(1);
    }
  }

  console.log("All seeds complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed runner crashed:", e);
  process.exit(1);
});

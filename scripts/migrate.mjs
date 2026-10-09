/**
 * Safe production migration runner.
 *
 * Replaces `prisma db push --accept-data-loss`, which DROPS every table that is
 * not in schema.prisma — including tables owned by other apps sharing the same
 * MySQL database (this is what kept wiping the UK-to-US app's data).
 *
 * `prisma migrate deploy` only applies the SQL files in prisma/migrations and
 * never touches tables it does not know about.
 *
 * First run on a database that was created with `db push` (no migration
 * history yet) → Prisma returns P3005. If all of our tables already exist we
 * mark 0_init as applied (baseline) and continue. Safe to run concurrently from
 * several app instances: migrate deploy takes a DB lock, and an already-applied
 * baseline (P3008) is treated as success.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const BASELINE = "0_init";
const OUR_TABLES = [
  "Session",
  "Store",
  "CheckoutTimerSettings",
  "Product",
  "StickyAtcConfig",
  "CheckoutConfig",
  "CustomReview",
  "CheckoutUpsellCampaign",
  "CheckoutUpsellItem",
];


const log = (...a) => console.log("[migrate]", ...a);

function prisma(args) {
  try {
    const out = execSync(`npx prisma ${args}`, { encoding: "utf8", stdio: "pipe" });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

async function existingOurTables() {
  const db = new PrismaClient();
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT table_name AS t FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name IN (${OUR_TABLES.map(() => "?").join(",")})`,
      ...OUR_TABLES,
    );
    return rows.map((r) => r.t ?? r.T ?? r.TABLE_NAME);
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  let res = prisma("migrate deploy");
  if (res.ok) return log("Schema up to date.\n" + res.out);

  if (!res.out.includes("P3005")) throw new Error(res.out);

  // Database already has tables but no migration history (created by db push).
  const found = await existingOurTables();
  log(`No migration history. Found ${found.length}/${OUR_TABLES.length} app tables.`);
  if (found.length !== OUR_TABLES.length) {
    throw new Error(
      `Refusing to baseline: missing tables ${OUR_TABLES.filter((t) => !found.includes(t)).join(", ")}. ` +
        "Fix manually — see prisma/migrations/0_init/migration.sql.",
    );
  }

  const r = prisma(`migrate resolve --applied ${BASELINE}`);
  if (!r.ok && !r.out.includes("P3008")) throw new Error(r.out);
  log(`Baselined ${BASELINE} (existing tables kept as-is).`);

  res = prisma("migrate deploy");
  if (!res.ok) throw new Error(res.out);
  log("Schema up to date.\n" + res.out);
}

main().catch((err) => {
  // Never block the app from booting on a migration problem: the tables already
  // exist in production. Log loudly so it shows up in Coolify logs.
  console.error("[migrate] ❌ MIGRATION FAILED — app will still start.\n", err?.message ?? err);
});

import prisma from "../db.server";
import {
  RechargeError,
  activeSubscriptions,
  createSubscription,
  findCustomerByShopifyId,
  getSubscription,
  rechargeConfigured,
  setSubscriptionPrice,
} from "./recharge.server";

/*
 * Post-purchase "add to my next box": nothing is charged on the page. When the buyer accepts, a NextBoxRequest
 * is queued; this job adds the product to their Recharge subscriptions with the same next charge date as their
 * existing box, at the first-delivery price, and raises it to the recurring price after that first charge.
 *
 * Status flow: signed -> pending (buyer accepted) -> created (first price) -> done. Or skipped / failed.
 */

const MINUTE = 60_000;
const RETRY_FOR_MS = 24 * 60 * MINUTE; // Recharge can take a while to pick up a brand-new subscriber
const numId = (v: string | number | null | undefined) => String(v ?? "").split("/").pop()!.split("?")[0];
const ymd = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : "");

function backoff(attempts: number) {
  return Math.min(60, 5 * 2 ** Math.min(attempts, 4)) * MINUTE; // 5, 10, 20, 40, 60, 60 ... minutes
}

async function update(id: string, data: Record<string, unknown>) {
  await prisma.nextBoxRequest.update({ where: { id }, data });
}

async function retryOrFail(row: { id: string; attempts: number; createdAt: Date }, detail: string) {
  if (Date.now() - row.createdAt.getTime() > RETRY_FOR_MS) {
    return update(row.id, { status: "failed", detail, attempts: row.attempts + 1 });
  }
  return update(row.id, { detail, attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + backoff(row.attempts)) });
}

type Row = Awaited<ReturnType<typeof prisma.nextBoxRequest.findFirstOrThrow>>;

async function handlePending(row: Row) {
  if (!row.customerId) return update(row.id, { status: "skipped", detail: "No customer account on the order" });
  const customer = await findCustomerByShopifyId(numId(row.customerId));
  if (!customer) return retryOrFail(row, "Customer not in Recharge yet");
  const subs = await activeSubscriptions(customer.id);
  const product = numId(row.productId);
  if (subs.some((s) => numId(s.external_product_id?.ecommerce) === product)) {
    return update(row.id, { status: "skipped", rechargeCustomerId: String(customer.id), detail: "Already subscribed to this product" });
  }
  // Anchor on the box that ships next, so both arrive together.
  const anchor = subs
    .filter((s) => s.next_charge_scheduled_at)
    .sort((a, b) => ymd(a.next_charge_scheduled_at).localeCompare(ymd(b.next_charge_scheduled_at)))[0];
  if (!anchor) return retryOrFail(row, "No active subscription with a next charge date yet");

  const firstChargeDate = ymd(anchor.next_charge_scheduled_at);
  const sub = await createSubscription({
    addressId: anchor.address_id,
    productId: product,
    variantId: numId(row.variantId),
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    price: row.firstPrice,
    intervalDays: row.intervalDays,
    nextChargeDate: firstChargeDate,
  });
  const samePrice = Number(row.firstPrice) === Number(row.recurringPrice);
  return update(row.id, {
    status: samePrice ? "done" : "created",
    rechargeCustomerId: String(customer.id),
    rechargeSubscriptionId: String(sub.id),
    firstChargeDate,
    detail: `Added to subscription box on address ${anchor.address_id}, first charge ${firstChargeDate}`,
    attempts: row.attempts + 1,
    // Check back the day after the first charge to move it to the recurring price.
    nextAttemptAt: new Date(new Date(`${firstChargeDate}T00:00:00Z`).getTime() + 24 * 60 * MINUTE),
  });
}

async function handleCreated(row: Row) {
  const sub = await getSubscription(row.rechargeSubscriptionId!);
  if (!sub || sub.status !== "active") {
    return update(row.id, { status: "done", detail: `Subscription ${sub?.status || "missing"} before the price change` });
  }
  if (ymd(sub.next_charge_scheduled_at) > (row.firstChargeDate || "")) {
    // The first delivery has been charged: from now on it's the recurring price.
    await setSubscriptionPrice(sub.id, row.recurringPrice);
    return update(row.id, { status: "done", detail: `First delivery charged; price now ${row.recurringPrice}` });
  }
  return update(row.id, { nextAttemptAt: new Date(Date.now() + 12 * 60 * MINUTE), detail: "Waiting for the first charge" });
}

export async function processNextBoxRequests(limit = 20) {
  const due = await prisma.nextBoxRequest.findMany({
    where: { status: { in: ["pending", "created"] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  if (!due.length) return 0;
  if (!rechargeConfigured()) {
    await prisma.nextBoxRequest.updateMany({
      where: { id: { in: due.map((r) => r.id) } },
      data: { nextAttemptAt: new Date(Date.now() + 15 * MINUTE), detail: "Waiting for RECHARGE_API_TOKEN to be set" },
    });
    return 0;
  }
  let done = 0;
  for (const row of due) {
    // Claim the row so a second server process can't work on it at the same time.
    const claimed = await prisma.nextBoxRequest.updateMany({
      where: { id: row.id, nextAttemptAt: row.nextAttemptAt, status: row.status },
      data: { nextAttemptAt: new Date(Date.now() + 10 * MINUTE) },
    });
    if (claimed.count !== 1) continue;
    try {
      if (row.status === "pending") await handlePending(row);
      else await handleCreated(row);
      done++;
    } catch (err) {
      const msg = err instanceof RechargeError ? err.message : String((err as Error)?.message || err);
      console.error("[NextBox]", row.id, msg);
      // Auth/permission problems won't fix themselves by retrying fast.
      if (err instanceof RechargeError && (err.status === 401 || err.status === 403)) {
        await update(row.id, { detail: msg, nextAttemptAt: new Date(Date.now() + 60 * MINUTE) });
      } else {
        await retryOrFail(row, msg);
      }
    }
  }
  return done;
}

declare global {
  // eslint-disable-next-line no-var
  var __nextBoxWorker: NodeJS.Timeout | undefined;
}

/** Runs the job every minute in this server process (once, even with hot reloads). */
export function startNextBoxWorker() {
  if (globalThis.__nextBoxWorker || process.env.NODE_ENV === "test") return;
  globalThis.__nextBoxWorker = setInterval(() => {
    processNextBoxRequests().catch((err) => console.error("[NextBox] run failed:", err));
  }, MINUTE);
  globalThis.__nextBoxWorker.unref?.();
}

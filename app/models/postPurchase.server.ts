import prisma from "../db.server";

/*
 * Post-purchase funnels: the one-click offer page Shopify shows between payment and the thank-you page.
 *
 * A funnel is picked by the products in the order (or "all" orders), highest priority first.
 * It holds up to 3 steps (Shopify lets a buyer accept at most 3 offers per checkout). Step 1 always shows;
 * later steps can be limited to "after the previous step was accepted" or "...declined".
 * The extension never decides prices: it sends an offer id + quantity, and the server builds and signs the
 * changeset from the saved offer.
 */

export { MAX_STEPS, parseJsonArray } from "../lib/postPurchase.shared";
export type { ShowWhen, TriggerType, TriggerProduct, OfferInput, FunnelInput, BuyerType } from "../lib/postPurchase.shared";
import { MAX_STEPS, parseJsonArray } from "../lib/postPurchase.shared";
import type { ShowWhen, TriggerType, TriggerProduct, OfferInput, FunnelInput, BuyerType, OfferType } from "../lib/postPurchase.shared";

// ─── helpers ────────────────────────────────────────────────────────────────

export function numericId(gidOrId: string | number | null | undefined): string {
  if (gidOrId === null || gidOrId === undefined) return "";
  return String(gidOrId).split("/").pop()!.split("?")[0];
}

export function clean(v: string | null | undefined, max = 2000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampPercent(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // 4 decimals, so an offer price typed in the editor ($12.99 off $14.99 = 13.3422%) lands on the exact cent.
  return Math.min(100, Math.round(n * 10000) / 10000);
}

function offerData(step: OfferInput, position: number) {
  const nextBox = step.offerType === "next_box";
  return {
    position,
    offerType: nextBox ? "next_box" : "product",
    subFirstPrice: nextBox ? clean(step.subFirstPrice, 20) : null,
    subRecurringPrice: nextBox ? clean(step.subRecurringPrice, 20) : null,
    subIntervalDays: clampInt(step.subIntervalDays, 1, 365, 28),
    showWhen: (["always", "accepted", "declined"].includes(String(step.showWhen)) ? step.showWhen : "always") as string,
    skipIfInOrder: step.skipIfInOrder ?? true,
    showShippingNote: step.showShippingNote ?? false,
    productId: step.productId,
    variantId: step.variantId,
    productTitle: clean(step.productTitle, 190) || "Product",
    variantTitle: clean(step.variantTitle, 190),
    imageUrl: clean(step.imageUrl, 2000),
    variantPrice: clean(step.variantPrice, 40),
    compareAtPrice: clean(step.compareAtPrice, 40),
    discountPercent: clampPercent(step.discountPercent),
    discountTitle: clean(step.discountTitle, 190) || "Exclusive offer",
    maxQuantity: clampInt(step.maxQuantity, 1, 10, 3),
    fixedQuantity: clampInt(step.fixedQuantity, 0, 10, 0),
    badgeText: clean(step.badgeText, 190),
    headline: clean(step.headline, 190),
    subheadline: clean(step.subheadline, 1000),
    bullets: JSON.stringify((step.bullets || []).map((b) => String(b).trim()).filter(Boolean).slice(0, 6)),
    ratingText: clean(step.ratingText, 190),
    guaranteeText: clean(step.guaranteeText, 1000),
    acceptLabel: clean(step.acceptLabel, 190),
    declineLabel: clean(step.declineLabel, 190),
  };
}

function variantList(list: TriggerProduct[] | undefined) {
  return JSON.stringify((list || []).filter((v) => v && v.id).map((v) => ({ id: v.id, title: String(v.title || "") })));
}

function funnelData(data: FunnelInput) {
  return {
    buyerType: (["subscriber", "onetime"].includes(String(data.buyerType)) ? data.buyerType : "any") as string,
    includeVariants: variantList(data.includeVariants),
    excludeVariants: variantList(data.excludeVariants),
    name: clean(data.name, 190) || "Post-purchase offer",
    enabled: data.enabled ?? false,
    priority: clampInt(data.priority, -100, 100, 0),
    triggerType: data.triggerType === "all" ? "all" : "products",
    triggerProducts: JSON.stringify(
      (data.triggerProducts || []).filter((p) => p && p.id).map((p) => ({ id: p.id, title: String(p.title || "") })),
    ),
    timerMinutes: clampInt(data.timerMinutes, 0, 60, 10),
  };
}

export function validateFunnel(data: FunnelInput): string | null {
  if (!data.steps || data.steps.length === 0) return "Add at least one offer.";
  if (data.steps.length > MAX_STEPS) return `A funnel can have at most ${MAX_STEPS} offers.`;
  for (const [i, s] of data.steps.entries()) {
    if (!s.productId || !s.variantId) return `Offer ${i + 1}: pick a product.`;
    if (s.offerType === "next_box" && !(Number(s.subFirstPrice) > 0 && Number(s.subRecurringPrice) > 0)) {
      return `Offer ${i + 1}: enter the first-delivery and recurring prices.`;
    }
  }
  if (data.triggerType !== "all" && (!data.triggerProducts || data.triggerProducts.length === 0)) {
    return "Pick at least one trigger product, or show the funnel on all orders.";
  }
  return null;
}

// ─── store ──────────────────────────────────────────────────────────────────

export async function ensureStore(shopDomain: string, accessToken?: string) {
  return prisma.store.upsert({
    where: { shopDomain },
    update: accessToken ? { accessToken } : {},
    create: { shopDomain, accessToken: accessToken || "" },
  });
}

// ─── admin CRUD ─────────────────────────────────────────────────────────────

export async function listFunnels(shopDomain: string) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return [];
  return prisma.postPurchaseFunnel.findMany({
    where: { storeId: store.id },
    include: { steps: { orderBy: { position: "asc" } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getFunnel(shopDomain: string, id: string) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return null;
  return prisma.postPurchaseFunnel.findFirst({
    where: { id, storeId: store.id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
}

export async function createFunnel(shopDomain: string, data: FunnelInput) {
  const store = await ensureStore(shopDomain);
  return prisma.postPurchaseFunnel.create({
    data: {
      storeId: store.id,
      ...funnelData(data),
      steps: { create: data.steps.slice(0, MAX_STEPS).map((s, i) => offerData(s, i)) },
    },
  });
}

export async function updateFunnel(shopDomain: string, id: string, data: FunnelInput) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) throw new Error("Store not found");
  const existing = await prisma.postPurchaseFunnel.findFirst({
    where: { id, storeId: store.id },
    include: { steps: true },
  });
  if (!existing) throw new Error("Funnel not found");

  // Update steps in place by position so analytics stay attached to the same offer ids.
  const steps = data.steps.slice(0, MAX_STEPS);
  return prisma.$transaction(async (tx) => {
    await tx.postPurchaseFunnel.update({ where: { id }, data: funnelData(data) });
    const byPos = new Map(existing.steps.map((s) => [s.position, s]));
    for (const [i, s] of steps.entries()) {
      const prev = byPos.get(i);
      if (prev) await tx.postPurchaseOffer.update({ where: { id: prev.id }, data: offerData(s, i) });
      else await tx.postPurchaseOffer.create({ data: { funnelId: id, ...offerData(s, i) } });
    }
    const removed = existing.steps.filter((s) => s.position >= steps.length).map((s) => s.id);
    if (removed.length) await tx.postPurchaseOffer.deleteMany({ where: { id: { in: removed } } });
  });
}

export async function setFunnelEnabled(shopDomain: string, id: string, enabled: boolean) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) throw new Error("Store not found");
  return prisma.postPurchaseFunnel.updateMany({ where: { id, storeId: store.id }, data: { enabled } });
}

export async function deleteFunnel(shopDomain: string, id: string) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) throw new Error("Store not found");
  return prisma.postPurchaseFunnel.deleteMany({ where: { id, storeId: store.id } });
}

export async function duplicateFunnel(shopDomain: string, id: string) {
  const f = await getFunnel(shopDomain, id);
  if (!f) throw new Error("Funnel not found");
  return createFunnel(shopDomain, {
    name: `${f.name} (copy)`,
    enabled: false,
    priority: f.priority,
    triggerType: f.triggerType as TriggerType,
    triggerProducts: parseJsonArray<TriggerProduct>(f.triggerProducts),
    buyerType: f.buyerType as BuyerType,
    includeVariants: parseJsonArray<TriggerProduct>(f.includeVariants),
    excludeVariants: parseJsonArray<TriggerProduct>(f.excludeVariants),
    timerMinutes: f.timerMinutes,
    steps: f.steps.map((s) => ({
      ...s,
      offerType: s.offerType as OfferType,
      showWhen: s.showWhen as ShowWhen,
      bullets: parseJsonArray<string>(s.bullets),
    })),
  });
}

// ─── stats ──────────────────────────────────────────────────────────────────

export interface FunnelStats {
  views: number;
  accepts: number;
  declines: number;
  revenue: number;
  conversion: number; // accepts / views, %
}

export async function funnelStats(shopDomain: string, days = 30) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  const out: Record<string, FunnelStats> = {};
  const byOffer: Record<string, FunnelStats> = {};
  if (!store) return { byFunnel: out, byOffer };
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.postPurchaseEvent.groupBy({
    by: ["funnelId", "offerId", "type"],
    where: { storeId: store.id, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { revenue: true },
  });
  const blank = (): FunnelStats => ({ views: 0, accepts: 0, declines: 0, revenue: 0, conversion: 0 });
  for (const r of rows) {
    for (const [map, key] of [[out, r.funnelId], [byOffer, r.offerId]] as const) {
      if (!key) continue;
      const s = (map[key] ||= blank());
      if (r.type === "view") s.views += r._count._all;
      if (r.type === "accept") {
        s.accepts += r._count._all;
        s.revenue += r._sum.revenue || 0;
      }
      if (r.type === "decline") s.declines += r._count._all;
    }
  }
  for (const s of [...Object.values(out), ...Object.values(byOffer)]) {
    s.revenue = Math.round(s.revenue * 100) / 100;
    s.conversion = s.views ? Math.round((s.accepts / s.views) * 1000) / 10 : 0;
  }
  return { byFunnel: out, byOffer };
}

// ─── storefront (extension) side ────────────────────────────────────────────

export interface OrderLine {
  productId: string | number;
  variantId: string | number;
  quantity?: number;
  sellingPlanId?: string | number | null;
}

/** Why a funnel does or doesn't fit an order. Exported for tests and the admin "who sees this" summary. */
export function funnelFits(
  f: { triggerType: string; triggerProducts: string | null; buyerType: string; includeVariants: string | null; excludeVariants: string | null },
  lines: OrderLine[],
): boolean {
  const products = new Set(lines.map((l) => numericId(l.productId)));
  const variants = new Set(lines.map((l) => numericId(l.variantId)));
  const subscriber = lines.some((l) => l.sellingPlanId !== null && l.sellingPlanId !== undefined && String(l.sellingPlanId) !== "");
  if (f.buyerType === "subscriber" && !subscriber) return false;
  if (f.buyerType === "onetime" && subscriber) return false;
  const include = parseJsonArray<TriggerProduct>(f.includeVariants).map((v) => numericId(v.id));
  if (include.length && !include.some((v) => variants.has(v))) return false;
  const exclude = parseJsonArray<TriggerProduct>(f.excludeVariants).map((v) => numericId(v.id));
  if (exclude.some((v) => variants.has(v))) return false;
  if (f.triggerType === "all") return true;
  const triggers = parseJsonArray<TriggerProduct>(f.triggerProducts).map((p) => numericId(p.id));
  return triggers.some((t) => products.has(t));
}

/**
 * The funnel for an order: enabled, highest priority first, whose conditions all fit the order
 * (trigger products, subscriber / one-time, must-contain and must-not-contain variants).
 */
export async function matchFunnel(shopDomain: string, lines: OrderLine[]) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return null;
  const funnels = await prisma.postPurchaseFunnel.findMany({
    where: { storeId: store.id, enabled: true },
    include: { steps: { orderBy: { position: "asc" } } },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  for (const f of funnels) {
    if (f.steps.length && funnelFits(f, lines)) return f;
  }
  return null;
}

/** What the extension needs to draw the page. Numeric ids, because the post-purchase API uses numbers. */
export function publicFunnel(f: NonNullable<Awaited<ReturnType<typeof matchFunnel>>>) {
  return {
    id: f.id,
    name: f.name,
    timerMinutes: f.timerMinutes,
    steps: f.steps.map((s) => ({
      id: s.id,
      position: s.position,
      showWhen: s.showWhen,
      skipIfInOrder: s.skipIfInOrder,
      showShippingNote: s.showShippingNote,
      offerType: s.offerType,
      subFirstPrice: s.subFirstPrice,
      subRecurringPrice: s.subRecurringPrice,
      subIntervalDays: s.subIntervalDays,
      productId: Number(numericId(s.productId)),
      variantId: Number(numericId(s.variantId)),
      productTitle: s.productTitle,
      variantTitle: s.variantTitle,
      imageUrl: s.imageUrl,
      compareAtPrice: s.compareAtPrice,
      discountPercent: s.discountPercent,
      discountTitle: s.discountTitle,
      maxQuantity: s.maxQuantity,
      fixedQuantity: s.fixedQuantity,
      badgeText: s.badgeText,
      headline: s.headline,
      subheadline: s.subheadline,
      bullets: parseJsonArray<string>(s.bullets),
      ratingText: s.ratingText,
      guaranteeText: s.guaranteeText,
      acceptLabel: s.acceptLabel,
      declineLabel: s.declineLabel,
    })),
  };
}

/** Metafield the "next box" offer writes on the order, so the order shows the buyer accepted it. */
export const NEXT_BOX_METAFIELD = { namespace: "checkout_and_atc", key: "next_box_offer" };

/**
 * The order change for one offer, rebuilt from the database (never from what the browser sends).
 * A "next_box" offer charges nothing: it only tags the order and queues the subscription for the customer
 * named in the signed post-purchase token.
 */
export async function offerChanges(
  shopDomain: string,
  offerId: string,
  quantity: number,
  ctx: { referenceId?: string; customerId?: string | null } = {},
) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return null;
  const offer = await prisma.postPurchaseOffer.findFirst({
    where: { id: offerId, funnel: { storeId: store.id, enabled: true } },
  });
  if (!offer) return null;

  if (offer.offerType === "next_box") {
    if (!ctx.referenceId) return null;
    const data = {
      shop: shopDomain,
      funnelId: offer.funnelId,
      offerId: offer.id,
      referenceId: ctx.referenceId,
      customerId: ctx.customerId ? numericId(ctx.customerId) : null,
      variantId: numericId(offer.variantId),
      productId: numericId(offer.productId),
      productTitle: offer.productTitle,
      variantTitle: offer.variantTitle,
      firstPrice: offer.subFirstPrice || offer.variantPrice || "0",
      recurringPrice: offer.subRecurringPrice || offer.variantPrice || "0",
      intervalDays: offer.subIntervalDays,
    };
    await prisma.nextBoxRequest.upsert({
      where: { referenceId_offerId: { referenceId: ctx.referenceId, offerId: offer.id } },
      update: { customerId: data.customerId },
      create: data,
    });
    const change = {
      type: "set_metafield",
      ...NEXT_BOX_METAFIELD,
      value: `${offer.productTitle} every ${offer.subIntervalDays} days: ${data.firstPrice} first delivery, then ${data.recurringPrice}`,
      valueType: "string",
    };
    return { offer, quantity: 1, changes: [change] };
  }

  const qty = offer.fixedQuantity > 0 ? offer.fixedQuantity : clampInt(quantity, 1, offer.maxQuantity, 1);
  const change: Record<string, unknown> = {
    type: "add_variant",
    variantId: Number(numericId(offer.variantId)),
    quantity: qty,
  };
  if (offer.discountPercent > 0) {
    change.discount = { value: offer.discountPercent, valueType: "percentage", title: offer.discountTitle };
  }
  return { offer, quantity: qty, changes: [change] };
}

/** The buyer accepted a "next box" offer (Shopify applied the change): let the job create the subscription. */
export async function confirmNextBox(referenceId: string, offerId: string) {
  return prisma.nextBoxRequest.updateMany({
    where: { referenceId, offerId, status: "signed" },
    data: { status: "pending", nextAttemptAt: new Date() },
  });
}

export async function nextBoxSummary(shopDomain: string) {
  const since = new Date(Date.now() - 30 * 86400000);
  const [groups, recent] = await Promise.all([
    prisma.nextBoxRequest.groupBy({ by: ["status"], where: { shop: shopDomain, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.nextBoxRequest.findMany({ where: { shop: shopDomain, status: { not: "signed" } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return {
    counts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number>,
    recent: recent.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      customerId: r.customerId,
      firstChargeDate: r.firstChargeDate,
      detail: r.detail,
    })),
  };
}

export async function recordEvent(
  shopDomain: string,
  e: {
    funnelId: string;
    offerId?: string | null;
    type: string;
    referenceId?: string | null;
    quantity?: number | null;
    revenue?: number | null;
    currency?: string | null;
    detail?: string | null;
  },
) {
  if (!["view", "accept", "decline", "error"].includes(e.type)) return null;
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return null;
  const funnel = await prisma.postPurchaseFunnel.findFirst({ where: { id: e.funnelId, storeId: store.id } });
  if (!funnel) return null;
  if (e.offerId) {
    const owned = await prisma.postPurchaseOffer.findFirst({ where: { id: e.offerId, funnelId: funnel.id }, select: { id: true } });
    if (!owned) e.offerId = null;
  }
  // One view / accept / decline per order and offer (the page can re-render, e.g. on Shop Pay).
  if (e.referenceId && e.type !== "error") {
    const dup = await prisma.postPurchaseEvent.findFirst({
      where: { funnelId: funnel.id, offerId: e.offerId || null, type: e.type, referenceId: e.referenceId },
      select: { id: true },
    });
    if (dup) return dup;
  }
  const revenue = Number(e.revenue);
  return prisma.postPurchaseEvent.create({
    data: {
      storeId: store.id,
      funnelId: funnel.id,
      offerId: e.offerId || null,
      type: e.type,
      referenceId: clean(e.referenceId, 190),
      quantity: e.quantity ? clampInt(e.quantity, 0, 1000, 0) : null,
      revenue: Number.isFinite(revenue) ? Math.round(revenue * 100) / 100 : null,
      currency: clean(e.currency, 10),
      detail: clean(e.detail, 2000),
    },
  });
}

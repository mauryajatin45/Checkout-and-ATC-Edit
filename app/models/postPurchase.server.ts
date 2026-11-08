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
export type { ShowWhen, TriggerType, TriggerProduct, OfferInput, FunnelInput } from "../lib/postPurchase.shared";
import { MAX_STEPS, parseJsonArray } from "../lib/postPurchase.shared";
import type { ShowWhen, TriggerType, TriggerProduct, OfferInput, FunnelInput } from "../lib/postPurchase.shared";

// ─── helpers ────────────────────────────────────────────────────────────────

export function numericId(gidOrId: string | number | null | undefined): string {
  if (gidOrId === null || gidOrId === undefined) return "";
  return String(gidOrId).split("/").pop()!.split("?")[0];
}

function clean(v: string | null | undefined, max = 2000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampPercent(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

function offerData(step: OfferInput, position: number) {
  return {
    position,
    showWhen: (["always", "accepted", "declined"].includes(String(step.showWhen)) ? step.showWhen : "always") as string,
    skipIfInOrder: step.skipIfInOrder ?? true,
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

function funnelData(data: FunnelInput) {
  return {
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
    timerMinutes: f.timerMinutes,
    steps: f.steps.map((s) => ({ ...s, showWhen: s.showWhen as ShowWhen, bullets: parseJsonArray<string>(s.bullets) })),
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
}

/** The funnel for an order: enabled, highest priority, and triggered by a product in the order. */
export async function matchFunnel(shopDomain: string, lines: OrderLine[]) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return null;
  const funnels = await prisma.postPurchaseFunnel.findMany({
    where: { storeId: store.id, enabled: true },
    include: { steps: { orderBy: { position: "asc" } } },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  const orderProducts = new Set(lines.map((l) => numericId(l.productId)));
  for (const f of funnels) {
    if (!f.steps.length) continue;
    if (f.triggerType === "all") return f;
    const triggers = parseJsonArray<TriggerProduct>(f.triggerProducts).map((p) => numericId(p.id));
    if (triggers.some((t) => orderProducts.has(t))) return f;
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
      productId: Number(numericId(s.productId)),
      variantId: Number(numericId(s.variantId)),
      productTitle: s.productTitle,
      variantTitle: s.variantTitle,
      imageUrl: s.imageUrl,
      compareAtPrice: s.compareAtPrice,
      discountPercent: s.discountPercent,
      discountTitle: s.discountTitle,
      maxQuantity: s.maxQuantity,
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

/** The order change for one offer, rebuilt from the database (never from what the browser sends). */
export async function offerChanges(shopDomain: string, offerId: string, quantity: number) {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return null;
  const offer = await prisma.postPurchaseOffer.findFirst({
    where: { id: offerId, funnel: { storeId: store.id, enabled: true } },
  });
  if (!offer) return null;
  const qty = clampInt(quantity, 1, offer.maxQuantity, 1);
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

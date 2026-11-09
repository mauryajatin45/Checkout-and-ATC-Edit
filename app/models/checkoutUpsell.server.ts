import prisma from "../db.server";

export interface UpsellItemInput {
  id?: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  customTitle?: string | null;
  customDescription?: string | null;
  strikethroughPrice?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  position?: number;
  headline?: string | null;
  subtext?: string | null;
  buttonLabel?: string | null;
  /** [{ id: "gid://shopify/ProductVariant/..", title }] */
  showIfVariants?: Array<{ id: string; title: string }>;
  hideIfVariants?: Array<{ id: string; title: string }>;
}

const short = (v: unknown, max: number) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
const variantRule = (list: unknown) =>
  JSON.stringify(
    (Array.isArray(list) ? list : [])
      .filter((v: any) => v && v.id)
      .map((v: any) => ({ id: String(v.id), title: String(v.title || "") })),
  );

/** Item columns shared by create and update. */
function itemRow(item: UpsellItemInput, index: number) {
  return {
    shopifyProductId: item.shopifyProductId,
    shopifyVariantId: item.shopifyVariantId,
    customTitle: item.customTitle || null,
    customDescription: item.customDescription || null,
    strikethroughPrice: item.strikethroughPrice || null,
    price: item.price || null,
    imageUrl: item.imageUrl || null,
    position: item.position ?? index,
    headline: short(item.headline, 190),
    subtext: short(item.subtext, 1000),
    buttonLabel: short(item.buttonLabel, 190),
    showIfVariants: variantRule(item.showIfVariants),
    hideIfVariants: variantRule(item.hideIfVariants),
  };
}

const numId = (v: string) => String(v).split("/").pop()!.split("?")[0];
function ruleIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x: any) => numId(x?.id || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Items whose cart rules fit: shown only when the cart has one of showIfVariants (if any are set),
 * and never when it has one of hideIfVariants. E.g. "popup adult in cart -> kids add-on bag, otherwise adult".
 */
export function itemsForCart<T extends { showIfVariants: string | null; hideIfVariants: string | null }>(
  items: T[],
  cartVariantIds: string[],
): T[] {
  const cart = new Set(cartVariantIds.map(numId));
  return items.filter((it) => {
    const show = ruleIds(it.showIfVariants);
    if (show.length && !show.some((v) => cart.has(v))) return false;
    return !ruleIds(it.hideIfVariants).some((v) => cart.has(v));
  });
}

export interface UpsellCampaignInput {
  name: string;
  enabled?: boolean;
  sourcePage: string;
  headline?: string | null;
  description?: string | null;
  buttonColor?: string | null;
  buttonTextColor?: string | null;
  priority?: number;
  items: UpsellItemInput[];
}

export async function getUpsellCampaigns(shopDomain: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
    include: {
      upsellCampaigns: {
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  return store?.upsellCampaigns || [];
}

export async function getUpsellCampaign(shopDomain: string, id: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) return null;

  return prisma.checkoutUpsellCampaign.findFirst({
    where: {
      id,
      storeId: store.id,
    },
    include: {
      items: {
        orderBy: { position: "asc" },
      },
    },
  });
}

export async function createUpsellCampaign(shopDomain: string, data: UpsellCampaignInput) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  return prisma.checkoutUpsellCampaign.create({
    data: {
      storeId: store.id,
      name: data.name,
      enabled: data.enabled ?? true,
      sourcePage: data.sourcePage.trim(),
      headline: data.headline ? data.headline.trim() : null,
      description: data.description || null,
      buttonColor: data.buttonColor || "#0066cc",
      buttonTextColor: data.buttonTextColor || "#ffffff",
      priority: data.priority || 0,
      items: {
        create: data.items.map((item, index) => itemRow(item, index)),
      },
    },
    include: {
      items: true,
    },
  });
}

export async function updateUpsellCampaign(shopDomain: string, id: string, data: UpsellCampaignInput) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  // Verify ownership
  const existing = await prisma.checkoutUpsellCampaign.findFirst({
    where: { id, storeId: store.id },
  });

  if (!existing) throw new Error("Campaign not found");

  // Transaction to update campaign and rewrite items
  return prisma.$transaction(async (tx) => {
    // Delete old items
    await tx.checkoutUpsellItem.deleteMany({
      where: { campaignId: id },
    });

    // Update campaign and insert new items
    return tx.checkoutUpsellCampaign.update({
      where: { id },
      data: {
        name: data.name,
        enabled: data.enabled ?? existing.enabled,
        sourcePage: data.sourcePage.trim(),
        headline: data.headline !== undefined ? (data.headline ? data.headline.trim() : null) : existing.headline,
        description: data.description ?? existing.description,
        buttonColor: data.buttonColor ?? existing.buttonColor ?? "#0066cc",
        buttonTextColor: data.buttonTextColor ?? existing.buttonTextColor ?? "#ffffff",
        priority: data.priority ?? existing.priority,
        items: {
          create: data.items.map((item, index) => itemRow(item, index)),
        },
      },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
      },
    });
  });
}

export async function deleteUpsellCampaign(shopDomain: string, id: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  return prisma.checkoutUpsellCampaign.deleteMany({
    where: {
      id,
      storeId: store.id,
    },
  });
}

export async function toggleUpsellCampaign(shopDomain: string, id: string, enabled: boolean) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  return prisma.checkoutUpsellCampaign.updateMany({
    where: {
      id,
      storeId: store.id,
    },
    data: { enabled },
  });
}

// Product info cache (handle, title) to make checkout queries sub-millisecond
const productInfoCache = new Map<string, { handle: string; title: string; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function slugMatchesTitle(slug: string, title: string): boolean {
  if (!slug || !title) return false;
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const cleanTitle = title.toLowerCase();

  // 1. Direct title slug substring match
  const titleSlug = cleanTitle.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (titleSlug.includes(cleanSlug) || cleanSlug.includes(titleSlug)) {
    return true;
  }

  // 2. Keyword matching: all significant words (len >= 3) from the slug are in the title
  const slugWords = cleanSlug.split("-").filter((w) => w.length >= 3);
  if (slugWords.length > 0) {
    const allWordsPresent = slugWords.every((word) => cleanTitle.includes(word));
    if (allWordsPresent) return true;
  }

  return false;
}

async function resolveProductHandles(
  shopDomain: string,
  accessToken: string,
  productIds: string[]
): Promise<Array<{ id: string; numericId: string; handle: string; title: string }>> {
  const results: Array<{ id: string; numericId: string; handle: string; title: string }> = [];
  const uncachedNumericIds: string[] = [];

  for (const rawId of productIds) {
    const numericId = String(rawId).replace(/^gid:\/\/shopify\/Product\//, "").trim();
    if (!numericId) continue;

    const cached = productInfoCache.get(numericId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      results.push({
        id: `gid://shopify/Product/${numericId}`,
        numericId,
        handle: cached.handle,
        title: cached.title,
      });
    } else {
      uncachedNumericIds.push(numericId);
    }
  }

  // Fallback to Session token if store.accessToken is missing
  let token = accessToken;
  if (!token && shopDomain) {
    try {
      const sess = await prisma.session.findFirst({
        where: { shop: shopDomain },
        orderBy: { id: "desc" },
      });
      if (sess && sess.accessToken) {
        token = sess.accessToken;
      }
    } catch (e) {}
  }

  if (uncachedNumericIds.length > 0 && token && shopDomain) {
    try {
      const gids = uncachedNumericIds.map((numId) => `gid://shopify/Product/${numId}`);
      const res = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: `
            query getProductHandles($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on Product {
                  id
                  handle
                  title
                }
              }
            }
          `,
          variables: { ids: gids },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const nodes = json?.data?.nodes || [];
        for (const node of nodes) {
          if (node && node.id) {
            const numId = String(node.id).replace(/^gid:\/\/shopify\/Product\//, "").trim();
            const handle = (node.handle || "").toLowerCase().trim();
            const title = node.title || "";
            productInfoCache.set(numId, { handle, title, timestamp: Date.now() });
            results.push({
              id: node.id,
              numericId: numId,
              handle,
              title,
            });
          }
        }
      } else {
        console.warn("[getMatchingUpsell] Shopify Admin API returned status:", res.status);
      }
    } catch (apiErr) {
      console.error("[getMatchingUpsell] Error resolving product handles via Admin API:", apiErr);
    }
  }

  // Fallback to local prisma.product records if Admin API failed or uncached
  const resolvedNumericIds = new Set(results.map((r) => r.numericId));
  const stillMissing = uncachedNumericIds.filter((id) => !resolvedNumericIds.has(id));

  if (stillMissing.length > 0) {
    try {
      const dbProducts = await prisma.product.findMany({
        where: {
          OR: [
            ...stillMissing.map((numId) => ({ id: `gid://shopify/Product/${numId}` })),
            ...stillMissing.map((numId) => ({ shopifyProductId: `gid://shopify/Product/${numId}` })),
            ...stillMissing.map((numId) => ({ shopifyProductId: numId })),
          ],
        },
      });

      for (const p of dbProducts) {
        const numId = String(p.shopifyProductId || p.id).replace(/^gid:\/\/shopify\/Product\//, "").trim();
        const derivedHandle = p.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        productInfoCache.set(numId, { handle: derivedHandle, title: p.title, timestamp: Date.now() });
        results.push({
          id: p.id,
          numericId: numId,
          handle: derivedHandle,
          title: p.title,
        });
      }
    } catch (dbErr) {
      console.error("[getMatchingUpsell] DB fallback error:", dbErr);
    }
  }

  return results;
}

export async function getMatchingUpsell(
  shopDomain: string,
  sourceParam?: string | null,
  cartProductIds?: string[] | null,
  cartTitles?: string[] | null,
  cartVariantIds?: string[] | null,
  isEditor?: boolean
) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
    include: {
      upsellCampaigns: {
        where: { enabled: true },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!store || !store.upsellCampaigns || store.upsellCampaigns.length === 0) {
    return null;
  }

  // In Checkout Editor / Preview mode, always return the top active campaign
  if (isEditor && store.upsellCampaigns.length > 0) {
    return store.upsellCampaigns[0];
  }

  function normalizePath(raw: string): string {
    if (!raw) return "";
    let clean = raw.trim().toLowerCase();
    try {
      if (clean.startsWith("http://") || clean.startsWith("https://")) {
        clean = new URL(clean).pathname;
      }
    } catch (e) {}
    clean = clean.replace(/^(?:https?:\/\/)?(?:www\.)?[^\/]+/, "");
    clean = clean.replace(/^(?:www\.)?[a-z0-9-]+\.[a-z0-9.]+(?:\/|$)/, "/");
    clean = clean.split("?")[0].split("#")[0].replace(/\/+$/, "");
    if (clean && !clean.startsWith("/")) clean = "/" + clean;
    return clean || "/";
  }

  function getCampaignPaths(raw: string): string[] {
    if (!raw) return [];
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function isPathMatch(campSourceRaw: string, buyerSourceRaw: string): boolean {
    if (!campSourceRaw || !buyerSourceRaw) return false;
    const campTrim = campSourceRaw.trim().toLowerCase();
    const buyerTrim = buyerSourceRaw.trim().toLowerCase();

    // Universal wildcard match
    if (campTrim === "*" || campTrim === "all") return true;

    const normCamp = normalizePath(campTrim);
    const normBuyer = normalizePath(buyerTrim);

    // Exact normalized path match (e.g. "/pages/kids-deficiency-signs" === "/pages/kids-deficiency-signs")
    if (normCamp && normBuyer && normCamp === normBuyer) {
      return true;
    }

    // Wildcard prefix match (e.g. "/pages/promo*" matches "/pages/promo" and "/pages/promo-kids")
    if (campTrim.endsWith("*")) {
      const prefix = normalizePath(campTrim.replace(/\*+$/, ""));
      if (prefix && prefix !== "/" && (normBuyer === prefix || normBuyer.startsWith(prefix + "/"))) {
        return true;
      }
    }

    // Slug match if merchant entered just the handle: e.g. "kids-deficiency-signs"
    const campSlug = normCamp.split("/").filter(Boolean).pop() || "";
    if (campSlug && campSlug.length > 3 && normBuyer.endsWith("/" + campSlug)) {
      return true;
    }

    // Exact raw string match
    if (campTrim === buyerTrim) {
      return true;
    }

    return false;
  }

  const cleanSource = (sourceParam || "").trim().toLowerCase();

  // 1. Strict match against buyer tracked source page (e.g. from cart attribute)
  if (cleanSource) {
    for (const campaign of store.upsellCampaigns) {
      const paths = getCampaignPaths(campaign.sourcePage);
      for (const campSource of paths) {
        const campTrim = campSource.toLowerCase().trim();
        if (campTrim === "*" || campTrim === "all") continue;

        if (isPathMatch(campTrim, cleanSource)) {
          return campaign;
        }
      }
    }
  }

  // 2. Match against products in the cart
  if (cartProductIds && cartProductIds.length > 0) {
    const resolvedProducts = await resolveProductHandles(
      shopDomain,
      store.accessToken,
      cartProductIds
    );

    for (const campaign of store.upsellCampaigns) {
      const paths = getCampaignPaths(campaign.sourcePage);
      let matched = false;

      for (const campSource of paths) {
        const campTrim = campSource.toLowerCase().trim();
        if (campTrim === "*" || campTrim === "all") continue;

        const normCamp = normalizePath(campTrim);
        const campSlug = normCamp.split("/").filter(Boolean).pop() || "";

        for (const prod of resolvedProducts) {
          const handle = (prod.handle || "").toLowerCase();
          const numId = prod.numericId.toLowerCase();

          // Match by handle: e.g. campaign has /products/zeolite-kids-gummies and handle is zeolite-kids-gummies
          if (
            (handle && normCamp === `/products/${handle}`) ||
            (handle && normCamp === `/${handle}`) ||
            (handle && campSlug && campSlug === handle) ||
            (handle && normCamp.endsWith(`/${handle}`))
          ) {
            matched = true;
            break;
          }

          // Match by product ID: e.g. campaign has 9656359256305 or /products/9656359256305
          if (
            normCamp === `/products/${numId}` ||
            normCamp === `/${numId}` ||
            campSlug === numId ||
            campTrim === numId
          ) {
            matched = true;
            break;
          }

          // Match by title keywords: e.g. campaign slug "zeolite-kids-gummies" matches title "Zeolite Kids Detox Gummies"
          if (prod.title && campSlug && slugMatchesTitle(campSlug, prod.title)) {
            matched = true;
            break;
          }
        }

        if (matched) break;
      }

      if (matched) {
        return campaign;
      }
    }
  }

  // 3. Match against cart titles if provided
  if (cartTitles && cartTitles.length > 0) {
    for (const campaign of store.upsellCampaigns) {
      const paths = getCampaignPaths(campaign.sourcePage);
      for (const campSource of paths) {
        const campTrim = campSource.toLowerCase().trim();
        if (campTrim === "*" || campTrim === "all") continue;

        const normCamp = normalizePath(campTrim);
        const campSlug = normCamp.split("/").filter(Boolean).pop() || "";
        if (!campSlug || campSlug.length < 3) continue;

        for (const title of cartTitles) {
          if (slugMatchesTitle(campSlug, title)) {
            return campaign;
          }
        }
      }
    }
  }

  // 4. Fallback to universal wildcard campaign (* or all)
  const universal = store.upsellCampaigns.find((c) => {
    const paths = getCampaignPaths(c.sourcePage);
    return paths.some((p) => p === "*" || p.toLowerCase() === "all");
  });
  if (universal) return universal;

  return null;
}

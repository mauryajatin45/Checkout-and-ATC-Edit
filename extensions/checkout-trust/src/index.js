// Trust Badges — checkout block (purchase.checkout.block.render).
// A bordered list of icon + title + line, configured in the app (Checkout and ATC -> Trust Badges).
// Replaces the Checkout Blocks "Checkout Trust & Guarantee" block. Polaris web components via the remote DOM.

const BACKENDS = [
  ["parrox-us", "https://checkoutandatc.parrox.us.terzettoo.com"],
  ["parrox", "https://checkoutandatc.parrox.terzettoo.com"],
];
const DEFAULT_BACKEND = "https://checkoutandatc.zoyava.terzettoo.com";
const val = (s) => (s && typeof s === "object" && "value" in s ? s.value : s);

function backendFor(domain) {
  const d = String(domain || "").toLowerCase();
  for (const [needle, url] of BACKENDS) if (d.includes(needle)) return url;
  return DEFAULT_BACKEND;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    node.setAttribute(k, String(v));
    // The checkout's remote DOM reads component props, so set the camelCase property as well (same as checkout-upsell).
    const prop = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    try {
      node[prop] = v;
    } catch (e) {}
  }
  for (const c of [].concat(children || [])) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export default async function () {
  const api = globalThis.shopify;
  if (!api || typeof document === "undefined") return;
  const shop = (api.shop && (val(api.shop.myshopifyDomain) || api.shop.myshopifyDomain)) || "";
  // English checkouts: the store's checkout text leaves Shopify's own "First payment ..., then ..." blank
  // (so it no longer repeats under each product), so this block shows it once, right under "Recurring subtotal".
  if (!isSpanish(api)) {
    try {
      const text = await recurringText(api);
      if (text) document.body.appendChild(el("s-box", { "padding-block-end": "base" }, [el("s-text", { type: "strong" }, text)]));
    } catch (err) {
      console.error("[Trust Badges] recurring line", err);
    }
  }
  try {
    const res = await fetch(`${backendFor(shop)}/api/trust?shop=${encodeURIComponent(shop)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.enabled || !Array.isArray(data.items) || !data.items.length) return;
    document.body.appendChild(render(isSpanish(api) ? toSpanish(data) : data));
  } catch (err) {
    console.error("[Trust Badges]", err);
  }
}

// Spanish checkouts (es / es-US): use the item's own Spanish fields when the app provides them,
// otherwise translate the current badge copy; anything unknown stays as configured.
const ES = {
  "4.9 stars from 100,000+ reviews": "4.9 estrellas en más de 100,000 reseñas",
  "1 Million+ Members and more than 2 Billion Gummies sold!": "¡Más de 1 millón de miembros y más de 2 mil millones de gomitas vendidas!",
  "Clinically and 3rd Party Tested": "Probado clínicamente y por terceros",
  "Every lot of our products undergoes rigorous testing to ensure quality and purity.":
    "Cada lote de nuestros productos pasa por pruebas rigurosas para garantizar su calidad y pureza.",
  "Swap or Cancel Anytime": "Cambia o cancela cuando quieras",
  "Zero Commitments. Zero Worries. Modify your subscription at any time.":
    "Cero compromisos. Cero preocupaciones. Modifica tu suscripción en cualquier momento.",
};

// "First payment $20.00, then $39.99 every 28 days" for the subscription lines in the cart.
// First payment = what the lines cost today; renewal price and interval come from the selling plan (Storefront API).
async function recurringText(api) {
  const lines = (val(api.lines) || []).filter((l) => l && l.merchandise && l.merchandise.sellingPlan);
  if (!lines.length || typeof api.query !== "function") return "";
  const q = `query Z($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id
    sellingPlanAllocations(first: 25) { nodes { sellingPlan { id name
      billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } } }
      priceAdjustments { price { amount currencyCode } } } } } } }`;
  const res = await api.query(q, { variables: { ids: [...new Set(lines.map((l) => l.merchandise.id))] } });
  const byId = {};
  for (const n of (res && res.data && res.data.nodes) || []) if (n && n.id) byId[n.id] = n;
  let first = 0, renew = 0, cur = "USD", every = "";
  for (const l of lines) {
    const amt = l.cost && l.cost.totalAmount;
    first += Number((amt && amt.amount) || 0);
    if (amt && amt.currencyCode) cur = amt.currencyCode;
    const planId = l.merchandise.sellingPlan.id;
    const alloc = ((byId[l.merchandise.id] || {}).sellingPlanAllocations || { nodes: [] }).nodes.find((a) => a.sellingPlan && a.sellingPlan.id === planId);
    if (!alloc) return "";
    const adj = alloc.priceAdjustments || [];
    const last = adj[adj.length - 1];
    if (!last) return "";
    renew += Number(last.price.amount) * (l.quantity || 1);
    const bp = alloc.sellingPlan.billingPolicy || {};
    const unit = String(bp.interval || "").toLowerCase();
    const n = Number(bp.intervalCount || 0);
    const days = (String(alloc.sellingPlan.name || "").match(/(\d+)\s*day/i) || [])[1];
    let label = unit && n ? (n === 1 ? unit : `${n} ${unit}s`) : days ? `${days} days` : "";
    // Client wording: 4-weekly plans read as "1 month" (billing itself stays every 28 days)
    if (label === "28 days" || label === "4 weeks" || label === "month") label = "1 month";
    if (!label || (every && every !== label)) return ""; // unknown or mixed intervals
    every = label;
  }
  const fmt = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(v);
  return `First payment ${fmt(first)}, then ${fmt(renew)} every ${every}`;
}

function isSpanish(api) {
  try {
    const lang = val(api.localization && api.localization.language);
    return String((lang && lang.isoCode) || "").toLowerCase().startsWith("es");
  } catch (e) {
    return false;
  }
}

function toSpanish(data) {
  const tr = (s) => (s && ES[String(s).trim()]) || s;
  return {
    ...data,
    title: data.titleEs || tr(data.title),
    items: data.items.map((it) => ({ ...it, title: it.titleEs || tr(it.title), description: it.descriptionEs || tr(it.description) })),
  };
}

function render(data) {
  const rows = data.items.map((it) =>
    el("s-grid", { "grid-template-columns": it.icon ? "36px 1fr" : "1fr", gap: "base", "align-items": "center", "inline-size": "fill" }, [
      it.icon
        ? el("s-grid-item", {}, [
            // Fixed 36px box: the image fills its container, so the box sets the icon size.
            el(
              "s-box",
              { "inline-size": "36px", "max-inline-size": "36px", "block-size": "36px", "max-block-size": "36px", overflow: "hidden" },
              [el("s-image", { src: it.icon, alt: "", "inline-size": "fill", "aspect-ratio": "1/1", "object-fit": "contain" })],
            ),
          ])
        : null,
      el("s-grid-item", {}, [
        el("s-stack", { gap: "none" }, [
          it.title ? el("s-text", { type: "strong" }, it.title) : null,
          it.description ? el("s-text", { color: "subdued" }, it.description) : null,
        ]),
      ]),
    ]),
  );
  return el("s-box", { border: "base", "border-radius": "base", padding: "base" }, [
    el("s-stack", { gap: "base" }, [data.title ? el("s-heading", {}, data.title) : null, ...rows]),
  ]);
}

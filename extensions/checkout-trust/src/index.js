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
  for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null && v !== false) node.setAttribute(k, String(v));
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
  try {
    const res = await fetch(`${backendFor(shop)}/api/trust?shop=${encodeURIComponent(shop)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.enabled || !Array.isArray(data.items) || !data.items.length) return;
    document.body.appendChild(render(data));
  } catch (err) {
    console.error("[Trust Badges]", err);
  }
}

function render(data) {
  const rows = data.items.map((it) =>
    el("s-grid", { "grid-template-columns": it.icon ? "40px 1fr" : "1fr", gap: "base", "align-items": "center" }, [
      it.icon ? el("s-grid-item", {}, [el("s-image", { src: it.icon, alt: "", "inline-size": "fill", "aspect-ratio": "1" })]) : null,
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

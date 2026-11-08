// Thank You Offer — block on Shopify's Thank you page (purchase.thank-you.block.render).
//
// The order is already complete here, so nothing can be added to it. Each product gets a "Buy now" button that
// opens a NEW checkout (cart permalink) with the product, quantity, the buyer's email/address and the offer's
// discount code filled in; Shop Pay buyers confirm in one tap. The offer itself is configured in the app
// (Checkout and ATC → Thank You Page) and fetched from our backend; prices are read live from the Storefront API.
// Uses Polaris web components through the remote DOM (`document`), like the other extensions in this app.

const BACKENDS = [
  ["parrox-us", "https://checkoutandatc.parrox.us.terzettoo.com"],
  ["parrox", "https://checkoutandatc.parrox.terzettoo.com"],
];
const DEFAULT_BACKEND = "https://checkoutandatc.zoyava.terzettoo.com";

function backendFor(domain) {
  const d = String(domain || "").toLowerCase();
  for (const [needle, url] of BACKENDS) if (d.includes(needle)) return url;
  return DEFAULT_BACKEND;
}

const val = (s) => (s && typeof s === "object" && "value" in s ? s.value : s);
const numericId = (gid) => String(gid || "").split("/").pop().split("?")[0];

export default async function () {
  const api = globalThis.shopify;
  if (!api || typeof document === "undefined") return;
  const offer = new ThankYouOffer(api);
  try {
    await offer.start();
  } catch (err) {
    console.error("[Thank You Offer]", err);
  }
}

class ThankYouOffer {
  constructor(api) {
    this.api = api;
    this.shopDomain = (api.shop && (val(api.shop.myshopifyDomain) || api.shop.myshopifyDomain)) || "";
    this.backend = backendFor(this.shopDomain);
    const sf = (api.shop && (val(api.shop.storefrontUrl) || api.shop.storefrontUrl)) || `https://${this.shopDomain}`;
    this.storefront = String(sf).replace(/\/$/, "");
    this.isEditor = !!(api.extension && (val(api.extension.editor) || api.extension.editor));
    this.campaign = null;
    this.items = [];
    this.qty = {};
    this.root = null;
    this.timerNode = null;
    this.deadline = 0;
    this.timer = null;
  }

  // ─── data ─────────────────────────────────────────────────────────────────

  orderRef() {
    const oc = val(this.api.orderConfirmation) || {};
    return numericId(oc.order && oc.order.id) || String(oc.number || "");
  }

  orderProductIds() {
    const lines = val(this.api.lines) || [];
    const ids = new Set();
    for (const l of lines) {
      const pid = l && l.merchandise && l.merchandise.product && l.merchandise.product.id;
      if (pid) ids.add(numericId(pid));
    }
    return [...ids];
  }

  async post(path, payload, keepalive) {
    let token = "";
    try {
      token = await this.api.sessionToken.get();
    } catch (e) {}
    return fetch(`${this.backend}${path}`, {
      method: "POST",
      keepalive: !!keepalive,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ shop: this.shopDomain, ...payload }),
    });
  }

  track(type, item) {
    if (!this.campaign || this.isEditor) return;
    this.post(
      "/api/thank-you/event",
      { campaignId: this.campaign.id, itemId: item ? item.id : null, type, referenceId: this.orderRef(), quantity: item ? this.qty[item.id] : null },
      true,
    ).catch(() => {});
  }

  /** Live price / availability / image from the Storefront API, in the buyer's country when known. */
  async livePrices(variantIds) {
    if (typeof this.api.query !== "function" || !variantIds.length) return {};
    const country = (() => {
      try {
        const c = val(this.api.localization && this.api.localization.country);
        return (c && c.isoCode) || null;
      } catch (e) {
        return null;
      }
    })();
    const q = `query TyVariants($ids: [ID!]!${country ? ", $country: CountryCode" : ""}) ${country ? "@inContext(country: $country)" : ""} {
      nodes(ids: $ids) {
        ... on ProductVariant { id availableForSale price { amount currencyCode } compareAtPrice { amount } image { url }
          product { featuredImage { url } rating: metafield(namespace: "reviews", key: "rating") { value } ratingCount: metafield(namespace: "reviews", key: "rating_count") { value } } }
      }
    }`;
    try {
      const res = await this.api.query(q, {
        variables: { ids: variantIds.map((id) => `gid://shopify/ProductVariant/${id}`), ...(country ? { country } : {}) },
      });
      const out = {};
      for (const n of (res && res.data && res.data.nodes) || []) {
        if (!n || !n.id) continue;
        out[numericId(n.id)] = {
          available: n.availableForSale !== false,
          price: Number(n.price && n.price.amount),
          currency: (n.price && n.price.currencyCode) || "USD",
          compareAt: Number(n.compareAtPrice && n.compareAtPrice.amount) || 0,
          image: (n.image && n.image.url) || (n.product && n.product.featuredImage && n.product.featuredImage.url) || "",
          rating: parseRating(n.product && n.product.rating && n.product.rating.value),
          ratingCount: Number(n.product && n.product.ratingCount && n.product.ratingCount.value) || 0,
        };
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  async start() {
    let data = null;
    try {
      const res = await this.post("/api/thank-you/offer", { orderId: this.orderRef(), productIds: this.orderProductIds() });
      if (res.ok) data = await res.json();
    } catch (e) {}
    this.campaign = data && data.campaign;

    if (!this.campaign) {
      if (this.isEditor) this.drawPlaceholder("No live offer matches this preview. Create one in Checkout and ATC → Thank You Page.");
      return;
    }

    const owned = new Set(this.orderProductIds());
    const candidates = this.campaign.items.filter((it) => !(it.skipIfInOrder && owned.has(String(it.productId))));
    const live = await this.livePrices(candidates.map((it) => String(it.variantId)));
    const pct = Number(this.campaign.discountPercent) || 0;

    this.items = candidates
      .map((it) => {
        const l = live[String(it.variantId)];
        if (l && !l.available) return null;
        const base = l && Number.isFinite(l.price) ? l.price : Number(it.price) || 0;
        const unit = Math.round(base * (1 - pct / 100) * 100) / 100;
        const compare = Math.max(Number(it.compareAtPrice) || 0, (l && l.compareAt) || 0, pct > 0 ? base : 0);
        return {
          ...it,
          unit,
          compare,
          currency: (l && l.currency) || "USD",
          image: it.imageUrl || (l && l.image) || "",
          rating: (l && l.rating) || 0,
          ratingCount: (l && l.ratingCount) || 0,
        };
      })
      .filter(Boolean)
      // One focused offer converts better than a list: products are a fallback order, show the first eligible one.
      .slice(0, 1);
    if (!this.items.length) {
      if (this.isEditor) this.drawPlaceholder("The offer's products are sold out or already in this order.");
      return;
    }
    for (const it of this.items) this.qty[it.id] = 1;

    await this.startTimer();
    if (this.deadline && Date.now() >= this.deadline) {
      // The offer really ends when the timer says so (no resetting clocks).
      if (this.isEditor) this.drawPlaceholder(this.t("ended"));
      return;
    }
    this.draw();
    this.track("view");
  }

  async startTimer() {
    const minutes = Number(this.campaign.timerMinutes) || 0;
    if (!minutes) return;
    const key = `ty_deadline_${this.campaign.id}_${this.orderRef()}`;
    let saved = 0;
    try {
      saved = Number(await this.api.storage.read(key)) || 0;
    } catch (e) {}
    this.deadline = saved > Date.now() - 86400000 && saved ? saved : Date.now() + minutes * 60000;
    if (!saved) {
      try {
        await this.api.storage.write(key, String(this.deadline));
      } catch (e) {}
    }
    this.timer = setInterval(() => this.tick(), 1000);
  }

  timeLeft() {
    const ms = Math.max(0, this.deadline - Date.now());
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  tick() {
    if (this.timerNode) setText(this.timerNode, this.timeLeft());
    if (Date.now() >= this.deadline && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Time is up: remove the offer so the countdown means what it says.
      if (this.root && !this.isEditor) {
        try {
          document.body.removeChild(this.root);
        } catch (e) {}
        this.root = null;
      }
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  lang() {
    try {
      const l = val(this.api.localization && this.api.localization.language);
      return String((l && l.isoCode) || "en").toLowerCase().slice(0, 2);
    } catch (e) {
      return "en";
    }
  }

  t(key, n) {
    const es = this.lang() === "es";
    const S = {
      endsIn: es ? "Termina en" : "Ends in",
      qty: es ? "Cant." : "Qty",
      save: es ? "Ahorras" : "You save",
      reviews: es ? `${n} reseñas` : `${n} reviews`,
      ended: es ? "Esta oferta ha terminado." : "This offer has ended.",
      buy: es ? "Comprar ahora · {price}" : "Buy now · {price}",
    };
    return S[key];
  }

  money(amount, currency) {
    try {
      if (this.api.i18n && typeof this.api.i18n.formatCurrency === "function") {
        return this.api.i18n.formatCurrency(amount, { currency });
      }
    } catch (e) {}
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
    } catch (e) {
      return `$${Number(amount).toFixed(2)}`;
    }
  }

  fill(text, item) {
    const first = item || this.items[0];
    const off = first && first.compare > first.unit ? (1 - first.unit / first.compare) * 100 : Number(this.campaign.discountPercent) || 0;
    let out = String(text || "");
    // No real saving on this product: drop "at {percent}% off"-style phrases instead of showing "0% off".
    if (Math.round(off) < 1) out = out.replace(/\s*(?:[—–-]\s*)?(?:at|for|with)?\s*\{percent\}%\s*(?:off)?/gi, "");
    return out
      .replace(/\{product\}/g, (first && first.productTitle) || "")
      .replace(/\{percent\}/g, String(Math.round(off)))
      .replace(/\{price\}/g, first ? this.money(first.unit * (this.qty[first.id] || 1), first.currency) : "");
  }

  buyUrl(item) {
    const q = this.qty[item.id] || 1;
    const params = [];
    const add = (k, v) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") params.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    };
    add("discount", this.campaign.discountCode);
    add("attributes[_ty_offer]", this.campaign.id);
    add("attributes[_ty_from_order]", this.orderRef());
    // Prefill the new checkout with what the buyer just entered (only when Shopify shares it with the app).
    try {
      const bi = this.api.buyerIdentity;
      const email = bi && (val(bi.email) || "");
      add("checkout[email]", email);
    } catch (e) {}
    try {
      const a = val(this.api.shippingAddress);
      if (a) {
        add("checkout[shipping_address][first_name]", a.firstName);
        add("checkout[shipping_address][last_name]", a.lastName);
        add("checkout[shipping_address][address1]", a.address1);
        add("checkout[shipping_address][address2]", a.address2);
        add("checkout[shipping_address][city]", a.city);
        add("checkout[shipping_address][province]", a.provinceCode);
        add("checkout[shipping_address][zip]", a.zip);
        add("checkout[shipping_address][country]", a.countryCode);
        add("checkout[shipping_address][phone]", a.phone);
      }
    } catch (e) {}
    return `${this.storefront}/cart/${item.variantId}:${q}${params.length ? `?${params.join("&")}` : ""}`;
  }

  // ─── view ─────────────────────────────────────────────────────────────────

  mount(node) {
    if (this.root) {
      try {
        document.body.removeChild(this.root);
      } catch (e) {}
    }
    this.root = node;
    document.body.appendChild(node);
  }

  drawPlaceholder(message) {
    this.mount(el("s-banner", { tone: "info", heading: "Thank You Offer" }, [el("s-text", {}, message)]));
  }

  itemRow(item) {
    const qty = this.qty[item.id] || 1;
    const off = item.compare > item.unit ? Math.round((1 - item.unit / item.compare) * 100) : 0;

    const prices = [];
    if (item.compare > item.unit + 0.009) prices.push(el("s-text", { type: "redundant", color: "subdued" }, this.money(item.compare * qty, item.currency)));
    prices.push(el("s-text", { type: "strong" }, this.money(item.unit * qty, item.currency)));
    if (off >= 1) prices.push(el("s-badge", { tone: "critical" }, `${off}% OFF`));

    const infoParts = [el("s-text", { type: "strong" }, item.productTitle)];
    if (item.rating >= 4 && item.ratingCount >= 10) {
      infoParts.push(el("s-text", { type: "small", color: "subdued" }, `${stars(item.rating)} ${item.rating.toFixed(1)} · ${this.t("reviews", item.ratingCount)}`));
    }
    infoParts.push(el("s-stack", { direction: "inline", gap: "small-200", alignItems: "center" }, prices));
    const saved = (item.compare - item.unit) * qty;
    if (saved > 0.009) infoParts.push(el("s-text", { type: "small", tone: "success" }, `${this.t("save")} ${this.money(saved, item.currency)}`));
    const info = el("s-stack", { gap: "small-200" }, infoParts);
    const top = item.image
      ? el("s-grid", { gridTemplateColumns: "80px 1fr", gap: "base", alignItems: "center" }, [
          el("s-image", { src: item.image, alt: item.productTitle, aspectRatio: "1", objectFit: "contain", borderRadius: "base", inlineSize: "fill" }),
          info,
        ])
      : info;

    const button = el("s-button", { variant: "primary", href: this.buyUrl(item), inlineSize: "fill" }, this.fill(this.campaign.buttonLabel || this.t("buy"), item));
    on(button, "click", () => this.track("click", item));

    let actions = button;
    const maxQ = Math.max(1, Number(item.maxQuantity) || 1);
    if (maxQ > 1) {
      const opts = Array.from({ length: maxQ }, (_, i) => el("s-option", { value: String(i + 1), selected: i + 1 === qty }, String(i + 1)));
      const select = el("s-select", { label: this.t("qty"), value: String(qty) }, opts);
      on(select, "change", (e) => {
        const v = Number((e && e.currentTarget && e.currentTarget.value) || select.value) || 1;
        this.qty[item.id] = Math.min(maxQ, Math.max(1, v));
        this.draw();
      });
      actions = el("s-grid", { gridTemplateColumns: "88px 1fr", gap: "base", alignItems: "end" }, [select, button]);
    }
    return el("s-stack", { gap: "base" }, [top, actions]);
  }

  draw() {
    const c = this.campaign;
    const head = [];
    const badgeAndTimer = [];
    if (c.badgeText) badgeAndTimer.push(el("s-badge", { tone: "critical" }, this.fill(c.badgeText)));
    if (this.deadline && Date.now() < this.deadline) {
      this.timerNode = el("s-text", { type: "strong", tone: "critical" }, this.timeLeft());
      badgeAndTimer.push(el("s-stack", { direction: "inline", gap: "small-300", alignItems: "center" }, [el("s-text", { color: "subdued" }, this.t("endsIn")), this.timerNode]));
    } else {
      this.timerNode = null;
    }
    if (badgeAndTimer.length) {
      head.push(el("s-stack", { direction: "inline", justifyContent: "space-between", alignItems: "center", gap: "base" }, badgeAndTimer));
    }
    if (c.headline) head.push(el("s-heading", {}, this.fill(c.headline)));
    if (c.subheadline) head.push(el("s-text", { color: "subdued" }, this.fill(c.subheadline)));

    const body = [el("s-stack", { gap: "small-200" }, head)];
    this.items.forEach((it, i) => {
      if (i > 0) body.push(el("s-divider"));
      body.push(this.itemRow(it));
    });
    if (c.smallPrint) body.push(el("s-text", { type: "small", color: "subdued" }, this.fill(c.smallPrint)));

    this.mount(el("s-box", { padding: "base", border: "base", borderRadius: "base", background: "base" }, [el("s-stack", { gap: "base" }, body)]));
  }
}

// ─── tiny DOM helpers (remote DOM: set both attribute and property) ─────────

function el(tag, props = {}, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    const attr = k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    try {
      node.setAttribute(attr, v === true ? "" : String(v));
    } catch (e) {}
    try {
      node[k] = v;
    } catch (e) {}
  }
  if (children !== undefined && children !== null) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
  }
  return node;
}

function parseRating(raw) {
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw);
    return Number(v && v.value) || 0;
  } catch (e) {
    return Number(raw) || 0;
  }
}

function stars(r) {
  const full = Math.round(r);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

function setText(node, text) {
  while (node.firstChild) node.removeChild(node.firstChild);
  node.appendChild(document.createTextNode(String(text)));
}

function on(node, type, fn) {
  try {
    node.addEventListener(type, fn);
  } catch (e) {
    try {
      node[`on${type}`] = fn;
    } catch (e2) {}
  }
}

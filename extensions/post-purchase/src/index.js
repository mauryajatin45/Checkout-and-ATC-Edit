/*
 * Post Purchase Offer: the one-click page Shopify shows between payment and the thank-you page.
 *
 * ShouldRender asks our backend which funnel fits this order (by the products bought) and only shows the page
 * when there is an offer worth showing. Render draws the offer, prices it with Shopify (calculateChangeset, so
 * shipping, taxes and currency are exact), and on "Pay now" asks the backend to sign the change and applies it
 * to the order with the customer's saved payment method. Up to 3 offers per order; later offers can depend on
 * whether the previous one was accepted or declined.
 *
 * Funnels are configured in the app under "Post Purchase".
 */
import {
  extend,
  Banner,
  BlockStack,
  Button,
  CalloutBanner,
  Heading,
  Image,
  InlineStack,
  Layout,
  Select,
  Separator,
  Spinner,
  Text,
  TextBlock,
  TextContainer,
  Tiles,
  View,
} from "@shopify/post-purchase-ui-extensions";

const MAX_ACCEPTED = 3;

function backendFor(domain) {
  const d = String(domain || "").toLowerCase();
  if (d.includes("parrox-us")) return "https://checkoutandatc.parrox.us.terzettoo.com";
  if (d.includes("parrox")) return "https://checkoutandatc.parrox.terzettoo.com";
  return "https://checkoutandatc.zoyava.terzettoo.com";
}

function post(inputData, path, body) {
  return fetch(`${backendFor(inputData.shop && inputData.shop.domain)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${inputData.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ shop: inputData.shop && inputData.shop.domain, referenceId: inputData.initialPurchase.referenceId, ...body }),
  });
}

function fetchFunnel(inputData) {
  const lineItems = (inputData.initialPurchase.lineItems || []).map((l) => ({
    productId: l.product && l.product.id,
    variantId: l.product && l.product.variant && l.product.variant.id,
    quantity: l.quantity,
  }));
  return post(inputData, "/api/post-purchase/offer", { lineItems })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && d.funnel && d.funnel.steps && d.funnel.steps.length ? d.funnel : null))
    .catch(() => null);
}

function track(inputData, funnel, step, type, extra) {
  post(inputData, "/api/post-purchase/event", {
    funnelId: funnel.id,
    offerId: step ? step.id : null,
    type,
    ...(extra || {}),
  }).catch(() => {});
}

function orderProductIds(inputData) {
  const ids = new Set();
  (inputData.initialPurchase.lineItems || []).forEach((l) => {
    if (l.product) ids.add(Number(l.product.id));
  });
  return ids;
}

/**
 * Index of the next step to show, starting at `from`. `outcome` is what happened to the previous step
 * ("accepted" | "declined" | null for the first one). Steps for a product already in the order are skipped
 * (when the offer says so) and count as declined.
 */
function nextStep(funnel, from, outcome, owned) {
  let last = outcome;
  for (let i = from; i < funnel.steps.length; i++) {
    const s = funnel.steps[i];
    const allowed = i === 0 || last === null || s.showWhen === "always" || s.showWhen === last;
    if (!allowed) continue;
    if (s.skipIfInOrder && owned.has(Number(s.productId))) {
      last = "declined";
      continue;
    }
    return i;
  }
  return -1;
}

function changesFor(step, quantity) {
  const change = { type: "add_variant", variantId: Number(step.variantId), quantity };
  if (step.discountPercent > 0) {
    change.discount = { value: step.discountPercent, valueType: "percentage", title: step.discountTitle || "Exclusive offer" };
  }
  return [change];
}

extend("Checkout::PostPurchase::ShouldRender", async ({ inputData, storage }) => {
  const funnel = await fetchFunnel(inputData);
  if (!funnel || nextStep(funnel, 0, null, orderProductIds(inputData)) === -1) return { render: false };
  await storage.update({ funnel });
  return { render: true };
});

extend("Checkout::PostPurchase::Render", (root, api) => {
  new OfferPage(root, api).start();
});

class OfferPage {
  constructor(root, api) {
    this.root = root;
    this.api = api;
    this.input = api.inputData;
    this.funnel = null;
    this.owned = orderProductIds(this.input);
    this.stepIndex = -1;
    this.qty = 1;
    this.calc = null; // Shopify's calculated purchase for the current step and quantity
    this.calculating = false;
    this.accepting = false;
    this.error = null;
    this.accepted = 0;
    this.deadline = 0;
    this.timerText = null;
    this.timer = null;
    this.page = null;
  }

  async start() {
    this.mount([this.c(BlockStack, { alignment: "center", spacing: "loose" }, [this.c(Spinner, { size: "large" })])]);
    const stored = this.api.storage.initialData;
    // Shop Pay renders this page on another domain, where the ShouldRender storage is not readable: fetch again.
    this.funnel = (stored && stored.funnel) || (await fetchFunnel(this.input));
    if (!this.funnel) return this.finish();
    const minutes = Number(this.funnel.timerMinutes) || 0;
    if (minutes > 0) {
      this.deadline = Date.now() + minutes * 60000;
      this.timer = setInterval(() => this.tick(), 1000);
    }
    this.goTo(nextStep(this.funnel, 0, null, this.owned));
  }

  c(type, props, children) {
    return this.root.createComponent(type, props || {}, children || []);
  }

  t(text) {
    return this.root.createText(String(text));
  }

  mount(children) {
    const page = this.c(BlockStack, { spacing: "loose" }, children);
    if (this.page) this.root.removeChild(this.page);
    this.root.appendChild(page);
    this.page = page;
  }

  get step() {
    return this.funnel && this.stepIndex >= 0 ? this.funnel.steps[this.stepIndex] : null;
  }

  async goTo(index) {
    if (index < 0 || this.accepted >= MAX_ACCEPTED) return this.finish();
    this.stepIndex = index;
    this.qty = 1;
    this.error = null;
    this.calc = null;
    const ok = await this.recalculate();
    if (!ok) {
      // Sold out, unsupported payment method, etc.: quietly move on instead of showing a broken offer.
      track(this.input, this.funnel, this.step, "error", { detail: this.error || "calculate_failed" });
      this.owned.add(Number(this.step.productId));
      return this.goTo(nextStep(this.funnel, index + 1, "declined", this.owned));
    }
    track(this.input, this.funnel, this.step, "view");
    this.draw();
  }

  async recalculate() {
    this.calculating = true;
    try {
      const res = await this.api.calculateChangeset({ changes: changesFor(this.step, this.qty) });
      if (res.status !== "processed" || (res.errors && res.errors.length)) {
        this.error = (res.errors && res.errors[0] && res.errors[0].message) || "This offer is not available.";
        return false;
      }
      this.calc = res.calculatedPurchase;
      return true;
    } catch (e) {
      this.error = String((e && e.message) || e);
      return false;
    } finally {
      this.calculating = false;
    }
  }

  async setQty(qty) {
    this.qty = qty;
    this.draw();
    const ok = await this.recalculate();
    if (!ok) {
      this.qty = 1;
      await this.recalculate();
      this.error = "That many aren't available. You can still add one.";
    } else {
      this.error = null;
    }
    this.draw();
  }

  async accept() {
    if (this.accepting) return;
    this.accepting = true;
    this.error = null;
    this.draw();
    const step = this.step;
    try {
      const r = await post(this.input, "/api/post-purchase/sign", { offerId: step.id, quantity: this.qty });
      const signed = r.ok ? await r.json() : null;
      if (!signed || !signed.token) throw new Error("We couldn't add this to your order. You have not been charged.");
      const result = await this.api.applyChangeset(signed.token);
      if (result.errors && result.errors.length) {
        throw new Error(result.errors[0].message || "We couldn't add this to your order. You have not been charged.");
      }
      const charged = this.calc && this.calc.totalOutstandingSet;
      track(this.input, this.funnel, step, "accept", {
        quantity: this.qty,
        revenue: charged ? Number(charged.shopMoney.amount) : null,
        currency: charged ? charged.shopMoney.currencyCode : null,
      });
      this.accepted += 1;
      this.owned.add(Number(step.productId));
      this.accepting = false;
      this.goTo(nextStep(this.funnel, this.stepIndex + 1, "accepted", this.owned));
    } catch (e) {
      this.accepting = false;
      this.error = String((e && e.message) || e);
      track(this.input, this.funnel, step, "error", { detail: this.error });
      this.draw();
    }
  }

  decline() {
    if (this.accepting) return;
    track(this.input, this.funnel, this.step, "decline");
    this.goTo(nextStep(this.funnel, this.stepIndex + 1, "declined", this.owned));
  }

  finish() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.api.done();
  }

  // ─── formatting ───────────────────────────────────────────────────────────

  money(amount, currency) {
    const n = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(this.input.locale || "en-US", { style: "currency", currency: currency || "USD" }).format(n);
    } catch (e) {
      return `$${n.toFixed(2)}`;
    }
  }

  prices() {
    const step = this.step;
    const calc = this.calc;
    const line = calc && calc.updatedLineItems && calc.updatedLineItems.find((l) => Number(l.variantId) === Number(step.variantId));
    const cur = (calc && calc.totalOutstandingSet.presentmentMoney.currencyCode) || "USD";
    const pct = Number(step.discountPercent) || 0;
    const lineTotal = line ? Number(line.totalPriceSet.presentmentMoney.amount) : 0;
    const unit = line ? Number(line.priceSet.presentmentMoney.amount) : 0;
    // Regular price before our discount, in the customer's currency.
    const regularUnit = pct > 0 && pct < 100 ? unit / (1 - pct / 100) : unit;
    // Crossed-out price: the merchant's "compare at" if set (scaled into the customer's currency), else the regular price.
    const shopUnit = line ? Number(line.priceSet.shopMoney.amount) : 0;
    const rate = shopUnit > 0 ? unit / shopUnit : 1;
    const compareUnit = Math.max(Number(step.compareAtPrice || 0) * rate, regularUnit);
    const shipping = (calc ? calc.addedShippingLines : []).reduce((a, s) => a + Number(s.priceSet.presentmentMoney.amount), 0);
    const taxes = (calc ? calc.addedTaxLines : []).reduce((a, t) => a + Number(t.priceSet.presentmentMoney.amount), 0);
    const total = calc ? Number(calc.totalOutstandingSet.presentmentMoney.amount) : 0;
    const compareTotal = compareUnit * this.qty;
    // % shown to the customer = saving against the crossed-out price (covers pre-discounted variants too).
    const off = compareTotal > 0 && lineTotal > 0 && lineTotal < compareTotal ? (1 - lineTotal / compareTotal) * 100 : pct;
    return {
      cur,
      pct: off,
      lineTotal,
      compareTotal,
      save: Math.max(0, compareTotal - lineTotal),
      shipping,
      taxes,
      total,
    };
  }

  fill(text, p) {
    return String(text || "")
      .replace(/\{product\}/g, this.step.productTitle || "")
      .replace(/\{percent\}/g, String(Math.round(p.pct)))
      .replace(/\{price\}/g, this.money(p.total, p.cur))
      .replace(/\{save\}/g, this.money(p.save, p.cur));
  }

  // ─── timer ────────────────────────────────────────────────────────────────

  timeLeft() {
    const ms = Math.max(0, this.deadline - Date.now());
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  tick() {
    if (!this.timerText) return;
    this.timerText.updateText(this.timeLeft());
    if (Date.now() >= this.deadline && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ─── view ─────────────────────────────────────────────────────────────────

  row(label, value, strong) {
    return this.c(Tiles, {}, [
      this.c(TextBlock, { emphasized: !!strong, subdued: !strong }, [this.t(label)]),
      this.c(TextContainer, { alignment: "trailing" }, [this.c(TextBlock, { emphasized: !!strong }, [this.t(value)])]),
    ]);
  }

  draw() {
    const step = this.step;
    if (!step) return;
    const p = this.prices();
    const busy = this.calculating || this.accepting;
    const firstAccepted = this.accepted > 0;

    // Header: confirmation + countdown
    this.timerText = this.deadline ? this.t(this.timeLeft()) : null;
    const headerChildren = [
      this.c(TextBlock, {}, [
        this.t(firstAccepted ? "Added to your order. One more exclusive offer: " : "Your order is confirmed. One last exclusive offer before your receipt"),
      ]),
    ];
    if (this.timerText) {
      headerChildren.push(
        this.c(TextBlock, { size: "small" }, [
          this.t("This price expires in "),
          this.c(Text, { emphasized: true, appearance: "critical" }, [this.timerText]),
        ]),
      );
    }
    const header = this.c(
      CalloutBanner,
      { title: firstAccepted ? "Great choice!" : "Wait! Your order isn't complete", background: "secondary", border: "none", alignment: "center", spacing: "tight" },
      headerChildren,
    );

    // Details column
    const details = [];
    if (step.badgeText || p.pct > 0) {
      const badge = [this.fill(step.badgeText, p), p.pct > 0 ? `${Math.round(p.pct)}% OFF` : ""].filter(Boolean).join(" · ");
      details.push(this.c(TextBlock, { size: "small", emphasized: true, appearance: "critical" }, [this.t(badge)]));
    }
    details.push(this.c(Heading, { level: 1 }, [this.t(this.fill(step.headline || step.productTitle, p))]));
    if (step.ratingText) details.push(this.c(TextBlock, { size: "small", emphasized: true, appearance: "warning" }, [this.t(this.fill(step.ratingText, p))]));
    if (step.subheadline) details.push(this.c(TextBlock, { subdued: true }, [this.t(this.fill(step.subheadline, p))]));

    // Price line
    const priceParts = [];
    if (p.compareTotal > p.lineTotal + 0.009) {
      priceParts.push(this.c(Text, { role: "deletion", size: "large", subdued: true }, [this.t(this.money(p.compareTotal, p.cur))]));
    }
    priceParts.push(this.c(Text, { size: "xlarge", emphasized: true }, [this.t(this.calc ? this.money(p.lineTotal, p.cur) : "…")]));
    if (p.save > 0.009) {
      priceParts.push(this.c(Text, { size: "medium", emphasized: true, appearance: "success" }, [this.t(`You save ${this.money(p.save, p.cur)}`)]));
    }
    details.push(this.c(InlineStack, { spacing: "tight", alignment: "baseline" }, priceParts));

    // Benefits
    const bullets = (step.bullets || []).filter(Boolean);
    if (bullets.length) {
      details.push(
        this.c(
          BlockStack,
          { spacing: "xtight" },
          bullets.map((b) => this.c(TextBlock, {}, [this.c(Text, { emphasized: true, appearance: "success" }, [this.t("✓ ")]), this.t(this.fill(b, p))])),
        ),
      );
    }

    // Quantity
    const maxQty = Math.max(1, Number(step.maxQuantity) || 1);
    if (maxQty > 1) {
      details.push(
        this.c(Select, {
          label: "Quantity",
          value: String(this.qty),
          disabled: busy,
          options: Array.from({ length: maxQty }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
          onChange: (v) => this.setQty(Number(v) || 1),
        }),
      );
    }

    // Money summary (Shopify requires the full cost to be clear before the buyer accepts)
    details.push(this.c(Separator, {}));
    details.push(
      this.c(BlockStack, { spacing: "xtight" }, [
        this.row("Subtotal", this.calc ? this.money(p.lineTotal, p.cur) : "…"),
        this.row("Shipping", this.calc ? (p.shipping > 0 ? this.money(p.shipping, p.cur) : "Free") : "…"),
        this.row("Taxes", this.calc ? this.money(p.taxes, p.cur) : "…"),
      ]),
    );
    details.push(this.c(Separator, {}));
    details.push(this.row("Total", this.calc ? this.money(p.total, p.cur) : "…", true));

    if (this.error) {
      details.push(this.c(Banner, { status: "critical" }, [this.c(TextBlock, {}, [this.t(this.error)])]));
    }

    // Actions
    details.push(
      this.c(BlockStack, { spacing: "tight" }, [
        this.c(
          Button,
          { submit: true, loading: busy, loadingLabel: this.accepting ? "Adding to your order…" : "Updating…", disabled: !this.calc, onPress: () => this.accept() },
          [this.t(this.fill(step.acceptLabel || "Pay now · {price}", p))],
        ),
        this.c(Button, { subdued: true, disabled: this.accepting, onPress: () => this.decline() }, [
          this.t(this.fill(step.declineLabel || "Decline this offer", p)),
        ]),
      ]),
    );
    if (step.guaranteeText) {
      details.push(this.c(TextContainer, { alignment: "center" }, [this.c(TextBlock, { size: "small", subdued: true }, [this.t(this.fill(step.guaranteeText, p))])]));
    }

    const media = step.imageUrl
      ? this.c(Image, { source: step.imageUrl, description: step.productTitle, aspectRatio: 1, fit: "contain", bordered: false })
      : this.c(View, {}, []);

    const layout = this.c(
      Layout,
      {
        media: [
          { viewportSize: "small", sizes: [1, 0, 1], maxInlineSize: 0.9 },
          { viewportSize: "medium", sizes: [532, 0, 1], maxInlineSize: 420 },
          { viewportSize: "large", sizes: [560, 38, 340] },
        ],
      },
      [media, this.c(View, {}, []), this.c(BlockStack, { spacing: "loose" }, details)],
    );

    this.mount([header, layout]);
  }
}

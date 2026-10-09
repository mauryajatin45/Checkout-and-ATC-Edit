// Checkout Upsell UI Extension
// Uses native Polaris Web Components (s-stack, s-box, s-text, s-image, s-button)
// Matches competitor layout positioned directly above the Contact section

export default function (arg1, arg2) {
  let api = null;

  // Resolve Shopify Checkout API
  if (arg1 && arg1.shop) {
    api = arg1;
  } else if (arg2 && arg2.shop) {
    api = arg2;
  } else if (typeof globalThis !== "undefined" && globalThis.shopify) {
    api = globalThis.shopify;
  }

  if (!api) {
    console.warn("[Checkout Upsell] Unable to locate Shopify Checkout API.");
    return;
  }

  const { shop, settings: extSettings, lines, attributes, applyCartLinesChange, extension } = api;

  const shopDomain =
    (shop && shop.myshopifyDomain) ||
    (globalThis.shopify && globalThis.shopify.shop && globalThis.shopify.shop.myshopifyDomain) ||
    "";

  // Auto-resolve backend API base URL
  const settingsVal = extSettings?.current || extSettings?.value || {};
  let baseUrl = settingsVal?.backend_url || "";
  if (baseUrl) {
    baseUrl = baseUrl.trim().replace(/\/$/, "");
  } else {
    const domainLower = String(shopDomain).toLowerCase();
    if (domainLower.includes("parrox-us")) {
      baseUrl = "https://checkoutandatc.parrox.us.terzettoo.com";
    } else if (domainLower.includes("parrox")) {
      baseUrl = "https://checkoutandatc.parrox.terzettoo.com";
    } else {
      baseUrl = "https://checkoutandatc.zoyava.terzettoo.com";
    }
  }

  const isEditor = !!(extension && extension.editor);
  const hasDocument = typeof document !== "undefined" && document.body;

  let currentCampaign = null;
  let isAddingMap = {};
  let isDescOpenMap = {};
  let container = null;

  function createEl(tag, attrs = {}, textContent = null) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) {
        el.setAttribute(k, String(v));
      }
    }
    if (textContent !== null && textContent !== undefined) {
      el.textContent = String(textContent);
    }
    return el;
  }

  function getCurrentLines() {
    if (Array.isArray(lines)) return lines;
    if (lines && Array.isArray(lines.value)) return lines.value;
    if (lines && Array.isArray(lines.current)) return lines.current;
    if (lines && Array.isArray(lines.__private_4_value)) return lines.__private_4_value;
    return [];
  }

  function getCurrentAttributes() {
    if (Array.isArray(attributes)) return attributes;
    if (attributes && Array.isArray(attributes.value)) return attributes.value;
    if (attributes && Array.isArray(attributes.current)) return attributes.current;
    if (attributes && Array.isArray(attributes.__private_4_value)) return attributes.__private_4_value;
    return [];
  }

  function getSourcePage() {
    const attrs = getCurrentAttributes();
    for (let i = 0; i < attrs.length; i++) {
      const k = (attrs[i].key || "").toLowerCase();
      if (k === "source_page" || k === "source" || k === "landing_page" || k === "page") {
        return attrs[i].value || "";
      }
    }

    try {
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("shopify_upsell_source_page");
        if (stored) return stored;
      }
    } catch (e) {}

    return "";
  }

  function getCartProductIds() {
    const curLines = getCurrentLines();
    const ids = [];
    for (let i = 0; i < curLines.length; i++) {
      const item = curLines[i];
      if (item.merchandise && item.merchandise.product && item.merchandise.product.id) {
        ids.push(String(item.merchandise.product.id).split("/").pop());
      }
    }
    return ids;
  }

  function isVariantInCart(variantId) {
    if (!variantId) return false;
    const curLines = getCurrentLines();
    const cleanTargetId = String(variantId).split("/").pop();

    return curLines.some(function (l) {
      if (!l.merchandise || !l.merchandise.id) return false;
      const curId = String(l.merchandise.id).split("/").pop();
      return curId === cleanTargetId;
    });
  }

  async function handleAddToCart(item) {
    if (!item.shopifyVariantId || isAddingMap[item.id]) return;
    isAddingMap[item.id] = true;
    renderUI();

    try {
      if (applyCartLinesChange) {
        // Ensure format is gid://shopify/ProductVariant/...
        let variantGid = item.shopifyVariantId;
        if (!variantGid.startsWith("gid://")) {
          variantGid = `gid://shopify/ProductVariant/${variantGid}`;
        }

        const res = await applyCartLinesChange({
          type: "addCartLine",
          merchandiseId: variantGid,
          quantity: 1,
        });
        console.log("[Checkout Upsell] Added line:", res);
      }
    } catch (err) {
      console.error("[Checkout Upsell] Error adding item:", err);
    } finally {
      isAddingMap[item.id] = false;
      renderUI();
    }
  }

  async function handleRemoveFromCart(item) {
    if (!item.shopifyVariantId || isAddingMap[item.id]) return;
    isAddingMap[item.id] = true;
    renderUI();

    try {
      const curLines = getCurrentLines();
      const cleanTargetId = String(item.shopifyVariantId).split("/").pop();

      const matched = curLines.find(function (l) {
        if (!l.merchandise || !l.merchandise.id) return false;
        const curId = String(l.merchandise.id).split("/").pop();
        return curId === cleanTargetId;
      });

      if (matched && applyCartLinesChange) {
        await applyCartLinesChange({
          type: "removeCartLine",
          id: matched.id,
          quantity: matched.quantity,
        });
        console.log("[Checkout Upsell] Removed line:", matched.id);
      }
    } catch (err) {
      console.error("[Checkout Upsell] Error removing item:", err);
    } finally {
      isAddingMap[item.id] = false;
      renderUI();
    }
  }

  // --- Rendering with Polaris Web Components ---
  function renderUI() {
    if (!hasDocument) return;

    if (!container) {
      container = createEl("s-stack", { gap: "tight" });
      document.body.appendChild(container);
    }

    // Clear previous children
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (!currentCampaign || !currentCampaign.items || currentCampaign.items.length === 0) {
      return;
    }

    // 1. Headline (Bold text above the upsell box, matching competitor)
    if (currentCampaign.headline) {
      const headlineText = createEl(
        "s-text",
        { type: "strong" },
        currentCampaign.headline
      );
      container.appendChild(headlineText);
    }

    // 2. Render each upsell card
    for (let i = 0; i < currentCampaign.items.length; i++) {
      const item = currentCampaign.items[i];
      const inCart = isVariantInCart(item.shopifyVariantId);
      const isAdding = !!isAddingMap[item.id];
      const isDescOpen = !!isDescOpenMap[item.id];

      // Card Box (Outer container with border and padding)
      const cardBox = createEl("s-box", {
        padding: "base",
        border: "base",
        borderRadius: "base",
        background: "base",
      });

      const cardStack = createEl("s-stack", { gap: "tight" });

      // Top Row: Thumbnail + Title on Left, Prices on Right
      const topRow = createEl("s-stack", {
        direction: "inline",
        gap: "base",
        alignItems: "center",
        justifyContent: "space-between",
      });

      // Left Info (Thumbnail + Title)
      const leftStack = createEl("s-stack", {
        direction: "inline",
        gap: "tight",
        alignItems: "center",
      });

      if (item.imageUrl) {
        const thumb = createEl("s-image", {
          src: item.imageUrl,
          alt: item.title || "Upsell Item",
          borderRadius: "base",
          inlineSize: "44px",
          blockSize: "44px",
          objectFit: "cover",
        });
        leftStack.appendChild(thumb);
      } else {
        const placeholder = createEl("s-text", { type: "strong" }, "📦 ");
        leftStack.appendChild(placeholder);
      }

      const titleText = createEl(
        "s-text",
        { type: "strong" },
        item.title || "Product Offer"
      );
      leftStack.appendChild(titleText);
      topRow.appendChild(leftStack);

      // Right Info (Prices)
      const priceStack = createEl("s-stack", {
        direction: "inline",
        gap: "tight",
        alignItems: "center",
      });

      if (item.strikethroughPrice) {
        const strikePrice = item.strikethroughPrice.startsWith("$")
          ? item.strikethroughPrice
          : `$${item.strikethroughPrice}`;
        const strikeText = createEl(
          "s-text",
          { type: "redundant", color: "subdued" },
          strikePrice
        );
        priceStack.appendChild(strikeText);
      }

      const displayPrice = item.price
        ? item.price.startsWith("$")
          ? item.price
          : `$${item.price}`
        : "$4.99";
      const sellText = createEl("s-text", { type: "strong" }, displayPrice);
      priceStack.appendChild(sellText);

      topRow.appendChild(priceStack);
      cardStack.appendChild(topRow);

      // Collapsible Description Accordion
      if (item.description) {
        const descBtn = createEl(
          "s-button",
          { variant: "secondary", type: "button" },
          isDescOpen ? "Product description ▲" : "Product description ▼"
        );
        descBtn.onclick = function () {
          isDescOpenMap[item.id] = !isDescOpenMap[item.id];
          renderUI();
        };
        cardStack.appendChild(descBtn);

        if (isDescOpen) {
          const descBox = createEl("s-box", {
            padding: "tight",
            background: "subdued",
            borderRadius: "base",
          });
          const descText = createEl(
            "s-text",
            { type: "small", color: "subdued" },
            item.description
          );
          descBox.appendChild(descText);
          cardStack.appendChild(descBox);
        }
      }

      // Action Button (Full-width "Add to cart" with customizable colors)
      const btn = createEl("s-button", {
        variant: inCart ? "secondary" : "primary",
        type: "button",
      });

      if (isAdding) {
        btn.setAttribute("loading", "true");
        btn.textContent = inCart ? "Removing..." : "Adding...";
      } else if (inCart) {
        btn.textContent = "Added ✓ (Tap to remove)";
      } else {
        btn.textContent = "Add to cart";
      }

      // Apply merchant-configured button colors
      const btnBg = currentCampaign.buttonColor || "#0066cc";
      const btnText = currentCampaign.buttonTextColor || "#ffffff";

      if (!inCart && !isAdding) {
        btn.style.backgroundColor = btnBg;
        btn.style.color = btnText;
        btn.setAttribute(
          "style",
          `background-color: ${btnBg} !important; color: ${btnText} !important; border-color: ${btnBg} !important;`
        );
      }

      btn.onclick = function () {
        if (inCart) {
          handleRemoveFromCart(item);
        } else {
          handleAddToCart(item);
        }
      };

      cardStack.appendChild(btn);
      cardBox.appendChild(cardStack);
      container.appendChild(cardBox);
    }
  }

  // --- Fetch Campaign from Backend ---
  async function loadUpsellCampaign() {
    const source = getSourcePage();
    const cartProductIds = getCartProductIds();

    const fetchUrl = `${baseUrl}/api/upsell?shop=${encodeURIComponent(
      shopDomain
    )}&source=${encodeURIComponent(source)}&cart_products=${encodeURIComponent(
      cartProductIds.join(",")
    )}&is_editor=${isEditor ? "true" : "false"}&_t=${Date.now()}`;

    try {
      console.log("[Checkout Upsell] Fetching campaign from:", fetchUrl);
      const res = await fetch(fetchUrl, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      if (res.ok) {
        const data = await res.json();
        currentCampaign = data.campaign || null;
        console.log(
          "[Checkout Upsell] Loaded campaign:",
          currentCampaign ? currentCampaign.name : "None matching"
        );
        renderUI();
      } else {
        console.warn("[Checkout Upsell] API returned status:", res.status);
      }
    } catch (err) {
      console.error("[Checkout Upsell] Network error loading campaign:", err);
    }
  }

  // Initial load
  loadUpsellCampaign();

  // Subscriptions to cart changes
  if (lines && typeof lines.subscribe === "function") {
    lines.subscribe(function () {
      renderUI();
    });
  }

  if (attributes && typeof attributes.subscribe === "function") {
    attributes.subscribe(function () {
      loadUpsellCampaign();
    });
  }
}

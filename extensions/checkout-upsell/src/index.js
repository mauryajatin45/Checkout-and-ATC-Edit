// Checkout Upsell UI Extension
// Matches the competitor's shipping protection / upsell design above Contact

export default function (arg1, arg2) {
  let root = null;
  let api = null;

  if (arg2) {
    if (arg1 && arg1.createComponent) {
      root = arg1;
      api = arg2;
    } else {
      api = arg1;
      root = arg2;
    }
  } else if (arg1) {
    if (arg1.createComponent) {
      root = arg1;
    } else {
      api = arg1;
      root = api.extension ? api.extension.root : null;
    }
  }

  if (!api && typeof globalThis !== "undefined" && globalThis.shopify) {
    api = globalThis.shopify;
  }

  if (!api) {
    console.warn("[Checkout Upsell] Unable to locate Shopify Checkout API.");
    return;
  }

  const shopDomain =
    (api.shop && api.shop.myshopifyDomain) ||
    (globalThis.shopify && globalThis.shopify.shop && globalThis.shopify.shop.myshopifyDomain) ||
    "";

  // Auto-resolve backend URL
  let baseUrl = (api.settings && api.settings.current && api.settings.current.backend_url) || "";
  if (baseUrl) {
    baseUrl = baseUrl.replace(/\/$/, "");
  } else {
    if (shopDomain.indexOf("a94f3b-3") !== -1) {
      baseUrl = "https://checkoutandatc.zoyava.terzettoo.com";
    } else if (shopDomain.indexOf("parrox-us") !== -1) {
      baseUrl = "https://checkoutandatc.parrox.us.terzettoo.com";
    } else if (shopDomain.indexOf("parrox") !== -1) {
      baseUrl = "https://checkoutandatc.parrox.terzettoo.com";
    } else {
      baseUrl = "https://checkoutandatc.zoyava.terzettoo.com";
    }
  }

  let currentCampaign = null;
  let isAddingMap = {};
  let isDescOpenMap = {};
  let renderedContainer = null;

  function getCurrentLines() {
    if (Array.isArray(api.lines)) return api.lines;
    if (api.lines && Array.isArray(api.lines.value)) return api.lines.value;
    if (api.lines && Array.isArray(api.lines.current)) return api.lines.current;
    return [];
  }

  function getCurrentAttributes() {
    if (Array.isArray(api.attributes)) return api.attributes;
    if (api.attributes && Array.isArray(api.attributes.value)) return api.attributes.value;
    if (api.attributes && Array.isArray(api.attributes.current)) return api.attributes.current;
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
    return "";
  }

  function getCartProductIds() {
    const lines = getCurrentLines();
    const ids = [];
    for (let i = 0; i < lines.length; i++) {
      const item = lines[i];
      if (item.merchandise && item.merchandise.product && item.merchandise.product.id) {
        ids.push(item.merchandise.product.id);
      }
    }
    return ids;
  }

  function isVariantInCart(variantId) {
    if (!variantId) return false;
    const lines = getCurrentLines();
    return lines.some(function (l) {
      return (
        l.merchandise &&
        (l.merchandise.id === variantId ||
          l.merchandise.id.indexOf(variantId) !== -1 ||
          variantId.indexOf(l.merchandise.id) !== -1)
      );
    });
  }

  async function handleAddToCart(item) {
    if (!item.shopifyVariantId || isAddingMap[item.id]) return;
    isAddingMap[item.id] = true;
    renderUI();

    try {
      if (api.applyCartLinesChange) {
        const res = await api.applyCartLinesChange({
          type: "addCartLine",
          merchandiseId: item.shopifyVariantId,
          quantity: 1,
        });
        console.log("[Checkout Upsell] Added line result:", res);
      }
    } catch (err) {
      console.error("[Checkout Upsell] Failed to add item:", err);
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
      const lines = getCurrentLines();
      const matched = lines.find(function (l) {
        return (
          l.merchandise &&
          (l.merchandise.id === item.shopifyVariantId ||
            l.merchandise.id.indexOf(item.shopifyVariantId) !== -1 ||
            item.shopifyVariantId.indexOf(l.merchandise.id) !== -1)
        );
      });

      if (matched && api.applyCartLinesChange) {
        await api.applyCartLinesChange({
          type: "removeCartLine",
          id: matched.id,
          quantity: matched.quantity,
        });
      }
    } catch (err) {
      console.error("[Checkout Upsell] Failed to remove item:", err);
    } finally {
      isAddingMap[item.id] = false;
      renderUI();
    }
  }

  // --- Rendering Implementation ---
  function renderUI() {
    if (!currentCampaign || !currentCampaign.items || currentCampaign.items.length === 0) {
      // Clear if no matching campaign
      if (root && renderedContainer) {
        try {
          root.removeChild(renderedContainer);
          renderedContainer = null;
        } catch (e) {}
      }
      return;
    }

    if (root && root.createComponent) {
      renderRemoteUI();
    } else if (typeof document !== "undefined" && document.body) {
      renderDomUI();
    }
  }

  // Remote UI Mode (Vanilla JS with remote-ui)
  function renderRemoteUI() {
    if (renderedContainer) {
      try {
        root.removeChild(renderedContainer);
      } catch (e) {}
    }

    // Main wrapper stack
    const mainStack = root.createComponent("BlockStack", { spacing: "tight" });

    // 1. Headline (Bold text matching competitor above box)
    if (currentCampaign.headline) {
      const headlineText = root.createComponent(
        "Text",
        { size: "base", emphasis: "bold" },
        currentCampaign.headline
      );
      mainStack.appendChild(headlineText);
    }

    // 2. Render each upsell item card
    for (let i = 0; i < currentCampaign.items.length; i++) {
      const item = currentCampaign.items[i];
      const inCart = isVariantInCart(item.shopifyVariantId);
      const isAdding = !!isAddingMap[item.id];
      const isDescOpen = !!isDescOpenMap[item.id];

      // Outer Card Box
      const cardBox = root.createComponent("Box", {
        border: "base",
        borderRadius: "base",
        padding: "base",
      });

      const cardStack = root.createComponent("BlockStack", { spacing: "tight" });

      // Top Row: Thumbnail + Title + Price
      const topRow = root.createComponent("InlineStack", {
        spacing: "base",
        blockAlignment: "center",
      });

      // Thumbnail Image
      if (item.imageUrl) {
        const thumb = root.createComponent("Image", {
          source: item.imageUrl,
          alt: item.title || "Upsell Item",
          border: "base",
          borderRadius: "base",
        });
        topRow.appendChild(thumb);
      } else {
        const placeholder = root.createComponent("Text", { size: "large" }, "📦");
        topRow.appendChild(placeholder);
      }

      // Title & Subtitle
      const titleStack = root.createComponent("BlockStack", { spacing: "none" });
      const titleText = root.createComponent(
        "Text",
        { size: "base", emphasis: "bold" },
        item.title || "Product Offer"
      );
      titleStack.appendChild(titleText);
      topRow.appendChild(titleStack);

      // Price Stack (Right aligned)
      const priceRow = root.createComponent("InlineStack", {
        spacing: "extraTight",
        blockAlignment: "center",
      });

      if (item.strikethroughPrice) {
        const strikePrice = item.strikethroughPrice.startsWith("$")
          ? item.strikethroughPrice
          : `$${item.strikethroughPrice}`;
        const strikeText = root.createComponent(
          "Text",
          { appearance: "subdued", size: "small", style: { textDecoration: "line-through" } },
          strikePrice
        );
        priceRow.appendChild(strikeText);
      }

      const displayPrice = item.price
        ? item.price.startsWith("$")
          ? item.price
          : `$${item.price}`
        : "$4.99";
      const sellText = root.createComponent(
        "Text",
        { size: "base", emphasis: "bold" },
        displayPrice
      );
      priceRow.appendChild(sellText);

      topRow.appendChild(priceRow);
      cardStack.appendChild(topRow);

      // Collapsible Product Description
      if (item.description) {
        const descToggleBtn = root.createComponent(
          "Button",
          {
            plain: true,
            onPress: function () {
              isDescOpenMap[item.id] = !isDescOpenMap[item.id];
              renderUI();
            },
          },
          isDescOpen ? "Product description ▲" : "Product description ▼"
        );
        cardStack.appendChild(descToggleBtn);

        if (isDescOpen) {
          const descBox = root.createComponent("Box", {
            padding: "tight",
            background: "subdued",
            borderRadius: "base",
          });
          const descText = root.createComponent(
            "Text",
            { size: "small", appearance: "subdued" },
            item.description
          );
          descBox.appendChild(descText);
          cardStack.appendChild(descBox);
        }
      }

      // Action Button
      let btn;
      if (inCart) {
        btn = root.createComponent(
          "Button",
          {
            kind: "secondary",
            loading: isAdding,
            onPress: function () {
              handleRemoveFromCart(item);
            },
          },
          "Added ✓ (Tap to remove)"
        );
      } else {
        btn = root.createComponent(
          "Button",
          {
            kind: "primary",
            loading: isAdding,
            onPress: function () {
              handleAddToCart(item);
            },
          },
          "Add to cart"
        );
      }

      cardStack.appendChild(btn);
      cardBox.appendChild(cardStack);
      mainStack.appendChild(cardBox);
    }

    renderedContainer = mainStack;
    root.appendChild(renderedContainer);
  }

  // DOM Web Components Mode (for modern sandbox)
  function renderDomUI() {
    let container = document.getElementById("checkout-upsell-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "checkout-upsell-container";
      container.style.marginBottom = "16px";
      document.body.appendChild(container);
    }
    container.innerHTML = "";

    // Headline
    if (currentCampaign.headline) {
      const headline = document.createElement("div");
      headline.style.fontSize = "14px";
      headline.style.fontWeight = "600";
      headline.style.color = "#111";
      headline.style.marginBottom = "8px";
      headline.innerText = currentCampaign.headline;
      container.appendChild(headline);
    }

    // Cards
    for (let i = 0; i < currentCampaign.items.length; i++) {
      const item = currentCampaign.items[i];
      const inCart = isVariantInCart(item.shopifyVariantId);
      const isAdding = !!isAddingMap[item.id];
      const isDescOpen = !!isDescOpenMap[item.id];

      const card = document.createElement("div");
      card.style.backgroundColor = "#fff";
      card.style.border = "1px solid #d9d9d9";
      card.style.borderRadius = "8px";
      card.style.padding = "12px";
      card.style.marginBottom = "10px";
      card.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";

      // Top Row
      const topRow = document.createElement("div");
      topRow.style.display = "flex";
      topRow.style.alignItems = "center";
      topRow.style.justifyContent = "space-between";
      topRow.style.gap = "10px";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "10px";
      left.style.flex = "1";

      if (item.imageUrl) {
        const img = document.createElement("img");
        img.src = item.imageUrl;
        img.alt = item.title || "";
        img.style.width = "40px";
        img.style.height = "40px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "6px";
        img.style.border = "1px solid #eee";
        left.appendChild(img);
      } else {
        const icon = document.createElement("div");
        icon.innerText = "📦";
        icon.style.fontSize = "22px";
        left.appendChild(icon);
      }

      const title = document.createElement("div");
      title.style.fontWeight = "600";
      title.style.fontSize = "14px";
      title.style.color = "#111";
      title.innerText = item.title || "Product Offer";
      left.appendChild(title);
      topRow.appendChild(left);

      // Price right
      const priceDiv = document.createElement("div");
      priceDiv.style.textAlign = "right";
      priceDiv.style.whiteSpace = "nowrap";

      if (item.strikethroughPrice) {
        const sSpan = document.createElement("span");
        sSpan.style.textDecoration = "line-through";
        sSpan.style.color = "#888";
        sSpan.style.fontSize = "12px";
        sSpan.style.marginRight = "6px";
        sSpan.innerText = item.strikethroughPrice.startsWith("$")
          ? item.strikethroughPrice
          : `$${item.strikethroughPrice}`;
        priceDiv.appendChild(sSpan);
      }

      const pSpan = document.createElement("span");
      pSpan.style.fontWeight = "700";
      pSpan.style.fontSize = "14px";
      pSpan.style.color = "#111";
      pSpan.innerText = item.price
        ? item.price.startsWith("$")
          ? item.price
          : `$${item.price}`
        : "$4.99";
      priceDiv.appendChild(pSpan);

      topRow.appendChild(priceDiv);
      card.appendChild(topRow);

      // Description Accordion
      if (item.description) {
        const descBtn = document.createElement("button");
        descBtn.type = "button";
        descBtn.style.background = "none";
        descBtn.style.border = "none";
        descBtn.style.padding = "4px 0";
        descBtn.style.marginTop = "6px";
        descBtn.style.fontSize = "12px";
        descBtn.style.color = "#555";
        descBtn.style.cursor = "pointer";
        descBtn.innerText = isDescOpen ? "Product description ▲" : "Product description ▼";
        descBtn.onclick = function () {
          isDescOpenMap[item.id] = !isDescOpenMap[item.id];
          renderUI();
        };
        card.appendChild(descBtn);

        if (isDescOpen) {
          const descBox = document.createElement("div");
          descBox.style.marginTop = "4px";
          descBox.style.padding = "6px 8px";
          descBox.style.backgroundColor = "#f7f7f7";
          descBox.style.borderRadius = "4px";
          descBox.style.fontSize = "12px";
          descBox.style.color = "#444";
          descBox.innerText = item.description;
          card.appendChild(descBox);
        }
      }

      // Add Button
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.width = "100%";
      btn.style.marginTop = "10px";
      btn.style.padding = "10px 14px";
      btn.style.borderRadius = "6px";
      btn.style.fontSize = "14px";
      btn.style.fontWeight = "600";
      btn.style.cursor = "pointer";
      btn.style.transition = "all 0.2s ease";

      if (inCart) {
        btn.innerText = isAdding ? "Updating..." : "Added ✓ (Tap to remove)";
        btn.style.backgroundColor = "#f0f2f5";
        btn.style.color = "#333";
        btn.style.border = "1px solid #ccc";
        btn.onclick = function () {
          handleRemoveFromCart(item);
        };
      } else {
        btn.innerText = isAdding ? "Adding..." : "Add to cart";
        btn.style.backgroundColor = "#0066cc";
        btn.style.color = "#ffffff";
        btn.style.border = "none";
        btn.onclick = function () {
          handleAddToCart(item);
        };
      }

      card.appendChild(btn);
      container.appendChild(card);
    }
  }

  // --- Fetch Campaign Logic ---
  async function loadUpsellCampaign() {
    const source = getSourcePage();
    const cartProductIds = getCartProductIds();

    const fetchUrl = `${baseUrl}/api/upsell?shop=${encodeURIComponent(
      shopDomain
    )}&source=${encodeURIComponent(source)}&cart_products=${encodeURIComponent(
      cartProductIds.join(",")
    )}`;

    try {
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const data = await res.json();
        currentCampaign = data.campaign || null;
        renderUI();
      }
    } catch (err) {
      console.error("[Checkout Upsell] Error fetching campaign:", err);
    }
  }

  // Initial load
  loadUpsellCampaign();

  // Subscribe to changes in lines or attributes
  if (api.lines && typeof api.lines.subscribe === "function") {
    api.lines.subscribe(function () {
      renderUI();
    });
  }

  if (api.attributes && typeof api.attributes.subscribe === "function") {
    api.attributes.subscribe(function () {
      loadUpsellCampaign();
    });
  }
}

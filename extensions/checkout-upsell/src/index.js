// Checkout Upsell UI Extension
// Uses native Polaris Web Components (s-grid, s-grid-item, s-stack, s-box, s-text, s-image, s-button, s-details, s-summary, s-divider)
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
  let container = null;
  let lastFetchedKey = "";
  let isFetching = false;

  // Helper to create element with attributes and text, compatible with remote-ui DOM shim
  function createEl(tag, attrs = {}, textContent = null) {
    const el = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) {
        // Convert camelCase to kebab-case for HTML attribute
        const kebabKey = k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        el.setAttribute(kebabKey, String(v));

        // Convert kebab-case to camelCase for JS property
        const camelKey = k.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        try {
          el[camelKey] = v;
        } catch (e) {}
        try {
          el[k] = v;
        } catch (e) {}
      }
    }

    if (textContent !== null && textContent !== undefined) {
      try {
        el.appendChild(document.createTextNode(String(textContent)));
      } catch (e) {
        try {
          el.textContent = String(textContent);
        } catch (e2) {}
      }
    }

    return el;
  }

  function setElementText(el, text) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    try {
      el.appendChild(document.createTextNode(String(text)));
    } catch (e) {
      try {
        el.textContent = String(text);
      } catch (e2) {}
    }
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
      if (item && item.merchandise && item.merchandise.product && item.merchandise.product.id) {
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
      if (!l || !l.merchandise || !l.merchandise.id) return false;
      const curId = String(l.merchandise.id).split("/").pop();
      return curId === cleanTargetId;
    });
  }

  async function handleAddToCart(item) {
    if (!item || !item.shopifyVariantId || isAddingMap[item.id]) return;
    isAddingMap[item.id] = true;
    renderUI();

    try {
      if (applyCartLinesChange) {
        let variantGid = String(item.shopifyVariantId);
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
    if (!item || !item.shopifyVariantId || isAddingMap[item.id]) return;
    isAddingMap[item.id] = true;
    renderUI();

    try {
      const curLines = getCurrentLines();
      const cleanTargetId = String(item.shopifyVariantId).split("/").pop();

      const matched = curLines.find(function (l) {
        if (!l || !l.merchandise || !l.merchandise.id) return false;
        const curId = String(l.merchandise.id).split("/").pop();
        return curId === cleanTargetId;
      });

      if (matched && applyCartLinesChange) {
        const res = await applyCartLinesChange({
          type: "removeCartLine",
          id: matched.id,
          quantity: matched.quantity,
        });
        console.log("[Checkout Upsell] Removed line:", res);
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

    try {
      if (!container) {
        container = createEl("s-stack", { gap: "base", "inline-size": "fill" });
        document.body.appendChild(container);
      } else {
        container.setAttribute("gap", "base");
        try { container.gap = "base"; } catch (e) {}
      }

      // Clear previous children
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      if (!currentCampaign || !currentCampaign.items || currentCampaign.items.length === 0) {
        return;
      }

      // 1. Headline (Bold text above the upsell box, optional with comfortable spacing)
      const cleanHeadline = (currentCampaign.headline || "").trim();
      if (cleanHeadline) {
        const headlineBox = createEl("s-box", {
          "padding-block-end": "tight",
          "inline-size": "fill",
        });
        headlineBox.setAttribute("style", "padding-bottom: 8px !important; margin-bottom: 4px !important; display: block !important;");
        if (headlineBox.style) {
          try {
            headlineBox.style.paddingBottom = "8px";
            headlineBox.style.marginBottom = "4px";
            headlineBox.style.display = "block";
          } catch (e) {}
        }
        const headlineText = createEl(
          "s-text",
          { type: "strong" },
          cleanHeadline
        );
        headlineBox.appendChild(headlineText);
        container.appendChild(headlineBox);
      }

      const isMulti = currentCampaign.items.length > 1;

      if (isMulti) {
        // --- MULTI-ITEM COMPACT LAYOUT (One unified card, space-saving inline rows) ---
        const unifiedCard = createEl("s-box", {
          padding: "base",
          border: "base",
          "border-radius": "base",
          background: "base",
          "inline-size": "fill",
        });

        const cardStack = createEl("s-stack", {
          gap: "base",
          "inline-size": "fill",
        });

        for (let i = 0; i < currentCampaign.items.length; i++) {
          try {
            const item = currentCampaign.items[i];
            const inCart = isVariantInCart(item.shopifyVariantId);
            const isAdding = !!isAddingMap[item.id];

            if (i > 0) {
              cardStack.appendChild(createEl("s-divider"));
            }

            // Compact row: Thumbnail (44px) | Info (1fr) | Action Button (auto)
            const itemRow = createEl("s-grid", {
              "grid-template-columns": item.imageUrl ? "44px 1fr auto" : "1fr auto",
              gap: "base",
              "align-items": "center",
              "inline-size": "fill",
            });

            // Column 1: Fixed 44x44 square thumbnail
            if (item.imageUrl) {
              const thumbItem = createEl("s-grid-item");
              const thumbBox = createEl("s-box", {
                "inline-size": "44px",
                "max-inline-size": "44px",
                "block-size": "44px",
                "max-block-size": "44px",
                overflow: "hidden",
                "border-radius": "base",
                border: "base",
                background: "subdued",
              });
              const img = createEl("s-image", {
                src: item.imageUrl,
                source: item.imageUrl,
                alt: item.title || "Upsell Item",
                "inline-size": "fill",
                "aspect-ratio": "1/1",
                "object-fit": "cover",
              });
              thumbBox.appendChild(img);
              thumbItem.appendChild(thumbBox);
              itemRow.appendChild(thumbItem);
            }

            // Column 2: Title and Prices stacked tightly
            const infoItem = createEl("s-grid-item");
            const infoStack = createEl("s-stack", { gap: "none" });

            const titleText = createEl(
              "s-text",
              { type: "strong" },
              item.title || "Product Offer"
            );
            infoStack.appendChild(titleText);

            const priceStack = createEl("s-stack", {
              direction: "inline",
              gap: "tight",
              "align-items": "center",
            });

            if (item.strikethroughPrice) {
              const strikeVal = String(item.strikethroughPrice).trim();
              const strikePrice = strikeVal.startsWith("$") ? strikeVal : `$${strikeVal}`;
              const strikeText = createEl(
                "s-text",
                { type: "redundant", color: "subdued" },
                strikePrice + "\u00A0\u00A0"
              );
              priceStack.appendChild(strikeText);
            }

            const rawPrice = item.price ? String(item.price).trim() : "$4.99";
            const displayPrice = rawPrice.startsWith("$") ? rawPrice : `$${rawPrice}`;
            const sellText = createEl("s-text", { type: "strong" }, displayPrice);
            priceStack.appendChild(sellText);
            infoStack.appendChild(priceStack);

            if (item.description) {
              const details = createEl("s-details");
              const summary = createEl("s-summary", {}, "Description");
              const descText = createEl(
                "s-text",
                { type: "small", color: "subdued" },
                item.description
              );
              details.appendChild(summary);
              details.appendChild(descText);
              infoStack.appendChild(details);
            }

            infoItem.appendChild(infoStack);
            itemRow.appendChild(infoItem);

            // Column 3: Compact Action Button (Add to cart / Remove)
            const btnItem = createEl("s-grid-item");
            const btn = createEl("s-button", {
              variant: inCart ? "secondary" : "primary",
              type: "button",
            });

            if (isAdding) {
              btn.setAttribute("loading", "true");
              try { btn.loading = true; } catch (e) {}
              setElementText(btn, inCart ? "Removing..." : "Adding...");
            } else if (inCart) {
              setElementText(btn, "Remove");
            } else {
              setElementText(btn, "Add to cart");
            }

            const btnBg = currentCampaign.buttonColor || "#008060";
            const btnText = currentCampaign.buttonTextColor || "#ffffff";

            if (!inCart && !isAdding) {
              btn.setAttribute(
                "style",
                `background-color: ${btnBg} !important; color: ${btnText} !important; border-color: ${btnBg} !important;`
              );
              if (btn.style) {
                try {
                  btn.style.backgroundColor = btnBg;
                  btn.style.color = btnText;
                  btn.style.borderColor = btnBg;
                } catch (e) {}
              }
            } else if (inCart) {
              btn.setAttribute("style", "color: #666666 !important;");
            }

            const onBtnClick = function () {
              if (isAddingMap[item.id]) return;
              if (inCart) {
                handleRemoveFromCart(item);
              } else {
                handleAddToCart(item);
              }
            };
            btn.addEventListener("click", onBtnClick);
            btn.onclick = onBtnClick;

            btnItem.appendChild(btn);
            itemRow.appendChild(btnItem);

            cardStack.appendChild(itemRow);
          } catch (itemErr) {
            console.error("[Checkout Upsell] Error rendering multi item:", i, itemErr);
          }
        }

        unifiedCard.appendChild(cardStack);
        container.appendChild(unifiedCard);

      } else {
        // --- SINGLE ITEM LAYOUT (Matching competitor shipping protection layout) ---
        const item = currentCampaign.items[0];
        const inCart = isVariantInCart(item.shopifyVariantId);
        const isAdding = !!isAddingMap[item.id];

        const cardBox = createEl("s-box", {
          padding: "base",
          border: "base",
          "border-radius": "base",
          background: "base",
          "inline-size": "fill",
        });

        const cardStack = createEl("s-stack", {
          gap: "base",
          "inline-size": "fill",
        });

        // Top Row: 3-column Grid (Thumbnail | Title | Prices)
        const topGrid = createEl("s-grid", {
          "grid-template-columns": item.imageUrl ? "48px 1fr auto" : "1fr auto",
          gap: "base",
          "align-items": "center",
          "inline-size": "fill",
        });

        if (item.imageUrl) {
          const thumbItem = createEl("s-grid-item");
          const thumbBox = createEl("s-box", {
            "inline-size": "48px",
            "max-inline-size": "48px",
            "block-size": "48px",
            "max-block-size": "48px",
            overflow: "hidden",
            "border-radius": "base",
            border: "base",
            background: "subdued",
          });
          const img = createEl("s-image", {
            src: item.imageUrl,
            source: item.imageUrl,
            alt: item.title || "Upsell Item",
            "inline-size": "fill",
            "aspect-ratio": "1/1",
            "object-fit": "cover",
          });
          thumbBox.appendChild(img);
          thumbItem.appendChild(thumbBox);
          topGrid.appendChild(thumbItem);
        }

        const titleItem = createEl("s-grid-item");
        const titleText = createEl(
          "s-text",
          { type: "strong" },
          item.title || "Product Offer"
        );
        titleItem.appendChild(titleText);
        topGrid.appendChild(titleItem);

        const priceItem = createEl("s-grid-item");
        const priceStack = createEl("s-stack", {
          direction: "inline",
          gap: "tight",
          "align-items": "center",
          "justify-content": "end",
        });

        if (item.strikethroughPrice) {
          const strikeVal = String(item.strikethroughPrice).trim();
          const strikePrice = strikeVal.startsWith("$") ? strikeVal : `$${strikeVal}`;
          const strikeText = createEl(
            "s-text",
            { type: "redundant", color: "subdued" },
            strikePrice + "\u00A0\u00A0"
          );
          priceStack.appendChild(strikeText);
        }

        const rawPrice = item.price ? String(item.price).trim() : "$4.99";
        const displayPrice = rawPrice.startsWith("$") ? rawPrice : `$${rawPrice}`;
        const sellText = createEl("s-text", { type: "strong" }, displayPrice);
        priceStack.appendChild(sellText);
        priceItem.appendChild(priceStack);
        topGrid.appendChild(priceItem);

        cardStack.appendChild(topGrid);

        // Native Collapsible Description Accordion
        if (item.description) {
          const details = createEl("s-details");
          const summary = createEl("s-summary", {}, "Product description");
          const descBox = createEl("s-box", {
            padding: "tight",
            background: "subdued",
            "border-radius": "base",
          });
          const descText = createEl(
            "s-text",
            { type: "small", color: "subdued" },
            item.description
          );
          descBox.appendChild(descText);
          details.appendChild(summary);
          details.appendChild(descBox);
          cardStack.appendChild(details);
        }

        // Full-width Action Button
        const btn = createEl("s-button", {
          variant: inCart ? "secondary" : "primary",
          type: "button",
          "inline-size": "fill",
        });

        if (isAdding) {
          btn.setAttribute("loading", "true");
          try { btn.loading = true; } catch (e) {}
          setElementText(btn, inCart ? "Removing..." : "Adding...");
        } else if (inCart) {
          setElementText(btn, "Remove");
        } else {
          setElementText(btn, "Add to cart");
        }

        const btnBg = currentCampaign.buttonColor || "#008060";
        const btnText = currentCampaign.buttonTextColor || "#ffffff";

        if (!inCart && !isAdding) {
          btn.setAttribute(
            "style",
            `width: 100% !important; inline-size: 100% !important; background-color: ${btnBg} !important; color: ${btnText} !important; border-color: ${btnBg} !important;`
          );
          if (btn.style) {
            try {
              btn.style.width = "100%";
              btn.style.inlineSize = "100%";
              btn.style.backgroundColor = btnBg;
              btn.style.color = btnText;
              btn.style.borderColor = btnBg;
            } catch (e) {}
          }
        } else if (inCart) {
          btn.setAttribute(
            "style",
            "width: 100% !important; inline-size: 100% !important;"
          );
          if (btn.style) {
            try {
              btn.style.width = "100%";
              btn.style.inlineSize = "100%";
            } catch (e) {}
          }
        }

        const onBtnClick = function () {
          if (isAddingMap[item.id]) return;
          if (inCart) {
            handleRemoveFromCart(item);
          } else {
            handleAddToCart(item);
          }
        };
        btn.addEventListener("click", onBtnClick);
        btn.onclick = onBtnClick;

        cardStack.appendChild(btn);
        cardBox.appendChild(cardStack);
        container.appendChild(cardBox);
      }
    } catch (renderErr) {
      console.error("[Checkout Upsell] Error during renderUI:", renderErr);
    }
  }

  // --- Fetch Campaign from Backend ---
  async function loadUpsellCampaign(force = false) {
    const source = getSourcePage();
    const cartProductIds = getCartProductIds();
    const fetchKey = `${source}::${cartProductIds.join(",")}`;

    if (!force && (isFetching || fetchKey === lastFetchedKey)) {
      return;
    }
    isFetching = true;
    lastFetchedKey = fetchKey;

    const fetchUrl = `${baseUrl}/api/upsell?shop=${encodeURIComponent(
      shopDomain
    )}&source=${encodeURIComponent(source)}&cart_products=${encodeURIComponent(
      cartProductIds.join(",")
    )}&is_editor=${isEditor ? "true" : "false"}&_t=${Date.now()}`;

    let data = null;
    try {
      console.log("[Checkout Upsell] Fetching campaign from:", fetchUrl);
      const res = await fetch(fetchUrl);

      if (res.ok) {
        data = await res.json();
      } else {
        console.warn("[Checkout Upsell] API returned status:", res.status);
      }
    } catch (netErr) {
      console.error("[Checkout Upsell] Network error loading campaign:", netErr);
    } finally {
      isFetching = false;
    }

    if (data && data.campaign) {
      currentCampaign = data.campaign;
      console.log(
        "[Checkout Upsell] Loaded campaign:",
        currentCampaign ? currentCampaign.name : "None matching"
      );
    } else {
      currentCampaign = null;
    }

    renderUI();
  }

  // Initial load
  loadUpsellCampaign(true);

  // Subscriptions to cart changes
  if (lines && typeof lines.subscribe === "function") {
    lines.subscribe(function () {
      renderUI();
    });
  }

  if (attributes && typeof attributes.subscribe === "function") {
    attributes.subscribe(function () {
      loadUpsellCampaign(false);
    });
  }
}

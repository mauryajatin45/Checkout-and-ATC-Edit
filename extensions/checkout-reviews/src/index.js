// Shopify Checkout UI Extension - Modern API (2025-10+ / 2026-07)
// API is on globalThis.shopify. Rendering uses the remote-ui bridge or DOM proxy.

export default function() {
  console.log("[Checkout Reviews] ===== EXTENSION STARTING v3 =====");
  
  // 1. Access API from globalThis.shopify
  const api = globalThis.shopify;
  if (!api) {
    console.error("[Checkout Reviews] FATAL: globalThis.shopify not available!");
    return;
  }
  
  console.log("[Checkout Reviews] API found. Keys:", Object.keys(api));
  
  const { lines, settings, shop, extension: ext } = api;
  console.log("[Checkout Reviews] shop:", JSON.stringify(shop));
  console.log("[Checkout Reviews] extension keys:", ext ? Object.keys(ext) : 'N/A');
  console.log("[Checkout Reviews] lines type:", typeof lines, "keys:", lines ? Object.keys(lines) : 'N/A');
  
  // 2. Determine rendering approach
  // Check if we have DOM access (iframe sandbox) or need remote-ui (worker sandbox)
  const hasDocument = typeof document !== 'undefined' && document.body;
  console.log("[Checkout Reviews] hasDocument:", hasDocument);
  console.log("[Checkout Reviews] typeof document:", typeof document);
  
  if (hasDocument) {
    console.log("[Checkout Reviews] document.body exists, using DOM rendering");
    console.log("[Checkout Reviews] document.body tagName:", document.body.tagName);
    console.log("[Checkout Reviews] document.body children:", document.body.children.length);
  }
  
  // Log ALL globals to find alternative rendering contexts
  const interestingGlobals = ['document', 'self', 'root', 'render', 'h', 'createElement',
    'createComponent', 'RemoteRoot', 'remoteRoot', 'extensionRoot'];
  interestingGlobals.forEach(name => {
    if (globalThis[name] !== undefined) {
      console.log(`[Checkout Reviews] globalThis.${name}:`, typeof globalThis[name]);
    }
  });
  
  // Try to find a root/rendering context on the shopify global
  if (api.root) console.log("[Checkout Reviews] api.root found:", typeof api.root);
  if (api.render) console.log("[Checkout Reviews] api.render found:", typeof api.render);
  if (ext && ext.root) console.log("[Checkout Reviews] ext.root found:", typeof ext.root);
  if (ext && ext.rendered) console.log("[Checkout Reviews] ext.rendered found:", typeof ext.rendered, ext.rendered);
  
  // 3. Create rendering functions for DOM approach
  function createEl(tag, attrs, textContent) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    }
    if (textContent) el.textContent = textContent;
    return el;
  }
  
  let container;
  
  if (hasDocument) {
    // Clear and set up container
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    
    container = createEl('s-stack', { gap: 'base' });
    const loading = createEl('s-text', { color: 'subdued' }, 'Loading reviews...');
    container.appendChild(loading);
    document.body.appendChild(container);
    console.log("[Checkout Reviews] Loading UI appended to document.body");
  } else {
    console.error("[Checkout Reviews] No document.body - cannot render DOM elements");
    console.log("[Checkout Reviews] Trying to log what's available in this environment:");
    console.log("[Checkout Reviews] typeof self:", typeof self);
    console.log("[Checkout Reviews] self keys:", typeof self !== 'undefined' ? Object.getOwnPropertyNames(self).slice(0, 50) : 'N/A');
    return;
  }
  
  // 4. Render reviews
  function renderReviews(reviews) {
    console.log(`[Checkout Reviews] renderReviews: ${reviews.length} reviews`);
    
    // Clear container
    while (container.firstChild) container.removeChild(container.firstChild);
    
    if (!reviews || reviews.length === 0) {
      console.log("[Checkout Reviews] No reviews to show");
      return;
    }
    
    // Cap reviews at 3 for checkout — keep it tight and high-impact
    const displayReviews = reviews.slice(0, 3);
    
    // ── Top divider ──
    container.appendChild(createEl('s-divider'));
    
    // ── Summary header: aggregate rating ──
    const avgRating = (displayReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / displayReviews.length).toFixed(1);
    const roundedStars = Math.round(parseFloat(avgRating));
    
    const headerBox = createEl('s-box', { padding: 'base', background: 'subdued', 'border-radius': 'base' });
    const headerStack = createEl('s-stack', { gap: 'tight' });
    
    const headingEl = createEl('s-heading', {}, 'Customer Reviews');
    headerStack.appendChild(headingEl);
    
    const ratingRow = createEl('s-stack', { gap: 'none' });
    const ratingSummary = createEl('s-text', { type: 'strong' },
      '★'.repeat(roundedStars) + '☆'.repeat(5 - roundedStars) +
      '  ' + avgRating + ' out of 5  ·  ' + reviews.length + (reviews.length === 1 ? ' review' : ' reviews')
    );
    ratingRow.appendChild(ratingSummary);
    headerStack.appendChild(ratingRow);
    
    headerBox.appendChild(headerStack);
    container.appendChild(headerBox);
    
    // ── Individual review cards ──
    displayReviews.forEach((review, i) => {
      console.log(`[Checkout Reviews] Review ${i + 1}: rating=${review.rating}`);
      
      // Each card gets a subdued background for visual lift
      const card = createEl('s-box', {
        padding: 'base',
        background: 'subdued',
        'border-radius': 'base'
      });
      
      const cardStack = createEl('s-stack', { gap: 'tight' });
      
      // ★ Star rating row — bold black stars
      const starsEl = createEl('s-text', { type: 'strong' },
        '★'.repeat(review.rating || 5) + '☆'.repeat(5 - (review.rating || 5))
      );
      cardStack.appendChild(starsEl);
      
      // Review title if available — bold emphasis
      if (review.title) {
        const titleEl = createEl('s-text', { type: 'strong' }, review.title);
        cardStack.appendChild(titleEl);
      }
      
      // Review body — wrapped in smart quotes for a testimonial feel
      const bodyEl = createEl('s-text', { type: 'emphasis' }, `\u201C${review.body || ''}\u201D`);
      cardStack.appendChild(bodyEl);
      
      // Reviewer attribution — subtle, small
      const attrEl = createEl('s-text', { type: 'small', color: 'subdued' },
        '\u2014 ' + (review.reviewer?.name || 'Verified Buyer')
      );
      cardStack.appendChild(attrEl);
      
      card.appendChild(cardStack);
      container.appendChild(card);
    });
    
    // ── Bottom divider ──
    container.appendChild(createEl('s-divider'));
    console.log("[Checkout Reviews] Render complete!");
  }
  
  // 5. Fetch reviews
  async function fetchReviews(currentLines) {
    console.log("[Checkout Reviews] fetchReviews called");
    
    if (!currentLines || !Array.isArray(currentLines) || currentLines.length === 0) {
      console.log("[Checkout Reviews] No lines data");
      renderReviews([]);
      return;
    }
    
    const productIds = Array.from(
      new Set(
        currentLines
          .map(line => {
            const id = line.merchandise?.product?.id;
            console.log("[Checkout Reviews] Line product id:", id);
            return id;
          })
          .filter(Boolean)
          .map(id => id.split('/').pop())
      )
    );
    
    console.log("[Checkout Reviews] Product IDs:", productIds);
    
    if (productIds.length === 0) {
      renderReviews([]);
      return;
    }
    
    try {
      const settingsVal = settings?.current || settings?.value;
      let baseUrl = settingsVal?.backend_url;
      console.log("[Checkout Reviews] Settings:", JSON.stringify(settingsVal));
      console.log("[Checkout Reviews] backend_url:", baseUrl);
      
      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/reviews`;
      } else {
        baseUrl = `${shop.storefrontUrl}apps/checkout-atc/api/reviews`;
      }
      
      const fetchUrl = `${baseUrl}?products=${productIds.join(',')}&shop=${shop.myshopifyDomain}`;
      console.log("[Checkout Reviews] Fetching:", fetchUrl);
      
      const res = await fetch(fetchUrl);
      console.log("[Checkout Reviews] Response:", res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log("[Checkout Reviews] Got reviews:", (data.reviews || []).length);
        renderReviews(data.reviews || []);
      } else {
        console.error("[Checkout Reviews] Fetch error:", res.status, await res.text());
        renderReviews([]);
      }
    } catch (err) {
      console.error("[Checkout Reviews] Fetch exception:", err);
      renderReviews([]);
    }
  }
  
  // 6. Subscribe to cart lines
  console.log("[Checkout Reviews] lines:", lines);
  console.log("[Checkout Reviews] lines.subscribe?", lines && typeof lines.subscribe);
  console.log("[Checkout Reviews] lines.current?", lines && lines.current);
  console.log("[Checkout Reviews] lines.value?", lines && lines.value);
  console.log("[Checkout Reviews] lines.__private_4_value?", lines && lines.__private_4_value);
  
  // Try to get initial lines value
  let initialLines;
  if (lines && lines.current) {
    initialLines = lines.current;
  } else if (lines && lines.value) {
    initialLines = lines.value;
  } else if (lines && lines.__private_4_value) {
    initialLines = lines.__private_4_value;
  }
  
  console.log("[Checkout Reviews] initialLines:", JSON.stringify(initialLines));
  
  if (lines && typeof lines.subscribe === 'function') {
    console.log("[Checkout Reviews] Subscribing to lines...");
    lines.subscribe(currentLines => {
      console.log("[Checkout Reviews] Lines changed:", currentLines?.length, "items");
      fetchReviews(currentLines);
    });
  } else if (initialLines) {
    console.log("[Checkout Reviews] Using initial lines directly");
    fetchReviews(initialLines);
  } else {
    console.log("[Checkout Reviews] No lines subscription or initial value, fetching with empty");
    fetchReviews([]);
  }
  
  console.log("[Checkout Reviews] ===== INIT COMPLETE =====");
}

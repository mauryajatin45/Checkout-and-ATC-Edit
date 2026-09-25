// Shopify Checkout UI Extension - Image Block
export default function() {
  const api = globalThis.shopify;
  if (!api) {
    console.log("[Checkout Image] No globalThis.shopify API found.");
    return;
  }

  const { shop, settings: extSettings, lines } = api;
  const hasDocument = typeof document !== 'undefined' && document.body;

  console.log("[Checkout Image] Init. hasDocument:", hasDocument);

  function createEl(tag, attrs = {}, children = []) {
    if (hasDocument) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          el.setAttribute(k, String(v));
        }
      }
      children.forEach(c => {
        if (typeof c === 'string') {
          el.appendChild(document.createTextNode(c));
        } else {
          el.appendChild(c);
        }
      });
      return el;
    } else {
      return api.extension.createComponent(tag, attrs, children);
    }
  }

  let root;
  if (hasDocument) {
    root = document.body;
  } else {
    root = api.extension.root;
  }

  let imageUrl = null;

  async function fetchSettings() {
    try {
      const settingsVal = extSettings?.current || extSettings?.value || {};
      let baseUrl = settingsVal?.backend_url;
      
      console.log("[Checkout Image] Settings backend_url:", baseUrl);

      let storefrontUrl = shop.storefrontUrl;
      if (storefrontUrl && !storefrontUrl.endsWith('/')) {
        storefrontUrl += '/';
      }

      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/image`;
      } else {
        baseUrl = `${storefrontUrl}apps/checkout-atc/api/image`;
      }
      
      console.log("[Checkout Image] Final API URL:", baseUrl);

      // Extract product IDs from the cart
      const currentLines = lines?.current || lines?.value || [];
      const pids = [];
      for (const l of currentLines) {
        if (l?.merchandise?.product?.id) {
          const id = String(l.merchandise.product.id).split('/').pop();
          if (id) pids.push(id);
        }
      }
      
      console.log("[Checkout Image] Product IDs in cart:", pids);

      if (pids.length === 0) {
        console.log("[Checkout Image] No products found in cart.");
        render();
        return;
      }

      const fetchUrl = `${baseUrl}?shop=${shop.myshopifyDomain}&products=${pids.join(',')}`;
      console.log("[Checkout Image] Fetching:", fetchUrl);

      const res = await fetch(fetchUrl);
      console.log("[Checkout Image] Fetch status:", res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log("[Checkout Image] API Response:", data);
        if (data.imageUrl) {
          imageUrl = data.imageUrl;
        }
      } else {
        console.error("[Checkout Image] API returned non-OK status.");
      }
    } catch (e) {
      console.error("[Checkout Image] Failed to fetch:", e);
    }
    
    render();
  }

  function render() {
    if (hasDocument) {
      while (root.firstChild) root.removeChild(root.firstChild);
    } else {
      for (const child of root.children) {
        root.removeChild(child);
      }
    }

    console.log("[Checkout Image] Render called. imageUrl:", imageUrl);

    if (!imageUrl) {
      console.log("[Checkout Image] No imageUrl. Rendering nothing.");
      return;
    }

    // Shopify requires native components for images
    console.log("[Checkout Image] Rendering s-image with source:", imageUrl);
    const imageEl = createEl('s-image', {
      src: imageUrl,
      source: imageUrl,
      loading: 'lazy',
      width: 'fill',
      borderRadius: 'loose',
      'border-radius': 'loose'
    });

    const boxEl = createEl('s-box', {
      inlineSize: 'fill',
      'inline-size': 'fill'
    });
    boxEl.appendChild(imageEl);

    root.appendChild(boxEl);
    console.log("[Checkout Image] Render complete.");
  }

  fetchSettings();
}

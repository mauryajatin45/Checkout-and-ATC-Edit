// Shopify Checkout UI Extension - Image Block
export default function() {
  const api = globalThis.shopify;
  if (!api) return;

  const { shop, settings: extSettings, lines } = api;
  const hasDocument = typeof document !== 'undefined' && document.body;

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
      
      let storefrontUrl = shop.storefrontUrl;
      if (storefrontUrl && !storefrontUrl.endsWith('/')) {
        storefrontUrl += '/';
      }

      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/image`;
      } else {
        baseUrl = `${storefrontUrl}apps/checkout-atc/api/image`;
      }
      
      // Extract product IDs from the cart
      const currentLines = lines?.current || lines?.value || [];
      const pids = [];
      for (const l of currentLines) {
        if (l?.merchandise?.product?.id) {
          const id = String(l.merchandise.product.id).split('/').pop();
          if (id) pids.push(id);
        }
      }
      
      const res = await fetch(`${baseUrl}?shop=${shop.myshopifyDomain}&products=${pids.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        if (data.imageUrl) {
          imageUrl = data.imageUrl;
        }
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

    if (!imageUrl) return;

    // The user wants a 9:16 portrait image. We just render it.
    const imageEl = createEl('s-image', {
      source: imageUrl,
      aspectRatio: '9/16',
      loading: 'lazy',
      fit: 'cover',
      borderRadius: 'base'
    });

    root.appendChild(imageEl);
  }

  fetchSettings();
}

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
      
      let storefrontUrl = shop.storefrontUrl;
      if (storefrontUrl && !storefrontUrl.endsWith('/')) {
        storefrontUrl += '/';
      }

      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/image`;
      } else {
        baseUrl = `${storefrontUrl}apps/checkout-atc/api/image`;
      }

      const currentLines = lines?.current || lines?.value || [];
      const pids = [];
      for (const l of currentLines) {
        if (l?.merchandise?.product?.id) {
          const id = String(l.merchandise.product.id).split('/').pop();
          if (id) pids.push(id);
        }
      }

      if (pids.length === 0) {
        render();
        return;
      }

      const fetchUrl = `${baseUrl}?shop=${shop.myshopifyDomain}&products=${pids.join(',')}`;
      const res = await fetch(fetchUrl);
      
      if (res.ok) {
        const data = await res.json();
        if (data.imageUrl) {
          imageUrl = data.imageUrl;
          // Force Cloudinary to upscale/downscale the image to 1000px width 
          // so Shopify's image component naturally shrinks it to exactly 100% column width
          if (imageUrl.includes('/upload/')) {
            imageUrl = imageUrl.replace('/upload/', '/upload/w_1000,c_scale/');
          }
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

    if (!imageUrl) {
      return;
    }

    const imageEl = createEl('s-image', {
      src: imageUrl,
      source: imageUrl,
      loading: 'lazy',
      inlineSize: 'fill',
      'inline-size': 'fill',
      borderRadius: 'large',
      'border-radius': 'large'
    });

    const boxEl = createEl('s-box', {
      inlineSize: 'fill',
      'inline-size': 'fill'
    });
    boxEl.appendChild(imageEl);

    root.appendChild(boxEl);
  }

  fetchSettings();
}

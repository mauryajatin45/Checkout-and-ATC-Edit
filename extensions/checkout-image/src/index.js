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

  function createEl(tag, attrs = {}, textContent) {
    if (hasDocument) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          // Set as HTML attribute (kebab-case)
          el.setAttribute(k, String(v));
        }
      }
      if (textContent) el.textContent = textContent;
      return el;
    } else {
      return api.extension.createComponent(tag, attrs, textContent ? [textContent] : []);
    }
  }

  // Clear the root
  if (hasDocument) {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  }

  // Use a container s-stack (same pattern as checkout-reviews which renders full-width)
  const container = createEl('s-stack', { gap: 'none' });
  if (hasDocument) {
    document.body.appendChild(container);
  }

  let imageUrl = null;
  let imageAspectRatio = null;

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
        return;
      }

      const fetchUrl = `${baseUrl}?shop=${shop.myshopifyDomain}&products=${pids.join(',')}`;
      console.log("[Checkout Image] Fetching:", fetchUrl);
      const res = await fetch(fetchUrl);
      
      if (res.ok) {
        const data = await res.json();
        console.log("[Checkout Image] API response:", JSON.stringify(data));
        if (data.imageUrl) {
          imageUrl = data.imageUrl;
          // Scale via Cloudinary to ensure the image is wide enough
          if (imageUrl.includes('/upload/')) {
            imageUrl = imageUrl.replace('/upload/', '/upload/w_1200,c_scale/');
          }
        }
        if (data.aspectRatio) {
          imageAspectRatio = data.aspectRatio;
        }
      }
    } catch (e) {
      console.error("[Checkout Image] Failed to fetch:", e);
    }
    
    render();
  }

  function render() {
    // Clear the container
    while (container.firstChild) container.removeChild(container.firstChild);

    if (!imageUrl) {
      return;
    }

    // Use the real aspect ratio from Cloudinary, or fall back to 3/4 (common portrait)
    const ratio = imageAspectRatio || '3/4';
    console.log("[Checkout Image] Rendering with aspectRatio:", ratio, "url:", imageUrl.substring(0, 80));

    // Create the s-image with all known valid attributes
    const imageEl = createEl('s-image', {
      'src': imageUrl,
      'inline-size': 'fill',
      'aspect-ratio': ratio,
      'border-radius': 'large',
      'loading': 'lazy'
    });

    // Also try setting as JS properties (some web components prefer property access)
    try {
      imageEl.src = imageUrl;
      imageEl.inlineSize = 'fill';
      imageEl.aspectRatio = ratio;
      imageEl.borderRadius = 'large';
    } catch(e) { /* ignore if properties don't exist */ }

    container.appendChild(imageEl);
  }

  fetchSettings();
}

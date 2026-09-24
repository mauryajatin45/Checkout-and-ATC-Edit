// Shopify Checkout UI Extension - Timer Block
export default function() {
  const api = globalThis.shopify;
  if (!api) return;

  const { shop, extension, settings: extSettings } = api;

  const hasDocument = typeof document !== 'undefined' && document.body;

  function createEl(tag, attrs = {}, textContent = null) {
    if (hasDocument) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          el.setAttribute(k, String(v));
        }
      }
      if (textContent) el.textContent = textContent;
      return el;
    } else {
      const children = textContent ? [textContent] : [];
      return api.extension.createComponent(tag, attrs, children);
    }
  }

  let root;
  if (hasDocument) {
    root = document.body;
  } else {
    root = api.extension.root;
  }

  let timerSettings = null;
  let timerInterval = null;
  let timeRemaining = 10 * 60;
  let fetchFailed = false;

  async function fetchSettings() {
    try {
      let storefrontUrl = shop.storefrontUrl;
      if (storefrontUrl && !storefrontUrl.endsWith('/')) {
        storefrontUrl += '/';
      }
      
      // FIXED: read settings correctly from api.settings.current
      const settingsVal = extSettings?.current || extSettings?.value || {};
      let baseUrl = settingsVal?.backend_url;
      
      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/timer`;
      } else {
        baseUrl = `${storefrontUrl}apps/checkout-atc/api/timer`;
      }
      
      const res = await fetch(`${baseUrl}?shop=${shop.myshopifyDomain}`);
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          timerSettings = data.settings;
          timeRemaining = timerSettings.timerMinutes * 60;
          fetchFailed = false;
        }
      } else {
        fetchFailed = true;
      }
    } catch (e) {
      console.error("[Checkout Timer] Failed to fetch settings:", e);
      fetchFailed = true;
    }
    
    if (!timerSettings) {
      timerSettings = {
        enabled: true,
        text: "Due to high demand your order is reserved for:",
        timerMinutes: 10,
        backgroundColor: "#e8f8e8",
        textColor: "#000000",
        iconEnabled: true
      };
    }
    
    render();
    startTimer();
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    let endTime = Date.now() + (timeRemaining * 1000);
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem('checkout_timer_end');
        if (stored && parseInt(stored) > Date.now()) {
          endTime = parseInt(stored);
        } else {
          sessionStorage.setItem('checkout_timer_end', endTime.toString());
        }
      }
    } catch(e) {}

    timerInterval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endTime - now) / 1000));
      
      timeRemaining = diff;
      updateTimeDisplay();
      
      if (diff <= 0) {
        clearInterval(timerInterval);
      }
    }, 1000);
  }

  let timeTextEl = null;

  function updateTimeDisplay() {
    if (!timeTextEl) return;
    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    
    if (hasDocument) {
      timeTextEl.textContent = `${m}:${s}`;
    } else {
      render();
    }
  }

  function render() {
    if (hasDocument) {
      while (root.firstChild) root.removeChild(root.firstChild);
    } else {
      for (const child of root.children) {
        root.removeChild(child);
      }
    }

    if (!timerSettings || !timerSettings.enabled) return;

    // Use s-banner instead of s-box. Banner naturally supports colors via status.
    // Map custom colors to standard Shopify status if possible.
    let status = 'info';
    const bg = (timerSettings.backgroundColor || '').toLowerCase();
    if (bg.includes('e8f8e8') || bg.includes('green') || timerSettings.iconEnabled) {
      status = 'success'; // Gives a nice green background + icon natively
    } else if (bg.includes('red') || bg.includes('critical')) {
      status = 'critical';
    } else if (bg.includes('yellow') || bg.includes('warning')) {
      status = 'warning';
    }

    // We disable the banner icon if user doesn't want it, otherwise we let the banner handle it
    const bannerAttrs = {
      status: status
    };
    
    const banner = createEl('s-banner', bannerAttrs);

    // Container for text
    const containerText = createEl('s-text', { size: 'base' });

    // The text
    const labelEl = createEl('s-text', {}, timerSettings.text + ' ');
    containerText.appendChild(labelEl);

    // The timer
    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    timeTextEl = createEl('s-text', { type: 'strong' }, `${m}:${s}`);
    
    containerText.appendChild(timeTextEl);
    
    if (fetchFailed) {
      const errorEl = createEl('s-text', { size: 'small', appearance: 'critical' }, ' (Error connecting to backend)');
      containerText.appendChild(errorEl);
    }

    banner.appendChild(containerText);
    root.appendChild(banner);
  }

  fetchSettings();
}

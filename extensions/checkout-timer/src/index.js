// Shopify Checkout UI Extension - Timer Block
export default function() {
  const api = globalThis.shopify;
  if (!api) return;

  const { shop, settings: extSettings } = api;
  const hasDocument = typeof document !== 'undefined' && document.body;

  function createEl(tag, attrs = {}, textContent = null) {
    if (hasDocument) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          el.setAttribute(k, String(v));
        }
      }
      if (textContent !== null && textContent !== undefined) {
        el.appendChild(document.createTextNode(String(textContent)));
      }
      return el;
    } else {
      const children = (textContent !== null && textContent !== undefined) ? [String(textContent)] : [];
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

  let timeTextEl = null;
  let containerText = null;

  function clearRoot() {
    try {
      if (hasDocument) {
        while (root.firstChild) root.removeChild(root.firstChild);
      } else {
        for (const child of root.children) {
          root.removeChild(child);
        }
      }
    } catch (e) {
      console.error("[Checkout Timer] Error clearing root:", e);
    }
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  async function fetchSettings() {
    // 1. Check extension block settings in Checkout Editor first
    const settingsVal = extSettings?.current || extSettings?.value || {};
    if (settingsVal?.enabled === false) {
      console.log("[Checkout Timer] Disabled via Checkout Editor block settings");
      stopTimer();
      clearRoot();
      return;
    }

    try {
      let storefrontUrl = shop?.storefrontUrl || '';
      if (storefrontUrl && !storefrontUrl.endsWith('/')) {
        storefrontUrl += '/';
      }
      
      let baseUrl = settingsVal?.backend_url;
      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/timer`;
      } else {
        baseUrl = `${storefrontUrl}apps/checkout-atc/api/timer`;
      }
      
      // Use cache-busting timestamp & no-store headers to guarantee fresh data
      const fetchUrl = `${baseUrl}?shop=${encodeURIComponent(shop?.myshopifyDomain || '')}&_t=${Date.now()}`;
      const res = await fetch(fetchUrl, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.settings) {
          timerSettings = data.settings;
          timeRemaining = (timerSettings.timerMinutes || 10) * 60;
        }
      }
    } catch (e) {
      console.error("[Checkout Timer] Failed to fetch settings:", e);
    }
    
    // If settings could not be fetched, default to FALSE so we never force an active timer on failure
    if (!timerSettings) {
      timerSettings = {
        enabled: false,
        text: "Due to high demand your order is reserved for:",
        timerMinutes: 10,
        backgroundColor: "#e8f8e8",
        textColor: "#000000",
        iconEnabled: true,
        fontSize: "base"
      };
    }
    
    // Explicitly check enabled flag:
    if (timerSettings.enabled === false) {
      console.log("[Checkout Timer] Timer is disabled in app dashboard");
      stopTimer();
      clearRoot();
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('checkout_timer_end');
        }
      } catch(e) {}
      return;
    }
    
    render();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    
    let endTime = Date.now() + (timeRemaining * 1000);
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem('checkout_timer_end');
        if (stored && parseInt(stored, 10) > Date.now()) {
          endTime = parseInt(stored, 10);
        } else {
          sessionStorage.setItem('checkout_timer_end', endTime.toString());
        }
      }
    } catch(e) {}

    // Immediate initial sync
    const initialDiff = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    timeRemaining = initialDiff;
    updateTimeDisplay();

    timerInterval = setInterval(() => {
      try {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((endTime - now) / 1000));
        timeRemaining = diff;
        updateTimeDisplay();
        
        if (diff <= 0) {
          stopTimer();
        }
      } catch (err) {
        console.error("[Checkout Timer] Timer tick error:", err);
      }
    }, 1000);
  }

  function updateTimeDisplay() {
    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    
    if (hasDocument) {
      if (timeTextEl) {
        if (timeTextEl.firstChild) {
          timeTextEl.firstChild.nodeValue = timeStr;
        } else {
          timeTextEl.appendChild(document.createTextNode(timeStr));
        }
        try {
          timeTextEl.textContent = timeStr;
        } catch(e) {}
      }
    } else {
      // In Remote UI (Worker sandbox)
      if (containerText && timeTextEl) {
        try {
          containerText.removeChild(timeTextEl);
          timeTextEl = createEl('s-text', { type: 'strong' }, timeStr);
          containerText.appendChild(timeTextEl);
        } catch(e) {}
      }
    }
  }

  function render() {
    clearRoot();

    if (!timerSettings || !timerSettings.enabled) return;

    let tone = 'info';
    const bg = (timerSettings.backgroundColor || '').toLowerCase();
    if (bg.includes('e8f8e8') || bg.includes('green') || timerSettings.iconEnabled) {
      tone = 'success';
    } else if (bg.includes('red') || bg.includes('critical')) {
      tone = 'critical';
    } else if (bg.includes('yellow') || bg.includes('warning')) {
      tone = 'warning';
    }

    const bannerAttrs = { tone };
    const banner = createEl('s-banner', bannerAttrs);

    const fontSize = timerSettings.fontSize || 'base';
    containerText = createEl('s-text', { size: fontSize });

    const labelEl = createEl('s-text', {}, timerSettings.text + ' ');
    containerText.appendChild(labelEl);

    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    timeTextEl = createEl('s-text', { type: 'strong' }, `${m}:${s}`);
    
    containerText.appendChild(timeTextEl);
    banner.appendChild(containerText);
    root.appendChild(banner);
  }

  fetchSettings();
}

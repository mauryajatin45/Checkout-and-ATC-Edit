// Shopify Checkout UI Extension - Timer Block
export default function() {
  const api = globalThis.shopify;
  if (!api) return;

  const { shop, extension } = api;

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

  let settings = null;
  let timerInterval = null;
  let timeRemaining = 10 * 60; // default 10 mins in seconds

  async function fetchSettings() {
    try {
      let storefrontUrl = shop.storefrontUrl;
      if (storefrontUrl && !storefrontUrl.endsWith('/')) {
        storefrontUrl += '/';
      }
      
      let baseUrl = extension?.settings?.backend_url;
      if (baseUrl) {
        baseUrl = `${baseUrl.replace(/\/$/, '')}/api/timer`;
      } else {
        baseUrl = `${storefrontUrl}apps/checkout-atc/api/timer`;
      }
      
      const res = await fetch(`${baseUrl}?shop=${shop.myshopifyDomain}`);
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          settings = data.settings;
          timeRemaining = settings.timerMinutes * 60;
        }
      }
    } catch (e) {
      console.error("[Checkout Timer] Failed to fetch settings:", e);
    }
    
    if (!settings) {
      settings = {
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

    if (!settings || !settings.enabled) return;

    // Use a subdued background token since HEX colors are stripped by Shopify Checkout Sandbox
    const blockAttrs = {
      padding: 'base',
      'border-radius': 'base',
      background: 'subdued'
    };
    const block = createEl('s-box', blockAttrs);
    
    // Use s-inline-stack for horizontal layout! (InlineStack in remote-ui)
    const outerStack = createEl('s-inline-stack', { 
      blockAlignment: 'start', 
      inlineAlignment: 'start',
      gap: 'tight' 
    });

    if (settings.iconEnabled) {
      // Use s-text for the checkmark to avoid HTML tags
      const iconFallback = createEl('s-text', { type: 'strong' }, '✓ ');
      outerStack.appendChild(iconFallback);
    }

    // Use s-inline-stack for text and timer so they are on the same line, or s-stack for multiline
    const textStack = createEl('s-inline-stack', { gap: 'tight', blockAlignment: 'center' });
    
    const labelText = createEl('s-text', { size: 'base' }, settings.text);
    textStack.appendChild(labelText);

    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    timeTextEl = createEl('s-text', { size: 'base', type: 'strong' }, `${m}:${s}`);
    
    textStack.appendChild(timeTextEl);
    outerStack.appendChild(textStack);
    
    block.appendChild(outerStack);
    root.appendChild(block);
  }

  fetchSettings();
}

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
        if (v !== undefined) el.setAttribute(k, v);
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
    root = document.createElement('div');
    // Important: we append to the body, similar to checkout-reviews
    document.body.appendChild(root);
  } else {
    root = api.extension.root;
  }

  let settings = null;
  let timerInterval = null;
  let timeRemaining = 10 * 60; // default 10 mins in seconds

  async function fetchSettings() {
    try {
      const baseUrl = `${shop.storefrontUrl}apps/checkout-atc/api/timer`;
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
      root.innerHTML = '';
    } else {
      for (const child of root.children) {
        root.removeChild(child);
      }
    }

    if (!settings || !settings.enabled) return;

    // Use only proven tags from checkout-reviews: s-box, s-stack, s-text, s-image
    const block = createEl('s-box', {
      padding: 'base',
      'border-radius': 'base'
    });
    
    if (hasDocument) {
      block.style.backgroundColor = settings.backgroundColor;
      block.style.color = settings.textColor;
      block.style.border = `1px solid ${settings.textColor}40`;
    }

    // Outer stack to contain icon and text. Using s-stack as it is known to work.
    const outerStack = createEl('s-stack', { gap: 'tight' });
    if (hasDocument) {
      // Force horizontal layout using inline styles since s-stack is normally vertical
      outerStack.style.display = 'flex';
      outerStack.style.flexDirection = 'row';
      outerStack.style.alignItems = 'flex-start';
    }

    // Since s-icon might not exist, use a standard HTML element or raw SVG if hasDocument
    if (settings.iconEnabled) {
      if (hasDocument) {
        const iconWrapper = document.createElement('div');
        iconWrapper.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20" fill="${settings.textColor}" style="margin-right: 8px;"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 13.5l-3.5-3.5 1.41-1.41L8 10.67l6.09-6.09L15.5 6 8 13.5z" /></svg>`;
        outerStack.appendChild(iconWrapper);
      } else {
        // Fallback for remote-ui
        const iconFallback = createEl('s-text', {}, '✓ ');
        outerStack.appendChild(iconFallback);
      }
    }

    const textStack = createEl('s-stack', { gap: 'none' });
    
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

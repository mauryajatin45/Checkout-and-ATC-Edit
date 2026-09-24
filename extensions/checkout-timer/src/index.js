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
    
    // Check if there's a stored end time in sessionStorage (if available)
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
      // In remote-ui, we'd need to re-render or use state, but without React we re-render the whole block or update the text node
      // Actually, since we don't have state hooks here, re-rendering the whole tree is safest for remote-ui
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

    const block = createEl('s-box', {
      padding: 'base',
      'border-radius': 'base'
    });
    
    // Remote-UI components don't support arbitrary backgroundColor string directly via simple props sometimes, 
    // but s-box might support 'background' token. 
    // To support exact hex codes, we might need an inline style if DOM, or just rely on Shopify's tokens.
    // The user wants color editing. If it's a DOM proxy, inline styles work. 
    // Let's use a standard inline style approach if possible, or fallback.
    if (hasDocument) {
      block.style.backgroundColor = settings.backgroundColor;
      block.style.color = settings.textColor;
      block.style.border = `1px solid ${settings.textColor}40`; // slight border
    }

    const inlineStack = createEl('s-inline-stack', {
      blockAlignment: 'start', // align to top so icon aligns with first line
      gap: 'tight'
    });

    if (settings.iconEnabled) {
      const icon = createEl('s-icon', {
        source: 'success', // Shopify built-in checkmark
        appearance: 'monochrome' // try to use textColor if supported
      });
      inlineStack.appendChild(icon);
    }

    const textStack = createEl('s-stack', { gap: 'none' }); // vertical stack for text + timer
    
    const labelText = createEl('s-text', { size: 'base' }, settings.text);
    textStack.appendChild(labelText);

    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    timeTextEl = createEl('s-text', { size: 'base', type: 'strong' }, `${m}:${s}`);
    
    textStack.appendChild(timeTextEl);
    inlineStack.appendChild(textStack);
    block.appendChild(inlineStack);

    root.appendChild(block);
  }

  fetchSettings();
}

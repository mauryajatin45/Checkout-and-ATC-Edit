document.addEventListener("DOMContentLoaded", function () {
  const containers = document.querySelectorAll(".sticky-atc-container");
  if (containers.length === 0) return;

  // Process each container found
  containers.forEach(container => {
    // Avoid double rendering if already processed
    if (container.dataset.rendered) return;
    container.dataset.rendered = "true";

    const productId = container.dataset.productId;
    if (!productId) return;

    fetch(`/apps/checkout-atc/api/config?productId=${productId}`)
      .then((res) => res.json())
      .then((config) => {
        if (!config || !config.enabled) return;

        const widget = document.createElement("div");
        widget.className = "sticky-atc-widget";
        widget.style.backgroundColor = config.backgroundColor || "#B978D1";
        widget.style.color = config.textColor || "#FFFFFF";

        const innerContainer = document.createElement("div");
        innerContainer.className = "sticky-atc-inner";

        const textContainer = document.createElement("div");
        textContainer.className = "sticky-atc-text";

        if (config.headline) {
          const headline = document.createElement("div");
          headline.className = "sticky-atc-headline";
          headline.innerText = config.headline;
          textContainer.appendChild(headline);
        }

        if (config.subheadline) {
          const subheadline = document.createElement("div");
          subheadline.className = "sticky-atc-subheadline";
          subheadline.innerText = config.subheadline;
          textContainer.appendChild(subheadline);
        }

        innerContainer.appendChild(textContainer);

        if (config.timerEnabled) {
          const timer = document.createElement("div");
          timer.className = "sticky-atc-timer";
          innerContainer.appendChild(timer);

          // Simple mock countdown timer loop for urgency
          let duration = 14 * 3600 + 15 * 60 + 52; // 14:15:52
          
          let interval;
          function updateTimer() {
            if (duration <= 0) {
              if (config.autoResetTimer !== false) {
                duration = 14 * 3600 + 15 * 60 + 52; // Reset loop
              } else {
                timer.innerText = "00 : 00 : 00 : 00";
                clearInterval(interval);
                return;
              }
            }

            const h = Math.floor(duration / 3600);
            const m = Math.floor((duration % 3600) / 60);
            const s = duration % 60;
            const timeText = `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')} : 00`;
            
            const iconColor = config.iconColor || "#FFFFFF";
            const svgIcon = `<svg style="margin-right: 8px;" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
            
            timer.style.display = "flex";
            timer.style.alignItems = "center";
            timer.innerHTML = `${svgIcon}${timeText}`;
            duration--;
          }

          updateTimer();
          interval = setInterval(updateTimer, 1000);
        }

        widget.appendChild(innerContainer);
        container.appendChild(widget);
      })
      .catch((err) => console.error("Error loading Sticky ATC config", err));
  });
});

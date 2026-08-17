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
                timer.innerHTML = "";
                clearInterval(interval);
                return;
              }
            }

            const d = Math.floor(duration / (3600 * 24));
            // Calculate hours based on remaining duration. The mock starts with 14 hours, so let's just do h, m, s, and a mock 'days' or just Days, Hrs, Mins, Secs
            // In the screenshot it's 13 DAYS, 20 HRS, 17 MINS, 56 SECS. 
            const h = Math.floor((duration % (3600 * 24)) / 3600);
            const m = Math.floor((duration % 3600) / 60);
            const s = duration % 60;
            
            const timerBoxColor = config.timerBoxColor || "#FFFFFF";
            const timerBoxTextColor = config.timerBoxTextColor || "#B978D1";
            
            const createBox = (val, label) => `
              <div class="sticky-atc-timer-col">
                <div class="sticky-atc-timer-box" style="background-color: ${timerBoxColor}; color: ${timerBoxTextColor};">${String(val).padStart(2, '0')}</div>
                <div class="sticky-atc-timer-label">${label}</div>
              </div>
            `;
            
            timer.innerHTML = `
              ${createBox(13, 'DAYS')}
              <div class="sticky-atc-timer-colon">:</div>
              ${createBox(h, 'HRS')}
              <div class="sticky-atc-timer-colon">:</div>
              ${createBox(m, 'MINS')}
              <div class="sticky-atc-timer-colon">:</div>
              ${createBox(s, 'SECS')}
            `;
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

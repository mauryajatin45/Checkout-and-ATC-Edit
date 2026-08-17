document.addEventListener("DOMContentLoaded", function () {
  const container = document.getElementById("sticky-atc-container");
  if (!container) return;

  const productId = container.dataset.productId;
  if (!productId) return;

  // In a real application, this would fetch from an App Proxy or a public API endpoint.
  // For demonstration, we simulate the fetch with basic config.
  fetch(`/apps/checkout-atc/api/config?productId=${productId}`)
    .then((res) => res.json())
    .then((config) => {
      if (!config || !config.enabled) return;

      const widget = document.createElement("div");
      widget.className = "sticky-atc-widget";
      widget.style.backgroundColor = config.backgroundColor || "#B978D1";

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

      if (config.timerEnabled) {
        const timer = document.createElement("div");
        timer.className = "sticky-atc-timer";
        textContainer.appendChild(timer);

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
          timer.innerText = `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')} : 00`;
          duration--;
        }

        updateTimer();
        interval = setInterval(updateTimer, 1000);
      }

      widget.appendChild(textContainer);

      const button = document.createElement("button");
      button.className = "sticky-atc-button";
      button.innerText = config.buttonText || "Add to Cart";
      button.onclick = () => {
        // Handle ATC
        alert("Added to cart!");
      };

      widget.appendChild(button);
      container.appendChild(widget);
    })
    .catch((err) => console.error("Error loading Sticky ATC config", err));
});

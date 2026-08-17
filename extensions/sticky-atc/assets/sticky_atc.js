document.addEventListener("DOMContentLoaded", function () {
  const container = document.getElementById("sticky-atc-container");
  if (!container) return;

  const productId = container.dataset.productId;
  if (!productId) return;

  // In a real application, this would fetch from an App Proxy or a public API endpoint.
  // For demonstration, we simulate the fetch with basic config.
  fetch(`/a/checkout-atc/api/config?productId=${productId}`)
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
        timer.innerText = "14 : 15 : 52 : 43"; // Static for mock
        textContainer.appendChild(timer);
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

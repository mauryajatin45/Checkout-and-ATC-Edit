// Storefront Source Tracking Script for Checkout Upsells
(function () {
  try {
    var pathname = window.location.pathname || "";
    // Ignore cart/checkout URLs themselves as source pages
    if (pathname && !pathname.includes("/checkout") && !pathname.includes("/cart")) {
      try {
        sessionStorage.setItem("shopify_upsell_source_page", pathname);
      } catch (e) {}

      // Background attach source_page and source attributes to cart
      var payload = JSON.stringify({
        attributes: {
          source_page: pathname,
          source: pathname
        }
      });

      if (window.fetch) {
        window.fetch("/cart/update.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        }).catch(function () {});
      }
    }

    // Capture click on any checkout/buy buttons or links
    document.addEventListener(
      "click",
      function (event) {
        var el = event.target ? event.target.closest("a, button, input[type='submit']") : null;
        if (!el) return;

        var href = el.getAttribute("href") || "";
        var name = el.getAttribute("name") || "";
        var action = (el.form && el.form.getAttribute("action")) || "";

        if (
          href.indexOf("/checkout") !== -1 ||
          href.indexOf("/cart") !== -1 ||
          name === "checkout" ||
          name === "add" ||
          action.indexOf("/cart") !== -1
        ) {
          var currentPath = window.location.pathname || "";
          if (currentPath && !currentPath.includes("/checkout")) {
            if (window.fetch) {
              window.fetch("/cart/update.js", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  attributes: {
                    source_page: currentPath,
                    source: currentPath
                  }
                })
              }).catch(function () {});
            }
          }
        }
      },
      true
    );
  } catch (err) {
    // Fail silently without disrupting buyer experience
  }
})();

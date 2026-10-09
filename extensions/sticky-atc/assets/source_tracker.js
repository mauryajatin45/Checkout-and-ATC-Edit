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
        var currentPath = window.location.pathname || "";

        if (!currentPath || currentPath.includes("/checkout")) return;

        // If clicking a direct checkout / cart link, append attributes directly to href
        if (el.tagName === "A" && href && (href.includes("/checkout") || href.includes("/cart"))) {
          try {
            var url = new URL(href, window.location.origin);
            if (!url.searchParams.has("attributes[source_page]")) {
              url.searchParams.set("attributes[source_page]", currentPath);
              url.searchParams.set("attributes[source]", currentPath);
              el.setAttribute("href", url.toString());
            }
          } catch (e) {}
        }

        // If form submission, inject hidden attribute inputs if not already present
        if (el.form && (action.includes("/cart") || name === "checkout" || name === "add")) {
          var form = el.form;
          if (!form.querySelector("input[name='attributes[source_page]']")) {
            var input1 = document.createElement("input");
            input1.type = "hidden";
            input1.name = "attributes[source_page]";
            input1.value = currentPath;
            form.appendChild(input1);

            var input2 = document.createElement("input");
            input2.type = "hidden";
            input2.name = "attributes[source]";
            input2.value = currentPath;
            form.appendChild(input2);
          }
        }

        if (
          href.indexOf("/checkout") !== -1 ||
          href.indexOf("/cart") !== -1 ||
          name === "checkout" ||
          name === "add" ||
          action.indexOf("/cart") !== -1
        ) {
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
      },
      true
    );
  } catch (err) {
    // Fail silently without disrupting buyer experience
  }
})();

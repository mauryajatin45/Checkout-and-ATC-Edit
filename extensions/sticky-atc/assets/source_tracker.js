// Storefront Source Tracking Script for Checkout Upsells
(function () {
  try {
    function getCleanPath() {
      return window.location.pathname || "";
    }

    var pathname = getCleanPath();

    function updateCartSource(path) {
      if (!path || path.includes("/checkout") || path.includes("/cart")) return;
      try {
        sessionStorage.setItem("shopify_upsell_source_page", path);
      } catch (e) {}

      if (window.fetch) {
        window.fetch("/cart/update.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attributes: {
              source_page: path,
              source: path
            }
          })
        }).catch(function () {});
      }
    }

    // Initial load update
    if (pathname && !pathname.includes("/checkout") && !pathname.includes("/cart")) {
      updateCartSource(pathname);
    }

    // Listen to pushState / replaceState for SPA / AJAX navigation
    if (window.history && window.history.pushState) {
      var originalPushState = window.history.pushState;
      window.history.pushState = function () {
        var ret = originalPushState.apply(this, arguments);
        var newPath = getCleanPath();
        if (newPath && newPath !== pathname) {
          pathname = newPath;
          updateCartSource(pathname);
        }
        return ret;
      };
    }
    window.addEventListener("popstate", function () {
      var newPath = getCleanPath();
      if (newPath && newPath !== pathname) {
        pathname = newPath;
        updateCartSource(pathname);
      }
    });

    // Intercept window.fetch for /cart/add and /cart/update so AJAX adds automatically include source_page
    if (window.fetch) {
      var origFetch = window.fetch;
      window.fetch = function (resource, init) {
        try {
          var urlStr = typeof resource === "string" ? resource : (resource && resource.url) || "";
          var curPath = getCleanPath();
          if (
            curPath &&
            !curPath.includes("/checkout") &&
            !curPath.includes("/cart") &&
            (urlStr.includes("/cart/add") || urlStr.includes("/cart/update"))
          ) {
            init = init || {};
            if (init.body && typeof init.body === "string") {
              try {
                var json = JSON.parse(init.body);
                json.attributes = json.attributes || {};
                if (!json.attributes.source_page) {
                  json.attributes.source_page = curPath;
                  json.attributes.source = curPath;
                  init.body = JSON.stringify(json);
                }
              } catch (e) {
                if (init.body.indexOf && init.body.indexOf("attributes[source_page]") === -1) {
                  init.body += "&attributes[source_page]=" + encodeURIComponent(curPath) + "&attributes[source]=" + encodeURIComponent(curPath);
                }
              }
            } else if (init.body && typeof FormData !== "undefined" && init.body instanceof FormData) {
              if (!init.body.has("attributes[source_page]")) {
                init.body.append("attributes[source_page]", curPath);
                init.body.append("attributes[source]", curPath);
              }
            }
          }
        } catch (fetchErr) {}
        return origFetch.apply(this, arguments);
      };
    }

    // Intercept XMLHttpRequest for /cart/add and /cart/update
    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype && window.XMLHttpRequest.prototype.send) {
      var origSend = window.XMLHttpRequest.prototype.send;
      var origOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        this.__url = url || "";
        return origOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function (body) {
        try {
          var curPath = getCleanPath();
          var urlStr = this.__url || "";
          if (
            curPath &&
            !curPath.includes("/checkout") &&
            !curPath.includes("/cart") &&
            (urlStr.includes("/cart/add") || urlStr.includes("/cart/update"))
          ) {
            if (typeof body === "string") {
              try {
                var json = JSON.parse(body);
                json.attributes = json.attributes || {};
                if (!json.attributes.source_page) {
                  json.attributes.source_page = curPath;
                  json.attributes.source = curPath;
                  body = JSON.stringify(json);
                }
              } catch (e) {
                if (body.indexOf && body.indexOf("attributes[source_page]") === -1) {
                  body += "&attributes[source_page]=" + encodeURIComponent(curPath) + "&attributes[source]=" + encodeURIComponent(curPath);
                }
              }
            } else if (typeof FormData !== "undefined" && body instanceof FormData) {
              if (!body.has("attributes[source_page]")) {
                body.append("attributes[source_page]", curPath);
                body.append("attributes[source]", curPath);
              }
            }
          }
        } catch (xhrErr) {}
        return origSend.apply(this, [body]);
      };
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
        var currentPath = getCleanPath();

        if (!currentPath || currentPath.includes("/checkout") || currentPath.includes("/cart")) return;

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
          updateCartSource(currentPath);
        }
      },
      true
    );
  } catch (err) {}
})();

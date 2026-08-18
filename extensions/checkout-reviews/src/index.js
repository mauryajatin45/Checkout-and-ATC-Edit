export default function(root, api) {
  const { lines } = api;

  let currentReviews = [];
  let isLoading = true;

  // Initialize UI components
  const textComponent = root.createComponent("Text", {}, "Loading reviews...");
  const stackComponent = root.createComponent("BlockStack", { spacing: "base" });

  root.appendChild(textComponent);

  function renderReviews() {
    if (isLoading) {
      return;
    }

    if (currentReviews.length === 0) {
      if (stackComponent.parent) root.removeChild(stackComponent);
      if (textComponent.parent) root.removeChild(textComponent);
      return;
    }

    // Rebuild the review stack
    stackComponent.replaceChildren();
    stackComponent.appendChild(root.createComponent("Divider"));
    stackComponent.appendChild(
      root.createComponent("Text", { size: "large", appearance: "interactive" }, "Product Reviews")
    );

    currentReviews.forEach((review) => {
      const reviewStack = root.createComponent("BlockStack", { spacing: "tight" }, [
        root.createComponent(
          "Text",
          { appearance: "critical" },
          "★".repeat(review.rating) + "☆".repeat(5 - review.rating)
        ),
        root.createComponent("Text", {}, review.body),
        root.createComponent("Text", { size: "small", appearance: "subdued" }, "- " + review.reviewer_name),
      ]);

      const view = root.createComponent(
        "View",
        { padding: "base", border: "base", cornerRadius: "base" },
        [reviewStack]
      );

      stackComponent.appendChild(view);
    });

    stackComponent.appendChild(root.createComponent("Divider"));

    if (textComponent.parent) root.removeChild(textComponent);
    if (!stackComponent.parent) root.appendChild(stackComponent);
  }

  async function fetchReviews(currentLines) {
    const productIds = Array.from(
      new Set(
        currentLines
          .map((line) => line.merchandise.product.id)
          .filter(Boolean)
          .map((id) => id.split('/').pop())
      )
    );

    if (productIds.length === 0) {
      isLoading = false;
      renderReviews();
      return;
    }

    try {
      const res = await fetch(`${api.shop.storefrontUrl}apps/checkout-atc/api/reviews?products=${productIds.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        currentReviews = data.reviews || [];
      }
    } catch (err) {
      console.error("Failed to load reviews", err);
    } finally {
      isLoading = false;
      renderReviews();
    }
  }

  lines.subscribe((currentLines) => {
    fetchReviews(currentLines);
  });
}

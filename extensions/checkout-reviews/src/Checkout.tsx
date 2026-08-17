import {
  reactExtension,
  useCartLines,
  BlockStack,
  Text,
  Divider,
  View
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

export default reactExtension("purchase.checkout.block.render", () => <Extension />);

function Extension() {
  const lines = useCartLines();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReviews() {
      // Get unique product IDs from the cart
      const productIds = Array.from(
        new Set(
          lines
            .map((line) => line.merchandise.product.id)
            .filter(Boolean)
            .map((id) => id.split('/').pop()) // Extract numerical ID from gid://
        )
      );

      if (productIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        // Assume APP_URL is provided in env or injected by proxy
        // We fetch reviews via our app backend proxy
        const res = await fetch(`/apps/checkout-atc/api/reviews?products=${productIds.join(",")}`);
        if (res.ok) {
          const data = await res.json();
          setReviews(data.reviews || []);
        }
      } catch (err) {
        console.error("Failed to load reviews", err);
      } finally {
        setLoading(false);
      }
    }

    fetchReviews();
  }, [lines]);

  if (loading) {
    return <Text>Loading reviews...</Text>;
  }

  if (reviews.length === 0) {
    return null; // Don't show anything if there are no reviews
  }

  return (
    <BlockStack spacing="base">
      <Divider />
      <Text size="large" appearance="interactive">Product Reviews</Text>
      {reviews.map((review, index) => (
        <View key={index} padding="base" border="base" cornerRadius="base">
          <BlockStack spacing="tight">
            <Text appearance="critical">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</Text>
            <Text>{review.body}</Text>
            <Text size="small" appearance="subdued">- {review.reviewer_name}</Text>
          </BlockStack>
        </View>
      ))}
      <Divider />
    </BlockStack>
  );
}

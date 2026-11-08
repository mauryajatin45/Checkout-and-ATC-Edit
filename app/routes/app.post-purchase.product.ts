import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/** GET /app/post-purchase/product?id=gid://shopify/Product/1 -> variants with prices, for the funnel editor. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ product: null }, { status: 400 });
  const res = await admin.graphql(
    `#graphql
      query postPurchaseProduct($id: ID!) {
        product(id: $id) {
          id
          title
          featuredImage { url }
          variants(first: 50) {
            nodes { id title price compareAtPrice availableForSale image { url } }
          }
        }
      }`,
    { variables: { id } },
  );
  const body = await res.json();
  const p = body.data?.product;
  if (!p) return json({ product: null }, { status: 404 });
  return json({
    product: {
      id: p.id,
      title: p.title,
      imageUrl: p.featuredImage?.url || null,
      variants: p.variants.nodes.map((v: any) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        available: v.availableForSale,
        imageUrl: v.image?.url || null,
      })),
    },
  });
};

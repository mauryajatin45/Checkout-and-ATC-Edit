import { useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Upsert the store
  const store = await prisma.store.upsert({
    where: { shopDomain: session.shop },
    create: {
      shopDomain: session.shop,
      accessToken: session.accessToken || "",
    },
    update: {
      accessToken: session.accessToken || "",
    },
  });

  // Fetch recent products from Shopify to display
  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 250, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }`
  );
  const responseJson = await response.json();
  const shopifyProducts = responseJson.data?.products?.edges || [];

  // Sync products into our DB if not exist
  for (const edge of shopifyProducts) {
    const p = edge.node;
    await prisma.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        storeId: store.id,
        shopifyProductId: p.id,
        title: p.title,
      },
      update: {
        title: p.title,
      },
    });
  }

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    include: { stickyAtcConfig: true, checkoutConfig: true },
  });

  return { products };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const actionType = formData.get("actionType");
  const productIdsStr = formData.get("productIds") as string;
  
  if (!productIdsStr) return json({ success: false });
  
  const productIds = JSON.parse(productIdsStr) as string[];

  if (actionType === "enable_checkout_reviews") {
    for (const id of productIds) {
      await prisma.checkoutConfig.upsert({
        where: { productId: id },
        create: { productId: id, enabled: true },
        update: { enabled: true },
      });
    }
  } else if (actionType === "disable_checkout_reviews") {
    for (const id of productIds) {
      await prisma.checkoutConfig.upsert({
        where: { productId: id },
        create: { productId: id, enabled: false },
        update: { enabled: false },
      });
    }
  } else if (actionType === "enable_sticky_atc") {
    for (const id of productIds) {
      await prisma.stickyAtcConfig.upsert({
        where: { productId: id },
        create: { productId: id, enabled: true },
        update: { enabled: true },
      });
    }
  } else if (actionType === "disable_sticky_atc") {
    for (const id of productIds) {
      await prisma.stickyAtcConfig.upsert({
        where: { productId: id },
        create: { productId: id, enabled: false },
        update: { enabled: false },
      });
    }
  }

  return json({ success: true });
};

export default function Index() {
  const { products } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(products);

  const submit = useSubmit();
  const nav = useNavigation();
  const isLoading = nav.state === "submitting" || nav.state === "loading";

  // When action completes, you might want to clear selection, but the page data revalidates automatically.
  // We can clear selection by tracking nav state, but for simplicity relying on native behaviour is fine.

  const promotedBulkActions = [
    {
      content: 'Enable Checkout Reviews',
      onAction: () => {
        submit({ actionType: 'enable_checkout_reviews', productIds: JSON.stringify(selectedResources) }, { method: 'post' });
        clearSelection();
      },
    },
    {
      content: 'Disable Checkout Reviews',
      onAction: () => {
        submit({ actionType: 'disable_checkout_reviews', productIds: JSON.stringify(selectedResources) }, { method: 'post' });
        clearSelection();
      },
    },
    {
      content: 'Enable Sticky ATC',
      onAction: () => {
        submit({ actionType: 'enable_sticky_atc', productIds: JSON.stringify(selectedResources) }, { method: 'post' });
        clearSelection();
      },
    },
    {
      content: 'Disable Sticky ATC',
      onAction: () => {
        submit({ actionType: 'disable_sticky_atc', productIds: JSON.stringify(selectedResources) }, { method: 'post' });
        clearSelection();
      },
    },
  ];

  const rowMarkup = products.map(
    ({ id, title, stickyAtcConfig, checkoutConfig }, index) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
        onClick={() => navigate(`/app/products/${encodeURIComponent(id)}`)}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {title}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {stickyAtcConfig?.enabled ? "Enabled" : "Disabled"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {checkoutConfig?.enabled ? "Enabled" : "Disabled"}
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page fullWidth>
      <TitleBar title="Dashboard - Campaigns & Products" />
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={products.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              promotedBulkActions={promotedBulkActions}
              loading={isLoading}
              headings={[
                { title: "Product" },
                { title: "Sticky ATC Widget" },
                { title: "Checkout Widget" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

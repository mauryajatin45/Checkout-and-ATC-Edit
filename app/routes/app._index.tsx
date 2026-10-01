import { useEffect, useState } from "react";
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
  IndexFilters,
  useSetIndexFiltersMode,
  ChoiceList
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

  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(["title asc"]);
  const [stickyAtcFilter, setStickyAtcFilter] = useState<string[] | undefined>(undefined);
  const [checkoutWidgetFilter, setCheckoutWidgetFilter] = useState<string[] | undefined>(undefined);

  const filteredProducts = products.filter((product) => {
    const matchesQuery = product.title.toLowerCase().includes(queryValue.toLowerCase());
    
    let matchesStickyAtc = true;
    if (stickyAtcFilter && stickyAtcFilter.length > 0) {
      const isEnabled = product.stickyAtcConfig?.enabled ? "enabled" : "disabled";
      matchesStickyAtc = stickyAtcFilter.includes(isEnabled);
    }
    
    let matchesCheckout = true;
    if (checkoutWidgetFilter && checkoutWidgetFilter.length > 0) {
      const isEnabled = product.checkoutConfig?.enabled ? "enabled" : "disabled";
      matchesCheckout = checkoutWidgetFilter.includes(isEnabled);
    }
    
    return matchesQuery && matchesStickyAtc && matchesCheckout;
  }).sort((a, b) => {
    const [key, direction] = sortSelected[0].split(" ");
    
    if (key === "title") {
      return direction === "asc" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title);
    } else if (key === "sticky_atc") {
      const aVal = a.stickyAtcConfig?.enabled ? 1 : 0;
      const bVal = b.stickyAtcConfig?.enabled ? 1 : 0;
      return direction === "asc" ? aVal - bVal : bVal - aVal;
    } else if (key === "checkout") {
      const aVal = a.checkoutConfig?.enabled ? 1 : 0;
      const bVal = b.checkoutConfig?.enabled ? 1 : 0;
      return direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    
    return 0;
  });

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(filteredProducts);

  const submit = useSubmit();
  const nav = useNavigation();
  const isLoading = nav.state === "submitting" || nav.state === "loading";

  const { mode, setMode } = useSetIndexFiltersMode();

  const onQueryChange = (value: string) => {
    setQueryValue(value);
    clearSelection();
  };
  const onQueryClear = () => {
    setQueryValue("");
    clearSelection();
  };

  const sortOptions = [
    { label: "Product title A-Z", value: "title asc", directionLabel: "A-Z" },
    { label: "Product title Z-A", value: "title desc", directionLabel: "Z-A" },
    { label: "Sticky ATC Enabled", value: "sticky_atc desc", directionLabel: "Highest to lowest" },
    { label: "Checkout Widget Enabled", value: "checkout desc", directionLabel: "Highest to lowest" },
  ];

  const handleStickyAtcFilterChange = (value: string[]) => setStickyAtcFilter(value);
  const handleCheckoutWidgetFilterChange = (value: string[]) => setCheckoutWidgetFilter(value);

  const filters = [
    {
      key: "stickyAtc",
      label: "Sticky ATC",
      filter: (
        <ChoiceList
          title="Sticky ATC"
          titleHidden
          choices={[
            { label: "Enabled", value: "enabled" },
            { label: "Disabled", value: "disabled" },
          ]}
          selected={stickyAtcFilter || []}
          onChange={handleStickyAtcFilterChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: "checkoutWidget",
      label: "Checkout Widget",
      filter: (
        <ChoiceList
          title="Checkout Widget"
          titleHidden
          choices={[
            { label: "Enabled", value: "enabled" },
            { label: "Disabled", value: "disabled" },
          ]}
          selected={checkoutWidgetFilter || []}
          onChange={handleCheckoutWidgetFilterChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (stickyAtcFilter && stickyAtcFilter.length > 0) {
    const key = "stickyAtc";
    appliedFilters.push({
      key,
      label: `Sticky ATC: ${stickyAtcFilter.join(", ")}`,
      onRemove: () => setStickyAtcFilter(undefined),
    });
  }
  if (checkoutWidgetFilter && checkoutWidgetFilter.length > 0) {
    const key = "checkoutWidget";
    appliedFilters.push({
      key,
      label: `Checkout Widget: ${checkoutWidgetFilter.join(", ")}`,
      onRemove: () => setCheckoutWidgetFilter(undefined),
    });
  }

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

  const rowMarkup = filteredProducts.map(
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
            <IndexFilters
              sortOptions={sortOptions}
              sortSelected={sortSelected as string[]}
              queryValue={queryValue}
              queryPlaceholder="Search products"
              onQueryChange={onQueryChange}
              onQueryClear={onQueryClear}
              onSort={setSortSelected as (value: string[]) => void}
              cancelAction={{
                onAction: onQueryClear,
                disabled: false,
                loading: false,
              }}
              tabs={[
                {
                  content: 'All',
                  id: 'all',
                  isLocked: true,
                  actions: []
                }
              ]}
              selected={0}
              onSelect={() => {}}
              filters={filters}
              appliedFilters={appliedFilters as any}
              onClearAll={() => {
                setStickyAtcFilter(undefined);
                setCheckoutWidgetFilter(undefined);
                setQueryValue("");
              }}
              mode={mode}
              setMode={setMode}
            />
            <IndexTable
              resourceName={resourceName}
              itemCount={filteredProducts.length}
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

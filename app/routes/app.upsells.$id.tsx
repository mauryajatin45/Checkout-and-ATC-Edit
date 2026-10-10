import { useState, useId } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Checkbox,
  Button,
  Banner,
  Thumbnail,
  Select,
  Divider,
  Box,
  Collapsible,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getUpsellCampaign,
  createUpsellCampaign,
  updateUpsellCampaign,
  type UpsellItemInput,
} from "../models/checkoutUpsell.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  const isNew = id === "new";

  let campaign = null;
  if (!isNew && id) {
    campaign = await getUpsellCampaign(session.shop, id);
    if (!campaign) {
      throw new Response("Campaign not found", { status: 404 });
    }
  }

  // Fetch shop products for fallback picker
  const response = await admin.graphql(
    `#graphql
      query getProductsForPicker {
        products(first: 100, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
              }
              variants(first: 30) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }`
  );

  const resJson = await response.json();
  const shopifyProducts = (resJson.data?.products?.edges || []).map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    handle: e.node.handle,
    imageUrl: e.node.featuredImage?.url || null,
    variants: (e.node.variants?.edges || []).map((v: any) => ({
      id: v.node.id,
      title: v.node.title,
      price: v.node.price,
    })),
  }));

  return json({
    isNew,
    campaign,
    shopifyProducts,
    shop: session.shop,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id;
  const isNew = id === "new";
  const formData = await request.formData();

  const name = (formData.get("name") as string) || "Upsell Campaign";
  const enabled = formData.get("enabled") === "true";
  const sourcePage = (formData.get("sourcePage") as string) || "*";
  const headline = (formData.get("headline") as string) || "Lost, stolen or damaged? We reship it free, no questions.";
  const description = formData.get("description") as string;
  const buttonColor = (formData.get("buttonColor") as string) || "#0066cc";
  const buttonTextColor = (formData.get("buttonTextColor") as string) || "#ffffff";
  const rawItems = formData.get("items") as string;

  let items: UpsellItemInput[] = [];
  try {
    items = JSON.parse(rawItems || "[]");
  } catch (e) {
    return json({ error: "Invalid items payload" }, { status: 400 });
  }

  if (items.length === 0) {
    return json({ error: "Please add at least one product to the campaign." }, { status: 400 });
  }

  try {
    if (isNew) {
      await createUpsellCampaign(session.shop, {
        name,
        enabled,
        sourcePage,
        headline,
        description,
        buttonColor,
        buttonTextColor,
        items,
      });
    } else if (id) {
      await updateUpsellCampaign(session.shop, id, {
        name,
        enabled,
        sourcePage,
        headline,
        description,
        buttonColor,
        buttonTextColor,
        items,
      });
    }

    return redirect("/app/upsells");
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
};

interface FormItem {
  shopifyProductId: string;
  shopifyVariantId: string;
  originalTitle: string;
  customTitle: string;
  customDescription: string;
  strikethroughPrice: string;
  price: string;
  imageUrl: string;
  variantsList?: { id: string; title: string; price: string }[];
}

export default function UpsellCampaignForm() {
  const { isNew, campaign, shopifyProducts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  const [name, setName] = useState(campaign?.name || "");
  const [enabled, setEnabled] = useState(campaign?.enabled ?? true);
  const [sourcePage, setSourcePage] = useState(campaign?.sourcePage || "");
  const [headline, setHeadline] = useState(
    campaign?.headline || "Lost, stolen or damaged? We reship it free, no questions."
  );
  const [description, setDescription] = useState(campaign?.description || "");
  const [buttonColor, setButtonColor] = useState(campaign?.buttonColor || "#0066cc");
  const [buttonTextColor, setButtonTextColor] = useState(campaign?.buttonTextColor || "#ffffff");

  // Initial items
  const initialItems: FormItem[] = (campaign?.items || []).map((item: any) => {
    const matchedProduct = shopifyProducts.find((p: any) => p.id === item.shopifyProductId);
    return {
      shopifyProductId: item.shopifyProductId,
      shopifyVariantId: item.shopifyVariantId,
      originalTitle: matchedProduct?.title || item.customTitle || "Product",
      customTitle: item.customTitle || "",
      customDescription: item.customDescription || "",
      strikethroughPrice: item.strikethroughPrice || "",
      price: item.price || "",
      imageUrl: item.imageUrl || matchedProduct?.imageUrl || "",
      variantsList: matchedProduct?.variants || [],
    };
  });

  const [items, setItems] = useState<FormItem[]>(initialItems);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>("");
  const [previewDescriptionOpen, setPreviewDescriptionOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewAddedMap, setPreviewAddedMap] = useState<Record<string, boolean>>({});

  // App Bridge Resource Picker
  const handlePickProduct = async () => {
    try {
      if ((window as any).shopify && typeof (window as any).shopify.resourcePicker === "function") {
        const selection = await (window as any).shopify.resourcePicker({
          type: "product",
          multiple: true,
          action: "select",
        });

        if (selection && selection.length > 0) {
          const newItems: FormItem[] = [...items];
          for (const prod of selection) {
            const firstVariant = prod.variants?.[0] || {};
            const img = prod.images?.[0]?.originalSrc || "";
            // Check if product already exists in list
            const existingIdx = newItems.findIndex((it) => it.shopifyProductId === prod.id);
            const itemObj: FormItem = {
              shopifyProductId: prod.id,
              shopifyVariantId: firstVariant.id || "",
              originalTitle: prod.title,
              customTitle: prod.title,
              customDescription: "",
              strikethroughPrice: "",
              price: firstVariant.price || "",
              imageUrl: img,
              variantsList: (prod.variants || []).map((v: any) => ({
                id: v.id,
                title: v.title,
                price: v.price,
              })),
            };

            if (existingIdx >= 0) {
              newItems[existingIdx] = itemObj;
            } else {
              newItems.push(itemObj);
            }
          }
          setItems(newItems);
          return;
        }
      }
    } catch (err) {
      console.warn("Resource picker not available or cancelled, falling back to manual selector", err);
    }
  };

  // Add from dropdown list
  const handleAddFromDropdown = () => {
    if (!selectedProductToAdd) return;
    const p = shopifyProducts.find((prod: any) => prod.id === selectedProductToAdd);
    if (!p) return;

    const firstVar = p.variants[0] || { id: "", title: "Default", price: "0.00" };
    const newItem: FormItem = {
      shopifyProductId: p.id,
      shopifyVariantId: firstVar.id,
      originalTitle: p.title,
      customTitle: p.title,
      customDescription: "",
      strikethroughPrice: "",
      price: firstVar.price,
      imageUrl: p.imageUrl || "",
      variantsList: p.variants,
    };

    setItems([...items, newItem]);
    setSelectedProductToAdd("");
  };

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
  };

  const handleUpdateItem = (index: number, field: keyof FormItem, val: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = val;

    // If changing variant, update price
    if (field === "shopifyVariantId" && updated[index].variantsList) {
      const v = updated[index].variantsList?.find((v) => v.id === val);
      if (v) {
        updated[index].price = v.price;
      }
    }
    setItems(updated);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setErrorMessage("Please enter a campaign name.");
      return;
    }
    if (!sourcePage.trim()) {
      setErrorMessage("Please enter a source page URL or path (e.g. /pages/offer-1 or * for all).");
      return;
    }
    if (items.length === 0) {
      setErrorMessage("Please add at least one product to this upsell campaign.");
      return;
    }

    setErrorMessage(null);
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("enabled", String(enabled));
    formData.append("sourcePage", sourcePage.trim());
    formData.append("headline", headline.trim());
    formData.append("description", description.trim());
    formData.append("buttonColor", buttonColor.trim());
    formData.append("buttonTextColor", buttonTextColor.trim());

    const itemsPayload: UpsellItemInput[] = items.map((it, idx) => ({
      shopifyProductId: it.shopifyProductId,
      shopifyVariantId: it.shopifyVariantId,
      customTitle: it.customTitle || it.originalTitle,
      customDescription: it.customDescription || null,
      strikethroughPrice: it.strikethroughPrice || null,
      price: it.price || null,
      imageUrl: it.imageUrl || null,
      position: idx,
    }));

    formData.append("items", JSON.stringify(itemsPayload));
    submit(formData, { method: "post" });
  };

  // Product options for select dropdown
  const productSelectOptions = [
    { label: "-- Choose a product from catalog --", value: "" },
    ...shopifyProducts.map((p: any) => ({
      label: p.title,
      value: p.id,
    })),
  ];

  const primaryItem = items[0];

  return (
    <Page
      title={isNew ? "Create Checkout Upsell Campaign" : `Edit Campaign: ${name || "Untitled"}`}
      backAction={{ content: "Campaigns", onAction: () => navigate("/app/upsells") }}
      primaryAction={{
        content: isSubmitting ? "Saving..." : "Save Campaign",
        onAction: handleSave,
        loading: isSubmitting,
      }}
    >
      <TitleBar title={isNew ? "New Upsell Campaign" : "Edit Campaign"}>
        <button variant="primary" onClick={handleSave}>
          Save Campaign
        </button>
      </TitleBar>
      <BlockStack gap="500">
        {errorMessage && (
          <Banner tone="critical" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </Banner>
        )}

        <Layout>
          {/* Main Configuration (Left Column) */}
          <Layout.Section>
            <BlockStack gap="400">
              {/* Campaign Details Card */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Campaign Details
                  </Text>
                  <TextField
                    label="Campaign Name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g. Shipping Protection Upsell"
                    autoComplete="off"
                    helpText="Internal name for your reference."
                  />
                  <Checkbox
                    label="Enable this campaign"
                    checked={enabled}
                    onChange={setEnabled}
                    helpText="When active, matching shoppers will see this upsell during checkout."
                  />
                  <Divider />
                  <TextField
                    label="Source Page Path or URL Match"
                    value={sourcePage}
                    onChange={setSourcePage}
                    placeholder="/pages/special-offer or /products/sample or *"
                    autoComplete="off"
                    helpText={
                      <span>
                        Enter the page pathname the customer must come from (e.g.{" "}
                        <code>/pages/offer-1</code> or <code>/products/my-product</code>). Enter{" "}
                        <code>*</code> or <code>all</code> to match <strong>all</strong> checkouts.
                      </span>
                    }
                  />
                  <TextField
                    label="Section Headline"
                    value={headline}
                    onChange={setHeadline}
                    placeholder="Lost, stolen or damaged? We reship it free, no questions."
                    autoComplete="off"
                    helpText="Shown directly above the product upsell box at checkout."
                  />
                </BlockStack>
              </Card>

              {/* Button Styling Card */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Button Appearance & Colors
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Customize the &quot;Add to cart&quot; button background and text color to match your store branding.
                  </Text>

                  <Layout>
                    <Layout.Section variant="oneHalf">
                      <BlockStack gap="200">
                        <TextField
                          label="Button Background Color"
                          value={buttonColor}
                          onChange={setButtonColor}
                          placeholder="#0066cc"
                          autoComplete="off"
                          prefix={
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                backgroundColor: buttonColor,
                                border: "1px solid #ccc",
                                marginRight: 4,
                              }}
                            />
                          }
                          helpText="Hex color code (e.g. #0066cc)."
                        />
                        <InlineStack gap="100">
                          {[
                            { label: "Default Blue", color: "#0066cc" },
                            { label: "Shopify Green", color: "#008060" },
                            { label: "Black", color: "#111111" },
                            { label: "Navy", color: "#1a2b49" },
                            { label: "Purple", color: "#b978d1" },
                            { label: "Red", color: "#d82c0d" },
                          ].map((p) => (
                            <button
                              key={p.color}
                              type="button"
                              onClick={() => setButtonColor(p.color)}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                backgroundColor: p.color,
                                border:
                                  buttonColor.toLowerCase() === p.color.toLowerCase()
                                    ? "2px solid #000"
                                    : "1px solid #ccc",
                                cursor: "pointer",
                                padding: 0,
                                outline: "none",
                              }}
                              title={p.label}
                            />
                          ))}
                        </InlineStack>
                      </BlockStack>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      <BlockStack gap="200">
                        <TextField
                          label="Button Text Color"
                          value={buttonTextColor}
                          onChange={setButtonTextColor}
                          placeholder="#ffffff"
                          autoComplete="off"
                          prefix={
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                backgroundColor: buttonTextColor,
                                border: "1px solid #ccc",
                                marginRight: 4,
                              }}
                            />
                          }
                          helpText="Hex color for button text."
                        />
                        <InlineStack gap="100">
                          {[
                            { label: "White", color: "#ffffff" },
                            { label: "Black", color: "#111111" },
                            { label: "Light Gray", color: "#f4f4f4" },
                          ].map((p) => (
                            <button
                              key={p.color}
                              type="button"
                              onClick={() => setButtonTextColor(p.color)}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                backgroundColor: p.color,
                                border:
                                  buttonTextColor.toLowerCase() === p.color.toLowerCase()
                                    ? "2px solid #000"
                                    : "1px solid #ccc",
                                cursor: "pointer",
                                padding: 0,
                                outline: "none",
                              }}
                              title={p.label}
                            />
                          ))}
                        </InlineStack>
                      </BlockStack>
                    </Layout.Section>
                  </Layout>
                </BlockStack>
              </Card>

              {/* Upsell Products Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">
                      Upsell Products
                    </Text>
                    <Button variant="primary" onClick={handlePickProduct}>
                      Browse Shopify Products
                    </Button>
                  </InlineStack>

                  {/* Manual Quick Add Dropdown */}
                  <InlineStack gap="300" blockAlign="end">
                    <div style={{ flex: 1 }}>
                      <Select
                        label="Or select a product from store catalog:"
                        options={productSelectOptions}
                        value={selectedProductToAdd}
                        onChange={setSelectedProductToAdd}
                      />
                    </div>
                    <Button onClick={handleAddFromDropdown} disabled={!selectedProductToAdd}>
                      Add Product
                    </Button>
                  </InlineStack>

                  <Divider />

                  {items.length === 0 ? (
                    <Box padding="400">
                      <Banner tone="info">
                        No products added yet. Click <strong>Browse Shopify Products</strong> or pick from the
                        dropdown above to configure your upsell item.
                      </Banner>
                    </Box>
                  ) : (
                    <BlockStack gap="400">
                      {items.map((item, index) => {
                        const variantOptions = (item.variantsList || []).map((v) => ({
                          label: `${v.title} (${v.price ? `$${v.price}` : "Standard"})`,
                          value: v.id,
                        }));

                        return (
                          <Card key={`${item.shopifyProductId}-${index}`}>
                            <BlockStack gap="300">
                              <InlineStack align="space-between" blockAlign="center">
                                <InlineStack gap="300" blockAlign="center">
                                  {item.imageUrl ? (
                                    <Thumbnail source={item.imageUrl} alt={item.originalTitle} size="small" />
                                  ) : (
                                    <div
                                      style={{
                                        width: 40,
                                        height: 40,
                                        backgroundColor: "#f1f2f3",
                                        borderRadius: 6,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      📦
                                    </div>
                                  )}
                                  <div>
                                    <Text variant="bodyMd" fontWeight="bold" as="p">
                                      {item.originalTitle}
                                    </Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                      Product #{index + 1}
                                    </Text>
                                  </div>
                                </InlineStack>
                                <Button
                                  tone="critical"
                                  variant="plain"
                                  onClick={() => handleRemoveItem(index)}
                                >
                                  Remove
                                </Button>
                              </InlineStack>

                              <Divider />

                              <Layout>
                                <Layout.Section variant="oneHalf">
                                  <TextField
                                    label="Custom Title"
                                    value={item.customTitle}
                                    onChange={(val) => handleUpdateItem(index, "customTitle", val)}
                                    placeholder={item.originalTitle}
                                    autoComplete="off"
                                    helpText="Override the product title shown at checkout (e.g. Shipping Protection)."
                                  />
                                </Layout.Section>
                                <Layout.Section variant="oneHalf">
                                  {variantOptions.length > 0 ? (
                                    <Select
                                      label="Pre-selected Variant"
                                      options={variantOptions}
                                      value={item.shopifyVariantId}
                                      onChange={(val) => handleUpdateItem(index, "shopifyVariantId", val)}
                                      helpText="This specific variant will be added to the customer's cart."
                                    />
                                  ) : (
                                    <TextField
                                      label="Shopify Variant GID"
                                      value={item.shopifyVariantId}
                                      onChange={(val) => handleUpdateItem(index, "shopifyVariantId", val)}
                                      autoComplete="off"
                                    />
                                  )}
                                </Layout.Section>
                              </Layout>

                              <Layout>
                                <Layout.Section variant="oneHalf">
                                  <TextField
                                    label="Selling Price"
                                    value={item.price}
                                    onChange={(val) => handleUpdateItem(index, "price", val)}
                                    placeholder="4.99"
                                    prefix="$"
                                    autoComplete="off"
                                    helpText="Standard selling price charged to customer."
                                  />
                                </Layout.Section>
                                <Layout.Section variant="oneHalf">
                                  <TextField
                                    label="Strikethrough Compare Price (Optional)"
                                    value={item.strikethroughPrice}
                                    onChange={(val) => handleUpdateItem(index, "strikethroughPrice", val)}
                                    placeholder="9.99"
                                    prefix="$"
                                    autoComplete="off"
                                    helpText="Displays crossed-out beside selling price (e.g. $9.99)."
                                  />
                                </Layout.Section>
                              </Layout>

                              <TextField
                                label="Custom Description (Optional Accordion)"
                                value={item.customDescription}
                                onChange={(val) => handleUpdateItem(index, "customDescription", val)}
                                placeholder="Covers items that are lost in transit, damaged upon arrival, or stolen."
                                multiline={2}
                                autoComplete="off"
                                helpText="Shown when the buyer clicks 'Product description ⌄'."
                              />
                            </BlockStack>
                          </Card>
                        );
                      })}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Live Checkout Preview (Right Column) */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h3">
                      Live Checkout Preview
                    </Text>
                    <Badge tone="info">Above Contact</Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued" as="p">
                    Simulates how this upsell appears directly above the Contact section at checkout.
                  </Text>

                  <Divider />

                  {/* Simulated Checkout Area */}
                  <div
                    style={{
                      backgroundColor: "#fafafa",
                      border: "1px solid #e1e3e5",
                      borderRadius: 12,
                      padding: 16,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                    }}
                  >
                    {/* Section Headline */}
                    <p
                      style={{
                        margin: "0 0 12px 0",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#1a1a1a",
                        lineHeight: 1.4,
                      }}
                    >
                      {headline || "Lost, stolen or damaged? We reship it free, no questions."}
                    </p>

                    {/* Competitor-Style Upsell Card */}
                    {items.length > 1 ? (
                      /* Multi-item compact unified card */
                      <div
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #d9d9d9",
                          borderRadius: 10,
                          padding: 12,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                      >
                        {items.map((item, idx) => {
                          const itemId = item.shopifyVariantId || String(idx);
                          const isAdded = !!previewAddedMap[itemId];
                          return (
                            <div key={idx}>
                              {idx > 0 && (
                                <div style={{ borderTop: "1px solid #eee", margin: "10px 0" }} />
                              )}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: item.imageUrl ? "44px 1fr auto" : "1fr auto",
                                  gap: 10,
                                  alignItems: "center",
                                }}
                              >
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt="Upsell"
                                    style={{
                                      width: 44,
                                      height: 44,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                      border: "1px solid #eee",
                                    }}
                                  />
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      fontSize: 13,
                                      color: "#111",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {item.customTitle || item.originalTitle || "Product Offer"}
                                  </div>
                                  <div style={{ marginTop: 2, fontSize: 13, whiteSpace: "nowrap" }}>
                                    {item.strikethroughPrice && (
                                      <span
                                        style={{
                                          textDecoration: "line-through",
                                          color: "#888",
                                          fontSize: 12,
                                          marginRight: 6,
                                        }}
                                      >
                                        {item.strikethroughPrice.startsWith("$")
                                          ? item.strikethroughPrice
                                          : `$${item.strikethroughPrice}`}
                                      </span>
                                    )}
                                    <span style={{ fontWeight: 700, color: "#111" }}>
                                      {item.price
                                        ? item.price.startsWith("$")
                                          ? item.price
                                          : `$${item.price}`
                                        : "$4.99"}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewAddedMap((prev) => ({
                                      ...prev,
                                      [itemId]: !prev[itemId],
                                    }))
                                  }
                                  style={{
                                    padding: "6px 12px",
                                    backgroundColor: isAdded ? "#f4f4f4" : buttonColor || "#0066cc",
                                    color: isAdded ? "#333333" : buttonTextColor || "#ffffff",
                                    border: isAdded ? "1px solid #ccc" : "none",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  {isAdded ? "Remove" : "Add to cart"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : primaryItem ? (
                      /* Single-item card */
                      <div
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #d9d9d9",
                          borderRadius: 10,
                          padding: 14,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                      >
                        {/* Top Row: Thumbnail + Title + Price */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                            {primaryItem.imageUrl ? (
                              <img
                                src={primaryItem.imageUrl}
                                alt="Upsell"
                                style={{
                                  width: 44,
                                  height: 44,
                                  objectFit: "cover",
                                  borderRadius: 8,
                                  border: "1px solid #eee",
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 44,
                                  height: 44,
                                  backgroundColor: "#f5f6f8",
                                  borderRadius: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 22,
                                  flexShrink: 0,
                                }}
                              >
                                📦
                              </div>
                            )}
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                              {primaryItem.customTitle || primaryItem.originalTitle || "Shipping Protection"}
                            </div>
                          </div>

                          {/* Prices */}
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {primaryItem.strikethroughPrice && (
                              <span
                                style={{
                                  textDecoration: "line-through",
                                  color: "#888",
                                  fontSize: 12,
                                  marginRight: 6,
                                }}
                              >
                                {primaryItem.strikethroughPrice.startsWith("$")
                                  ? primaryItem.strikethroughPrice
                                  : `$${primaryItem.strikethroughPrice}`}
                              </span>
                            )}
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>
                              {primaryItem.price
                                ? primaryItem.price.startsWith("$")
                                  ? primaryItem.price
                                  : `$${primaryItem.price}`
                                : "$4.99"}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Product Description Link */}
                        <div style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => setPreviewDescriptionOpen(!previewDescriptionOpen)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              fontSize: 12,
                              color: "#555",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span>Product description</span>
                            <span style={{ fontSize: 10 }}>{previewDescriptionOpen ? "▲" : "▼"}</span>
                          </button>

                          {previewDescriptionOpen && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: "8px 10px",
                                backgroundColor: "#f9f9f9",
                                borderRadius: 6,
                                fontSize: 12,
                                color: "#444",
                                lineHeight: 1.4,
                              }}
                            >
                              {primaryItem.customDescription ||
                                "Covers packages lost, damaged, or stolen during transit. Instant hassle-free replacement with zero deductibles."}
                            </div>
                          )}
                        </div>

                        {/* Full-width Add to Cart / Remove Button */}
                        <div style={{ marginTop: 12 }}>
                          {(() => {
                            const isSingleAdded = !!previewAddedMap["single"];
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewAddedMap((prev) => ({
                                    ...prev,
                                    single: !prev.single,
                                  }))
                                }
                                style={{
                                  width: "100%",
                                  padding: "10px 14px",
                                  backgroundColor: isSingleAdded ? "#f4f4f4" : buttonColor || "#0066cc",
                                  color: isSingleAdded ? "#333333" : buttonTextColor || "#ffffff",
                                  border: isSingleAdded ? "1px solid #ccc" : "none",
                                  borderRadius: 8,
                                  fontSize: 14,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  textAlign: "center",
                                  transition: "background-color 0.2s ease",
                                }}
                              >
                                {isSingleAdded ? "Remove" : "Add to cart"}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px dashed #ccc",
                          borderRadius: 8,
                          padding: 20,
                          textAlign: "center",
                          color: "#777",
                          fontSize: 13,
                        }}
                      >
                        Add a product to see live preview
                      </div>
                    )}

                    {/* Simulated Contact Section below */}
                    <div
                      style={{
                        marginTop: 18,
                        paddingTop: 14,
                        borderTop: "1px solid #e1e3e5",
                        opacity: 0.65,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Contact</span>
                        <span style={{ fontSize: 12, color: "#0066cc" }}>Sign in</span>
                      </div>
                      <div
                        style={{
                          backgroundColor: "#fff",
                          border: "1px solid #ccc",
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 13,
                          color: "#999",
                        }}
                      >
                        Email
                      </div>
                    </div>
                  </div>
                </BlockStack>
              </Card>

              {/* Instructions Card */}
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Targeting & Rules
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Specific Page:</strong> Enter <code>/pages/promo</code> or{" "}
                    <code>/products/item-a</code> to trigger this upsell only when buyers come from that page.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Universal:</strong> Enter <code>*</code> or <code>all</code> to trigger this
                    upsell on all checkout pages.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Multi-campaign:</strong> Create multiple campaigns for different products or
                    funnels.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

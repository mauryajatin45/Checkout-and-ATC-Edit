import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Select,
  Checkbox,
  Button,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getProduct, updateStickyAtcConfig, updateCheckoutConfig } from "../models/product.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const productId = params.id as string;
  const product = await getProduct(productId);

  if (!product) {
    throw new Response("Not Found", { status: 404 });
  }

  return json({ product });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const productId = params.id as string;
  const formData = await request.formData();

  const actionType = formData.get("actionType");

  if (actionType === "stickyAtc") {
    await updateStickyAtcConfig(productId, {
      enabled: formData.get("enabled") === "true",
      headline: formData.get("headline"),
      subheadline: formData.get("subheadline"),
      timerEnabled: formData.get("timerEnabled") === "true",
      timerMode: formData.get("timerMode"),
      autoResetTimer: formData.get("autoResetTimer") === "true",
      backgroundColor: formData.get("backgroundColor"),
      textColor: formData.get("textColor"),
    });
  } else if (actionType === "checkout") {
    await updateCheckoutConfig(productId, {
      enabled: formData.get("enabled") === "true",
      showReviews: formData.get("showReviews") === "true",
      showRating: formData.get("showRating") === "true",
    });
  }

  return json({ success: true });
};

export default function ProductConfig() {
  const { product } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  // Sticky ATC State
  const [stickyEnabled, setStickyEnabled] = useState(product.stickyAtcConfig?.enabled ?? false);
  const [headline, setHeadline] = useState(product.stickyAtcConfig?.headline ?? "Back to school sale");
  const [subheadline, setSubheadline] = useState(product.stickyAtcConfig?.subheadline ?? "50% OFF + FREE Gifts!");
  const [timerEnabled, setTimerEnabled] = useState(product.stickyAtcConfig?.timerEnabled ?? false);
  const [timerMode, setTimerMode] = useState(product.stickyAtcConfig?.timerMode ?? "fixed_end");
  const [autoResetTimer, setAutoResetTimer] = useState(product.stickyAtcConfig?.autoResetTimer ?? true);
  const [backgroundColor, setBackgroundColor] = useState(product?.stickyAtcConfig?.backgroundColor || "#B978D1");
  const [textColor, setTextColor] = useState(product?.stickyAtcConfig?.textColor || "#FFFFFF");

  // Checkout State
  const [checkoutEnabled, setCheckoutEnabled] = useState(product.checkoutConfig?.enabled ?? false);
  const [showReviews, setShowReviews] = useState(product.checkoutConfig?.showReviews ?? true);
  const [showRating, setShowRating] = useState(product.checkoutConfig?.showRating ?? true);

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Settings saved successfully!");
    }
  }, [actionData]);

  const handleSaveStickyAtc = () => {
    submit(
      {
        actionType: "stickyAtc",
        enabled: String(stickyEnabled),
        headline,
        subheadline,
        timerEnabled: String(timerEnabled),
        timerMode,
        autoResetTimer: String(autoResetTimer),
        backgroundColor,
        textColor,
      },
      { method: "post" }
    );
  };

  const handleSaveCheckout = () => {
    submit(
      {
        actionType: "checkout",
        enabled: String(checkoutEnabled),
        showReviews: String(showReviews),
        showRating: String(showRating),
      },
      { method: "post" }
    );
  };

  return (
    <Page
      breadcrumbs={[{ content: "Products", url: "/app" }]}
      title={product.title}
    >
      <TitleBar title={product.title} />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Checkout Widget Config */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Checkout Widget</Text>
                <Checkbox
                  label="Enable Checkout Widget"
                  checked={checkoutEnabled}
                  onChange={setCheckoutEnabled}
                />
                <Checkbox
                  label="Show Reviews"
                  checked={showReviews}
                  onChange={setShowReviews}
                  disabled={!checkoutEnabled}
                />
                <Checkbox
                  label="Show Rating"
                  checked={showRating}
                  onChange={setShowRating}
                  disabled={!checkoutEnabled}
                />
                <InlineStack align="end">
                  <Button onClick={handleSaveCheckout} variant="primary">
                    Save Checkout Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Sticky ATC Config */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Sticky ATC / Timer</Text>
                <Checkbox
                  label="Enable Sticky ATC"
                  checked={stickyEnabled}
                  onChange={setStickyEnabled}
                />
                <TextField
                  label="Headline"
                  value={headline}
                  onChange={setHeadline}
                  autoComplete="off"
                  disabled={!stickyEnabled}
                />
                <TextField
                  label="Subtitle"
                  value={subheadline}
                  onChange={setSubheadline}
                  autoComplete="off"
                  disabled={!stickyEnabled}
                />
                <Checkbox
                  label="Enable Timer"
                  checked={timerEnabled}
                  onChange={setTimerEnabled}
                  disabled={!stickyEnabled}
                />
                <Select
                  label="Timer Mode"
                  options={[
                    { label: "Fixed End Date", value: "fixed_end" },
                    { label: "Duration from first visit", value: "duration" },
                  ]}
                  value={timerMode}
                  onChange={setTimerMode}
                  disabled={!timerEnabled || !stickyEnabled}
                />
                <Checkbox
                  label="Auto-reset Timer (Never show 0)"
                  checked={autoResetTimer}
                  onChange={setAutoResetTimer}
                  disabled={!timerEnabled || !stickyEnabled}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Background Color"
                      value={backgroundColor}
                      onChange={setBackgroundColor}
                      autoComplete="off"
                      disabled={!stickyEnabled}
                    />
                  </div>
                  <div style={{ marginTop: '24px' }}>
                    <input 
                      type="color" 
                      value={backgroundColor} 
                      onChange={(e) => setBackgroundColor(e.target.value)} 
                      disabled={!stickyEnabled}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                      title="Choose background color"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Text Color"
                      value={textColor}
                      onChange={setTextColor}
                      autoComplete="off"
                      disabled={!stickyEnabled}
                    />
                  </div>
                  <div style={{ marginTop: '24px' }}>
                    <input 
                      type="color" 
                      value={textColor} 
                      onChange={(e) => setTextColor(e.target.value)} 
                      disabled={!stickyEnabled}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                      title="Choose text color"
                    />
                  </div>
                </div>
                <InlineStack align="end">
                  <Button onClick={handleSaveStickyAtc} variant="primary">
                    Save Sticky ATC Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Live Preview (Placeholder) */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Live Preview</Text>
              <div
                style={{
                  backgroundColor: backgroundColor,
                  color: textColor,
                  padding: "16px",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <Text variant="headingSm" as="h3">{headline}</Text>
                <p>{subheadline}</p>
                {timerEnabled && (
                  <div style={{ margin: "10px 0", fontSize: "20px", fontWeight: "bold" }}>
                    14 : 15 : 52 : 43
                  </div>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

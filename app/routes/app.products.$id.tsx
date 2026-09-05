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
import { getProduct, updateStickyAtcConfig, updateCheckoutConfig, createCustomReview, deleteCustomReview } from "../models/product.server";

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
      iconColor: formData.get("iconColor"),
      timerBoxColor: formData.get("timerBoxColor"),
      timerBoxTextColor: formData.get("timerBoxTextColor"),
    });
  } else if (actionType === "checkout") {
    await updateCheckoutConfig(productId, {
      enabled: formData.get("enabled") === "true",
      showReviews: formData.get("showReviews") === "true",
      showRating: formData.get("showRating") === "true",
      reviewsSource: formData.get("reviewsSource"),
    });
  } else if (actionType === "addCustomReview") {
    await createCustomReview(productId, {
      name: formData.get("name"),
      rating: parseInt(formData.get("rating") as string, 10),
      title: formData.get("title"),
      body: formData.get("body"),
    });
  } else if (actionType === "deleteCustomReview") {
    await deleteCustomReview(formData.get("reviewId") as string);
  }

  return json({ success: true, actionType });
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
  const [iconColor, setIconColor] = useState(product?.stickyAtcConfig?.iconColor || "#FFFFFF");
  const [timerBoxColor, setTimerBoxColor] = useState(product?.stickyAtcConfig?.timerBoxColor || "#FFFFFF");
  const [timerBoxTextColor, setTimerBoxTextColor] = useState(product?.stickyAtcConfig?.timerBoxTextColor || "#B978D1");

  // Checkout State
  const [checkoutEnabled, setCheckoutEnabled] = useState(product.checkoutConfig?.enabled ?? false);
  const [showReviews, setShowReviews] = useState(product.checkoutConfig?.showReviews ?? true);
  const [showRating, setShowRating] = useState(product.checkoutConfig?.showRating ?? true);
  const [reviewsSource, setReviewsSource] = useState(product.checkoutConfig?.reviewsSource ?? "judgeme");

  // Custom Review Form State
  const [newReviewName, setNewReviewName] = useState("");
  const [newReviewRating, setNewReviewRating] = useState("5");
  const [newReviewTitle, setNewReviewTitle] = useState("");
  const [newReviewBody, setNewReviewBody] = useState("");

  useEffect(() => {
    if (actionData?.success) {
      if (actionData.actionType === "addCustomReview") {
        setNewReviewName("");
        setNewReviewRating("5");
        setNewReviewTitle("");
        setNewReviewBody("");
        shopify.toast.show("Review added successfully!");
      } else if (actionData.actionType === "deleteCustomReview") {
        shopify.toast.show("Review deleted successfully!");
      } else {
        shopify.toast.show("Settings saved successfully!");
      }
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
        iconColor,
        timerBoxColor,
        timerBoxTextColor,
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
        reviewsSource,
      },
      { method: "post" }
    );
  };

  const handleAddCustomReview = () => {
    if (!newReviewName || !newReviewBody) {
      shopify.toast.show("Name and Review Text are required", { isError: true });
      return;
    }
    submit(
      {
        actionType: "addCustomReview",
        name: newReviewName,
        rating: newReviewRating,
        title: newReviewTitle,
        body: newReviewBody,
      },
      { method: "post" }
    );
  };

  const handleDeleteCustomReview = (reviewId: string) => {
    submit(
      {
        actionType: "deleteCustomReview",
        reviewId,
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
                <Select
                  label="Review Source"
                  options={[
                    { label: "Judge.me API", value: "judgeme" },
                    { label: "Custom Reviews", value: "custom" },
                  ]}
                  value={reviewsSource}
                  onChange={setReviewsSource}
                  disabled={!checkoutEnabled || !showReviews}
                />
                <InlineStack align="end">
                  <Button onClick={handleSaveCheckout} variant="primary">
                    Save Checkout Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {reviewsSource === "custom" && (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Manage Custom Reviews</Text>
                  
                  {/* List existing custom reviews */}
                  {product.customReviews?.length > 0 ? (
                    <BlockStack gap="300">
                      {product.customReviews.map((review: any) => (
                        <Card key={review.id} background="bg-surface-secondary">
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text variant="bodyMd" fontWeight="bold" as="span">{review.name} - {review.rating} Stars</Text>
                              <Button tone="critical" variant="plain" onClick={() => handleDeleteCustomReview(review.id)}>Delete</Button>
                            </InlineStack>
                            {review.title && <Text variant="bodySm" fontWeight="bold" as="span">{review.title}</Text>}
                            <Text variant="bodySm" as="span">{review.body}</Text>
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  ) : (
                    <Text variant="bodyMd" as="span" tone="subdued">No custom reviews added yet.</Text>
                  )}

                  <hr style={{ margin: '10px 0', border: '1px solid #e1e3e5' }} />
                  
                  {/* Add new review form */}
                  <Text variant="headingSm" as="h3">Add New Review</Text>
                  <TextField
                    label="Reviewer Name"
                    value={newReviewName}
                    onChange={setNewReviewName}
                    autoComplete="off"
                  />
                  <Select
                    label="Star Rating"
                    options={[
                      { label: "5 Stars", value: "5" },
                      { label: "4 Stars", value: "4" },
                      { label: "3 Stars", value: "3" },
                      { label: "2 Stars", value: "2" },
                      { label: "1 Star", value: "1" },
                    ]}
                    value={newReviewRating}
                    onChange={setNewReviewRating}
                  />
                  <TextField
                    label="Review Title (Optional)"
                    value={newReviewTitle}
                    onChange={setNewReviewTitle}
                    autoComplete="off"
                  />
                  <TextField
                    label="Review Text"
                    value={newReviewBody}
                    onChange={setNewReviewBody}
                    autoComplete="off"
                    multiline={3}
                  />
                  <InlineStack align="end">
                    <Button onClick={handleAddCustomReview}>Add Review</Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Icon Color (Clock)"
                      value={iconColor}
                      onChange={setIconColor}
                      autoComplete="off"
                      disabled={!stickyEnabled || !timerEnabled}
                    />
                  </div>
                  <div style={{ marginTop: '24px' }}>
                    <input 
                      type="color" 
                      value={iconColor} 
                      onChange={(e) => setIconColor(e.target.value)} 
                      disabled={!stickyEnabled || !timerEnabled}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                      title="Choose icon color"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Timer Box Color"
                      value={timerBoxColor}
                      onChange={setTimerBoxColor}
                      autoComplete="off"
                      disabled={!stickyEnabled || !timerEnabled}
                    />
                  </div>
                  <div style={{ marginTop: '24px' }}>
                    <input 
                      type="color" 
                      value={timerBoxColor} 
                      onChange={(e) => setTimerBoxColor(e.target.value)} 
                      disabled={!stickyEnabled || !timerEnabled}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                      title="Choose timer box color"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Timer Box Text Color"
                      value={timerBoxTextColor}
                      onChange={setTimerBoxTextColor}
                      autoComplete="off"
                      disabled={!stickyEnabled || !timerEnabled}
                    />
                  </div>
                  <div style={{ marginTop: '24px' }}>
                    <input 
                      type="color" 
                      value={timerBoxTextColor} 
                      onChange={(e) => setTimerBoxTextColor(e.target.value)} 
                      disabled={!stickyEnabled || !timerEnabled}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                      title="Choose timer box text color"
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
                  padding: "10px 5%",
                  boxSizing: "border-box",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                  <Text variant="headingMd" as="h3">
                    <span style={{ fontSize: "1.4rem" }}>{headline}</span>
                  </Text>
                  <p style={{ fontSize: "1rem", marginTop: "2px" }}>{subheadline}</p>
                </div>
                {timerEnabled && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "1.8rem", fontWeight: "bold" }}>
                    {!autoResetTimer && (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                          <div style={{ backgroundColor: timerBoxColor, color: timerBoxTextColor, padding: "8px 12px", borderRadius: "8px", lineHeight: 1 }}>13</div>
                          <div style={{ fontSize: "0.6rem", fontWeight: "bold" }}>DAYS</div>
                        </div>
                        <div>:</div>
                      </>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ backgroundColor: timerBoxColor, color: timerBoxTextColor, padding: "8px 12px", borderRadius: "8px", lineHeight: 1 }}>{autoResetTimer ? '23' : '14'}</div>
                      <div style={{ fontSize: "0.6rem", fontWeight: "bold" }}>HRS</div>
                    </div>
                    <div>:</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ backgroundColor: timerBoxColor, color: timerBoxTextColor, padding: "8px 12px", borderRadius: "8px", lineHeight: 1 }}>15</div>
                      <div style={{ fontSize: "0.6rem", fontWeight: "bold" }}>MINS</div>
                    </div>
                    <div>:</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ backgroundColor: timerBoxColor, color: timerBoxTextColor, padding: "8px 12px", borderRadius: "8px", lineHeight: 1 }}>52</div>
                      <div style={{ fontSize: "0.6rem", fontWeight: "bold" }}>SECS</div>
                    </div>
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

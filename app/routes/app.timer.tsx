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
  Checkbox, Select,
  Button,
  InlineStack,
  ColorPicker,
  hsbToHex,
  hexToRgb,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getCheckoutTimerSettings, updateCheckoutTimerSettings } from "../models/checkoutTimer.server";

// Helper for ColorPicker
const hexToHsb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { hue: 0, saturation: 0, brightness: 1 };
  
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, v = max;
  const d = max - min;
  
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { hue: h * 360, saturation: s, brightness: v };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getCheckoutTimerSettings(session.shop);
  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  try {
    await updateCheckoutTimerSettings(session.shop, {
      enabled: formData.get("enabled") === "true",
      text: formData.get("text"),
      timerMinutes: parseInt(formData.get("timerMinutes") as string, 10),
      backgroundColor: formData.get("backgroundColor"),
      textColor: formData.get("textColor"),
      iconEnabled: formData.get("iconEnabled") === "true",
      fontSize: formData.get("fontSize") || "base",
    });
    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 400 });
  }
};

export default function CheckoutTimer() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();

  const [enabled, setEnabled] = useState(settings?.enabled ?? true);
  const [text, setText] = useState(settings?.text || "Due to high demand your order is reserved for:");
  const [timerMinutes, setTimerMinutes] = useState(String(settings?.timerMinutes || 10));
  
  const [backgroundColor, setBackgroundColor] = useState(settings?.backgroundColor || "#e8f8e8");
  const [textColor, setTextColor] = useState(settings?.textColor || "#000000");
  const [iconEnabled, setIconEnabled] = useState(settings?.iconEnabled ?? true);
  const [fontSize, setFontSize] = useState(settings?.fontSize || "base");

  const [bgColorHsb, setBgColorHsb] = useState(hexToHsb(backgroundColor));
  const [textColorHsb, setTextColorHsb] = useState(hexToHsb(textColor));

  useEffect(() => {
    setBackgroundColor(hsbToHex(bgColorHsb));
  }, [bgColorHsb]);

  useEffect(() => {
    setTextColor(hsbToHex(textColorHsb));
  }, [textColorHsb]);

  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        shopify.toast.show("Timer settings saved");
      } else {
        shopify.toast.show("Error saving settings", { isError: true });
      }
    }
  }, [actionData]);

  const handleSave = () => {
    submit(
      {
        enabled: String(enabled),
        text,
        timerMinutes,
        backgroundColor,
        textColor,
        iconEnabled: String(iconEnabled),
        fontSize,
      },
      { method: "post" }
    );
  };

  const fontOptions = [
    { label: "Small", value: "small" },
    { label: "Medium / Base", value: "base" },
    { label: "Large", value: "large" },
    { label: "Extra Large", value: "extraLarge" },
  ];

  return (
    <Page>
      <TitleBar title="Checkout Reservation Timer" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Global Checkout Timer</Text>
              <Text as="p">
                Enable and configure a reservation timer for your checkout page. Add the app block from the Shopify Checkout Editor.
              </Text>

              <Checkbox
                label="Enable Checkout Timer"
                checked={enabled}
                onChange={setEnabled}
              />

              <TextField
                label="Timer Text"
                value={text}
                onChange={setText}
                autoComplete="off"
              />

              <TextField
                label="Timer Duration (Minutes)"
                type="number"
                value={timerMinutes}
                onChange={setTimerMinutes}
                autoComplete="off"
              />

              <Checkbox
                label="Show Checkmark Icon"
                checked={iconEnabled}
                onChange={setIconEnabled}
              />
              
              <Select
                label="Font Size"
                options={fontOptions}
                onChange={setFontSize}
                value={fontSize}
              />

              <InlineStack gap="400">
                <BlockStack gap="200">
                  <Text as="span" variant="bodyMd">Background Color (Checkout overrides this with native Banner colors)</Text>
                  <ColorPicker onChange={setBgColorHsb} color={bgColorHsb} />
                  <TextField label="Hex" value={backgroundColor} onChange={setBackgroundColor} autoComplete="off" />
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="span" variant="bodyMd">Text Color (Checkout overrides this)</Text>
                  <ColorPicker onChange={setTextColorHsb} color={textColorHsb} />
                  <TextField label="Hex" value={textColor} onChange={setTextColor} autoComplete="off" />
                </BlockStack>
              </InlineStack>

              <div style={{ padding: '16px', backgroundColor, color: textColor, borderRadius: '8px', border: '1px solid #ccc' }}>
                <InlineStack gap="200" align="start">
                  {iconEnabled && (
                    <svg viewBox="0 0 20 20" width="20" height="20" fill={textColor}>
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 13.5l-3.5-3.5 1.41-1.41L8 10.67l6.09-6.09L15.5 6 8 13.5z" />
                    </svg>
                  )}
                  <BlockStack>
                    <Text as="span" variant="bodyMd">{text}</Text>
                    <Text as="span" variant="headingMd" fontWeight="bold">0{timerMinutes}:00</Text>
                  </BlockStack>
                </InlineStack>
              </div>

              <InlineStack align="end">
                <Button variant="primary" onClick={handleSave}>Save Settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

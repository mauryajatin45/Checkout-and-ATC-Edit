import fs from 'fs';

let code = fs.readFileSync('app/routes/app.products.$id.tsx', 'utf8');

// 1. Update the action function to handle checkoutImageUrl
const checkoutActionMatch = /\} else if \(actionType === "checkout"\) \{\n      await updateCheckoutConfig\(productId, \{\n        enabled: formData.get\("enabled"\) === "true",\n        showReviews: formData.get\("showReviews"\) === "true",\n        showRating: formData.get\("showRating"\) === "true",\n        reviewsSource: formData.get\("reviewsSource"\),\n      \}\);/g;

code = code.replace(checkoutActionMatch, `} else if (actionType === "checkout") {
      let checkoutImageUrl = formData.get("existingImageUrl") || null;
      const imageBase64 = formData.get("checkoutImageBase64");
      if (imageBase64 && typeof imageBase64 === "string" && imageBase64.startsWith("data:image")) {
        checkoutImageUrl = await uploadImageToCloudinary(imageBase64);
      } else if (formData.get("removeImage") === "true") {
        checkoutImageUrl = null;
      }

      await updateCheckoutConfig(productId, {
        enabled: formData.get("enabled") === "true",
        showReviews: formData.get("showReviews") === "true",
        showRating: formData.get("showRating") === "true",
        reviewsSource: formData.get("reviewsSource"),
        checkoutImageUrl: checkoutImageUrl,
      });`);

// 2. Remove image upload from addCustomReview
const addReviewMatch = /\} else if \(actionType === "addCustomReview"\) \{[\s\S]*?imageUrl,\n      \}\);/g;

code = code.replace(addReviewMatch, `} else if (actionType === "addCustomReview") {
      await createCustomReview(productId, {
        name: formData.get("name") ? String(formData.get("name")) : "",
        rating: parseInt(formData.get("rating") as string, 10) || 5,
        title: formData.get("title") ? String(formData.get("title")) : null,
        body: formData.get("body") ? String(formData.get("body")) : "",
        imageUrl: null,
      });`);

// 3. Update the component state
const stateMatch = /const \[newReviewImageBase64, setNewReviewImageBase64\] = useState<string \| null>\(null\);/g;
code = code.replace(stateMatch, `const [checkoutImageBase64, setCheckoutImageBase64] = useState<string | null>(null);
  const [removeCheckoutImage, setRemoveCheckoutImage] = useState(false);`);

// 4. Update the handleDropZoneDrop
const dropZoneMatch = /const handleDropZoneDrop = \(\_dropFiles: File\[\], acceptedFiles: File\[\], \_rejectedFiles: File\[\]\) => \{\n    const file = acceptedFiles\[0\];\n    if \(file\) \{\n      const reader = new FileReader\(\);\n      reader.onload = \(\) => setNewReviewImageBase64\(reader.result as string\);\n      reader.readAsDataURL\(file\);\n    \}\n  \};/g;

code = code.replace(dropZoneMatch, `const handleDropZoneDrop = (_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCheckoutImageBase64(reader.result as string);
        setRemoveCheckoutImage(false);
      };
      reader.readAsDataURL(file);
    }
  };`);

// 5. Update the handleSaveCheckout handle function
const saveCheckoutMatch = /const handleSaveCheckout = \(\) => \{\n    submit\(\{\n      actionType: "checkout",\n      enabled: String\(checkoutEnabled\),\n      showReviews: String\(showReviews\),\n      showRating: String\(showRating\),\n      reviewsSource,\n    \}, \{ method: "post" \}\);\n  \};/g;

code = code.replace(saveCheckoutMatch, `const handleSaveCheckout = () => {
    setIsUploading(true);
    submit({
      actionType: "checkout",
      enabled: String(checkoutEnabled),
      showReviews: String(showReviews),
      showRating: String(showRating),
      reviewsSource,
      checkoutImageBase64: checkoutImageBase64 || "",
      existingImageUrl: product.checkoutConfig?.checkoutImageUrl || "",
      removeImage: String(removeCheckoutImage)
    }, { method: "post" });
  };`);

// 6. Remove the DropZone from the Review Form
const reviewFormDropZoneMatch = /<div style=\{\{ marginTop: '10px' \}\}>\n                    <Text variant="bodyMd" as="span" fontWeight="medium">Review Image \(Optional\)<\/Text>\n                    <div style=\{\{ marginTop: '4px' \}\}>\n                      <DropZone accept="image\/\*" type="image" onDrop=\{handleDropZoneDrop\}>\n                        \{newReviewImageBase64 \? \(\n                          <LegacyStack alignment="center">\n                            <Thumbnail size="small" alt="Upload" source=\{newReviewImageBase64\} \/>\n                            <div>Image selected<\/div>\n                          <\/LegacyStack>\n                        \) : \(\n                          <DropZone.FileUpload actionHint="Accepts .gif, .jpg, and .png" \/>\n                        \)\}\n                      <\/DropZone>\n                    <\/div>\n                  <\/div>/g;

code = code.replace(reviewFormDropZoneMatch, '');

// 7. Inject the new Checkout Image Card before the Sticky ATC config
const stickyAtcMatch = /\{\/\* Sticky ATC Config \*\/\}/g;

const newCheckoutImageSection = `
            {/* Checkout Image Settings */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Checkout Product Image</Text>
                <Text as="p">Upload a 9:16 portrait image for this product to be displayed on the checkout page when enabled.</Text>
                
                <div style={{ marginTop: '10px' }}>
                    <div style={{ marginTop: '4px' }}>
                      <DropZone accept="image/*" type="image" onDrop={handleDropZoneDrop}>
                        {checkoutImageBase64 ? (
                          <LegacyStack alignment="center">
                            <Thumbnail size="large" alt="Upload" source={checkoutImageBase64} />
                            <div>New Image selected</div>
                          </LegacyStack>
                        ) : (product.checkoutConfig?.checkoutImageUrl && !removeCheckoutImage) ? (
                          <LegacyStack alignment="center">
                            <Thumbnail size="large" alt="Current Image" source={product.checkoutConfig.checkoutImageUrl} />
                            <div>Current Image</div>
                          </LegacyStack>
                        ) : (
                          <DropZone.FileUpload actionHint="Accepts .gif, .jpg, and .png (9:16 recommended)" />
                        )}
                      </DropZone>
                    </div>
                </div>

                {(product.checkoutConfig?.checkoutImageUrl || checkoutImageBase64) && !removeCheckoutImage && (
                  <InlineStack>
                    <Button tone="critical" onClick={() => {
                      setCheckoutImageBase64(null);
                      setRemoveCheckoutImage(true);
                    }}>Remove Image</Button>
                  </InlineStack>
                )}

                <InlineStack align="end">
                  <Button onClick={handleSaveCheckout} loading={isUploading}>Save Image Settings</Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Sticky ATC Config */}`;

code = code.replace(stickyAtcMatch, newCheckoutImageSection);

fs.writeFileSync('app/routes/app.products.$id.tsx', code);

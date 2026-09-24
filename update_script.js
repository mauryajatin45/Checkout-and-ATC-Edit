const fs = require('fs');
let code = fs.readFileSync('app/models/product.server.ts', 'utf8');

code = code.replace(
  /reviewsSource: data.reviewsSource\n    },/g,
  `reviewsSource: data.reviewsSource,
      checkoutImageUrl: data.checkoutImageUrl
    },`
);

fs.writeFileSync('app/models/product.server.ts', code);

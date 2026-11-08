-- AlterTable
ALTER TABLE `PostPurchaseOffer` ADD COLUMN `showShippingNote` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `ThankYouItem` ADD COLUMN `showShippingNote` BOOLEAN NOT NULL DEFAULT false;


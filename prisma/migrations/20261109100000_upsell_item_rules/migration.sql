-- AlterTable
ALTER TABLE `CheckoutUpsellItem` ADD COLUMN `buttonLabel` VARCHAR(191) NULL,
    ADD COLUMN `headline` VARCHAR(191) NULL,
    ADD COLUMN `hideIfVariants` TEXT NULL,
    ADD COLUMN `showIfVariants` TEXT NULL,
    ADD COLUMN `subtext` TEXT NULL;


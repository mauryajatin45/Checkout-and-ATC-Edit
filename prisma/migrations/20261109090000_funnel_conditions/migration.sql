-- AlterTable
ALTER TABLE `PostPurchaseFunnel` ADD COLUMN `buyerType` VARCHAR(191) NOT NULL DEFAULT 'any',
    ADD COLUMN `includeVariants` TEXT NULL,
    ADD COLUMN `excludeVariants` TEXT NULL;

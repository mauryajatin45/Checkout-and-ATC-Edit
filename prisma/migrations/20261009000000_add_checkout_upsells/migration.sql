-- CreateTable
CREATE TABLE `CheckoutUpsellCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sourcePage` VARCHAR(191) NOT NULL,
    `headline` VARCHAR(191) NULL DEFAULT 'Special Offer Just for You',
    `description` VARCHAR(191) NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CheckoutUpsellCampaign_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CheckoutUpsellItem` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `shopifyProductId` VARCHAR(191) NOT NULL,
    `shopifyVariantId` VARCHAR(191) NOT NULL,
    `customTitle` VARCHAR(191) NULL,
    `customDescription` VARCHAR(191) NULL,
    `strikethroughPrice` VARCHAR(191) NULL,
    `price` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CheckoutUpsellItem_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CheckoutUpsellCampaign` ADD CONSTRAINT `CheckoutUpsellCampaign_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CheckoutUpsellItem` ADD CONSTRAINT `CheckoutUpsellItem_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CheckoutUpsellCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

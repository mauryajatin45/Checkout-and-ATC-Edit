-- CreateTable
CREATE TABLE `ThankYouCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `triggerType` VARCHAR(191) NOT NULL DEFAULT 'all',
    `triggerProducts` TEXT NULL,
    `timerMinutes` INTEGER NOT NULL DEFAULT 10,
    `badgeText` VARCHAR(191) NULL,
    `headline` VARCHAR(191) NULL,
    `subheadline` TEXT NULL,
    `buttonLabel` VARCHAR(191) NULL,
    `smallPrint` TEXT NULL,
    `discountCode` VARCHAR(191) NULL,
    `discountPercent` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ThankYouCampaign_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ThankYouItem` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `productTitle` VARCHAR(191) NOT NULL,
    `variantTitle` VARCHAR(191) NULL,
    `imageUrl` TEXT NULL,
    `variantPrice` VARCHAR(191) NULL,
    `compareAtPrice` VARCHAR(191) NULL,
    `maxQuantity` INTEGER NOT NULL DEFAULT 3,
    `skipIfInOrder` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ThankYouItem_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ThankYouEvent` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `quantity` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ThankYouEvent_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `ThankYouEvent_campaignId_type_idx`(`campaignId`, `type`),
    INDEX `ThankYouEvent_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ThankYouCampaign` ADD CONSTRAINT `ThankYouCampaign_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ThankYouItem` ADD CONSTRAINT `ThankYouItem_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `ThankYouCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ThankYouEvent` ADD CONSTRAINT `ThankYouEvent_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `ThankYouCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ThankYouEvent` ADD CONSTRAINT `ThankYouEvent_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ThankYouItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


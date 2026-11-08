-- CreateTable
CREATE TABLE `PostPurchaseFunnel` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `triggerType` VARCHAR(191) NOT NULL DEFAULT 'products',
    `triggerProducts` TEXT NULL,
    `timerMinutes` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PostPurchaseFunnel_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostPurchaseOffer` (
    `id` VARCHAR(191) NOT NULL,
    `funnelId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `showWhen` VARCHAR(191) NOT NULL DEFAULT 'always',
    `skipIfInOrder` BOOLEAN NOT NULL DEFAULT true,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `productTitle` VARCHAR(191) NOT NULL,
    `variantTitle` VARCHAR(191) NULL,
    `imageUrl` TEXT NULL,
    `variantPrice` VARCHAR(191) NULL,
    `compareAtPrice` VARCHAR(191) NULL,
    `discountPercent` DOUBLE NOT NULL DEFAULT 0,
    `discountTitle` VARCHAR(191) NOT NULL DEFAULT 'Exclusive offer',
    `maxQuantity` INTEGER NOT NULL DEFAULT 3,
    `badgeText` VARCHAR(191) NULL,
    `headline` VARCHAR(191) NULL,
    `subheadline` TEXT NULL,
    `bullets` TEXT NULL,
    `ratingText` VARCHAR(191) NULL,
    `guaranteeText` TEXT NULL,
    `acceptLabel` VARCHAR(191) NULL,
    `declineLabel` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PostPurchaseOffer_funnelId_idx`(`funnelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostPurchaseEvent` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `funnelId` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `quantity` INTEGER NULL,
    `revenue` DOUBLE NULL,
    `currency` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PostPurchaseEvent_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `PostPurchaseEvent_funnelId_type_idx`(`funnelId`, `type`),
    INDEX `PostPurchaseEvent_offerId_idx`(`offerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostPurchaseFunnel` ADD CONSTRAINT `PostPurchaseFunnel_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostPurchaseOffer` ADD CONSTRAINT `PostPurchaseOffer_funnelId_fkey` FOREIGN KEY (`funnelId`) REFERENCES `PostPurchaseFunnel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostPurchaseEvent` ADD CONSTRAINT `PostPurchaseEvent_funnelId_fkey` FOREIGN KEY (`funnelId`) REFERENCES `PostPurchaseFunnel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostPurchaseEvent` ADD CONSTRAINT `PostPurchaseEvent_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `PostPurchaseOffer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


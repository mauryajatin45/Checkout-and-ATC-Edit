-- AlterTable
ALTER TABLE `PostPurchaseOffer` ADD COLUMN `offerType` VARCHAR(191) NOT NULL DEFAULT 'product',
    ADD COLUMN `subFirstPrice` VARCHAR(191) NULL,
    ADD COLUMN `subIntervalDays` INTEGER NOT NULL DEFAULT 28,
    ADD COLUMN `subRecurringPrice` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `NextBoxRequest` (
    `id` VARCHAR(191) NOT NULL,
    `shop` VARCHAR(191) NOT NULL,
    `funnelId` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `productTitle` VARCHAR(191) NULL,
    `variantTitle` VARCHAR(191) NULL,
    `firstPrice` VARCHAR(191) NOT NULL,
    `recurringPrice` VARCHAR(191) NOT NULL,
    `intervalDays` INTEGER NOT NULL DEFAULT 28,
    `status` VARCHAR(191) NOT NULL DEFAULT 'signed',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rechargeCustomerId` VARCHAR(191) NULL,
    `rechargeSubscriptionId` VARCHAR(191) NULL,
    `firstChargeDate` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NextBoxRequest_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `NextBoxRequest_shop_createdAt_idx`(`shop`, `createdAt`),
    UNIQUE INDEX `NextBoxRequest_referenceId_offerId_key`(`referenceId`, `offerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


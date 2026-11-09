-- CreateTable
CREATE TABLE `ExtensionLog` (
    `id` VARCHAR(191) NOT NULL,
    `shop` VARCHAR(191) NULL,
    `path` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `status` INTEGER NOT NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExtensionLog_createdAt_idx`(`createdAt`),
    INDEX `ExtensionLog_path_createdAt_idx`(`path`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


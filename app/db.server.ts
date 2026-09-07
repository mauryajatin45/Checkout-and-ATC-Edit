import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
} else {
  // Auto-migrate database on server start in production to ensure tables exist
  try {
    console.log("Auto-migrating database schema...");
    execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
    console.log("Auto-migration complete.");
  } catch (error) {
    console.error("Auto-migration failed. Error:", error);
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

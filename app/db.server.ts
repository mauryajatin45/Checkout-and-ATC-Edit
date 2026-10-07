import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

// NOTE: Schema changes are applied by scripts/migrate.mjs (prisma migrate deploy)
// before the server starts. Never run `prisma db push --accept-data-loss` here:
// it drops every table not in schema.prisma, including other apps' tables.
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

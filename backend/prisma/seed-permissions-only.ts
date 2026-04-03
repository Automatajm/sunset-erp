import { PrismaClient } from "@prisma/client";
import { seedPermissions } from "./seeds/03-permissions.seed";

const prisma = new PrismaClient();

async function main() {
  console.log("🔐 Running permissions-only seed (safe upsert, no data loss)...\n");
  await seedPermissions(prisma);
  console.log("\n✅ Done.");
}

main()
  .catch((e) => { console.error("❌ Failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
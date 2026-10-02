import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// `prisma generate` не подключается к БД, поэтому ему DATABASE_URL не нужен: так `npm install`
// (postinstall) проходит на чистой копии до создания .env. Остальным командам адрес БД обязателен.
const generateOnly = process.argv.includes("generate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: generateOnly ? (process.env.DATABASE_URL ?? "postgresql://localhost:5432/unused-for-generate") : env("DATABASE_URL"),
  },
});

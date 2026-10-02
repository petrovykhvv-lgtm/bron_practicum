import "dotenv/config";
import { assertSafeTestDatabase } from "./support/safe-db";

assertSafeTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);

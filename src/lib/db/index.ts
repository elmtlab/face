import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "face.db");

const globalForDb = globalThis as unknown as {
  __faceDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getDb() {
  if (!globalForDb.__faceDb) {
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    globalForDb.__faceDb = drizzle(sqlite, { schema });
  }
  return globalForDb.__faceDb;
}

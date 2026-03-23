import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "face.db");

export function runMigrations() {
  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      component_id TEXT NOT NULL,
      section TEXT NOT NULL,
      duration_ms INTEGER,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS layout_weights (
      component_id TEXT PRIMARY KEY,
      weight REAL NOT NULL DEFAULT 1.0,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      last_interaction INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      healthy INTEGER NOT NULL,
      message TEXT,
      checked_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_events_component
      ON usage_events(component_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_health_checks_agent
      ON health_checks(agent_id, checked_at);

    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      display_name TEXT,
      onboarded_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      preferences TEXT
    );

    CREATE TABLE IF NOT EXISTS feature_usage_stats (
      feature_id TEXT PRIMARY KEY,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      visibility_score REAL NOT NULL DEFAULT 0.5,
      role TEXT NOT NULL DEFAULT 'unknown',
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feature_usage_role
      ON feature_usage_stats(role, interaction_count DESC);
  `);

  sqlite.close();
  console.log("[face] Database migrations complete");
}

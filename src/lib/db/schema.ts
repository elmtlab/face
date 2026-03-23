import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const usageEvents = sqliteTable("usage_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: integer("timestamp").notNull(),
  eventType: text("event_type").notNull(),
  componentId: text("component_id").notNull(),
  section: text("section").notNull(),
  durationMs: integer("duration_ms"),
  metadata: text("metadata"),
});

export const layoutWeights = sqliteTable("layout_weights", {
  componentId: text("component_id").primaryKey(),
  weight: real("weight").notNull().default(1.0),
  interactionCount: integer("interaction_count").notNull().default(0),
  lastInteraction: integer("last_interaction"),
  updatedAt: integer("updated_at").notNull(),
});

export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(), // single-user, default "default"
  role: text("role").notNull(), // e.g. "engineer", "product_manager", "sales"
  displayName: text("display_name"),
  onboardedAt: integer("onboarded_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  preferences: text("preferences"), // JSON blob for misc prefs
});

export const featureUsageStats = sqliteTable("feature_usage_stats", {
  featureId: text("feature_id").primaryKey(),
  interactionCount: integer("interaction_count").notNull().default(0),
  lastUsedAt: integer("last_used_at"),
  visibilityScore: real("visibility_score").notNull().default(0.5),
  role: text("role").notNull().default("unknown"),
  updatedAt: integer("updated_at").notNull(),
});

export const healthChecks = sqliteTable("health_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id").notNull(),
  healthy: integer("healthy").notNull(),
  message: text("message"),
  checkedAt: integer("checked_at").notNull(),
});

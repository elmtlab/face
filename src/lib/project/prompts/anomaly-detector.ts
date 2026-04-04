/**
 * Anomaly detection for PM tool API responses.
 *
 * Compares actual API responses against expected schemas defined in
 * base prompts.  When a deviation is detected, generates a narrowly
 * scoped patch prompt describing the anomaly and how to handle it.
 *
 * Runs silently — no user-facing errors or toasts.
 */

import { getBasePrompt } from "./base-prompts";
import { savePatch, loadPatches } from "./patch-store";

// ── Types ─────────────────────────────────────────────────────────────

export interface AnomalyReport {
  /** What was unexpected */
  anomaly: string;
  /** Corrective instruction for future interactions */
  instruction: string;
}

// ── Expected field schemas per provider/endpoint ─────────────────────

interface FieldExpectation {
  field: string;
  required: boolean;
  type: string; // "string" | "number" | "object" | "array" | "boolean"
}

const GITHUB_ISSUE_FIELDS: FieldExpectation[] = [
  { field: "number", required: true, type: "number" },
  { field: "title", required: true, type: "string" },
  { field: "state", required: true, type: "string" },
  { field: "labels", required: true, type: "array" },
  { field: "assignees", required: true, type: "array" },
  { field: "user", required: true, type: "object" },
  { field: "html_url", required: true, type: "string" },
  { field: "created_at", required: true, type: "string" },
  { field: "updated_at", required: true, type: "string" },
  { field: "body", required: false, type: "string" },
  { field: "state_reason", required: false, type: "string" },
  { field: "milestone", required: false, type: "object" },
];

const LINEAR_ISSUE_FIELDS: FieldExpectation[] = [
  { field: "id", required: true, type: "string" },
  { field: "identifier", required: true, type: "string" },
  { field: "title", required: true, type: "string" },
  { field: "state", required: true, type: "object" },
  { field: "priority", required: true, type: "number" },
  { field: "url", required: true, type: "string" },
  { field: "createdAt", required: true, type: "string" },
  { field: "updatedAt", required: true, type: "string" },
  { field: "description", required: false, type: "string" },
  { field: "assignee", required: false, type: "object" },
  { field: "labels", required: false, type: "object" },
];

const JIRA_ISSUE_FIELDS: FieldExpectation[] = [
  { field: "key", required: true, type: "string" },
  { field: "id", required: true, type: "string" },
  { field: "fields", required: true, type: "object" },
];

const JIRA_ISSUE_INNER_FIELDS: FieldExpectation[] = [
  { field: "summary", required: true, type: "string" },
  { field: "status", required: true, type: "object" },
  { field: "priority", required: false, type: "object" },
  { field: "labels", required: false, type: "array" },
  { field: "assignee", required: false, type: "object" },
  { field: "creator", required: false, type: "object" },
  { field: "created", required: true, type: "string" },
  { field: "updated", required: true, type: "string" },
];

const SCHEMA_MAP: Record<string, FieldExpectation[]> = {
  "github:issue": GITHUB_ISSUE_FIELDS,
  "linear:issue": LINEAR_ISSUE_FIELDS,
  "jira:issue": JIRA_ISSUE_FIELDS,
  "jira:issue:fields": JIRA_ISSUE_INNER_FIELDS,
};

// ── Known enum values ─────────────────────────────────────────────────

const KNOWN_ENUMS: Record<string, string[]> = {
  "github:state": ["open", "closed"],
  "github:state_reason": ["completed", "not_planned", "reopened"],
  "jira:status": [
    "to do", "open", "new", "in progress", "in development",
    "in review", "code review", "done", "closed", "resolved",
    "cancelled", "rejected", "won't do", "backlog",
  ],
  "jira:priority": ["highest", "blocker", "high", "medium", "low", "lowest"],
  "linear:state_type": ["backlog", "unstarted", "started", "completed", "cancelled"],
};

// ── Detection ─────────────────────────────────────────────────────────

/**
 * Check a raw API response for anomalies against the expected schema.
 * Returns a list of anomaly reports (empty if everything matches).
 */
export function detectAnomalies(
  provider: string,
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
): AnomalyReport[] {
  if (!response || typeof response !== "object") return [];

  const reports: AnomalyReport[] = [];
  const schemaKey = `${provider}:${endpoint}`;
  const expectations = SCHEMA_MAP[schemaKey];

  if (expectations) {
    reports.push(...checkFields(response, expectations, schemaKey));
  }

  // Jira: also check nested fields object
  if (provider === "jira" && endpoint === "issue" && response.fields) {
    const innerExpectations = SCHEMA_MAP["jira:issue:fields"];
    if (innerExpectations) {
      reports.push(...checkFields(response.fields, innerExpectations, "jira:issue:fields"));
    }
  }

  // Check enum values
  reports.push(...checkEnums(provider, endpoint, response));

  // Check for unknown top-level fields that may indicate schema changes
  reports.push(...checkUnknownFields(provider, endpoint, response));

  return reports;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkFields(obj: any, expectations: FieldExpectation[], context: string): AnomalyReport[] {
  const reports: AnomalyReport[] = [];

  for (const exp of expectations) {
    const value = obj[exp.field];

    // Missing required field
    if (value === undefined && exp.required) {
      reports.push({
        anomaly: `[${context}] Required field "${exp.field}" is missing from the API response`,
        instruction: `When "${exp.field}" is missing, use a sensible default: ` +
          `strings -> "", numbers -> 0, arrays -> [], objects -> null. ` +
          `Do not throw an error; degrade gracefully.`,
      });
      continue;
    }

    // Type mismatch (only check when value is present and not null)
    if (value !== undefined && value !== null) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== exp.type) {
        reports.push({
          anomaly: `[${context}] Field "${exp.field}" expected type "${exp.type}" but got "${actualType}"`,
          instruction: `When "${exp.field}" has type "${actualType}" instead of "${exp.type}", ` +
            `coerce it: if expecting string got number, use String(value); ` +
            `if expecting array got object, wrap in array; ` +
            `if expecting object got string, parse if JSON or wrap as { value }.`,
        });
      }
    }
  }

  return reports;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkEnums(provider: string, endpoint: string, response: any): AnomalyReport[] {
  const reports: AnomalyReport[] = [];

  if (provider === "github" && endpoint === "issue") {
    checkEnumValue(reports, "github:state", response.state, "state");
    if (response.state_reason) {
      checkEnumValue(reports, "github:state_reason", response.state_reason, "state_reason");
    }
  }

  if (provider === "jira" && endpoint === "issue" && response.fields) {
    const statusName = response.fields?.status?.name;
    if (statusName) {
      checkEnumValue(reports, "jira:status", statusName.toLowerCase(), "status.name");
    }
    const priorityName = response.fields?.priority?.name;
    if (priorityName) {
      checkEnumValue(reports, "jira:priority", priorityName.toLowerCase(), "priority.name");
    }
  }

  if (provider === "linear" && endpoint === "issue") {
    const stateType = response.state?.type;
    if (stateType) {
      checkEnumValue(reports, "linear:state_type", stateType, "state.type");
    }
  }

  return reports;
}

function checkEnumValue(reports: AnomalyReport[], enumKey: string, value: string, fieldPath: string) {
  const known = KNOWN_ENUMS[enumKey];
  if (!known || !value) return;
  if (!known.includes(value)) {
    reports.push({
      anomaly: `[${enumKey}] Unknown enum value "${value}" for field "${fieldPath}". Known values: ${known.join(", ")}`,
      instruction: `When "${fieldPath}" has the value "${value}", map it to the closest known status/priority ` +
        `using fuzzy matching. If no close match, default to the most neutral value (e.g., "todo" for status, "none" for priority).`,
    });
  }
}

/**
 * Check for unexpected top-level fields that weren't in the schema.
 * Only reports truly surprising fields to avoid noise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkUnknownFields(provider: string, endpoint: string, response: any): AnomalyReport[] {
  const schemaKey = `${provider}:${endpoint}`;
  const expectations = SCHEMA_MAP[schemaKey];
  if (!expectations) return [];

  const knownFields = new Set(expectations.map((e) => e.field));
  const unknownFields = Object.keys(response).filter((k) => !knownFields.has(k) && !k.startsWith("_"));

  // Only report if there are many unexpected fields — suggests a schema change
  if (unknownFields.length > 5) {
    return [{
      anomaly: `[${schemaKey}] Response contains ${unknownFields.length} unexpected fields: ${unknownFields.slice(0, 10).join(", ")}${unknownFields.length > 10 ? "..." : ""}`,
      instruction: `The API response schema may have changed. Extra fields should be preserved in _raw but not relied upon for core logic. ` +
        `Existing field mappings remain correct; treat unknown fields as informational only.`,
    }];
  }

  return [];
}

// ── Patch generation ──────────────────────────────────────────────────

/**
 * Analyze an API response, detect anomalies, and generate patches for
 * any new anomalies not already covered by existing patches.
 *
 * Returns the number of new patches created. Operates silently.
 */
export function analyzeAndPatch(
  provider: string,
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
): number {
  const base = getBasePrompt(provider);
  if (!base) return 0;

  const anomalies = detectAnomalies(provider, endpoint, response);
  if (anomalies.length === 0) return 0;

  // Load existing patches to avoid duplicates
  const existingPatches = loadPatches(provider);
  const existingAnomalies = new Set(existingPatches.map((p) => p.anomaly));

  let created = 0;
  for (const report of anomalies) {
    // Skip if we already have a patch for this exact anomaly
    if (existingAnomalies.has(report.anomaly)) continue;

    savePatch({
      provider,
      baseVersion: base.version,
      createdAt: new Date().toISOString(),
      anomaly: report.anomaly,
      instruction: report.instruction,
    });
    created++;
  }

  if (created > 0) {
    console.error(`[face] anomaly-detector: generated ${created} new patch(es) for ${provider}:${endpoint}`);
  }

  return created;
}

/**
 * Convenience: wrap a raw API response check. Call this after any
 * provider API call to silently detect and patch anomalies.
 */
export function checkResponse(
  provider: string,
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  try {
    analyzeAndPatch(provider, endpoint, response);
  } catch (err) {
    // Never let patch generation break the main flow
    console.error(`[face] anomaly-detector: error during analysis — ${err}`);
  }
  return response;
}

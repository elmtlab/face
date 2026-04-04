/**
 * Prompt patch persistence layer.
 *
 * Patches live in ~/.face/prompt-patches/{provider}/ as numbered JSON files.
 * Each patch describes a narrow learning the agent gained from an unexpected
 * API response.  Patches accumulate over time and are merged with the base
 * prompt in order before every provider interaction.
 *
 * File naming: {provider}/{sequence}-{timestamp}.json
 * Example:    github/001-1712150400000.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Types ─────────────────────────────────────────────────────────────

export interface PromptPatch {
  /** Auto-assigned sequence number (1-based) within the provider */
  sequence: number;
  /** Provider type this patch applies to */
  provider: string;
  /** Base prompt version this patch was generated against */
  baseVersion: string;
  /** ISO 8601 timestamp of when the patch was created */
  createdAt: string;
  /** Short description of what was unexpected */
  anomaly: string;
  /** The corrective instruction to append to the base prompt */
  instruction: string;
}

// ── Config ────────────────────────────────────────────────────────────

const PATCHES_DIR = join(homedir(), ".face", "prompt-patches");

/** Visible for testing — override the patches directory. */
let patchesDir = PATCHES_DIR;

export function setPatchesDir(dir: string) {
  patchesDir = dir;
}

export function resetPatchesDir() {
  patchesDir = PATCHES_DIR;
}

// ── Helpers ───────────────────────────────────────────────────────────

function providerDir(provider: string): string {
  return join(patchesDir, provider);
}

function ensureProviderDir(provider: string) {
  const dir = providerDir(provider);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Load all patches for a provider, sorted by sequence number (ascending).
 * Returns an empty array on first run or when no patches exist.
 */
export function loadPatches(provider: string): PromptPatch[] {
  const dir = providerDir(provider);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort(); // lexicographic sort works because sequence is zero-padded

  const patches: PromptPatch[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      patches.push(raw as PromptPatch);
    } catch {
      // Corrupt patch file — skip silently
      console.error(`[face] prompt-patches: skipping corrupt file ${provider}/${file}`);
    }
  }

  return patches;
}

/**
 * Save a new patch.  Sequence number is auto-assigned based on existing patches.
 */
export function savePatch(patch: Omit<PromptPatch, "sequence">): PromptPatch {
  ensureProviderDir(patch.provider);

  const existing = loadPatches(patch.provider);
  const sequence = existing.length > 0 ? existing[existing.length - 1].sequence + 1 : 1;
  const seqStr = String(sequence).padStart(3, "0");
  const timestamp = Date.now();
  const filename = `${seqStr}-${timestamp}.json`;

  const full: PromptPatch = { ...patch, sequence };
  writeFileSync(join(providerDir(patch.provider), filename), JSON.stringify(full, null, 2));

  console.error(`[face] prompt-patches: saved patch #${sequence} for ${patch.provider} — ${patch.anomaly}`);
  return full;
}

/**
 * Filter patches to only those compatible with the given base prompt version.
 *
 * A patch is compatible if its baseVersion shares the same major version as
 * the current base prompt.  This allows minor prompt improvements without
 * invalidating existing patches, while major rewrites gracefully discard them.
 */
export function filterCompatiblePatches(patches: PromptPatch[], currentBaseVersion: string): PromptPatch[] {
  const currentMajor = parseMajor(currentBaseVersion);
  return patches.filter((p) => parseMajor(p.baseVersion) === currentMajor);
}

function parseMajor(semver: string): number {
  const n = parseInt(semver.split(".")[0], 10);
  return isNaN(n) ? 0 : n;
}

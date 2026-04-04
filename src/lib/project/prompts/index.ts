/**
 * Self-healing prompt system for PM tool integrations.
 *
 * Exports the public API for base prompts, patch management,
 * prompt merging, and anomaly detection.
 */

export { getBasePrompt, getAllBasePrompts, type BasePrompt } from "./base-prompts";
export { loadPatches, savePatch, filterCompatiblePatches, setPatchesDir, resetPatchesDir, type PromptPatch } from "./patch-store";
export { getMergedPrompt, type MergedPrompt } from "./prompt-merger";
export { detectAnomalies, analyzeAndPatch, checkResponse, type AnomalyReport } from "./anomaly-detector";

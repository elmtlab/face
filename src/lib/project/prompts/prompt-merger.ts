/**
 * Merges base prompts with accumulated patches to produce the effective
 * prompt for a given provider.
 *
 * Strategy: base prompt content + "\n\n## Learned Patches\n\n" + ordered
 * patch instructions.  Simple concatenation keeps the system predictable
 * and debuggable.
 */

import { getBasePrompt } from "./base-prompts";
import { loadPatches, filterCompatiblePatches } from "./patch-store";

export interface MergedPrompt {
  provider: string;
  baseVersion: string;
  patchCount: number;
  content: string;
}

/**
 * Build the effective prompt for a provider by merging its base prompt
 * with any compatible patches from the config directory.
 *
 * Returns null if no base prompt is defined for the provider.
 */
export function getMergedPrompt(provider: string): MergedPrompt | null {
  const base = getBasePrompt(provider);
  if (!base) return null;

  const allPatches = loadPatches(provider);
  const compatible = filterCompatiblePatches(allPatches, base.version);

  if (compatible.length === 0) {
    console.error(`[face] prompt-merger: using base prompt for ${provider} v${base.version} (no patches)`);
    return {
      provider,
      baseVersion: base.version,
      patchCount: 0,
      content: base.content,
    };
  }

  const patchSection = compatible
    .map((p) => `### Patch #${p.sequence} (${p.createdAt})\n**Anomaly:** ${p.anomaly}\n**Handling:** ${p.instruction}`)
    .join("\n\n");

  const merged = `${base.content}\n\n## Learned Patches\n\n${patchSection}`;

  console.error(
    `[face] prompt-merger: merged ${compatible.length} patch(es) into ${provider} v${base.version}` +
    (allPatches.length > compatible.length ? ` (${allPatches.length - compatible.length} incompatible skipped)` : ""),
  );

  return {
    provider,
    baseVersion: base.version,
    patchCount: compatible.length,
    content: merged,
  };
}

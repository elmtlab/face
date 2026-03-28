import fs from "fs";
import path from "path";
import os from "os";
import { readConfig, writeConfig } from "../tasks/file-manager";
import { detectAllAgents } from "./detect";
import { FACE_BASE_URL } from "../constants";

const CLAUDE_SETTINGS_PATH = path.join(
  os.homedir(),
  ".claude",
  "settings.json"
);

const FACE_HOOK_URL = `${FACE_BASE_URL}/api/hooks/task-update`;

// We tag our hooks with this command prefix so we can find/remove them later
const FACE_HOOK_TAG = "# face-hook";

interface ClaudeHookEntry {
  matcher?: string;
  hooks?: Array<{
    type: string;
    url?: string;
    command?: string;
  }>;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookEntry[]>;
  [key: string]: unknown;
}

function readClaudeSettings(): ClaudeSettings {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return {};
    return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeClaudeSettings(settings: ClaudeSettings): void {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    CLAUDE_SETTINGS_PATH,
    JSON.stringify(settings, null, 2),
    "utf-8"
  );
}

function isFaceHook(entry: ClaudeHookEntry): boolean {
  return (
    entry.hooks?.some(
      (h) =>
        h.url?.includes("/api/hooks/task-update") ||
        h.command?.includes(FACE_HOOK_TAG)
    ) ?? false
  );
}

export async function setupClaudeCode(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const settings = readClaudeSettings();

    if (!settings.hooks) {
      settings.hooks = {};
    }

    // --- UserPromptSubmit: captures the user's actual request ---
    if (!settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = [];
    }
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
      (h) => !isFaceHook(h)
    );
    settings.hooks.UserPromptSubmit.push({
      hooks: [
        {
          type: "command",
          command: `${FACE_HOOK_TAG}\n[ -n "$FACE_INTERNAL" ] && exit 0\ncurl -s -X POST ${FACE_HOOK_URL} -H 'Content-Type: application/json' -d "$(cat | jq -c '{hook_type: \"UserPromptSubmit\", session_id: .session_id, prompt: .prompt}')" > /dev/null 2>&1 || true`,
        },
      ],
    });

    // --- PostToolUse: fires after every tool use, captures each step ---
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [];
    }
    // Remove existing FACE hooks
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (h) => !isFaceHook(h)
    );
    // Add: curl POST with the hook input piped via stdin
    settings.hooks.PostToolUse.push({
      hooks: [
        {
          type: "command",
          command: `${FACE_HOOK_TAG}\n[ -n "$FACE_INTERNAL" ] && exit 0\ncurl -s -X POST ${FACE_HOOK_URL} -H 'Content-Type: application/json' -d "$(cat | jq -c '{hook_type: \"PostToolUse\", session_id: .session_id, tool_name: .tool_name, tool_input: .tool_input, tool_result: (.tool_result // "" | tostring | .[0:500])}')" > /dev/null 2>&1 || true`,
        },
      ],
    });

    // --- Stop: fires when Claude finishes responding ---
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => !isFaceHook(h)
    );
    settings.hooks.Stop.push({
      hooks: [
        {
          type: "command",
          command: `${FACE_HOOK_TAG}\n[ -n "$FACE_INTERNAL" ] && exit 0\ncurl -s -X POST ${FACE_HOOK_URL} -H 'Content-Type: application/json' -d "$(cat | jq -c '{hook_type: \"Stop\", session_id: .session_id, stop_reason: .stop_reason, last_assistant_message: (.last_assistant_message // "" | tostring | .[0:2000])}')" > /dev/null 2>&1 || true`,
        },
      ],
    });

    writeClaudeSettings(settings);

    // Update FACE config
    const config = await detectAllAgents();
    if (config.agents["claude-code"]) {
      config.agents["claude-code"].configured = true;
      config.setupCompletedAt = new Date().toISOString();
      writeConfig(config);
    }

    return { success: true, message: "Claude Code hooks configured" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Setup failed",
    };
  }
}

export async function removeClaudeCodeHooks(): Promise<void> {
  const settings = readClaudeSettings();
  if (settings.hooks) {
    for (const eventName of Object.keys(settings.hooks)) {
      settings.hooks[eventName] = settings.hooks[eventName].filter(
        (h) => !isFaceHook(h)
      );
    }
    writeClaudeSettings(settings);
  }
}

export function isClaudeCodeConfigured(): boolean {
  try {
    const settings = readClaudeSettings();
    if (!settings.hooks) return false;
    const stopHooks = settings.hooks.Stop ?? [];
    return stopHooks.some((h) => isFaceHook(h));
  } catch {
    return false;
  }
}

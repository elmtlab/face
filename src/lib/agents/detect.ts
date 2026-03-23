import { execSync } from "child_process";
import type { AgentDetection, FaceConfig } from "../tasks/types";
import { readConfig, writeConfig, ensureFaceDir } from "../tasks/file-manager";

interface AgentDef {
  id: string;
  binary: string;
  versionFlag: string;
  configCheck: () => boolean;
}

const KNOWN_AGENTS: AgentDef[] = [
  {
    id: "claude-code",
    binary: "claude",
    versionFlag: "--version",
    configCheck: checkClaudeCodeConfigured,
  },
  {
    id: "codex",
    binary: "codex",
    versionFlag: "--version",
    configCheck: () => false, // TODO: implement codex config check
  },
];

function findBinary(name: string): string | null {
  try {
    const result = execSync(`which ${name}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function getVersion(binary: string, flag: string): string | undefined {
  try {
    const result = execSync(`"${binary}" ${flag}`, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
    return result;
  } catch {
    return undefined;
  }
}

function checkClaudeCodeConfigured(): boolean {
  try {
    const { isClaudeCodeConfigured } = require("../agents/setup");
    return isClaudeCodeConfigured();
  } catch {
    return false;
  }
}

export function detectAgent(def: AgentDef): AgentDetection {
  const agentPath = findBinary(def.binary);
  if (!agentPath) {
    return { installed: false, configured: false, path: null };
  }

  const version = getVersion(agentPath, def.versionFlag);
  const configured = def.configCheck();

  return {
    installed: true,
    configured,
    path: agentPath,
    version,
  };
}

export async function detectAllAgents(): Promise<FaceConfig> {
  ensureFaceDir();

  const existingConfig = readConfig();
  const agents: Record<string, AgentDetection> = {};

  for (const def of KNOWN_AGENTS) {
    agents[def.id] = detectAgent(def);
  }

  const config: FaceConfig = {
    agents,
    setupCompletedAt: existingConfig?.setupCompletedAt ?? null,
  };

  writeConfig(config);
  return config;
}

export function getKnownAgentIds(): string[] {
  return KNOWN_AGENTS.map((a) => a.id);
}

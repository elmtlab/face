import type { FaceTaskStep } from "../tasks/types";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  /** If set, only apply this rule to steps using one of these tools */
  toolFilter?: string[];
  /** Returns true if the step matches this rule */
  match: (step: FaceTaskStep) => boolean;
}

// Helper: test description against a regex
function descMatches(pattern: RegExp): (step: FaceTaskStep) => boolean {
  return (step) => pattern.test(step.description);
}

// ---------------------------------------------------------------------------
// Critical
// ---------------------------------------------------------------------------
const criticalRules: SecurityRule[] = [
  {
    id: "crit-rm-rf-root",
    name: "Recursive delete on root/system directory",
    description: "Detects rm -rf targeting / or top-level system directories",
    severity: "critical",
    toolFilter: ["Bash"],
    match: descMatches(/rm\s+-[^\s]*r[^\s]*f[^\s]*\s+\/(?:\s|$|etc|usr|var|bin|sbin|lib|boot|sys|proc)/),
  },
  {
    id: "crit-drop-table",
    name: "SQL DROP TABLE",
    description: "Detects DROP TABLE statements that destroy database tables",
    severity: "critical",
    match: descMatches(/DROP\s+TABLE/i),
  },
  {
    id: "crit-delete-from-no-where",
    name: "SQL DELETE without WHERE",
    description: "Detects DELETE FROM without a WHERE clause, which deletes all rows",
    severity: "critical",
    match: (step) => {
      const d = step.description;
      return /DELETE\s+FROM\s+\w+/i.test(d) && !/WHERE/i.test(d);
    },
  },
  {
    id: "crit-format-disk",
    name: "Disk format command",
    description: "Detects mkfs, diskutil erase, or similar disk-format commands",
    severity: "critical",
    toolFilter: ["Bash"],
    match: descMatches(/\b(mkfs|diskutil\s+erase)\b/),
  },
];

// ---------------------------------------------------------------------------
// High
// ---------------------------------------------------------------------------
const highRules: SecurityRule[] = [
  {
    id: "high-force-push",
    name: "Git force push",
    description: "Force pushing can rewrite shared history and cause data loss",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/git\s+push\s+.*--force/),
  },
  {
    id: "high-reset-hard",
    name: "Git reset --hard",
    description: "Hard reset discards uncommitted changes permanently",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/git\s+reset\s+--hard/),
  },
  {
    id: "high-chmod-777",
    name: "chmod 777",
    description: "World-writable permissions are a security risk",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/chmod\s+777/),
  },
  {
    id: "high-curl-pipe-sh",
    name: "Pipe remote script to shell",
    description: "Downloading and executing remote code is dangerous",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/curl\s.*\|\s*(bash|sh|zsh)|wget\s.*\|\s*(bash|sh|zsh)/),
  },
  {
    id: "high-eval",
    name: "Use of eval",
    description: "eval() can execute arbitrary code and is often exploitable",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/\beval\s*[\(\s]/),
  },
  {
    id: "high-env-secrets-access",
    name: "Access to secrets or credentials files",
    description: "Reading or writing .env, credentials, or secret files risks leaking sensitive data",
    severity: "high",
    match: descMatches(/\.(env|env\.local|env\.production|pem|key)\b|credentials|secrets?\b.*\.(json|ya?ml|toml)/i),
  },
  {
    id: "high-sudo",
    name: "Sudo command",
    description: "Running commands with elevated privileges",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/\bsudo\s/),
  },
  {
    id: "high-no-verify",
    name: "Skipping git hooks (--no-verify)",
    description: "Bypassing pre-commit hooks may skip important checks",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/--no-verify/),
  },
  {
    id: "high-write-system-path",
    name: "Write to system path",
    description: "Writing to /etc/, /usr/, or other system directories",
    severity: "high",
    toolFilter: ["Bash", "Write", "Edit"],
    match: descMatches(/\/etc\/|\/usr\/local\/bin\/|\/usr\/lib\//),
  },
  {
    id: "high-kill-9",
    name: "kill -9",
    description: "Forcefully killing processes can cause data corruption",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/kill\s+-9/),
  },
  {
    id: "high-install-unknown-global",
    name: "Global package install",
    description: "Installing packages globally can affect the entire system",
    severity: "high",
    toolFilter: ["Bash"],
    match: descMatches(/npm\s+install\s+-g|yarn\s+global\s+add|pip\s+install\b(?!.*-r\b)/),
  },
];

// ---------------------------------------------------------------------------
// Medium
// ---------------------------------------------------------------------------
const mediumRules: SecurityRule[] = [
  {
    id: "med-git-push",
    name: "Git push",
    description: "Pushing changes to a remote repository",
    severity: "medium",
    toolFilter: ["Bash"],
    match: (step) =>
      /git\s+push/.test(step.description) && !(/--force/.test(step.description)),
  },
  {
    id: "med-config-file-write",
    name: "Modify configuration file",
    description: "Editing config files can change build or runtime behavior",
    severity: "medium",
    toolFilter: ["Write", "Edit"],
    match: descMatches(/\.(config\.(js|ts|mjs|cjs)|ya?ml|toml|ini)\b|tsconfig|next\.config|tailwind\.config|eslint/),
  },
  {
    id: "med-ci-cd-modify",
    name: "Modify CI/CD pipeline",
    description: "Changes to CI/CD workflows can alter deployment and security checks",
    severity: "medium",
    match: descMatches(/\.github\/workflows\/|\.gitlab-ci|Jenkinsfile|\.circleci/),
  },
  {
    id: "med-delete-files",
    name: "Delete files",
    description: "Deleting files can cause data loss",
    severity: "medium",
    toolFilter: ["Bash"],
    match: (step) =>
      /\brm\s/.test(step.description) && !(/rm\s+-[^\s]*r[^\s]*f[^\s]*\s+\//.test(step.description)),
  },
  {
    id: "med-npm-install",
    name: "Install new packages",
    description: "Adding dependencies changes the supply chain",
    severity: "medium",
    toolFilter: ["Bash"],
    match: descMatches(/npm\s+install\s+(?!-g)\S|yarn\s+add\s|pnpm\s+add\s/),
  },
  {
    id: "med-network-request",
    name: "Network request to external URL",
    description: "External network requests may leak data or fetch untrusted content",
    severity: "medium",
    toolFilter: ["Bash"],
    match: descMatches(/\b(curl|wget|fetch)\s+https?:\/\//),
  },
  {
    id: "med-delete-sql",
    name: "SQL DELETE with WHERE",
    description: "Targeted DELETE still removes data permanently",
    severity: "medium",
    match: (step) =>
      /DELETE\s+FROM/i.test(step.description) && /WHERE/i.test(step.description),
  },
];

// ---------------------------------------------------------------------------
// Low
// ---------------------------------------------------------------------------
const lowRules: SecurityRule[] = [
  {
    id: "low-edit-outside-project",
    name: "Edit file outside project directory",
    description: "Modifying files outside the project may have unintended side effects",
    severity: "low",
    toolFilter: ["Write", "Edit"],
    match: (step) => {
      const desc = step.description;
      // Absolute path not under common project indicators
      return /^\//.test(desc) && !/node_modules/.test(desc) && !/\/src\//.test(desc) && !/\/app\//.test(desc);
    },
  },
  {
    id: "low-read-sensitive-path",
    name: "Read sensitive-looking path",
    description: "Accessing paths that may contain sensitive information",
    severity: "low",
    toolFilter: ["Read", "Bash"],
    match: descMatches(/\/\.ssh\/|\/\.aws\/|\/\.gnupg\/|\/\.config\//),
  },
];

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------
const infoRules: SecurityRule[] = [
  {
    id: "info-batch-operations",
    name: "Large batch file operation",
    description: "Batch operations affect many files at once",
    severity: "info",
    toolFilter: ["Bash"],
    match: descMatches(/xargs|find\s.*-exec|for\s+\w+\s+in/),
  },
  {
    id: "info-long-running",
    name: "Potentially long-running command",
    description: "Commands that may take a long time to complete",
    severity: "info",
    toolFilter: ["Bash"],
    match: descMatches(/\b(npm\s+run\s+build|npm\s+test|docker\s+build|make\s+all|cargo\s+build)\b/),
  },
];

export const ALL_RULES: SecurityRule[] = [
  ...criticalRules,
  ...highRules,
  ...mediumRules,
  ...lowRules,
  ...infoRules,
];

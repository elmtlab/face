#!/usr/bin/env tsx

import { scanAllTasks, scanTaskById, type SecurityReport, type SecurityFinding } from "../lib/security/scanner";
import type { Severity } from "../lib/security/rules";

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const COLORS: Record<Severity, string> = {
  critical: "\x1b[41m\x1b[97m", // white on red bg
  high: "\x1b[91m",              // bright red
  medium: "\x1b[93m",            // bright yellow
  low: "\x1b[96m",               // bright cyan
  info: "\x1b[90m",              // gray
};

function colorize(severity: Severity, text: string): string {
  return `${COLORS[severity]}${text}${RESET}`;
}

function severityBadge(severity: Severity): string {
  const label = severity.toUpperCase().padEnd(8);
  return colorize(severity, ` ${label} `);
}

// ---------------------------------------------------------------------------
// Severity ordering (for filtering)
// ---------------------------------------------------------------------------
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

function severityIndex(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
interface CliArgs {
  taskId: string | null;
  minSeverity: Severity;
  jsonOutput: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    taskId: null,
    minSeverity: "info",
    jsonOutput: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--task":
        result.taskId = args[++i] ?? null;
        break;
      case "--severity":
        {
          const val = args[++i] as Severity;
          if (SEVERITY_ORDER.includes(val)) {
            result.minSeverity = val;
          } else {
            console.error(`Unknown severity: ${val}. Valid: ${SEVERITY_ORDER.join(", ")}`);
            process.exit(2);
          }
        }
        break;
      case "--json":
        result.jsonOutput = true;
        break;
      case "--help":
      case "-h":
        console.log(`Usage: security-scan [options]

Options:
  --task <id>         Scan a specific task by ID
  --severity <level>  Minimum severity to show (critical|high|medium|low|info)
  --json              Output raw JSON instead of formatted text
  -h, --help          Show this help message`);
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}. Use --help for usage.`);
        process.exit(2);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Filter findings by minimum severity
// ---------------------------------------------------------------------------
function filterFindings(report: SecurityReport, minSeverity: Severity): SecurityFinding[] {
  const minIdx = severityIndex(minSeverity);
  return report.findings.filter((f) => severityIndex(f.severity) <= minIdx);
}

// ---------------------------------------------------------------------------
// Formatted output
// ---------------------------------------------------------------------------
function printReport(report: SecurityReport, minSeverity: Severity): void {
  const findings = filterFindings(report, minSeverity);

  const statusColor = report.taskStatus === "completed" ? "\x1b[32m" : report.taskStatus === "failed" ? "\x1b[31m" : "\x1b[33m";

  console.log(`\n${BOLD}Task: ${report.taskTitle}${RESET}`);
  console.log(`${DIM}  ID: ${report.taskId}  |  Status: ${statusColor}${report.taskStatus}${RESET}${DIM}  |  Scanned: ${report.scannedAt}${RESET}`);

  if (findings.length === 0) {
    console.log(`  ${DIM}No findings at severity >= ${minSeverity}${RESET}`);
    return;
  }

  console.log(`  ${BOLD}${findings.length} finding(s)${RESET}  [ ${formatSummary(report.riskSummary)} ]`);
  console.log();

  for (const finding of findings) {
    console.log(`  ${severityBadge(finding.severity)} ${BOLD}${finding.ruleName}${RESET}`);
    console.log(`    ${DIM}${finding.ruleDescription}${RESET}`);
    console.log(`    Step ${finding.stepId} (${finding.stepTool}): ${truncate(finding.stepDescription, 120)}`);
    console.log();
  }
}

function formatSummary(s: { critical: number; high: number; medium: number; low: number; info: number }): string {
  const parts: string[] = [];
  if (s.critical) parts.push(colorize("critical", `${s.critical} critical`));
  if (s.high) parts.push(colorize("high", `${s.high} high`));
  if (s.medium) parts.push(colorize("medium", `${s.medium} medium`));
  if (s.low) parts.push(colorize("low", `${s.low} low`));
  if (s.info) parts.push(colorize("info", `${s.info} info`));
  return parts.join("  ") || "clean";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs();

  let reports: SecurityReport[];

  if (args.taskId) {
    const report = scanTaskById(args.taskId);
    if (!report) {
      console.error(`Task not found: ${args.taskId}`);
      process.exit(2);
    }
    reports = [report];
  } else {
    reports = scanAllTasks();
  }

  if (args.jsonOutput) {
    // Apply severity filter to JSON output as well
    const filtered = reports.map((r) => ({
      ...r,
      findings: filterFindings(r, args.minSeverity),
    }));
    console.log(JSON.stringify(filtered, null, 2));
  } else {
    console.log(`\n${BOLD}=== FACE Security Scan ===${RESET}`);
    console.log(`${DIM}Scanned ${reports.length} task(s), minimum severity: ${args.minSeverity}${RESET}`);

    if (reports.length === 0) {
      console.log(`\n${DIM}No tasks found in ~/.face/tasks/${RESET}`);
    }

    for (const report of reports) {
      printReport(report, args.minSeverity);
    }

    // Overall summary
    const totalCritical = reports.reduce((n, r) => n + r.riskSummary.critical, 0);
    const totalHigh = reports.reduce((n, r) => n + r.riskSummary.high, 0);
    const totalFindings = reports.reduce((n, r) => n + filterFindings(r, args.minSeverity).length, 0);

    console.log(`${BOLD}--- Summary ---${RESET}`);
    console.log(`Total findings: ${totalFindings}`);
    if (totalCritical + totalHigh > 0) {
      console.log(colorize("critical", `  ${totalCritical} critical`) + "  " + colorize("high", `${totalHigh} high`));
    }
    console.log();
  }

  // Exit code 1 if any critical or high findings
  const hasCriticalOrHigh = reports.some(
    (r) => r.riskSummary.critical > 0 || r.riskSummary.high > 0
  );
  process.exit(hasCriticalOrHigh ? 1 : 0);
}

main();

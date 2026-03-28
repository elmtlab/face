import type { FaceTask, FaceTaskStep } from "../tasks/types";
import { readTask, readAllTasks } from "../tasks/file-manager";
import { ALL_RULES, type Severity, type SecurityRule } from "./rules";

export interface SecurityFinding {
  ruleId: string;
  ruleName: string;
  ruleDescription: string;
  severity: Severity;
  stepId: string;
  stepTool: string;
  stepDescription: string;
}

export interface RiskSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface SecurityReport {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  scannedAt: string;
  findings: SecurityFinding[];
  riskSummary: RiskSummary;
}

function scanStep(step: FaceTaskStep, rules: SecurityRule[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const rule of rules) {
    // Skip if rule is filtered to specific tools and this step doesn't match
    if (rule.toolFilter && !rule.toolFilter.includes(step.tool)) {
      continue;
    }

    if (rule.match(step)) {
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleDescription: rule.description,
        severity: rule.severity,
        stepId: step.id,
        stepTool: step.tool,
        stepDescription: step.description,
      });
    }
  }

  return findings;
}

function buildRiskSummary(findings: SecurityFinding[]): RiskSummary {
  const summary: RiskSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }
  return summary;
}

export function scanTask(task: FaceTask): SecurityReport {
  const findings: SecurityFinding[] = [];

  for (const step of task.steps) {
    findings.push(...scanStep(step, ALL_RULES));
  }

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskStatus: task.status,
    scannedAt: new Date().toISOString(),
    findings,
    riskSummary: buildRiskSummary(findings),
  };
}

export function scanTaskById(taskId: string): SecurityReport | null {
  const task = readTask(taskId);
  if (!task) return null;
  return scanTask(task);
}

export function scanAllTasks(): SecurityReport[] {
  const tasks = readAllTasks();
  return tasks.map((task) => scanTask(task));
}

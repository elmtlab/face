/**
 * Three-agent harness for requirement workflow.
 *
 * Orchestrates Planner, Evaluator, and Generator agents through
 * open-ended debate to produce higher-quality stories and implementations.
 * Two human gates (story approval and PR review) bookend the process.
 *
 * Each agent role uses the same LLM backend (Claude Opus 4.6) but has
 * a distinct persona/system prompt.
 */

import {
  buildEvaluatorReviewPrompt,
  buildDebatePrompt,
} from "./prompts/agent-prompts";

// ── Types ──────────────────────────────────────────────────────────

export type AgentRole = "planner" | "evaluator" | "generator";

export interface DebateMessage {
  role: AgentRole;
  content: string;
  timestamp: string;
  /** Whether this message contains an explicit APPROVE signal */
  isApproval: boolean;
}

export interface ConsensusState {
  /** Messages in the debate conversation */
  messages: DebateMessage[];
  /** Which agents have explicitly approved */
  approvals: Record<AgentRole, boolean>;
  /** Current round number (starts at 1) */
  round: number;
  /** Maximum rounds before human escalation */
  maxRounds: number;
  /** Whether consensus has been reached */
  reached: boolean;
  /** Whether we hit the max rounds limit */
  escalated: boolean;
  /** When the debate started */
  startedAt: string;
  /** When consensus was reached or escalation happened */
  completedAt: string | null;
}

/** The structured approval token agents emit */
const APPROVE_TOKEN = "[APPROVE]";

/** Default max debate rounds before escalating to human */
const DEFAULT_MAX_ROUNDS = 10;

// ── Consensus detection ────────────────────────────────────────────

/**
 * Check whether a message contains the structured approval signal.
 */
export function containsApproval(content: string): boolean {
  return content.includes(APPROVE_TOKEN);
}

/**
 * Create a fresh consensus state.
 */
export function createConsensusState(maxRounds = DEFAULT_MAX_ROUNDS): ConsensusState {
  return {
    messages: [],
    approvals: { planner: false, evaluator: false, generator: false },
    round: 0,
    maxRounds,
    reached: false,
    escalated: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

/**
 * Record a message and update consensus tracking.
 * Returns whether consensus has now been reached.
 */
export function recordDebateMessage(
  state: ConsensusState,
  role: AgentRole,
  content: string,
): boolean {
  const isApproval = containsApproval(content);

  state.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
    isApproval,
  });

  if (isApproval) {
    state.approvals[role] = true;
  } else {
    // If an agent raises a concern (non-approval message), revoke its prior approval
    state.approvals[role] = false;
  }

  // Check if all three agents have approved
  const allApproved = state.approvals.planner && state.approvals.evaluator && state.approvals.generator;
  if (allApproved) {
    state.reached = true;
    state.completedAt = new Date().toISOString();
  }

  return state.reached;
}

/**
 * Check if debate should be escalated to human.
 */
export function shouldEscalate(state: ConsensusState): boolean {
  return state.round >= state.maxRounds && !state.reached;
}

// ── Orchestration ──────────────────────────────────────────────────

export interface AgentHarnessContext {
  /** The story being reviewed/implemented */
  storyTitle: string;
  storyBody: string;
  /** Conversation from requirement gathering */
  gatheringMessages: { role: string; content: string }[];
  /** Call the AI with a system prompt and conversation */
  callAI: (systemPrompt: string, messages: { role: string; content: string }[]) => Promise<string>;
  /** Optional callback invoked after each agent message for real-time persistence */
  onMessage?: (state: ConsensusState) => void;
}

/**
 * Run the Evaluator agent to review a generated story.
 * Returns the evaluator's assessment.
 */
export async function runEvaluatorReview(
  ctx: AgentHarnessContext,
): Promise<{ assessment: string; approved: boolean }> {
  const prompt = buildEvaluatorReviewPrompt(ctx.storyTitle, ctx.storyBody, ctx.gatheringMessages);
  const response = await ctx.callAI(prompt, []);
  return {
    assessment: response,
    approved: containsApproval(response),
  };
}

/**
 * Run a single round of the consensus debate.
 *
 * In each round, the three agents take turns responding to the conversation.
 * The order is: Planner -> Evaluator -> Generator.
 *
 * Returns the updated consensus state.
 */
export async function runDebateRound(
  state: ConsensusState,
  ctx: AgentHarnessContext,
): Promise<ConsensusState> {
  state.round++;

  const agentOrder: AgentRole[] = ["planner", "evaluator", "generator"];

  for (const role of agentOrder) {
    if (state.reached) break;

    const systemPrompt = buildDebatePrompt(role, ctx.storyTitle, ctx.storyBody);
    const conversationForAI = state.messages.map((m) => ({
      role: m.role === role ? "assistant" as const : "user" as const,
      content: `[${m.role.toUpperCase()}]: ${m.content}`,
    }));

    const response = await ctx.callAI(systemPrompt, conversationForAI);
    recordDebateMessage(state, role, response);

    // Notify caller for real-time persistence
    ctx.onMessage?.(state);
  }

  // Check for escalation
  if (shouldEscalate(state)) {
    state.escalated = true;
    state.completedAt = new Date().toISOString();
  }

  return state;
}

/**
 * Run the full consensus loop until agreement or escalation.
 *
 * This is the main entry point for the debate phase.
 * Starts with each agent assessing the implementation plan,
 * then enters free-form debate until consensus or max rounds.
 */
export async function runConsensusLoop(
  consensus: ConsensusState,
  ctx: AgentHarnessContext,
): Promise<ConsensusState> {
  while (!consensus.reached && !consensus.escalated) {
    await runDebateRound(consensus, ctx);
  }
  return consensus;
}

/**
 * Get a human-readable summary of the consensus state.
 */
export function getConsensusSummary(state: ConsensusState): string {
  if (state.reached) {
    return `Consensus reached in ${state.round} round(s). All three agents approved.`;
  }
  if (state.escalated) {
    return `Debate escalated after ${state.round} round(s) without consensus. Human review required.`;
  }

  const approved = Object.entries(state.approvals)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const pending = Object.entries(state.approvals)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  return `Round ${state.round}/${state.maxRounds} — Approved: ${approved.length > 0 ? approved.join(", ") : "none"} · Pending: ${pending.join(", ")}`;
}

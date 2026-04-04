import { describe, test, expect, vi } from "vitest";
import {
  containsApproval,
  createConsensusState,
  recordDebateMessage,
  shouldEscalate,
  runDebateRound,
  runEvaluatorReview,
  getConsensusSummary,
  type AgentHarnessContext,
} from "../agent-harness";

describe("containsApproval", () => {
  test("detects [APPROVE] token", () => {
    expect(containsApproval("Looks good to me. [APPROVE]")).toBe(true);
  });

  test("returns false when no token", () => {
    expect(containsApproval("I have some concerns about edge cases.")).toBe(false);
  });

  test("detects token mid-text", () => {
    expect(containsApproval("After review [APPROVE] I'm satisfied")).toBe(true);
  });
});

describe("createConsensusState", () => {
  test("creates fresh state with defaults", () => {
    const state = createConsensusState();
    expect(state.messages).toEqual([]);
    expect(state.approvals).toEqual({ planner: false, evaluator: false, generator: false });
    expect(state.round).toBe(0);
    expect(state.maxRounds).toBe(10);
    expect(state.reached).toBe(false);
    expect(state.escalated).toBe(false);
  });

  test("respects custom maxRounds", () => {
    const state = createConsensusState(5);
    expect(state.maxRounds).toBe(5);
  });
});

describe("recordDebateMessage", () => {
  test("records approval and tracks it", () => {
    const state = createConsensusState();
    recordDebateMessage(state, "planner", "Looks solid. [APPROVE]");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].isApproval).toBe(true);
    expect(state.approvals.planner).toBe(true);
    expect(state.reached).toBe(false); // need all three
  });

  test("revokes approval on non-approval message", () => {
    const state = createConsensusState();
    recordDebateMessage(state, "planner", "Looks solid. [APPROVE]");
    expect(state.approvals.planner).toBe(true);

    recordDebateMessage(state, "planner", "Wait, I found an issue.");
    expect(state.approvals.planner).toBe(false);
  });

  test("reaches consensus when all three approve", () => {
    const state = createConsensusState();
    recordDebateMessage(state, "planner", "[APPROVE]");
    recordDebateMessage(state, "evaluator", "[APPROVE]");
    const reached = recordDebateMessage(state, "generator", "[APPROVE]");
    expect(reached).toBe(true);
    expect(state.reached).toBe(true);
    expect(state.completedAt).not.toBeNull();
  });

  test("does not reach consensus with only two approvals", () => {
    const state = createConsensusState();
    recordDebateMessage(state, "planner", "[APPROVE]");
    const reached = recordDebateMessage(state, "evaluator", "[APPROVE]");
    expect(reached).toBe(false);
    expect(state.reached).toBe(false);
  });
});

describe("shouldEscalate", () => {
  test("escalates at max rounds without consensus", () => {
    const state = createConsensusState(3);
    state.round = 3;
    expect(shouldEscalate(state)).toBe(true);
  });

  test("does not escalate below max rounds", () => {
    const state = createConsensusState(3);
    state.round = 2;
    expect(shouldEscalate(state)).toBe(false);
  });

  test("does not escalate if consensus reached", () => {
    const state = createConsensusState(3);
    state.round = 3;
    state.reached = true;
    expect(shouldEscalate(state)).toBe(false);
  });
});

describe("getConsensusSummary", () => {
  test("reports consensus reached", () => {
    const state = createConsensusState();
    state.reached = true;
    state.round = 2;
    expect(getConsensusSummary(state)).toContain("Consensus reached in 2 round(s)");
  });

  test("reports escalation", () => {
    const state = createConsensusState();
    state.escalated = true;
    state.round = 10;
    expect(getConsensusSummary(state)).toContain("Debate escalated after 10 round(s)");
  });

  test("reports in-progress state", () => {
    const state = createConsensusState();
    state.round = 2;
    state.approvals.planner = true;
    const summary = getConsensusSummary(state);
    expect(summary).toContain("Approved: planner");
    expect(summary).toContain("evaluator");
    expect(summary).toContain("generator");
  });
});

describe("runDebateRound", () => {
  function makeContext(responses: string[]): AgentHarnessContext {
    let callIndex = 0;
    return {
      storyTitle: "Test Story",
      storyBody: "## Summary\nTest body\n\n## Acceptance Criteria\n- [ ] Test",
      gatheringMessages: [{ role: "user", content: "Build a test feature" }],
      callAI: vi.fn(async () => responses[callIndex++] ?? "No response"),
    };
  }

  test("increments round counter", async () => {
    const state = createConsensusState();
    const ctx = makeContext(["Response 1", "Response 2", "Response 3"]);
    await runDebateRound(state, ctx);
    expect(state.round).toBe(1);
  });

  test("calls AI three times (one per agent)", async () => {
    const state = createConsensusState();
    const ctx = makeContext(["Planner says OK", "Evaluator says OK", "Generator says OK"]);
    await runDebateRound(state, ctx);
    expect(ctx.callAI).toHaveBeenCalledTimes(3);
    expect(state.messages).toHaveLength(3);
    expect(state.messages[0].role).toBe("planner");
    expect(state.messages[1].role).toBe("evaluator");
    expect(state.messages[2].role).toBe("generator");
  });

  test("detects consensus within a round", async () => {
    const state = createConsensusState();
    const ctx = makeContext(["[APPROVE]", "[APPROVE]", "[APPROVE]"]);
    await runDebateRound(state, ctx);
    expect(state.reached).toBe(true);
  });

  test("stops calling agents after consensus", async () => {
    const state = createConsensusState();
    // Pre-approve planner and evaluator
    recordDebateMessage(state, "planner", "[APPROVE]");
    recordDebateMessage(state, "evaluator", "[APPROVE]");
    // Now in the round, planner approves again, evaluator approves, generator approves
    const ctx = makeContext(["[APPROVE]", "[APPROVE]", "[APPROVE]"]);
    await runDebateRound(state, ctx);
    // Consensus should be reached after planner's first approval completes all three
    expect(state.reached).toBe(true);
  });

  test("escalates after max rounds", async () => {
    const state = createConsensusState(1);
    const ctx = makeContext(["Concern 1", "Concern 2", "Concern 3"]);
    await runDebateRound(state, ctx);
    expect(state.escalated).toBe(true);
  });
});

describe("runEvaluatorReview", () => {
  test("returns assessment and approval status", async () => {
    const ctx: AgentHarnessContext = {
      storyTitle: "Test Story",
      storyBody: "## Summary\nTest\n\n## Acceptance Criteria\n- [ ] Test",
      gatheringMessages: [{ role: "user", content: "Build a test feature" }],
      callAI: vi.fn(async () => "Story looks complete and well-scoped. [APPROVE]"),
    };
    const result = await runEvaluatorReview(ctx);
    expect(result.approved).toBe(true);
    expect(result.assessment).toContain("Story looks complete");
  });

  test("returns non-approved when evaluator has concerns", async () => {
    const ctx: AgentHarnessContext = {
      storyTitle: "Test Story",
      storyBody: "## Summary\nTest",
      gatheringMessages: [{ role: "user", content: "Build a test feature" }],
      callAI: vi.fn(async () => "Missing acceptance criteria. Please add specific test cases."),
    };
    const result = await runEvaluatorReview(ctx);
    expect(result.approved).toBe(false);
    expect(result.assessment).toContain("Missing acceptance criteria");
  });
});

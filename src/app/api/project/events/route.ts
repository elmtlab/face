import { eventBus } from "@/lib/events/bus";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 30_000);

      const onIssueCreated = (data: unknown) => send("issue_created", data);
      const onIssueUpdated = (data: unknown) => send("issue_updated", data);
      const onAgentStarted = (data: unknown) => send("agent_started", data);
      const onAgentCompleted = (data: unknown) => send("agent_completed", data);

      eventBus.on("issue_created", onIssueCreated);
      eventBus.on("issue_updated", onIssueUpdated);
      eventBus.on("agent_started", onAgentStarted);
      eventBus.on("agent_completed", onAgentCompleted);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(heartbeat);
        eventBus.off("issue_created", onIssueCreated);
        eventBus.off("issue_updated", onIssueUpdated);
        eventBus.off("agent_started", onAgentStarted);
        eventBus.off("agent_completed", onAgentCompleted);
      };

      // The stream will be closed by the client or server; use signal if available
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Store cleanup so it can be called
      (stream as any).__cleanup = cleanup;
    },
    cancel() {
      // Called when the client disconnects
      if ((stream as any).__cleanup) (stream as any).__cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

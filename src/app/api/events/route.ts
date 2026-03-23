import { eventBus } from "@/lib/events/bus";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const onEvent = (data: unknown) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      eventBus.on("agent-event", onEvent);

      // Send initial keepalive
      controller.enqueue(encoder.encode(": keepalive\n\n"));

      // Keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      // Cleanup when client disconnects
      const cleanup = () => {
        clearInterval(keepalive);
        eventBus.off("agent-event", onEvent);
      };

      // The stream will be cancelled when the client disconnects
      void new Promise<void>((resolve) => {
        const check = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(""));
          } catch {
            clearInterval(check);
            cleanup();
            resolve();
          }
        }, 5000);
      });
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

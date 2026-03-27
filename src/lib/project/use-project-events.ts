"use client";

import { useEffect, useRef } from "react";

export type ProjectEventType =
  | "issue_created"
  | "issue_updated"
  | "agent_started"
  | "agent_completed";

interface ProjectEvent {
  type: ProjectEventType;
  data: unknown;
}

export function useProjectEvents(
  onEvent: (event: ProjectEvent) => void,
  eventTypes?: ProjectEventType[]
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/project/events");

    const types = eventTypes ?? [
      "issue_created",
      "issue_updated",
      "agent_started",
      "agent_completed",
    ];

    const handlers = types.map((type) => {
      const handler = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          callbackRef.current({ type, data });
        } catch {
          // ignore parse errors
        }
      };
      es.addEventListener(type, handler);
      return { type, handler };
    });

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      handlers.forEach(({ type, handler }) =>
        es.removeEventListener(type, handler)
      );
      es.close();
    };
  }, [eventTypes]);
}

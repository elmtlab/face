export interface TrackingEvent {
  eventType: "click" | "view" | "expand" | "collapse";
  componentId: string;
  section: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

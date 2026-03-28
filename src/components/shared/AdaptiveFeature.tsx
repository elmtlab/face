"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useUser } from "@/components/user/UserContext";

interface AdaptiveFeatureProps {
  featureId: string;
  children: ReactNode;
  /** If true, track views automatically when the component mounts */
  trackOnView?: boolean;
  /** Override: always show regardless of score */
  alwaysShow?: boolean;
  /** Render collapsed version when hidden (e.g. a "Show more" link) */
  collapsedContent?: ReactNode;
  /** Additional CSS classes for the wrapper div */
  className?: string;
}

export function AdaptiveFeature({
  featureId,
  children,
  trackOnView = false,
  alwaysShow = false,
  collapsedContent,
  className,
}: AdaptiveFeatureProps) {
  const { isFeatureVisible, isFeaturePinned, trackFeature, getFeatureScore } =
    useUser();
  const tracked = useRef(false);

  const visible = alwaysShow || isFeatureVisible(featureId);
  const pinned = isFeaturePinned(featureId);
  const score = getFeatureScore(featureId);

  useEffect(() => {
    if (trackOnView && visible && !tracked.current) {
      tracked.current = true;
      fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            { eventType: "view", componentId: featureId, section: "adaptive" },
          ],
        }),
      }).catch(() => {});
    }
  }, [featureId, trackOnView, visible]);

  if (!visible) {
    return collapsedContent ? <>{collapsedContent}</> : null;
  }

  return (
    <div
      onClick={() => trackFeature(featureId)}
      className={`transition-opacity duration-300 ${
        pinned ? "opacity-100" : score < 0.5 ? "opacity-70" : "opacity-90"
      }${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

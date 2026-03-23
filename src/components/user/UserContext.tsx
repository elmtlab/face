"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  AdaptiveLayout,
  FeatureVisibility,
  UserRole,
} from "@/lib/user/types";

interface UserContextValue {
  role: UserRole | null;
  needsOnboarding: boolean;
  layout: AdaptiveLayout | null;
  isFeatureVisible: (featureId: string) => boolean;
  isFeaturePinned: (featureId: string) => boolean;
  getFeatureScore: (featureId: string) => number;
  trackFeature: (featureId: string) => void;
  refreshLayout: () => void;
}

const UserCtx = createContext<UserContextValue>({
  role: null,
  needsOnboarding: true,
  layout: null,
  isFeatureVisible: () => true,
  isFeaturePinned: () => false,
  getFeatureScore: () => 0.5,
  trackFeature: () => {},
  refreshLayout: () => {},
});

export function useUser() {
  return useContext(UserCtx);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(true);
  const [layout, setLayout] = useState<AdaptiveLayout | null>(null);

  // Load profile
  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setRole(data.profile.role);
          setNeedsOnboarding(false);
        } else {
          setNeedsOnboarding(true);
        }
      })
      .catch(() => setNeedsOnboarding(true));
  }, []);

  // Load adaptive layout whenever role changes
  const refreshLayout = useCallback(() => {
    fetch("/api/user/adaptive")
      .then((r) => r.json())
      .then(setLayout)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (role) refreshLayout();
  }, [role, refreshLayout]);

  // Periodically refresh layout (picks up usage changes)
  useEffect(() => {
    if (!role) return;
    const interval = setInterval(refreshLayout, 30_000);
    return () => clearInterval(interval);
  }, [role, refreshLayout]);

  const getFeature = useCallback(
    (featureId: string): FeatureVisibility => {
      if (!layout?.features[featureId]) {
        return { featureId, score: 0.5, visible: true, pinned: false };
      }
      return layout.features[featureId];
    },
    [layout]
  );

  const trackFeature = useCallback(
    (featureId: string) => {
      // Fire-and-forget tracking call
      fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: "click",
              componentId: featureId,
              section: "adaptive",
            },
          ],
        }),
      }).catch(() => {});
    },
    []
  );

  return (
    <UserCtx.Provider
      value={{
        role,
        needsOnboarding,
        layout,
        isFeatureVisible: (id) => getFeature(id).visible,
        isFeaturePinned: (id) => getFeature(id).pinned,
        getFeatureScore: (id) => getFeature(id).score,
        trackFeature,
        refreshLayout,
      }}
    >
      {children}
    </UserCtx.Provider>
  );
}

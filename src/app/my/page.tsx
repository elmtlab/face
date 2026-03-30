"use client";

import { Suspense } from "react";
import { MyDashboard } from "@/components/my/MyDashboard";

export default function MyPage() {
  return (
    <Suspense>
      <MyDashboard />
    </Suspense>
  );
}

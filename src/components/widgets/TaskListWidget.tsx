"use client";

import { TaskList } from "@/components/tasks/TaskList";

interface TaskListWidgetProps {
  readOnly?: boolean;
}

export function TaskListWidget({ readOnly }: TaskListWidgetProps) {
  return (
    <div className={readOnly ? "pointer-events-none opacity-90" : ""}>
      <TaskList />
    </div>
  );
}

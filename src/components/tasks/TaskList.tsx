"use client";

import { useEffect, useState } from "react";
import type { FaceTask } from "@/lib/tasks/types";
import { TaskRow } from "./TaskRow";
import { TaskDetail } from "./TaskDetail";

export function TaskList() {
  const [tasks, setTasks] = useState<FaceTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 3_000);
    return () => clearInterval(interval);
  }, []);

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  async function handleDelete(taskId: string) {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (selectedId === taskId) setSelectedId(null);
      loadTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  }

  async function handleRestart(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/restart`, { method: "POST" });
      const data = await res.json();
      if (data.taskId) {
        setSelectedId(data.taskId);
        loadTasks();
      }
    } catch (err) {
      console.error("Failed to restart task:", err);
    }
  }

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0">
      {/* Task list column */}
      <div className="flex flex-col w-full lg:w-72 xl:w-80 lg:flex-shrink-0 min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Tasks
            {tasks.length > 0 && (
              <span className="ml-2 text-zinc-600">({tasks.length})</span>
            )}
          </h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="all">All</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
              <svg className="h-8 w-8 mb-3 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-xs">No tasks yet</p>
              <p className="text-xs mt-1 text-zinc-700">
                Submit a task above to get started
              </p>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedId}
                onSelectAction={setSelectedId}
                onDeleteAction={handleDelete}
                onRestartAction={handleRestart}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail column */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        {selectedTask ? (
          <TaskDetail task={selectedTask} onRestart={handleRestart} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Select a task to view details
          </div>
        )}
      </div>
    </div>
  );
}

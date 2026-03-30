import type { Task, TaskDetail, TaskCreateInput, Column as ColumnType } from "@kb/core";
import { COLUMNS } from "@kb/core";
import { Column } from "./Column";
import type { ToastType } from "../hooks/useToast";
import { useState, useMemo } from "react";

interface BoardProps {
  tasks: Task[];
  maxConcurrent: number;
  onMoveTask: (id: string, column: ColumnType) => Promise<Task>;
  onOpenDetail: (task: TaskDetail) => void;
  addToast: (message: string, type?: ToastType) => void;
  onQuickCreate?: (description: string) => Promise<void>;
  onNewTask: () => void;
  autoMerge: boolean;
  onToggleAutoMerge: () => void;
  globalPaused?: boolean;
  onUpdateTask?: (
    id: string,
    updates: { title?: string; description?: string; dependencies?: string[] }
  ) => Promise<Task>;
  onArchiveTask?: (id: string) => Promise<Task>;
  onUnarchiveTask?: (id: string) => Promise<Task>;
  searchQuery?: string;
}

export function Board({ tasks, maxConcurrent, onMoveTask, onOpenDetail, addToast, onQuickCreate, onNewTask, autoMerge, onToggleAutoMerge, globalPaused, onUpdateTask, onArchiveTask, onUnarchiveTask, searchQuery = "" }: BoardProps) {
  const [archivedCollapsed, setArchivedCollapsed] = useState(true);

  // Filter tasks based on search query (matches id, title, or description)
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const query = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.id.toLowerCase().includes(query) ||
        (t.title && t.title.toLowerCase().includes(query)) ||
        t.description.toLowerCase().includes(query)
    );
  }, [tasks, searchQuery]);

  return (
    <main className="board" id="board">
      {COLUMNS.map((col) => (
        <Column
          key={col}
          column={col}
          tasks={filteredTasks
            .filter((t) => t.column === col)
            .sort((a, b) => {
              // Tasks with columnMovedAt sort descending (most recent first)
              // Tasks without it (legacy) fall to the bottom, sorted by createdAt ascending
              if (a.columnMovedAt && b.columnMovedAt) {
                return b.columnMovedAt.localeCompare(a.columnMovedAt);
              }
              if (a.columnMovedAt && !b.columnMovedAt) return -1;
              if (!a.columnMovedAt && b.columnMovedAt) return 1;
              return a.createdAt.localeCompare(b.createdAt);
            })}
          allTasks={tasks}
          maxConcurrent={maxConcurrent}
          onMoveTask={onMoveTask}
          onOpenDetail={onOpenDetail}
          addToast={addToast}
          globalPaused={globalPaused}
          onUpdateTask={onUpdateTask}
          onArchiveTask={onArchiveTask}
          onUnarchiveTask={onUnarchiveTask}
          {...(col === "triage" ? { onQuickCreate, onNewTask } : {})}
          {...(col === "in-review" ? { autoMerge, onToggleAutoMerge } : {})}
          {...(col === "archived" ? { collapsed: archivedCollapsed, onToggleCollapse: () => setArchivedCollapsed(!archivedCollapsed) } : {})}
        />
      ))}
    </main>
  );
}

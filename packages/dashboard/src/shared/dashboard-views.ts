/*
FNXC:UiMetadataApi 2026-07-14-00:00:
Dashboard view ids, English fallback labels, and translation keys have one source of truth consumed by both the dashboard UI and GET /api/views. Edit this registry rather than either consumer so external discovery cannot drift from navigation.
*/

export const DASHBOARD_VIEW_IDS = [
  "board",
  "list",
  "graph",
  "agents",
  "missions",
  "chat",
  "documents",
  "research",
  "evals",
  "ideation",
  "goalsView",
  "todos",
  "planning",
  "skills",
  "mailbox",
  "insights",
  "memory",
  "command-center",
  "secrets",
  "dev-server",
  "pull-requests",
  "workflows",
  "import-tasks",
  "automations",
  "settings",
  "task-detail",
] as const;

export type CanonicalDashboardViewId = (typeof DASHBOARD_VIEW_IDS)[number];
export type BuiltInTaskView = CanonicalDashboardViewId | "devserver";

export interface DashboardViewMetadata {
  id: CanonicalDashboardViewId;
  label: string;
  labelKey: string;
  aliases?: readonly string[];
  internal?: boolean;
}

export const DASHBOARD_VIEWS: readonly DashboardViewMetadata[] = [
  { id: "board", label: "Board", labelKey: "nav.board" },
  { id: "list", label: "List", labelKey: "nav.list" },
  { id: "graph", label: "Graph", labelKey: "nav.graph" },
  { id: "agents", label: "Agents", labelKey: "nav.agents" },
  { id: "missions", label: "Missions", labelKey: "nav.missions" },
  { id: "chat", label: "Chat", labelKey: "nav.chat" },
  { id: "documents", label: "Artifacts", labelKey: "nav.documents" },
  { id: "research", label: "Research", labelKey: "header.researchView" },
  { id: "evals", label: "Evals", labelKey: "header.evalsView" },
  { id: "ideation", label: "Ideation", labelKey: "nav.ideation" },
  { id: "goalsView", label: "Goals", labelKey: "header.goalsView" },
  { id: "todos", label: "Todos", labelKey: "header.todosView" },
  { id: "planning", label: "Planning", labelKey: "nav.planning" },
  { id: "skills", label: "Skills", labelKey: "header.skillsView" },
  { id: "mailbox", label: "Mailbox", labelKey: "nav.mailbox" },
  { id: "insights", label: "Insights", labelKey: "header.insightsView" },
  { id: "memory", label: "Memory", labelKey: "header.memoryView" },
  { id: "command-center", label: "Dashboard", labelKey: "nav.commandCenter" },
  { id: "secrets", label: "Secrets", labelKey: "header.secretsView" },
  { id: "dev-server", label: "Dev Server", labelKey: "nav.devServer", aliases: ["devserver"] },
  { id: "pull-requests", label: "Pull Requests", labelKey: "nav.pullRequests" },
  { id: "workflows", label: "Workflows", labelKey: "nav.workflows" },
  { id: "import-tasks", label: "Import Tasks", labelKey: "nav.importTasks" },
  { id: "automations", label: "Automations", labelKey: "nav.automations" },
  { id: "settings", label: "Settings", labelKey: "header.settings" },
  { id: "task-detail", label: "Task Detail", labelKey: "taskDetail.title", internal: true },
];

const DASHBOARD_VIEW_BY_ID = new Map(DASHBOARD_VIEWS.map((view) => [view.id, view]));

export function getDashboardViewLabel(id: CanonicalDashboardViewId): string {
  const view = DASHBOARD_VIEW_BY_ID.get(id);
  if (!view) {
    throw new Error(`Unknown dashboard view id: ${id}`);
  }
  return view.label;
}

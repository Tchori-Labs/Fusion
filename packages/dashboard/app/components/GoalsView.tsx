import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import "./GoalsView.css";

interface Goal {
  id: string;
  title: string;
  status: "active" | "inactive";
  createdAt: string;
}

interface UseGoalsResult {
  goals: Goal[];
  activeCount: number;
  errorMessage: string | null;
  addGoal: () => void;
  activateGoal: (goalId: string) => void;
}

export interface GoalsViewProps {
  initialGoals?: Goal[];
}

const MAX_ACTIVE_GOALS = 5;
const WARNING_THRESHOLD = 3;

const defaultMockGoals: Goal[] = [
  { id: "goal-1", title: "Reduce mean review turnaround", status: "active", createdAt: "2026-05-14T09:30:00.000Z" },
  { id: "goal-2", title: "Raise merge reliability coverage", status: "active", createdAt: "2026-05-15T12:00:00.000Z" },
  { id: "goal-3", title: "Ship dashboard quality audit", status: "inactive", createdAt: "2026-05-16T08:15:00.000Z" },
];

function useGoals(initialGoals?: Goal[]): UseGoalsResult {
  const [goals, setGoals] = useState<Goal[]>(() => initialGoals ?? defaultMockGoals);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCount = useMemo(() => goals.filter((goal) => goal.status === "active").length, [goals]);

  function addGoal() {
    if (activeCount >= MAX_ACTIVE_GOALS) {
      setErrorMessage("Cannot activate more than 5 goals. Resolve an active goal before adding another active goal.");
      return;
    }

    setErrorMessage(null);
    setGoals((current) => [
      ...current,
      {
        id: `goal-${current.length + 1}`,
        title: `New Goal ${current.length + 1}`,
        status: "active",
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function activateGoal(goalId: string) {
    const nextGoal = goals.find((goal) => goal.id === goalId);
    if (!nextGoal || nextGoal.status === "active") {
      return;
    }

    if (activeCount >= MAX_ACTIVE_GOALS) {
      setErrorMessage("Cannot activate more than 5 goals. Resolve an active goal before activating another.");
      return;
    }

    setErrorMessage(null);
    setGoals((current) => current.map((goal) => (goal.id === goalId ? { ...goal, status: "active" } : goal)));
  }

  return {
    goals,
    activeCount,
    errorMessage,
    addGoal,
    activateGoal,
  };
}

export function GoalsView({ initialGoals }: GoalsViewProps) {
  const { goals, activeCount, errorMessage, addGoal, activateGoal } = useGoals(initialGoals);
  const showWarning = activeCount >= WARNING_THRESHOLD && activeCount <= MAX_ACTIVE_GOALS;

  return (
    <section className="goals-view" data-testid="goals-view">
      <header className="goals-header">
        <div>
          <h2 className="goals-title">Goals</h2>
          <p className="goals-count" data-testid="goals-active-count">
            {activeCount} active goals
          </p>
        </div>
        <button type="button" className="btn btn-primary goals-add-button" onClick={addGoal} data-testid="goals-add-button">
          <Plus aria-hidden="true" />
          Add Goal
        </button>
      </header>

      {showWarning ? (
        <p className="goals-warning" role="status">
          Approaching the 5-active goal cap. Keep active goals focused.
        </p>
      ) : null}

      {errorMessage ? (
        <p className="form-error goals-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {goals.length === 0 ? (
        <div className="goals-empty card" data-testid="goals-empty-state">
          No goals yet. Add one to begin tracking strategic outcomes.
        </div>
      ) : (
        <div className="goals-list" data-testid="goals-list">
          {goals.map((goal) => (
            <article key={goal.id} className="card goals-card" data-testid={`goal-card-${goal.id}`}>
              <div className="goals-card-main">
                <h3 className="goals-card-title">{goal.title}</h3>
                <p className="goals-card-status">Status: {goal.status}</p>
              </div>
              <button
                type="button"
                className="btn goals-activate-button"
                disabled={goal.status === "active"}
                onClick={() => activateGoal(goal.id)}
                data-testid={`goal-activate-${goal.id}`}
              >
                {goal.status === "active" ? "Active" : "Activate"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

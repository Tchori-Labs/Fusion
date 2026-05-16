import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GoalsView } from "../GoalsView";

vi.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus" />,
}));

describe("GoalsView", () => {
  it("renders empty state", () => {
    render(<GoalsView initialGoals={[]} />);
    expect(screen.getByTestId("goals-empty-state")).toBeInTheDocument();
  });

  it("does not show warning at 2 active goals", () => {
    render(
      <GoalsView
        initialGoals={[
          { id: "g1", title: "One", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g2", title: "Two", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows warning at 3 active goals", () => {
    render(
      <GoalsView
        initialGoals={[
          { id: "g1", title: "One", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g2", title: "Two", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g3", title: "Three", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("5-active goal cap");
  });

  it("shows hard error and prevents 6th activation when 5 are active", () => {
    render(
      <GoalsView
        initialGoals={[
          { id: "g1", title: "One", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g2", title: "Two", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g3", title: "Three", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g4", title: "Four", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g5", title: "Five", status: "active", createdAt: "2026-05-16T00:00:00.000Z" },
          { id: "g6", title: "Six", status: "inactive", createdAt: "2026-05-16T00:00:00.000Z" },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId("goal-activate-g6"));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("goal-activate-g6")).toHaveTextContent("Activate");
  });

  it("renders add button with class for focus-visible style hook", () => {
    render(<GoalsView initialGoals={[]} />);
    expect(screen.getByTestId("goals-add-button")).toHaveClass("goals-add-button");
  });
});

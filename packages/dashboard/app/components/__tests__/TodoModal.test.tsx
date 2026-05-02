import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TodoModal } from "../TodoModal";

const mockTodoView = vi.fn();

vi.mock("../TodoView", () => ({
  TodoView: (props: unknown) => {
    mockTodoView(props);
    return <div data-testid="todo-view-content">Todo content</div>;
  },
}));

describe("TodoModal", () => {
  const onClose = vi.fn();
  const addToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal dialog semantics and header content", () => {
    render(<TodoModal onClose={onClose} addToast={addToast} />);

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByText("Manage reusable todo lists for your project.")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<TodoModal onClose={onClose} addToast={addToast} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on overlay backdrop click", () => {
    render(<TodoModal onClose={onClose} addToast={addToast} />);
    const overlay = screen.getByRole("dialog");
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from close button", () => {
    render(<TodoModal onClose={onClose} addToast={addToast} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("passes projectId and addToast through to TodoView", () => {
    render(<TodoModal onClose={onClose} addToast={addToast} projectId="proj-1" />);

    expect(screen.getByTestId("todo-view-content")).toBeInTheDocument();
    expect(mockTodoView).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", addToast }),
    );
  });
});

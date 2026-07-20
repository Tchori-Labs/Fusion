import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportActionMenu } from "../ReportActionMenu";

describe("ReportActionMenu", () => {
  it("defines the portal stacking contract instead of relying on an undefined z-index", () => {
    const styles = readFileSync(join(process.cwd(), "app/styles.css"), "utf8");
    const menuStyles = readFileSync(join(process.cwd(), "app/components/ReportActionMenu.css"), "utf8");

    expect(styles).toMatch(/--z-dropdown:\s*\d+/);
    expect(styles).toMatch(/--z-modal:\s*\d+/);
    expect(menuStyles).toMatch(/\.report-action-menu__list\s*{[^}]*z-index:\s*var\(--z-dropdown\)/s);
    expect(menuStyles).toMatch(/\.report-action-menu__list--portal\s*{[^}]*position:\s*fixed/s);
  });

  it("exposes all four guided actions without empty controls", () => {
    const onSelect = vi.fn();
    render(<ReportActionMenu onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    const actions = ["Report bug", "Send feedback", "Share idea", "Get help"];
    for (const action of actions) expect(screen.getByRole("menuitem", { name: action })).toBeEnabled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Get help" }));
    expect(onSelect).toHaveBeenCalledWith("help");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

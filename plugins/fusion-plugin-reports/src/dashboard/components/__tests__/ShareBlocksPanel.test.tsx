import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareBlocksPanel } from "../ShareBlocksPanel.js";

const getShareBlocks = vi.fn();
vi.mock("../../api.js", () => ({ getShareBlocks: (...args: unknown[]) => getShareBlocks(...args) }));

describe("ShareBlocksPanel", () => {
  it("renders tabs and copies selected block", async () => {
    getShareBlocks.mockResolvedValue({ plainText: "a", markdown: "b", slack: "c", emailHtml: "d" });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ShareBlocksPanel report={{ id: "rep_1" } as any} />);
    await screen.findByText("Plain Text");
    fireEvent.click(screen.getByText("Markdown"));
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("b"));
  });

  it("shows locked message on 409", async () => {
    getShareBlocks.mockRejectedValue(new Error("409 Conflict"));
    render(<ShareBlocksPanel report={{ id: "rep_1" } as any} />);
    await screen.findByText(/unlock after the report is approved/i);
  });
});

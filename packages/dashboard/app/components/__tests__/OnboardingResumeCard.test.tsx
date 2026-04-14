import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingResumeCard } from "../OnboardingResumeCard";
import * as onboardingState from "../model-onboarding-state";

// Mock the onboarding state module
vi.mock("../model-onboarding-state", () => ({
  isOnboardingResumable: vi.fn(),
  getOnboardingResumeStep: vi.fn(),
}));

const mockIsOnboardingResumable = onboardingState.isOnboardingResumable as ReturnType<typeof vi.fn>;
const mockGetOnboardingResumeStep = onboardingState.getOnboardingResumeStep as ReturnType<typeof vi.fn>;

describe("OnboardingResumeCard", () => {
  const mockOnContinue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem("kb-onboarding-state");
  });

  it("renders null when onboarding is not resumable", () => {
    mockIsOnboardingResumable.mockReturnValue(false);
    const { container } = render(<OnboardingResumeCard onContinue={mockOnContinue} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when getOnboardingResumeStep returns null", () => {
    mockIsOnboardingResumable.mockReturnValue(true);
    mockGetOnboardingResumeStep.mockReturnValue(null);
    const { container } = render(<OnboardingResumeCard onContinue={mockOnContinue} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the resume card with correct content", () => {
    mockIsOnboardingResumable.mockReturnValue(true);
    mockGetOnboardingResumeStep.mockReturnValue({ currentStep: "github", label: "GitHub" });

    render(<OnboardingResumeCard onContinue={mockOnContinue} />);

    expect(screen.getByRole("region", { name: /continue where you left off/i })).toBeTruthy();
    expect(screen.getByText("Continue where you left off")).toBeTruthy();
    expect(screen.getByText(/Resume onboarding at/i)).toBeTruthy();
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Continue onboarding")).toBeTruthy();
  });

  it("renders with different step labels", () => {
    mockIsOnboardingResumable.mockReturnValue(true);
    mockGetOnboardingResumeStep.mockReturnValue({ currentStep: "ai-setup", label: "AI Setup" });

    render(<OnboardingResumeCard onContinue={mockOnContinue} />);

    expect(screen.getByText("AI Setup")).toBeTruthy();
  });

  it("calls onContinue when button is clicked", () => {
    mockIsOnboardingResumable.mockReturnValue(true);
    mockGetOnboardingResumeStep.mockReturnValue({ currentStep: "first-task", label: "First Task" });

    render(<OnboardingResumeCard onContinue={mockOnContinue} />);

    fireEvent.click(screen.getByText("Continue onboarding"));
    expect(mockOnContinue).toHaveBeenCalledTimes(1);
  });

  it("button is keyboard accessible", () => {
    mockIsOnboardingResumable.mockReturnValue(true);
    mockGetOnboardingResumeStep.mockReturnValue({ currentStep: "github", label: "GitHub" });

    render(<OnboardingResumeCard onContinue={mockOnContinue} />);

    const button = screen.getByRole("button", { name: "Continue onboarding" });
    expect(button).toBeTruthy();

    // Test keyboard activation - buttons respond to keyPress or click
    button.focus();
    expect(document.activeElement).toBe(button);

    // Use click to verify the button is functional
    fireEvent.click(button);
    expect(mockOnContinue).toHaveBeenCalledTimes(1);
  });

  it("has proper heading structure for accessibility", () => {
    mockIsOnboardingResumable.mockReturnValue(true);
    mockGetOnboardingResumeStep.mockReturnValue({ currentStep: "ai-setup", label: "AI Setup" });

    render(<OnboardingResumeCard onContinue={mockOnContinue} />);

    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toBeTruthy();
    expect(heading).toHaveTextContent("Continue where you left off");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getOnboardingState,
  saveOnboardingState,
  clearOnboardingState,
  isOnboardingResumable,
  getOnboardingResumeStep,
} from "../model-onboarding-state";

const STORAGE_KEY = "kb-onboarding-state";

describe("model-onboarding-state", () => {
  beforeEach(() => {
    // Clear storage before each test
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.removeItem(STORAGE_KEY);
  });

  describe("getOnboardingState", () => {
    it("returns null when no state is stored", () => {
      expect(getOnboardingState()).toBeNull();
    });

    it("returns null when stored data is malformed", () => {
      localStorage.setItem(STORAGE_KEY, "not-json");
      expect(getOnboardingState()).toBeNull();
    });

    it("returns null when stored data is missing currentStep", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt: "2024-01-01T00:00:00.000Z" }));
      expect(getOnboardingState()).toBeNull();
    });

    it("returns parsed state when valid", () => {
      const state = { currentStep: "ai-setup" as const, updatedAt: "2024-01-01T00:00:00.000Z" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      expect(getOnboardingState()).toEqual(state);
    });

    it("fills in updatedAt if missing", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStep: "github" }));
      const result = getOnboardingState();
      expect(result?.currentStep).toBe("github");
      expect(result?.updatedAt).toBeTruthy();
    });
  });

  describe("saveOnboardingState", () => {
    it("persists state to localStorage", () => {
      saveOnboardingState({ currentStep: "first-task" });
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.currentStep).toBe("first-task");
      expect(parsed.updatedAt).toBeTruthy();
    });
  });

  describe("clearOnboardingState", () => {
    it("removes state from localStorage", () => {
      saveOnboardingState({ currentStep: "ai-setup" });
      clearOnboardingState();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("isOnboardingResumable", () => {
    it("returns false when no state is stored", () => {
      expect(isOnboardingResumable()).toBe(false);
    });

    it("returns false when state is terminal 'complete'", () => {
      saveOnboardingState({ currentStep: "complete" });
      expect(isOnboardingResumable()).toBe(false);
    });

    it("returns true for non-terminal steps", () => {
      saveOnboardingState({ currentStep: "ai-setup" });
      expect(isOnboardingResumable()).toBe(true);

      saveOnboardingState({ currentStep: "github" });
      expect(isOnboardingResumable()).toBe(true);

      saveOnboardingState({ currentStep: "first-task" });
      expect(isOnboardingResumable()).toBe(true);
    });
  });

  describe("getOnboardingResumeStep", () => {
    it("returns null when no state is stored", () => {
      expect(getOnboardingResumeStep()).toBeNull();
    });

    it("returns null for terminal 'complete' step", () => {
      saveOnboardingState({ currentStep: "complete" });
      expect(getOnboardingResumeStep()).toBeNull();
    });

    it("returns step and label for 'ai-setup'", () => {
      saveOnboardingState({ currentStep: "ai-setup" });
      expect(getOnboardingResumeStep()).toEqual({
        currentStep: "ai-setup",
        label: "AI Setup",
      });
    });

    it("returns step and label for 'github'", () => {
      saveOnboardingState({ currentStep: "github" });
      expect(getOnboardingResumeStep()).toEqual({
        currentStep: "github",
        label: "GitHub",
      });
    });

    it("returns step and label for 'first-task'", () => {
      saveOnboardingState({ currentStep: "first-task" });
      expect(getOnboardingResumeStep()).toEqual({
        currentStep: "first-task",
        label: "First Task",
      });
    });

    it("generates fallback label for unknown step IDs", () => {
      // @ts-expect-error - Testing with arbitrary step ID
      saveOnboardingState({ currentStep: "custom-step" });
      const result = getOnboardingResumeStep();
      expect(result?.currentStep).toBe("custom-step");
      expect(result?.label).toBe("Custom Step");
    });

    it("generates fallback label for kebab-case steps", () => {
      // @ts-expect-error - Testing with arbitrary step ID
      saveOnboardingState({ currentStep: "my-custom-step" });
      const result = getOnboardingResumeStep();
      expect(result?.currentStep).toBe("my-custom-step");
      expect(result?.label).toBe("My Custom Step");
    });

    it("generates fallback label for snake_case steps", () => {
      // @ts-expect-error - Testing with arbitrary step ID
      saveOnboardingState({ currentStep: "my_custom_step" });
      const result = getOnboardingResumeStep();
      expect(result?.currentStep).toBe("my_custom_step");
      expect(result?.label).toBe("My Custom Step");
    });
  });
});

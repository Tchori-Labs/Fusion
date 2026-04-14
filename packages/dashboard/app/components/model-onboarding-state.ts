import { getScopedItem, setScopedItem, scopedKey } from "../utils/projectStorage";

/**
 * Onboarding step type matching the ModelOnboardingModal steps.
 * Note: "complete" is the terminal state and is NOT resumable.
 */
export type OnboardingStepId = "ai-setup" | "github" | "first-task" | "complete";

/**
 * Persisted onboarding state stored in localStorage.
 */
export interface OnboardingState {
  /** The current step the user was on when they dismissed the modal */
  currentStep: OnboardingStepId;
  /** ISO-8601 timestamp of when the state was last updated */
  updatedAt: string;
}

/** LocalStorage key for onboarding state (global, not project-scoped) */
const ONBOARDING_STATE_KEY = "kb-onboarding-state";

/**
 * Well-known step labels for display purposes.
 * Steps that are not in this map will use a fallback label.
 */
const STEP_LABELS: Record<Exclude<OnboardingStepId, "complete">, string> = {
  "ai-setup": "AI Setup",
  "github": "GitHub",
  "first-task": "First Task",
};

/**
 * Get the persisted onboarding state from localStorage.
 * Returns null if no state is stored.
 */
export function getOnboardingState(): OnboardingState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(ONBOARDING_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Validate required fields
    if (!parsed.currentStep || typeof parsed.currentStep !== "string") {
      return null;
    }
    // Ensure updatedAt is present
    if (!parsed.updatedAt) {
      parsed.updatedAt = new Date().toISOString();
    }
    return parsed as OnboardingState;
  } catch {
    return null;
  }
}

/**
 * Save onboarding state to localStorage.
 * This is called by the modal when the user navigates between steps
 * so we can restore their position if they dismiss and want to resume.
 */
export function saveOnboardingState(state: Omit<OnboardingState, "updatedAt">): void {
  if (typeof window === "undefined") {
    return;
  }

  const fullState: OnboardingState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(fullState));
}

/**
 * Clear the persisted onboarding state.
 * Called when onboarding is completed (reaches "complete" step) or explicitly dismissed.
 */
export function clearOnboardingState(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ONBOARDING_STATE_KEY);
}

/**
 * Check if onboarding can be resumed.
 * Returns true only when:
 * - Persisted state exists
 * - currentStep is NOT "complete" (the terminal state)
 */
export function isOnboardingResumable(): boolean {
  const state = getOnboardingState();
  if (!state) {
    return false;
  }
  return state.currentStep !== "complete";
}

/**
 * Get the step and label for resuming onboarding.
 * Returns null if onboarding cannot be resumed.
 *
 * For unknown step IDs (future-proofing), generates a fallback label.
 */
export function getOnboardingResumeStep(): { currentStep: string; label: string } | null {
  const state = getOnboardingState();
  if (!state) {
    return null;
  }

  // Terminal state - cannot resume
  if (state.currentStep === "complete") {
    return null;
  }

  // Use known label or generate fallback for unknown steps
  const label =
    STEP_LABELS[state.currentStep as keyof typeof STEP_LABELS] ??
    generateFallbackLabel(state.currentStep);

  return {
    currentStep: state.currentStep,
    label,
  };
}

/**
 * Generate a fallback label for an unknown step ID.
 * Converts kebab-case or snake_case to Title Case.
 */
function generateFallbackLabel(stepId: string): string {
  // Remove any path prefixes if somehow a full key got stored
  const lastPart = stepId.split("/").pop() ?? stepId;

  // Convert kebab-case or snake_case to Title Case
  return lastPart
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

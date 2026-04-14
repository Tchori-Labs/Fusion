import { Lightbulb } from "lucide-react";
import { isOnboardingResumable, getOnboardingResumeStep } from "./model-onboarding-state";

interface OnboardingResumeCardProps {
  /** Callback when user clicks continue onboarding */
  onContinue: () => void;
}

/**
 * Dashboard resume card shown when onboarding was dismissed but not completed.
 * Allows users to continue from their last step rather than starting over.
 */
export function OnboardingResumeCard({ onContinue }: OnboardingResumeCardProps) {
  // Don't render if onboarding cannot be resumed
  if (!isOnboardingResumable()) {
    return null;
  }

  const resumeStep = getOnboardingResumeStep();
  if (!resumeStep) {
    return null;
  }

  return (
    <section
      className="onboarding-resume-card"
      role="region"
      aria-labelledby="onboarding-resume-heading"
    >
      <div className="onboarding-resume-card__content">
        <div className="onboarding-resume-card__icon">
          <Lightbulb size={20} aria-hidden="true" />
        </div>
        <div className="onboarding-resume-card__text">
          <h3 id="onboarding-resume-heading" className="onboarding-resume-card__title">
            Continue where you left off
          </h3>
          <p className="onboarding-resume-card__meta">
            Resume onboarding at <strong>{resumeStep.label}</strong>
          </p>
        </div>
      </div>
      <div className="onboarding-resume-card__actions">
        <button
          className="onboarding-resume-card__continue"
          onClick={onContinue}
        >
          Continue onboarding
        </button>
      </div>
    </section>
  );
}

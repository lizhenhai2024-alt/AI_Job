const MOVED_MESSAGE = 'AI_Job no longer builds candidate-fit shortlists. Final Eligibility, Match, Capability, Career Fit, competition intensity, Offer reachability, Company Top-3 and application priority belong to CareerPilot. campus-job-board only publishes the risk-intelligence contract.';

/** Compatibility fence for stale callers. */
export function buildDailyShortlist() {
  throw new Error(MOVED_MESSAGE);
}

export function dailyShortlistStats() {
  throw new Error(MOVED_MESSAGE);
}

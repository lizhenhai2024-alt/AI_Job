const MOVED_MESSAGE = 'AI_Job is discovery/intelligence only. Final Eligibility, Match, Capability, Career Fit, competition intensity, Offer reachability, first-job value, Company Top-3 and application recommendation are owned by CareerPilot. campus-job-board owns the risk-intelligence contract only.';

/**
 * Compatibility fence only.
 *
 * Candidate-side scoring was intentionally removed from AI_Job. AI_Job may expose
 * factual inputs such as JD evidence, source provenance, compensation and disclosed
 * headcount, but it must not turn those facts into a personal ranking, S/A/B tier,
 * competition score or Offer probability.
 *
 * Keep these exports temporarily so stale callers fail loudly instead of silently
 * reintroducing a second final-decision algorithm outside CareerPilot.
 */
export function evaluateJob() {
  throw new Error(MOVED_MESSAGE);
}

export function rankJobs() {
  throw new Error(MOVED_MESSAGE);
}

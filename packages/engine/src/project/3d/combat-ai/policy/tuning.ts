const moves: Readonly<Record<string, number>> = { jab: -.25, 'dash-jab-toward': -.45, 'drive-jab-toward': -.1 };

/** Conservative reviewed priors from retained match observations, not measured
 * win probabilities or automatic training. Live match evidence still adapts. */
export const reviewedPolicyEvidence = {
  analysisId: 'tod-spectator-learning-2026-09-29',
  report: '.local/touch-of-death/spectator-learning/ingestion-summary.json',
  moves,
};

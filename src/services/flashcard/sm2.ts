/**
 * SM-2 Spaced Repetition Algorithm
 * Based on the SuperMemo SM-2 algorithm by Piotr Wozniak
 *
 * Quality scale (0-5):
 *   0 - Complete blackout, no recall
 *   1 - Wrong answer, but recognized after reveal
 *   2 - Wrong answer, but easy to recall after reveal
 *   3 - Correct answer, but with significant difficulty
 *   4 - Correct answer, with some hesitation
 *   5 - Perfect recall, instant response
 */

export interface SM2Input {
  quality: number;       // 0-5 rating
  easeFactor: number;    // current ease factor (>= 1.3)
  interval: number;      // current interval in days
  repetitions: number;   // consecutive correct reviews
}

export interface SM2Output {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

export function calculateSM2(input: SM2Input): SM2Output {
  const { quality, easeFactor: prevEF, interval: prevInterval, repetitions: prevReps } = input;

  // Clamp quality to 0-5
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let newInterval: number;
  let newReps: number;

  if (q >= 3) {
    // Correct response
    if (prevReps === 0) {
      newInterval = 1;
    } else if (prevReps === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(prevInterval * prevEF);
    }
    newReps = prevReps + 1;
  } else {
    // Incorrect response — reset
    newReps = 0;
    newInterval = 1;
  }

  // Calculate new ease factor
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const newEF = Math.max(
    1.3,
    prevEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  );

  // Calculate next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    easeFactor: Math.round(newEF * 100) / 100, // Round to 2 decimals
    interval: newInterval,
    repetitions: newReps,
    nextReviewDate,
  };
}

/**
 * Check if a card is due for review
 */
export function isCardDue(nextReviewDate: Date): boolean {
  return new Date() >= nextReviewDate;
}

/**
 * Get mastery level based on SM-2 data
 * Returns a string label for UI display
 */
export function getMasteryLevel(repetitions: number, easeFactor: number): string {
  if (repetitions === 0) return 'new';
  if (repetitions <= 2) return 'learning';
  if (easeFactor < 2.0) return 'difficult';
  if (repetitions >= 5 && easeFactor >= 2.5) return 'mastered';
  return 'reviewing';
}

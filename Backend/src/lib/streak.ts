// Day streak rules:
// - The first visit of a calendar day (India time) counts that day.
// - A visit within 48 hours of the previous visit, on a later day, extends the streak by 1.
// - A visit more than 48 hours after the previous one starts a new streak at 1.
// - More visits on the same day change nothing (only lastActiveAt moves forward).
export const STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
const STREAK_TIME_ZONE = "Asia/Kolkata";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STREAK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in India time */
export const streakDay = (date: Date) => dayFormatter.format(date);

export type StreakState = {
  streakCount: number;
  longestStreak: number;
  lastActiveAt: Date | null;
};

/** The state to store after the student is seen active at `now`. */
export function recordActivity(prev: StreakState, now: Date): StreakState {
  // A late-arriving request from before the last recorded visit changes nothing
  if (prev.lastActiveAt && now.getTime() <= prev.lastActiveAt.getTime()) {
    return { ...prev, streakCount: Math.max(prev.streakCount, 1), longestStreak: Math.max(prev.longestStreak, prev.streakCount, 1) };
  }

  let streakCount: number;
  if (!prev.lastActiveAt) {
    streakCount = 1;
  } else if (streakDay(prev.lastActiveAt) === streakDay(now)) {
    streakCount = Math.max(prev.streakCount, 1);
  } else if (now.getTime() - prev.lastActiveAt.getTime() <= STREAK_WINDOW_MS) {
    streakCount = prev.streakCount + 1;
  } else {
    streakCount = 1;
  }
  return {
    streakCount,
    longestStreak: Math.max(prev.longestStreak, streakCount),
    lastActiveAt: now,
  };
}

/** The streak to show right now: 0 once the 48-hour window has passed without a visit. */
export function currentStreak(state: StreakState, now: Date): number {
  if (!state.lastActiveAt) return 0;
  return now.getTime() - state.lastActiveAt.getTime() <= STREAK_WINDOW_MS ? state.streakCount : 0;
}
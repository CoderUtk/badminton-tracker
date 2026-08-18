import type { EarnedBadge } from "./types";

/** Most badges are in progress at once; showing them all defeats the point. */
export const NEXT_UP_LIMIT = 3;

export type BadgeGroups = {
  earned: EarnedBadge[];
  nextUp: EarnedBadge[];
  locked: EarnedBadge[];
};

/**
 * Partition badges for the profile achievements section. Exhaustive and
 * non-overlapping by construction: a badge is earned or not, and an unearned
 * badge has progress either above zero or exactly zero. Earned and locked keep
 * their definition order; only nextUp is re-sorted, and it sorts a copy so the
 * caller's array is untouched.
 */
export function groupBadges(badges: EarnedBadge[]): BadgeGroups {
  return {
    earned: badges.filter((b) => b.earned),
    nextUp: badges
      .filter((b) => !b.earned && b.progress > 0)
      .sort((a, z) => z.progress - a.progress)
      .slice(0, NEXT_UP_LIMIT),
    locked: badges.filter((b) => !b.earned && b.progress === 0),
  };
}

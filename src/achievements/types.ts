export type Badge = { id: string; title: string; description: string; icon: string };
export type EarnedBadge = Badge & { earned: boolean; progress: number };

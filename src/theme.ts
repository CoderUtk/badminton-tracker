/**
 * CourtSide theme — premium "sports game HUD" direction.
 * Deep near-black surfaces, action red primary, an electric-cyan accent for
 * highlights/glows, and the Russo One / Chakra Petch esports type pairing.
 */
export const C = {
  // base surfaces (deep, slightly cool black for depth)
  bg: "#0C0E12",
  bgElev: "#12151B",
  card: "#171A21",
  cardHi: "#1F232C",
  line: "#2A2F3A",
  lineHi: "#3A4150",
  // brand + semantic
  red: "#FF3B30",
  redDeep: "#B3261E",
  blue: "#3B82F6",
  green: "#22C55E",
  amber: "#F59E0B",
  accent: "#22D3EE", // electric cyan — premium highlights + glow
  accentDeep: "#0E7490",
  // text
  text: "#FFFFFF",
  text2: "#9BA3B2",
  // Raised from #5C6472, which measured 3.24:1 on bg and 2.90:1 on cardHi —
  // the root of audit finding A8. This is the dimmest slate that still clears
  // 4.5:1 on every surface in this palette.
  text3: "#838B9D",
  // The old text3. Decorative only — inactive dots, icon washes, hairlines.
  // Never colour text with this; it fails AA by design.
  ghost: "#5C6472",
} as const;

/** Font families (loaded in the root layout via @expo-google-fonts). */
export const F = {
  display: "RussoOne_400Regular", // scores, wordmark, big numerals
  body: "ChakraPetch_400Regular",
  medium: "ChakraPetch_500Medium",
  semibold: "ChakraPetch_600SemiBold",
  bold: "ChakraPetch_700Bold",
} as const;

/** Gradients (for expo-linear-gradient). */
export const GRAD = {
  screen: ["#0C0E12", "#0F1319"] as const,
  card: ["#1B1F27", "#141821"] as const,
  redCTA: ["#FF4D42", "#D42318"] as const,
  accent: ["#22D3EE", "#0E7490"] as const,
  court: ["#1A2A2E", "#14202A"] as const,
} as const;

/** Neon glow presets — apply as shadow* props for a HUD feel. */
export const glow = (color: string, radius = 14, opacity = 0.55) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
});

/** Neon glow for text (uses textShadow, which Text supports on both platforms). */
export const textGlow = (color: string, radius = 12) => ({
  textShadowColor: color,
  textShadowRadius: radius,
  textShadowOffset: { width: 0, height: 0 },
});

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** 
 * Emil's custom easing curves: all animations use ease-out (never ease-in).
 * Exits should be faster than entrances (250ms exit vs 300ms entrance).
 */
export const easing = {
  // Apple's signature curve: ease-out with slight snap
  standard: [0.4, 0, 0.2, 1] as const,
  // Snappier for quick feedback (button presses, toggles)
  snappy: [0.25, 0.1, 0.25, 1] as const,
  // Smooth for page transitions and large movements
  smooth: [0.32, 0.72, 0, 1] as const,
  // Exit curve: faster, more direct
  exit: [0.4, 0, 1, 1] as const,
} as const;

/** Instant press feedback for any Pressable — subtle scale + dim. Transform/opacity only (GPU-safe). */
export const press = { transform: [{ scale: 0.97 }], opacity: 0.92 } as const;

/** 8pt spatial grid. Every margin, padding and gap comes from here. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Android's minimum touch target, in dp. Applies on both axes. */
export const MIN_TOUCH = 48;

/**
 * Destructive recipe. Outlined, never filled: a red FILL means "primary
 * action" and nothing else, so Delete and Start a match can never look alike
 * (audit M2). Pair with dangerText and always confirm through AppDialog.
 */
export const danger = {
  backgroundColor: "transparent",
  borderWidth: 1.5,
  borderColor: C.red,
} as const;
export const dangerText = { color: C.red } as const;

/**
 * Selected state. Deliberately hueless — selection is a state, not an action,
 * so it gets elevation instead of colour. Cyan was considered and rejected: it
 * already means DRAFT, and its higher luminance would make a passive selected
 * chip louder than the primary CTA.
 */
export const selected = {
  backgroundColor: C.cardHi,
  borderWidth: 1,
  borderColor: C.lineHi,
} as const;
export const selectedText = { color: C.text } as const;
export const unselectedText = { color: C.text2 } as const;

/**
 * Scoreboard type scale, in points.
 *
 * Lives here rather than in MatchScreen's StyleSheet so the hierarchy is
 * asserted in tests. Audit M8: the score was 32pt against a 26pt "+1" label and
 * 15pt names, so on a board meant to be read from across a court the buttons
 * were the dominant element.
 */
export const SCOREBOARD_TYPE = {
  score: 56,
  divider: 26,
  rail: 22,
  name: 13,
  timer: 12,
} as const;

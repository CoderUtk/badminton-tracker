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
  text3: "#5C6472",
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

/**
 * WCAG 2.1 contrast math (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
 *
 * Exists so token contrast is asserted in tests rather than eyeballed — the
 * 2026-08-12 audit's A8 was entirely "looks a bit dim" until it was measured.
 */

/** Channel-wise sRGB -> linear-light transfer. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Expected 6-digit hex with leading #, got "${hex}"`);
  }
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

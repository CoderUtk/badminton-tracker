# Play Store Listing Screenshots — Design

## Context

Play Store listing needs screenshots. No feature graphic/icon work needed — device (Android) already connected for capture.

## Flow

1. **Seed demo data** on the connected device: a club, at least one upcoming session, one completed match with a score, and one tournament with a bracket in progress. Real personal data stays untouched — seed data lives alongside it and can be deleted after capture.
2. **Capture 5 raw screenshots** via mobile-mcp, one per visible tab, in this order (matches the tab tour):
   - Home
   - Sessions
   - Matches
   - Tournaments
   - Profile
3. **Composite each into a marketing frame:**
   - HTML template rendered in the Browser pane at 1080×1920 (9:16, Play Store's standard portrait size)
   - Background: theme gradient (`GRAD`/`C` tokens from `src/theme.ts`)
   - Headline: same copy as the tab tour's per-tab pages (`src/lib/tourPages.ts` — e.g. "Sessions" / "Plan practice, track attendance, run drills.")
   - Fonts: Russo One for headline (`F.display`), Chakra Petch for body (`F.body`) — matches app branding
   - Device frame around the raw screenshot (simple rounded-rect bezel, not a literal phone-shell asset — no new asset dependency)
4. **Export** each composited page as a PNG via the Browser pane's screenshot tool.

## Output

5 PNG files at 1080×1920, saved to `store-assets/screenshots/01-home.png` … `05-profile.png`. Ready to upload directly to Play Console.

## Tooling

- No new npm dependency. Compositing uses the Browser pane (already available in this session) to render/screenshot an HTML page — same technique as any static mockup.
- Raw captures use mobile-mcp against the already-connected device.

## Out of scope

- iOS App Store screenshots
- Feature graphic, app icon, promo video
- Localized copy variants
- Automating this as a repeatable script/CI step — one-off manual run for this listing

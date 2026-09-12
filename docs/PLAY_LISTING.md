# Play Console — Internal Testing Setup Notes

Answers/declarations for CourtSide's first Play Console upload. These reflect the
current **offline-only** build (no accounts, no data leaves the device). Revisit
all of this if/when Supabase accounts + cloud sync are enabled.

App package: `com.navalo.courtside`

---

## App content → Data safety

**Does your app collect or share any of the required user data types?** → **No**

- Data collected: **None**
- Data shared: **None**
- Is all user data encrypted in transit? → N/A (no data is transmitted)
- Do you provide a way for users to request that their data be deleted? →
  Data is stored only on the device and is removed on uninstall (state this in
  the notes field).

> If cloud sync/accounts ship later, this becomes: collects Email address +
> "App activity/other" (matches), used for App functionality, linked to the user,
> encrypted in transit, deletable via account.

## App content → Privacy policy

Provide a public URL to `docs/PRIVACY.md`. Options once the repo is on GitHub:
- Enable **GitHub Pages** and link the rendered page, or
- Use the raw file URL:
  `https://raw.githubusercontent.com/<you>/<repo>/master/docs/PRIVACY.md`

## App content → Content rating (IARC questionnaire)

- Category: **Utility / Reference / Other** (or Sports)
- Violence / sexual / language / controlled substances: **No** to all
- User-generated content shared with others: **No** (data is local-only)
- Expected rating: **Everyone / PEGI 3**

## App content → Target audience and content

- Target age group: **13+** (not designed for children)
- Appeals to children: **No**

## App content → Ads

- Contains ads: **No**

## App content → Government apps / News / COVID

- **No** to all.

## App access

- All functionality is available **without** logging in (offline build).
- Select "All functionality is available without special access" — no test
  credentials needed.

## Store listing essentials

- **App name:** CourtSide: Badminton Scorer
- **Short description (≤80 chars):**
  `Live badminton scoring, club sessions, and player stats — works offline.`
- **Full description (draft):**
  ```
  CourtSide is the badminton app for clubs, leagues, and casual players who
  want more than a paper scoresheet. Run your club sessions, score matches
  with real BWF rules, and see who's actually winning — all in one badminton
  scoring and club management app.

  LIVE MATCH SCORING
  • Full BWF rules — singles & doubles, best of 1/3/5
  • Automatic serve rotation and side-switching
  • Match history saved automatically, no scorebook needed

  CLUB SESSIONS
  • Plan sessions, check players in, track attendance
  • Auto-generate fair matchups so nobody sits out twice
  • Built for weekly club nights, drop-in play, and coaching groups

  TOURNAMENTS & BRACKETS
  • Run a tournament bracket for your club or league
  • Track standings and share results with players

  PLAYER STATS & RATINGS
  • Win %, form, best partner, and a player rating that updates as you play
  • See your improvement match over match

  WORKS OFFLINE
  • No account required, no signup wall
  • Full scoring and stats work without a connection — sync later if you want

  Whether you're running a badminton club, organizing a local tournament, or
  just keeping score with friends, CourtSide replaces the spreadsheet and the
  scorebook. Download CourtSide free and start your next match.
  ```
- **Graphics required by Play:** app icon (512×512), a feature graphic
  (1024×500), and at least 2 phone screenshots. (Icon exists; feature graphic +
  screenshots still to produce.)

## Release

- Testing → **Internal testing** → Create new release → upload the `.aab` from
  the EAS build → add tester emails → **Review release** → **Roll out**.
- Testers accept the invite link, then install via the Play Store.

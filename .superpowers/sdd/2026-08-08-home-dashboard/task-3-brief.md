### Task 3: Presentational components — `StatTile` and `NextSessionCard`

Both are dumb. They receive already-formatted strings from Task 2 and render
them. No data fetching, no formatting, no conditionals beyond styling.

**Files:**
- Create: `src/components/StatTile.tsx`
- Create: `src/components/NextSessionCard.tsx`

**Interfaces:**
- Consumes: `sessionMetaLabel` output as a plain string (Task 2); `C`, `F`, `press` from `src/theme`; `Icon` from `src/components/Icon`.
- Produces:
  - `<StatTile label: string; value: string; valueColor?: string />`
  - `<NextSessionCard title: string; meta: string; onPress: () => void />`

- [ ] **Step 1: Write `StatTile`**

Create `src/components/StatTile.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C, F } from "../theme";

/** One tile in the Recent Performance row. Value is pre-formatted by the caller. */
export default function StatTile({
  label, value, valueColor = C.text,
}: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={s.tile}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: C.card, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", gap: 6,
  },
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA.
  label: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3 },
  value: { fontSize: 22, fontFamily: F.display },
});
```

- [ ] **Step 2: Write `NextSessionCard`**

Create `src/components/NextSessionCard.tsx`:

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./Icon";
import { C, F, press } from "../theme";

/**
 * The upcoming-session card. Both strings are resolved by the caller — the club
 * name as title (ClubSession has no title field) and sessionMetaLabel() as meta.
 * The caller renders nothing at all when there is no upcoming session; this
 * component has no empty state of its own.
 */
export default function NextSessionCard({
  title, meta, onPress,
}: {
  title: string; meta: string; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && press]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next session: ${title}, ${meta}`}
    >
      <View style={s.iconWrap}>
        <Icon name="calendar" color={C.accent} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <Icon name="chevron-forward" color={C.text2} size={20} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(34,211,238,0.12)", alignItems: "center", justifyContent: "center",
  },
  title: { color: C.text, fontSize: 16, fontFamily: F.bold },
  meta: { color: C.text2, fontSize: 13, fontFamily: F.body, marginTop: 2 },
});
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent. If `"calendar"` or `"chevron-forward"` is rejected, open
`src/components/Icon.tsx` and use the exact name from its union — both are
listed there today (`"calendar" | "calendar-outline"` at line 24, and
`chevron-forward` is already used by the club row in `app/(app)/index.tsx:153`).

- [ ] **Step 4: Run the suite to confirm nothing regressed**

```bash
npx jest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/StatTile.tsx src/components/NextSessionCard.tsx
git commit -m "feat(home): add StatTile and NextSessionCard components"
```

---


### Task 4: `ClubSheet` — create and join, moved off the home screen

The create/join forms currently live in the clubs-list footer specifically so
React Native scrolls the focused input into view — see the comment at
`app/(app)/index.tsx:69`, which notes a `KeyboardAvoidingView` was a no-op on
Android. Putting stats below the clubs list destroys that arrangement. A
`BottomPanel` sizes to its own content and handles the keyboard more directly.

The mutation bodies move over unchanged.

**Files:**
- Create: `src/components/ClubSheet.tsx`
- Reference (read, do not modify): `src/components/BottomPanel.tsx`, `app/(app)/index.tsx:40-66`

**Interfaces:**
- Consumes: `createClub`, `joinClub` from `src/repos/clubRepo`; `validateName` from `src/lib/validate`; `toast` from `src/lib/toast`; `BusyButton`, `Icon`, `BottomPanel`.
- Produces: `<ClubSheet visible: boolean; onClose: () => void; onChanged: () => void />` — `onChanged` fires after a successful create or join so the caller can reload.

- [ ] **Step 1: Write the component**

Create `src/components/ClubSheet.tsx`:

```tsx
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import BottomPanel from "./BottomPanel";
import BusyButton from "./BusyButton";
import Icon from "./Icon";
import { createClub, joinClub } from "../repos/clubRepo";
import { validateName } from "../lib/validate";
import { toast } from "../lib/toast";
import { C, F } from "../theme";

/**
 * Create-a-club and join-by-code, hosted in a BottomPanel. These forms used to
 * sit in the home screen's club-list footer for keyboard reasons; a panel sized
 * to its own content solves that more directly, and keeps home clean at every
 * club count.
 */
export default function ClubSheet({
  visible, onClose, onChanged,
}: {
  visible: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const nameError = validateName(name, "Club name");

  const onCreate = async () => {
    if (nameError) { toast(nameError, "error"); return; }
    setCreating(true);
    try {
      await createClub(name.trim());
      setName("");
      setNameTouched(false);
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message || "Could not create club", "error");
    } finally {
      setCreating(false);
    }
  };

  const onJoin = async () => {
    setJoining(true);
    try {
      await joinClub(inviteCode);
      setInviteCode("");
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message || "Could not join club", "error");
    } finally {
      setJoining(false);
    }
  };

  return (
    <BottomPanel visible={visible} title="Clubs" onClose={onClose}>
      <View style={s.group}>
        <Text style={s.groupLabel}>Create a club</Text>
        <View style={s.row}>
          <TextInput
            style={s.input} placeholder="New club name" placeholderTextColor={C.text2}
            value={name} onChangeText={setName} onBlur={() => setNameTouched(true)}
          />
          <BusyButton
            busy={creating} disabled={!!nameError}
            style={[s.btn, !!nameError && s.btnOff]} onPress={onCreate}
          >
            <Icon name="add" color={C.text} size={18} />
            <Text style={s.btnText}>Create</Text>
          </BusyButton>
        </View>
        {nameTouched && nameError ? <Text style={s.err}>{nameError}</Text> : null}
      </View>

      <View style={s.group}>
        <Text style={s.groupLabel}>Join with a code</Text>
        <View style={s.row}>
          <TextInput
            style={s.input} placeholder="Invite code" placeholderTextColor={C.text2}
            autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode}
          />
          <BusyButton
            busy={joining} disabled={!inviteCode.trim()}
            style={[s.btn, !inviteCode.trim() && s.btnOff]} onPress={onJoin}
          >
            <Text style={s.btnText}>Join</Text>
          </BusyButton>
        </View>
      </View>
    </BottomPanel>
  );
}

const s = StyleSheet.create({
  group: { gap: 8, marginBottom: 20 },
  groupLabel: { color: C.text2, fontSize: 13, fontFamily: F.medium, letterSpacing: 0.3 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 12,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, height: 48, fontSize: 16,
  },
  btn: {
    flexDirection: "row", gap: 4, backgroundColor: C.red, borderRadius: 12,
    paddingHorizontal: 16, height: 48, minWidth: 96, alignItems: "center", justifyContent: "center",
  },
  btnOff: { opacity: 0.5 },
  btnText: { color: C.text, fontSize: 16, fontWeight: "700" },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
});
```

- [ ] **Step 2: Confirm `BottomPanel`'s prop names before typechecking**

Open `src/components/BottomPanel.tsx` and confirm its signature is
`{ visible, title, onClose, children }`. If `title` is optional or named
differently, adjust the call above to match — do not change `BottomPanel`.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add src/components/ClubSheet.tsx
git commit -m "feat(home): add ClubSheet hosting create and join forms"
```

---


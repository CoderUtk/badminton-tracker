import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Sheet, { type SheetAction } from "./Sheet";
import { C, F } from "../theme";

/**
 * Header "⋮" that opens a Sheet of actions. Presentational only — callers own
 * the behaviour, including any confirmation step. Destructive actions render
 * red via Sheet's own `destructive` flag.
 *
 * The menu surface is Sheet rather than a bespoke popover so dismissal,
 * backdrop, and drag-to-close behave exactly like every other sheet in the app.
 */
export default function MenuButton({ actions }: { actions: SheetAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="More actions"
        hitSlop={12}
        style={{ paddingHorizontal: 12, paddingVertical: 4 }}
      >
        <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 22 }}>⋮</Text>
      </Pressable>
      <Sheet
        visible={open}
        title="Actions"
        actions={[
          // Close before running: the action usually opens a confirm sheet, and
          // two stacked sheets fight over the backdrop.
          ...actions.map((a) => ({
            ...a,
            onPress: () => { setOpen(false); a.onPress(); },
          })),
          { label: "Cancel", onPress: () => setOpen(false) },
        ]}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Club } from "../repos/clubRepo";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import { C } from "../theme";

/**
 * Where a finished match gets saved. "Personal" means no club — the old label
 * for this was "None", which read like the name of a club.
 */
export default function ClubPicker({
  clubs, clubId, onChange,
}: {
  clubs: Club[];
  clubId: string | null;
  onChange: (clubId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (clubs.length === 0) return null;

  const current = clubs.find((c) => c.id === clubId);
  const pick = (id: string | null) => { onChange(id); setOpen(false); };

  return (
    <>
      <PressableScale style={s.button} onPress={() => setOpen(true)} scaleTo={0.96}>
        <Icon name={current ? "account-group" : "person-outline"} color={C.text2} size={16} />
        <Text style={s.buttonText} numberOfLines={1}>{current?.name ?? "Personal"}</Text>
        <Icon name="chevron-down" color={C.text2} size={14} />
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.title}>Save this match to</Text>

            <Pressable style={[s.row, clubId === null && s.rowOn]} onPress={() => pick(null)}>
              <Icon name="person-outline" color={C.text} size={18} />
              <View style={s.rowText}>
                <Text style={s.rowTitle}>Personal</Text>
                <Text style={s.rowHint}>Not saved to a club</Text>
              </View>
              {clubId === null && <Icon name="checkmark-circle" color={C.red} size={18} />}
            </Pressable>

            {clubs.map((c) => (
              <Pressable
                key={c.id}
                style={[s.row, clubId === c.id && s.rowOn]}
                onPress={() => pick(c.id)}
              >
                <Icon name="account-group" color={C.text} size={18} />
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text>
                </View>
                {clubId === c.id && <Icon name="checkmark-circle" color={C.red} size={18} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  button: {
    flexDirection: "row", alignItems: "center", gap: 6,
    maxWidth: 170, minHeight: 44, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.line,
  },
  buttonText: { color: C.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 16, gap: 8,
  },
  title: { color: C.text2, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    minHeight: 52, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: C.bg,
  },
  rowOn: { borderWidth: 1, borderColor: C.red },
  rowText: { flex: 1 },
  rowTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  rowHint: { color: C.text2, fontSize: 12 },
});

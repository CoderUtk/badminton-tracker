import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Icon from "./Icon";
import { getMyUpiId, setMyUpiId } from "../repos/payeeRepo";
import { toast } from "../lib/toast";
import { C, F, MIN_TOUCH, radius } from "../theme";

/**
 * Publish a UPI ID so the people you front court money for can pay you back in
 * one tap.
 *
 * Opt-in and reversible: with no handle set, the pay button simply never
 * appears and everyone settles the way they did before. Clearing the field
 * deletes the row.
 *
 * The handle is never shown to anyone else's client directly — see
 * payeeRepo for why it does not live on `profiles`.
 */
export default function UpiHandleCard() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getMyUpiId().then((v) => {
      setSaved(v);
      setValue(v ?? "");
    });
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await setMyUpiId(value);
      const next = value.trim() || null;
      setSaved(next);
      setEditing(false);
      toast(next ? "UPI ID saved" : "UPI ID removed");
    } catch (e) {
      toast((e as Error).message || "Could not save that UPI ID", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Get paid back</Text>
          <Text style={s.sub}>
            {saved ? saved : "Add a UPI ID so players can settle their share in one tap."}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? "Edit UPI ID" : "Add UPI ID"}
          hitSlop={10}
          style={s.edit}
          onPress={() => { setValue(saved ?? ""); setEditing((e) => !e); }}
        >
          <Icon name={saved ? "create-outline" : "add"} color={C.text2} size={18} />
        </Pressable>
      </View>

      {editing && (
        <View style={s.form}>
          <TextInput
            style={s.input}
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="name@bank"
            placeholderTextColor={C.ghost}
            accessibilityLabel="Your UPI ID"
          />
          <Text style={s.hint}>Leave blank to remove it. UPI is India-only.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save UPI ID"
            style={[s.save, busy && s.saveOff]}
            disabled={busy}
            onPress={() => void save()}
          >
            <Text style={s.saveText}>{busy ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: radius.md, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: C.text, fontSize: 15, fontFamily: F.semibold },
  sub: { color: C.text2, fontSize: 12.5, marginTop: 2, fontFamily: F.body },
  edit: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  form: { gap: 8 },
  input: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, paddingHorizontal: 14,
    backgroundColor: C.bgElev, borderWidth: 1, borderColor: C.line,
    color: C.text, fontFamily: F.body, fontSize: 15,
  },
  hint: { color: C.text3, fontFamily: F.body, fontSize: 12 },
  save: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, alignItems: "center",
    justifyContent: "center", backgroundColor: C.red,
  },
  saveOff: { opacity: 0.6 },
  saveText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
});

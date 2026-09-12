import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import BottomPanel from "./BottomPanel";
import CarvedCard from "./CarvedCard";
import Chip from "./Chip";
import Icon from "./Icon";
import Stepper from "./Stepper";
import { formatMoney, parseMoney } from "../lib/money";
import { toast } from "../lib/toast";
import {
  setAttendanceSettled, setSessionCost, splitCost,
  type Attendance, type ClubSession,
} from "../repos/sessionRepo";
import { C, F, MIN_TOUCH, radius, space } from "../theme";

/**
 * The money panel for one session: what the night cost, the per-head share,
 * and who still owes the person who fronted it.
 *
 * Lives in its own component rather than inline in app/(app)/sessions/[id].tsx
 * because that screen is already at 491 lines against this project's 500-line
 * ceiling, and because the settle controls belong next to the amount they
 * settle rather than scattered through the attendance list.
 */
export default function SessionCost({
  session, attendance, canManage, onChanged,
}: {
  session: ClubSession;
  attendance: Attendance[];
  /** Session creator or club admin — the same gate the RPCs enforce server-side. */
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [shuttles, setShuttles] = useState(0);
  const [payer, setPayer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const split = splitCost(session, attendance);
  const checkedIn = attendance.filter((a) => a.status === "in");
  const payerName = split.paidBy
    ? attendance.find((a) => a.id === split.paidBy)?.name ?? null
    : null;

  const openEditor = () => {
    setAmount(split.totalCents ? String(split.totalCents / 100) : "");
    setShuttles(split.shuttles);
    setPayer(split.paidBy);
    setEditing(true);
  };

  const save = async () => {
    const totalCents = amount.trim() ? parseMoney(amount) : 0;
    if (totalCents === null) {
      toast("Enter a valid amount.", "error");
      return;
    }
    setSaving(true);
    try {
      await setSessionCost(session.id, { totalCents, shuttles, paidBy: payer });
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not save the cost", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleSettled = async (playerId: string, next: boolean) => {
    try {
      await setAttendanceSettled(session.id, playerId, next);
      await onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not update that share", "error");
    }
  };

  // Nothing recorded and nothing the viewer can do about it — stay out of the
  // way rather than showing an empty money card on every session.
  if (split.totalCents === 0 && !canManage) return null;

  return (
    <>
      <CarvedCard style={s.card}>
        <View style={s.head}>
          <Icon name="wallet-outline" color={C.accent} size={18} />
          <Text style={s.headText}>Cost</Text>
          {canManage && (
            <Pressable accessibilityRole="button"
              style={s.edit}
              hitSlop={10}
              onPress={openEditor}
              accessibilityLabel={split.totalCents ? "Edit session cost" : "Add session cost"}
            >
              <Icon name={split.totalCents ? "create-outline" : "add"} color={C.text2} size={18} />
            </Pressable>
          )}
        </View>

        {split.totalCents === 0 ? (
          <Text style={s.empty}>No cost recorded. Add the court and shuttle total to split it.</Text>
        ) : split.headCount === 0 ? (
          <Text style={s.empty}>
            {formatMoney(split.totalCents)} total. Check players in to split it.
          </Text>
        ) : (
          <>
            <View style={s.headline}>
              <Text style={s.perHead}>{formatMoney(Math.floor(split.totalCents / split.headCount))}</Text>
              <Text style={s.perHeadLabel}>each</Text>
            </View>
            <Text style={s.meta}>
              {formatMoney(split.totalCents)} total · {split.headCount} in
              {split.shuttles > 0 ? ` · ${split.shuttles} shuttle${split.shuttles === 1 ? "" : "s"}` : ""}
            </Text>
            {payerName && <Text style={s.meta}>Paid by {payerName}</Text>}

            <View style={s.shares}>
              {split.shares.map((share) => (
                <Pressable
                  key={share.playerId}
                  style={s.shareRow}
                  disabled={!canManage || share.isPayer}
                  onPress={() => void toggleSettled(share.playerId, !share.settled)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: share.settled, disabled: !canManage || share.isPayer }}
                  accessibilityLabel={`${share.name} owes ${formatMoney(share.cents)}${share.settled ? ", settled" : ", not settled"}`}
                >
                  <Icon
                    name={share.settled ? "checkmark-circle" : "ellipse"}
                    color={share.settled ? C.green : C.ghost}
                    size={18}
                  />
                  <Text style={[s.shareName, share.settled && s.shareNameOff]} numberOfLines={1}>
                    {share.name}{share.isPayer ? " · paid" : ""}
                  </Text>
                  <Text style={[s.shareAmt, share.settled && s.shareNameOff]}>
                    {formatMoney(share.cents)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.outstanding, split.outstandingCents === 0 && s.allSettled]}>
              {split.outstandingCents === 0
                ? "All settled"
                : `${formatMoney(split.outstandingCents)} outstanding`}
            </Text>
          </>
        )}
      </CarvedCard>

      {editing && (
        <BottomPanel visible title="Session cost" onClose={() => setEditing(false)}>
          <View style={s.form}>
            <Text style={s.label}>Total for the night</Text>
            <TextInput
              style={s.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={C.ghost}
              accessibilityLabel="Total cost for the night"
            />
            <Text style={s.hint}>Court hire plus shuttles. Leave blank to clear.</Text>

            <Text style={s.label}>Shuttles used</Text>
            <Stepper value={shuttles} min={0} max={500} onChange={setShuttles} />

            <Text style={s.label}>Who paid?</Text>
            {checkedIn.length === 0 ? (
              <Text style={s.hint}>Check someone in first.</Text>
            ) : (
              <View style={s.payers}>
                {checkedIn.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    isSelected={payer === p.id}
                    onPress={() => setPayer(payer === p.id ? null : p.id)}
                  />
                ))}
              </View>
            )}

            <Pressable accessibilityRole="button"
              style={[s.save, saving && s.saveOff]}
              disabled={saving}
              onPress={() => void save()}
              accessibilityLabel="Save session cost"
            >
              <Text style={s.saveText}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>
        </BottomPanel>
      )}
    </>
  );
}

const s = StyleSheet.create({
  card: { padding: space.md, gap: space.sm, marginTop: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headText: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 13, letterSpacing: 1 },
  edit: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  empty: { color: C.text3, fontFamily: F.body, fontSize: 13 },
  headline: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  perHead: { color: C.accent, fontFamily: F.display, fontSize: 34 },
  perHeadLabel: { color: C.text2, fontFamily: F.body, fontSize: 13 },
  meta: { color: C.text2, fontFamily: F.body, fontSize: 12 },
  shares: { gap: 2, marginTop: space.sm },
  shareRow: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    minHeight: MIN_TOUCH, paddingHorizontal: space.xs,
  },
  shareName: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14 },
  shareNameOff: { color: C.text3 },
  shareAmt: { color: C.text, fontFamily: F.medium, fontSize: 14 },
  outstanding: { color: C.amber, fontFamily: F.semibold, fontSize: 13 },
  allSettled: { color: C.green },
  form: { gap: space.sm, paddingBottom: space.md },
  label: { color: C.text2, fontFamily: F.semibold, fontSize: 12, letterSpacing: 1, marginTop: space.sm },
  input: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, paddingHorizontal: space.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    color: C.text, fontFamily: F.display, fontSize: 22,
  },
  hint: { color: C.text3, fontFamily: F.body, fontSize: 12 },
  payers: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  save: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: C.red, marginTop: space.md,
  },
  saveOff: { opacity: 0.6 },
  saveText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
});

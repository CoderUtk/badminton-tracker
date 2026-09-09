import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import BottomPanel from "./BottomPanel";
import CarvedCard from "./CarvedCard";
import Chip from "./Chip";
import Icon from "./Icon";
import Stepper from "./Stepper";
import { buildSessionJoinPath } from "../lib/joinLink";
import { shareJoinLink } from "../lib/shareJoin";
import { setSessionOpenJoin } from "../repos/openSessionRepo";
import { openJoinArgs } from "../session/openJoin";
import { type ClubSession } from "../repos/sessionRepo";
import { toast } from "../lib/toast";
import { C, F, MIN_TOUCH, radius, space } from "../theme";

/**
 * Organiser controls for opening a session to anyone holding the link: toggle,
 * player cap, and the share action. Modelled on SessionCost — same CarvedCard
 * shell, same BottomPanel editor, same toast-on-failure handling.
 *
 * set_session_open_join(p_session_id, p_open, p_max_players) writes both
 * columns unconditionally, so a null p_max_players CLEARS an existing cap.
 * Both calls below go through openJoinArgs (src/session/openJoin.ts), which
 * carries session.max_players through instead of relying on null-by-omission
 * — most importantly on close, where dropping the cap would silently wipe
 * the organiser's setting until they set it again. See tests/openJoinArgs.test.ts.
 */
export default function SessionOpenJoin({
  session, canManage, onChanged,
}: {
  session: ClubSession;
  canManage: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [capValue, setCapValue] = useState(12);
  const [noLimit, setNoLimit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Nothing to show and nothing the viewer can do about it.
  if (!canManage && !session.open_join) return null;

  const venueLabel = session.location || "this session";

  const toggleOpen = async () => {
    setToggling(true);
    try {
      await setSessionOpenJoin(session.id, openJoinArgs(session, { open: !session.open_join }));
      await onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not update the join link", "error");
    } finally {
      setToggling(false);
    }
  };

  const openEditor = () => {
    setCapValue(session.max_players ?? 12);
    setNoLimit(session.max_players === null);
    setEditing(true);
  };

  const saveCap = async () => {
    setSaving(true);
    try {
      await setSessionOpenJoin(session.id, openJoinArgs(session, { open: true, maxPlayers: noLimit ? null : capValue }));
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not save the player cap", "error");
    } finally {
      setSaving(false);
    }
  };

  const onShare = () =>
    void shareJoinLink(buildSessionJoinPath(session.id), `invited you to play in "${venueLabel}"`);

  return (
    <>
      <CarvedCard style={s.card}>
        <View style={s.head}>
          <Icon name={session.open_join ? "share-social-outline" : "lock-closed-outline"} color={C.accent} size={18} />
          <Text style={s.headText}>LINK</Text>
          {canManage && session.open_join && (
            <Pressable
              style={s.edit}
              hitSlop={10}
              onPress={openEditor}
              accessibilityLabel="Edit player cap"
            >
              <Icon name="create-outline" color={C.text2} size={18} />
            </Pressable>
          )}
        </View>

        {session.open_join && (
          <>
            <Text style={s.state}>OPEN</Text>
            <Text style={s.meta}>{session.max_players ? `Limit ${session.max_players}` : "No limit"}</Text>
            <Pressable
              style={s.shareBtn}
              onPress={onShare}
              accessibilityLabel={`Share the join link for ${venueLabel}`}
            >
              <Icon name="share-social-outline" color={C.text} size={17} />
              <Text style={s.shareText}>Share link</Text>
            </Pressable>
          </>
        )}

        {canManage && (
          <Pressable
            style={[s.toggleRow, toggling && s.toggleOff]}
            disabled={toggling}
            onPress={() => void toggleOpen()}
            accessibilityRole="switch"
            accessibilityState={{ checked: session.open_join, disabled: toggling }}
            accessibilityLabel={session.open_join ? "Close the join link" : "Open to anyone with the link"}
          >
            <Icon name={session.open_join ? "lock-closed-outline" : "share-social-outline"} color={C.text2} size={17} />
            <Text style={s.toggleText}>{session.open_join ? "Close link" : "Open to anyone with the link"}</Text>
          </Pressable>
        )}
      </CarvedCard>

      {editing && (
        <BottomPanel visible title="Player cap" onClose={() => setEditing(false)}>
          <View style={s.form}>
            <Text style={s.label}>Limit players</Text>
            <View style={noLimit && s.dimmed}>
              <Stepper value={capValue} min={1} max={100} onChange={setCapValue} />
            </View>
            <View style={s.noLimitRow}>
              <Chip label="No limit" isSelected={noLimit} onPress={() => setNoLimit(!noLimit)} />
            </View>

            <Pressable
              style={[s.save, saving && s.saveOff]}
              disabled={saving}
              onPress={() => void saveCap()}
              accessibilityLabel="Save player cap"
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
  state: { color: C.green, fontFamily: F.semibold, fontSize: 13, letterSpacing: 1 },
  meta: { color: C.text2, fontFamily: F.body, fontSize: 12 },
  shareBtn: {
    flexDirection: "row", gap: space.sm, minHeight: MIN_TOUCH, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line,
  },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 14 },
  toggleRow: {
    flexDirection: "row", gap: space.sm, minHeight: MIN_TOUCH, alignItems: "center",
    paddingHorizontal: space.xs,
  },
  toggleOff: { opacity: 0.6 },
  toggleText: { color: C.text2, fontFamily: F.medium, fontSize: 14 },
  form: { gap: space.sm, paddingBottom: space.md },
  label: { color: C.text2, fontFamily: F.semibold, fontSize: 12, letterSpacing: 1, marginTop: space.sm },
  dimmed: { opacity: 0.4 },
  noLimitRow: { flexDirection: "row", marginTop: space.xs },
  save: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: C.red, marginTop: space.md,
  },
  saveOff: { opacity: 0.6 },
  saveText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
});

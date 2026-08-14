import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../../src/lib/supabase";
import { useSession } from "../../../src/stores/session";
import { getMyProfile, setDisplayName as saveProfileName, setProfileDetails, setUsername as saveProfileUsername, uploadAvatar, removeAvatar, type Hand } from "../../../src/repos/profileRepo";
import SegmentedControl from "../../../src/components/SegmentedControl";
import { validateName, validateUsername } from "../../../src/lib/validate";
import { toast } from "../../../src/lib/toast";
import { formatWinRate } from "../../../src/lib/winRate";
import { getPlayerAnalytics, type PlayerAnalytics } from "../../../src/repos/statsRepo";
import Icon from "../../../src/components/Icon";
import FormScreen from "../../../src/components/FormScreen";
import BadgeGrid from "../../../src/components/BadgeGrid";
import BadgeSharePopup from "../../../src/components/BadgeSharePopup";
import type { EarnedBadge } from "../../../src/achievements/types";
import Sheet from "../../../src/components/Sheet";
import { evaluateBadges } from "../../../src/achievements/rules";
import { getSetting, setSetting, REMINDERS_KEY } from "../../../src/repos/settingsRepo";
import { scheduleInactivityReminder, syncSessionReminders, cancelReminders } from "../../../src/lib/reminders";
import { registerPushToken, unregisterPushToken } from "../../../src/lib/push";
import { notificationsBlocked } from "../../../src/lib/notificationPermission";
import { C, F, glow } from "../../../src/theme";
import { useScreenInsets } from "../../../src/hooks/useScreenInsets";

export default function Profile() {
  const { session } = useSession();
  const router = useRouter();

  const [a, setA] = useState<PlayerAnalytics | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [savedName, setSavedName] = useState<string>("");
  const [remindersOn, setRemindersOn] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  const [hand, setHand] = useState<Hand>("right");
  const [savedAge, setSavedAge] = useState<number | null>(null);
  const [savedHand, setSavedHand] = useState<Hand>("right");
  const [ageDraft, setAgeDraft] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [usernameDraft, setUsernameDraft] = useState<string>("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<EarnedBadge | null>(null);

  useEffect(() => {
    void getMyProfile().then((p) => {
      const name = p?.displayName ?? "";
      setDisplayName(name);
      setSavedName(name);
      setAge(p?.age ?? null);
      setSavedAge(p?.age ?? null);
      setHand(p?.hand ?? "right");
      setSavedHand(p?.hand ?? "right");
      setAvatarUrl(p?.avatarUrl ?? null);
      setUsername(p?.username ?? "");
    });
  }, []);

  useEffect(() => {
    void getSetting(REMINDERS_KEY).then((v) => setRemindersOn(v === "1"));
  }, []);

  const toggleReminders = async () => {
    if (remindersBusy) return;
    const next = !remindersOn;
    setRemindersBusy(true);
    setRemindersOn(next);
    try {
      await setSetting(REMINDERS_KEY, next ? "1" : "0");
      if (next) {
        const scheduled = await scheduleInactivityReminder();
        if (!scheduled) {
          setRemindersOn(false);
          await setSetting(REMINDERS_KEY, "0");
          // Two different dead ends: the OS dialog was shown and declined
          // (tapping again re-prompts), or the OS refuses to prompt at all,
          // in which case only system settings can turn this back on.
          if (await notificationsBlocked()) {
            Alert.alert(
              "Notifications are blocked",
              "Your phone won't show the permission prompt again. Turn notifications on in system settings to get reminders.",
              [
                { text: "Not now", style: "cancel" },
                { text: "Open settings", onPress: () => void Linking.openSettings() },
              ]
            );
          } else {
            toast("Notifications are off — tap again to allow", "error");
          }
          return;
        }
        await syncSessionReminders();
        void registerPushToken();
      } else {
        await cancelReminders();
        void unregisterPushToken();
      }
    } finally {
      setRemindersBusy(false);
    }
  };

  const nameError = validateName(displayName, "Display name", { requireLetter: true });

  const saveDisplayName = () => {
    const v = displayName.trim();
    if (nameError) { toast(nameError, "error"); return; }
    setEditingName(false);
    // `me` derives from savedName and keys every analytics query, so a no-op
    // rename must not trigger a write and a reload.
    if (v === savedName) return;
    void saveProfileName(v)
      .then(() => { setSavedName(v); toast("Name updated", "success"); })
      .catch((e: Error) => toast(e.message || "Could not save your name", "error"));
  };

  // Abandoning the edit must not leave the draft in the field — the hero reads
  // savedName, but the input is bound to displayName.
  const cancelNameEdit = () => { setDisplayName(savedName); setEditingName(false); };

  const usernameError = validateUsername(usernameDraft);

  const openUsernameEdit = useCallback(() => {
    setUsernameDraft(username);
    setEditingUsername(true);
  }, [username]);

  const cancelUsernameEdit = useCallback(() => {
    setEditingUsername(false);
    setUsernameDraft(username);
  }, [username]);

  const saveUsername = useCallback(() => {
    const v = usernameDraft.trim().toLowerCase();
    if (usernameError) { toast(usernameError, "error"); return; }
    if (v === username) { setEditingUsername(false); return; }
    setUsernameBusy(true);
    saveProfileUsername(v)
      .then((saved) => {
        setUsername(saved);
        setEditingUsername(false);
        toast("Username updated", "success");
      })
      .catch((e: Error) => toast(e.message || "Could not save your username", "error"))
      .finally(() => setUsernameBusy(false));
  }, [usernameDraft, usernameError, username]);

  const openDetailsEdit = () => {
    setAge(savedAge);
    setHand(savedHand);
    setAgeDraft(savedAge != null ? String(savedAge) : "");
    setEditingDetails(true);
  };
  const cancelDetailsEdit = () => { setAge(savedAge); setHand(savedHand); setEditingDetails(false); };
  const saveDetails = () => {
    const trimmed = ageDraft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 5 || parsed > 100)) {
      toast("Enter an age between 5 and 100, or leave it blank", "error");
      return;
    }
    setEditingDetails(false);
    if (parsed === savedAge && hand === savedHand) return;
    void setProfileDetails(parsed, hand)
      .then(() => { setSavedAge(parsed); setSavedHand(hand); setAge(parsed); toast("Details updated", "success"); })
      .catch((e: Error) => toast(e.message || "Could not save your details", "error"));
  };

  const pickAndUpload = async (source: "camera" | "library") => {
    setAvatarSheetOpen(false);
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast(`Enable ${source === "camera" ? "camera" : "photo"} access in Settings to add a picture`, "error");
      return;
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;

    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(result.assets[0].uri);
      setAvatarUrl(url);
      toast("Profile picture updated", "success");
    } catch (e) {
      toast((e as Error).message || "Could not upload that picture", "error");
    } finally {
      setAvatarBusy(false);
    }
  };

  const doRemoveAvatar = async () => {
    setConfirmingRemove(false);
    setAvatarBusy(true);
    try {
      await removeAvatar();
      setAvatarUrl(null);
      toast("Profile picture removed", "success");
    } catch (e) {
      toast((e as Error).message || "Could not remove your picture", "error");
    } finally {
      setAvatarBusy(false);
    }
  };

  // Stats/matches are keyed by the name recorded on club_players, which is the
  // profile's display name — not the raw auth metadata, which can diverge.
  const me = savedName || "Player";

  const load = useCallback(() => { void getPlayerAnalytics(me).then(setA); }, [me]);
  useFocusEffect(load);
  useEffect(load, [load]);

  const initial = me.slice(0, 1).toUpperCase();
  const badges = a ? evaluateBadges(a, { age, hand, avatarUrl }) : [];

  const { ctaPadding } = useScreenInsets();

  return (
    <>
    <FormScreen contentContainerStyle={[s.content, { paddingBottom: ctaPadding + 56 }]}>
      {/* Identity */}
      {/* Tap the name to edit it. The name is set once at signup and rarely
          changes, so a standing text field here just pushed the stats down. */}
      <View style={s.hero}>
        <Pressable
          style={s.avatar}
          disabled={avatarBusy}
          onPress={() => setAvatarSheetOpen(true)}
          accessibilityLabel="Change profile picture"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
          ) : (
            <Text style={s.avatarText}>{initial}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => { setDisplayName(savedName); setEditingName(true); }}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
          accessibilityLabel="Edit display name"
        >
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">{me}</Text>
            <Text style={s.sub}>{session?.user.email ?? ""}</Text>
          </View>
          <Icon name="create-outline" color={C.text2} size={18} />
        </Pressable>
        <Icon name="badminton" color={C.red} size={30} />
      </View>

      <Modal visible={editingName} transparent animationType="fade" onRequestClose={cancelNameEdit}>
        <Pressable style={s.modalBack} onPress={cancelNameEdit}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.cardTitle}>Display name</Text>
            <TextInput
              style={s.nameInput}
              placeholder="Your name"
              placeholderTextColor={C.text2}
              value={displayName}
              onChangeText={setDisplayName}
              onSubmitEditing={saveDisplayName}
              returnKeyType="done"
              autoFocus
              maxLength={60}
            />
            {nameError ? <Text style={s.err}>{nameError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable style={[s.modalBtn, s.modalCancel]} onPress={cancelNameEdit}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.modalBtn, s.modalSave, !!nameError && { opacity: 0.5 }]} disabled={!!nameError} onPress={saveDisplayName}>
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Username: the account's global handle. Public by design — the helper
          text in the editor is the whole expectation-setting mechanism, since
          nothing can search for it yet. */}
      <Pressable style={s.detailsCard} onPress={openUsernameEdit} accessibilityLabel="Edit username">
        <Icon name="person-outline" color={C.text2} size={16} />
        <Text style={s.detailsText}>{username ? `@${username}` : "Username unavailable — check your connection"}</Text>
        <Icon name="create-outline" color={C.text2} size={15} />
      </Pressable>

      <Modal visible={editingUsername} transparent animationType="fade" onRequestClose={cancelUsernameEdit}>
        <Pressable style={s.modalBack} onPress={cancelUsernameEdit}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.cardTitle}>Username</Text>
            <TextInput
              style={s.nameInput}
              placeholder="yourname"
              placeholderTextColor={C.text2}
              value={usernameDraft}
              onChangeText={(t) => setUsernameDraft(t.toLowerCase())}
              onSubmitEditing={saveUsername}
              returnKeyType="done"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            <Text style={s.usernameHint}>Your username is public. Other players can find you by it.</Text>
            {usernameError ? <Text style={s.err}>{usernameError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable style={[s.modalBtn, s.modalCancel]} onPress={cancelUsernameEdit}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalBtn, s.modalSave, (!!usernameError || usernameBusy) && { opacity: 0.5 }]}
                disabled={!!usernameError || usernameBusy}
                onPress={saveUsername}
              >
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Player details: age and playing hand, editable after onboarding */}
      <Pressable style={s.detailsCard} onPress={openDetailsEdit} accessibilityLabel="Edit player details">
        <Icon name="hand-left-outline" color={C.text2} size={16} />
        <Text style={s.detailsText}>
          {savedAge != null ? `${savedAge} yrs` : "Age not set"} · {savedHand === "left" ? "Left-handed" : "Right-handed"}
        </Text>
        <Icon name="create-outline" color={C.text2} size={15} />
      </Pressable>

      <Modal visible={editingDetails} transparent animationType="fade" onRequestClose={cancelDetailsEdit}>
        <Pressable style={s.modalBack} onPress={cancelDetailsEdit}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.cardTitle}>Player details</Text>
            <Text style={s.fieldLabel}>Age</Text>
            <TextInput
              style={s.nameInput}
              placeholder="Optional"
              placeholderTextColor={C.text2}
              value={ageDraft}
              onChangeText={setAgeDraft}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={s.fieldLabel}>Playing hand</Text>
            <SegmentedControl
              options={[
                { label: "Left", value: "left" as Hand },
                { label: "Right", value: "right" as Hand },
              ]}
              value={hand}
              onChange={setHand}
              role="radio"
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable style={[s.modalBtn, s.modalCancel]} onPress={cancelDetailsEdit}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.modalBtn, s.modalSave]} onPress={saveDetails}>
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Pressable style={s.card} onPress={() => router.push("/profile/friends")}>
        <View style={s.reminderRow}>
          <Icon name="people-outline" color={C.red} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Friends</Text>
            <Text style={s.reminderSub}>Add players by username, manage requests.</Text>
          </View>
          <Icon name="chevron-forward" color={C.text2} size={20} />
        </View>
      </Pressable>

      {/* Headline stats */}
      <View style={s.statGrid}>
        <Stat label="Played" value={a?.played ?? 0} />
        <Stat label="Won" value={a?.wins ?? 0} accent />
        <Stat label="Lost" value={a?.losses ?? 0} />
        <Stat label="Win %" value={formatWinRate(a?.played ?? 0, a?.winPct ?? 0)} accent />
      </View>

      {/* Achievements */}
      {a && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Achievements</Text>
          <BadgeGrid badges={badges} onPressBadge={setSelectedBadge} />
        </View>
      )}

      {a && a.played === 0 ? (
        <View style={s.emptyCard}>
          <Icon name="scoreboard-outline" color={C.text2} size={30} />
          <Text style={s.emptyText}>No completed matches for {me} yet.</Text>
          <Pressable style={s.startBtn} onPress={() => router.push("/new-match")}>
            <Icon name="play" color={C.text} size={16} />
            <Text style={s.startText}>Start a match</Text>
          </Pressable>
        </View>
      ) : (
        a && (
          <>
            {/* Recent form */}
            {a.form.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Recent form</Text>
                <View style={s.formRow}>
                  {a.form.map((r, i) => (
                    <View key={i} style={[s.formPill, r === "W" ? s.pillW : s.pillL]}>
                      <Text style={s.formPillText}>{r}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Secondary stats */}
            <View style={s.card}>
              <Row icon="scoreboard-outline" label="Games (W–L)" value={`${a.gamesWon}–${a.gamesLost}`} />
              <Row icon="trophy-outline" label="Points (for–against)" value={`${a.pointsFor}–${a.pointsAgainst}`} />
              {a.bestPartner && (
                <Row icon="account-group" label="Best partner" value={`${a.bestPartner.name} · ${a.bestPartner.wins}W`} />
              )}
              {a.toughestOpponent && (
                <Row icon="badminton" label="Toughest opponent" value={`${a.toughestOpponent.name} · ${a.toughestOpponent.losses}L`} last />
              )}
            </View>

            {/* Recent matches */}
            {a.recent.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Recent matches</Text>
                {a.recent.map((m) => (
                  <Pressable key={m.id} style={s.matchRow} onPress={() => router.push(`/matches/${m.id}`)}>
                    <View style={[s.resultBadge, m.result === "W" ? s.pillW : m.result === "L" ? s.pillL : s.pillN]}>
                      <Text style={[s.resultText, m.result === "—" && { color: C.text2 }]}>{m.result}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.matchOpp} numberOfLines={1}>
                        vs {m.opponents}{m.partner ? `  ·  w/ ${m.partner}` : ""}
                      </Text>
                      <Text style={s.matchMeta}>{m.summary || "—"}</Text>
                    </View>
                    <Icon name="chevron-forward" color={C.text2} size={18} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )
      )}


      {/* Local inactivity reminders */}
      <View style={s.card}>
        <View style={s.reminderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Notifications</Text>
            <Text style={s.reminderSub}>Match reminders and requests</Text>
          </View>
          <Switch
            value={remindersOn}
            onValueChange={() => void toggleReminders()}
            disabled={remindersBusy}
            trackColor={{ false: C.line, true: C.red }}
            thumbColor={C.text}
            accessibilityLabel="Match reminders"
          />
        </View>
      </View>

      {session && (
        <Pressable
          style={s.signOut}
          onPress={() => {
            // Local reminders are cancelled too: their identifiers are
            // per-session and the SQLite cache is not cleared on sign-out, so
            // a leftover `session:<id>` would fire for the next account on
            // this device, for a session it has no access to.
            void Promise.all([unregisterPushToken(), cancelReminders()]).finally(() => {
              void supabase?.auth.signOut();
            });
          }}
        >
          <Icon name="log-out-outline" color={C.red} size={18} />
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      )}
    </FormScreen>
    <Sheet
      visible={avatarSheetOpen}
      title="Profile picture"
      actions={[
        { label: "Take photo", onPress: () => void pickAndUpload("camera") },
        { label: "Choose from library", onPress: () => void pickAndUpload("library") },
        ...(avatarUrl ? [{ label: "Remove photo", destructive: true, onPress: () => { setAvatarSheetOpen(false); setConfirmingRemove(true); } }] : []),
        { label: "Cancel", onPress: () => setAvatarSheetOpen(false) },
      ]}
      onClose={() => setAvatarSheetOpen(false)}
    />
    <Sheet
      visible={confirmingRemove}
      title="Remove profile picture?"
      message="You'll go back to the default initial-letter avatar."
      actions={[
        { label: "Remove", onPress: doRemoveAvatar, destructive: true },
        { label: "Cancel", onPress: () => setConfirmingRemove(false) },
      ]}
      onClose={() => setConfirmingRemove(false)}
    />
    <BadgeSharePopup
      badge={selectedBadge}
      playerName={me}
      onClose={() => setSelectedBadge(null)}
    />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statNum, accent && { color: C.red }]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, value, last }: { icon: React.ComponentProps<typeof Icon>["name"]; label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.infoRow, !last && s.infoDivider]}>
      <Icon name={icon} color={C.text2} size={18} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.red, alignItems: "center", justifyContent: "center", ...glow(C.red, 12, 0.4) },
  avatarText: { color: C.text, fontSize: 24, fontFamily: F.display },
  avatarImage: { width: 56, height: 56, borderRadius: 28 },
  usernameHint: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 2 },
  name: { color: C.text, fontSize: 22, fontFamily: F.display, letterSpacing: 0.5 },
  sub: { color: C.text2, fontSize: 13, marginTop: 2, fontFamily: F.body },
  statGrid: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: C.line },
  statNum: { color: C.text, fontSize: 24, fontFamily: F.display, fontVariant: ["tabular-nums"] },
  statLbl: { color: C.text2, fontSize: 11, fontFamily: F.medium, marginTop: 3, letterSpacing: 0.5 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 8 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  detailsCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, minHeight: 44 },
  detailsText: { flex: 1, color: C.text, fontSize: 13.5, fontWeight: "600" },
  fieldLabel: { color: C.text2, fontSize: 12, fontWeight: "700", marginTop: 2 },
  nameInput: { backgroundColor: C.bgElev, color: C.text, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
  modalBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.lineHi, padding: 18, gap: 10 },
  modalBtn: { flex: 1, borderRadius: 10, minHeight: 42, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  modalCancel: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  modalCancelText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  modalSave: { backgroundColor: C.red },
  modalSaveText: { color: C.text, fontFamily: F.semibold, fontSize: 14 },
  formRow: { flexDirection: "row", gap: 6 },
  formPill: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pillW: { backgroundColor: C.green },
  pillL: { backgroundColor: C.red },
  pillN: { backgroundColor: C.cardHi },
  formPillText: { color: C.bg, fontWeight: "900", fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  infoDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  infoLabel: { flex: 1, color: C.text2, fontSize: 14, fontWeight: "600" },
  infoValue: { color: C.text, fontSize: 15, fontWeight: "800" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  resultBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  resultText: { color: C.bg, fontWeight: "900", fontSize: 14 },
  matchOpp: { color: C.text, fontSize: 15, fontWeight: "700" },
  matchMeta: { color: C.text2, fontSize: 13, marginTop: 1, fontVariant: ["tabular-nums"] },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  reminderSub: { color: C.text2, fontSize: 12.5, marginTop: 2, fontFamily: F.body },
  off: { opacity: 0.45 },
  emptyCard: { backgroundColor: C.card, borderRadius: 14, padding: 22, alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.line },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center" },
  startBtn: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 20, minHeight: 46, alignItems: "center", justifyContent: "center" },
  startText: { color: C.text, fontWeight: "800", fontSize: 15 },
  signOut: { flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 4 },
  signOutText: { color: C.red, fontSize: 16, fontWeight: "700" },
});

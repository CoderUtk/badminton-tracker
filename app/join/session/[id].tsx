import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getSessionOpenPreview, joinOpenSession, leaveOpenSession,
} from "../../../src/repos/openSessionRepo";
import { joinEligibility, type SessionOpenPreview } from "../../../src/session/openJoin";
import { toast } from "../../../src/lib/toast";
import Icon from "../../../src/components/Icon";
import Logo from "../../../src/components/Logo";
import PressableScale from "../../../src/components/PressableScale";
import { C, F, glow } from "../../../src/theme";

export default function JoinSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<SessionOpenPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      setPreview(await getSessionOpenPreview(id));
    } catch (e) {
      toast((e as Error).message || "Could not load that session", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: (sessionId: string) => Promise<unknown>, fallback: string) => {
    if (!id || busy) return;          // busy guard: a double tap must not fire two joins
    setBusy(true);
    try {
      await fn(id);
      await load();                    // re-read rather than guess the new state
    } catch (e) {
      toast((e as Error).message || fallback, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  // A closed session and a nonexistent one are the same response by design —
  // session_open_preview returns no rows for both, so a revoked link cannot be
  // distinguished from one that never existed.
  if (!preview) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>This link is no longer active</Text>
        <Text style={s.sub}>Ask the organiser for a fresh one.</Text>
        <PressableScale
          style={s.ghost}
          accessibilityLabel="Back to CourtSide"
          onPress={() => router.replace("/")}
        >
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const eligibility = joinEligibility(preview);
  const joined = !eligibility.ok && eligibility.reason === "already-in";
  const when = new Date(preview.startsAt).toLocaleString([], {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const heads = preview.maxPlayers === null
    ? `${preview.checkedIn} in`
    : `${preview.checkedIn} of ${preview.maxPlayers} in`;

  return (
    <View style={s.center}>
      <Logo size={44} />
      {joined && <Icon name="checkmark-circle" color={C.green} size={32} />}
      <Text style={s.title}>{joined ? "You're in" : preview.clubName}</Text>
      <Text style={s.sub}>{preview.location || "Badminton session"}</Text>
      <Text style={s.sub}>{when}</Text>
      <Text style={s.heads}>{heads}</Text>

      {joined ? (
        <PressableScale
          style={s.ghost}
          disabled={busy}
          accessibilityLabel="Leave this session"
          onPress={() => void act(leaveOpenSession, "Could not leave the session")}
        >
          <Text style={s.ghostText}>{busy ? "Leaving…" : "Leave session"}</Text>
        </PressableScale>
      ) : (
        <>
          <PressableScale
            style={[s.cta, (!eligibility.ok || busy) && s.ctaOff]}
            disabled={!eligibility.ok || busy}
            accessibilityLabel="Join this session"
            onPress={() => void act(joinOpenSession, "Could not join the session")}
          >
            <Text style={s.ctaText}>{busy ? "Joining…" : "Join this session"}</Text>
          </PressableScale>
          {/* Never router.replace("/") on success — a non-member has nowhere to
              land, so this screen stays their view of the session. */}
          {!eligibility.ok && <Text style={s.blocked}>{eligibility.message}</Text>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: C.text, fontFamily: F.display, fontSize: 27, textAlign: "center", letterSpacing: 0.2 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
  heads: { color: C.accent, fontFamily: F.semibold, fontSize: 14 },
  cta: {
    backgroundColor: C.red, borderRadius: 14, minHeight: 54, minWidth: 220,
    alignItems: "center", justifyContent: "center", marginTop: 4,
    ...glow(C.red, 16, 0.45),
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  blocked: { color: C.amber, fontFamily: F.body, fontSize: 13, textAlign: "center" },
});

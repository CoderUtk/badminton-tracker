import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { getClubPreview, requestJoinClub, type ClubPreview, type RequestOutcome } from "../../../src/repos/membershipRepo";
import { toast } from "../../../src/lib/toast";
import FormScreen from "../../../src/components/FormScreen";
import Logo from "../../../src/components/Logo";
import PressableScale from "../../../src/components/PressableScale";
import { C, F, GRAD, glow } from "../../../src/theme";

export default function JoinClub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [club, setClub] = useState<ClubPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState<RequestOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getClubPreview(id)
      .then(setClub)
      .catch((e: Error) => toast(e.message || "Could not load that club", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  const onRequest = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const result = await requestJoinClub(id);
      setOutcome(result);
      if (result === "member") {
        toast("You are already a member", "info");
        router.replace("/");
      }
    } catch (e) {
      toast((e as Error).message || "Could not send the request", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.red} /></View>;
  }
  if (!club) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>Club not found</Text>
        <Text style={s.sub}>This link may be out of date. Ask for a fresh one.</Text>
        <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const decided = outcome === "pending" || outcome === "denied";

  return (
    <FormScreen contentContainerStyle={s.scroll}>
      <View style={s.hero}>
        <Logo size={52} />
        <Text style={s.eyebrow}>CLUB INVITATION</Text>
        <Text style={s.title}>{club.name}</Text>
        <Text style={s.sub}>
          {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
        </Text>
      </View>

      <View style={s.card}>
        {outcome === "pending" ? (
          <>
            <Text style={s.stateTitle}>Request sent</Text>
            <Text style={s.sub}>A club admin will review it. You will see the club once approved.</Text>
          </>
        ) : outcome === "denied" ? (
          <>
            <Text style={s.stateTitle}>Request declined</Text>
            <Text style={s.sub}>An admin declined this request. Ask them directly if you think that was a mistake.</Text>
          </>
        ) : (
          <>
            <Text style={s.sub}>Ask a club admin to let you in. They approve every request.</Text>
            <PressableScale style={[s.ctaWrap, busy && s.off]} disabled={busy} onPress={onRequest}>
              <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
                <Text style={s.ctaText}>{busy ? "SENDING…" : "REQUEST TO JOIN"}</Text>
              </LinearGradient>
            </PressableScale>
          </>
        )}
        {decided ? (
          <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
            <Text style={s.ghostText}>Back to CourtSide</Text>
          </PressableScale>
        ) : null}
      </View>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: C.bg },
  hero: { alignItems: "center", gap: 10 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  title: { color: C.text, fontFamily: F.display, fontSize: 27, textAlign: "center", letterSpacing: 0.2 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 20, gap: 12 },
  stateTitle: { color: C.text, fontFamily: F.display, fontSize: 19, textAlign: "center" },
  ctaWrap: { borderRadius: 14, marginTop: 4, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
});

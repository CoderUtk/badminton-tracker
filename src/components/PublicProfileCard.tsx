import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Icon from "./Icon";
import { getPublicProfileEnabled, setPublicProfile } from "../repos/publicProfileRepo";
import { joinLinkDisplayDomain, shareJoinLink } from "../lib/shareJoin";
import { toast } from "../lib/toast";
import { C, F, radius } from "../theme";

/**
 * Owner's switch for the public player page at /u/<username>.
 *
 * Off by default and off for everyone until they turn it on here — 0052 ships
 * the column defaulting to false, so enabling the feature publishes nobody.
 * The copy states exactly what becomes visible, because "make profile public"
 * on its own does not tell anyone what they are agreeing to.
 */
export default function PublicProfileCard({ username }: { username: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const domain = joinLinkDisplayDomain();

  useEffect(() => {
    void getPublicProfileEnabled().then(setOn);
  }, []);

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setBusy(true);
    setOn(next); // optimistic; reverted below if the RPC refuses
    try {
      await setPublicProfile(next);
    } catch (e) {
      setOn(!next);
      toast((e as Error).message || "Could not change that", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Public profile</Text>
          <Text style={s.sub}>
            {on && domain
              ? `${domain}/u/${username}`
              : "Let anyone see your record and club ratings at a shareable link. Nothing else is published."}
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={() => void toggle()}
          disabled={busy || !username}
          trackColor={{ false: C.line, true: C.red }}
          thumbColor={C.text}
          accessibilityLabel="Public profile"
        />
      </View>

      {on && username && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share my profile link"
          style={s.share}
          onPress={() => void shareJoinLink(`u/${username}`, "shared their CourtSide profile")}
        >
          <Icon name="share-social-outline" color={C.text2} size={17} />
          <Text style={s.shareText}>Share my profile</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: radius.md, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: C.text, fontSize: 15, fontFamily: F.semibold },
  sub: { color: C.text2, fontSize: 12.5, marginTop: 2, fontFamily: F.body, lineHeight: 17 },
  share: {
    flexDirection: "row", gap: 8, minHeight: 48, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.line,
  },
  shareText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
});

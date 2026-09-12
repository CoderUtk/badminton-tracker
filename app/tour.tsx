import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle,
  useReducedMotion, useSharedValue, type SharedValue,
} from "react-native-reanimated";
import Icon from "../src/components/Icon";
import Logo from "../src/components/Logo";
import PressableScale from "../src/components/PressableScale";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
import { setSeenTabTour } from "../src/lib/tabTour";
import { TOUR_PAGES, type TourPage } from "../src/lib/tourPages";
import { C, F, GRAD, glow, radius, space } from "../src/theme";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

function TourPageView({
  page, index, scrollX, width, reduced,
}: {
  page: TourPage; index: number; scrollX: SharedValue<number>; width: number; reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [{ translateY: 0 }] };
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(scrollX.value, input, [16, 0, 16], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[s.page, { width }]}>
      <Animated.View style={[s.pageContent, style]}>
        {page.icon ? (
          <View style={[s.iconRing, glow(C.accent, 20, 0.4)]}>
            <Icon name={page.icon} size={48} color={C.accent} />
          </View>
        ) : (
          <Logo size={56} showWordmark={false} />
        )}
        <Text style={s.headline}>{page.headline}</Text>
        <Text style={s.body}>{page.body}</Text>
      </Animated.View>
    </View>
  );
}

export default function Tour() {
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const { width } = useWindowDimensions();
  const { top, ctaPadding } = useScreenInsets();
  const reduced = useReducedMotion();

  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const scrollRef = React.useRef<ScrollView>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const finish = async () => {
    await setSeenTabTour();
    router.replace((target ?? "/") as never);
  };

  const goNext = () => {
    if (index >= TOUR_PAGES.length - 1) { void finish(); return; }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  const isLast = index === TOUR_PAGES.length - 1;

  return (
    <View style={s.root}>
      {!isLast && (
        <Pressable accessibilityRole="button" style={[s.skip, { top: top + space.md }]} onPress={() => void finish()} hitSlop={12}>
          <Text style={s.skipText}>Skip</Text>
        </Pressable>
      )}

      <AnimatedScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {TOUR_PAGES.map((page, i) => (
          <TourPageView key={page.key} page={page} index={i} scrollX={scrollX} width={width} reduced={reduced} />
        ))}
      </AnimatedScrollView>

      <View style={s.dots}>
        {TOUR_PAGES.map((page, i) => (
          <View key={page.key} style={[s.dot, i === index && s.dotOn]} />
        ))}
      </View>

      <View style={{ paddingBottom: ctaPadding, paddingHorizontal: space.lg }}>
        <PressableScale accessibilityRole="button" style={[s.ctaWrap]} onPress={goNext}>
          <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
            <Text style={s.ctaText}>{isLast ? "GET STARTED" : "NEXT"}</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  skip: { position: "absolute", right: space.lg, zIndex: 10 },
  skipText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  page: { alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  pageContent: { alignItems: "center", gap: space.md },
  iconRing: {
    width: 96, height: 96, borderRadius: radius.pill, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center",
  },
  headline: { color: C.text, fontFamily: F.display, fontSize: 24, letterSpacing: 0.5, textAlign: "center" },
  body: { color: C.text2, fontFamily: F.body, fontSize: 15, lineHeight: 22, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: space.xs, marginBottom: space.lg },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: C.line },
  dotOn: { backgroundColor: C.red, width: 18 },
  ctaWrap: { borderRadius: radius.lg, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: radius.lg, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type AnimatedListProps = {
  items?: string[];
  onItemSelect?: (item: string, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
  renderItem?: (item: string, index: number, selected: boolean) => React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  ListFooterComponent?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: boolean;
};

const AnimatedItem = ({
  children,
  onPress,
  selected,
}: {
  children: React.ReactNode;
  onPress: () => void;
  selected: boolean;
}) => {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={[
        styles.itemWrapper,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

const AnimatedList = ({
  items = [
    "Item 1",
    "Item 2",
    "Item 3",
    "Item 4",
    "Item 5",
    "Item 6",
    "Item 7",
    "Item 8",
    "Item 9",
    "Item 10",
    "Item 11",
    "Item 12",
    "Item 13",
    "Item 14",
    "Item 15",
  ],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  displayScrollbar = true,
  initialSelectedIndex = -1,
  renderItem,
  ListEmptyComponent,
  ListFooterComponent,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps,
}: AnimatedListProps) => {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const handleItemPress = useCallback(
    (item: string, index: number) => {
      setSelectedIndex(index);
      onItemSelect?.(item, index);
    },
    [onItemSelect]
  );

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const offsetY = contentOffset.y;
    setTopGradientOpacity(Math.min(offsetY / 50, 1));
    const bottomDistance = contentSize.height - (offsetY + layoutMeasurement.height);
    setBottomGradientOpacity(contentSize.height <= layoutMeasurement.height ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  return (
    <View style={[styles.container, style]}>
      <FlatList
        data={items}
        keyExtractor={(_, index) => String(index)}
        showsVerticalScrollIndicator={displayScrollbar}
        contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
        style={styles.list}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ? "handled" : "never"}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListEmptyComponent={
          <>
            {ListEmptyComponent ?? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No items yet.</Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={ListFooterComponent != null ? <>{ListFooterComponent}</> : undefined}
        renderItem={({ item, index }) => (
          <AnimatedItem onPress={() => handleItemPress(item, index)} selected={selectedIndex === index}>
            {renderItem ? (
              renderItem(item, index, selectedIndex === index)
            ) : (
              <View style={[styles.item, selectedIndex === index && styles.selectedItem]}>
                <Text style={styles.itemText}>{item}</Text>
              </View>
            )}
          </AnimatedItem>
        )}
      />
      {showGradients && (
        <>
          <LinearGradient
            colors={["rgba(12, 14, 18, 0.92)", "transparent"]}
            style={[styles.gradient, styles.topGradient, { opacity: topGradientOpacity }]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(12, 14, 18, 0.92)", "transparent"]}
            style={[styles.gradient, styles.bottomGradient, { opacity: bottomGradientOpacity }]}
            pointerEvents="none"
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, position: "relative" },
  list: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 24 },
  itemWrapper: { marginBottom: 16 },
  pressable: { borderRadius: 12, overflow: "hidden" },
  pressed: { opacity: 0.72 },
  item: {
    backgroundColor: "#2F293A",
    borderRadius: 12,
    padding: 16,
  },
  selectedItem: {
    borderColor: "#FF5C5B",
    borderWidth: 1,
  },
  itemText: { color: "#FFF", fontSize: 16 },
  emptyContainer: { paddingVertical: 24 },
  emptyText: { color: "#B8B8C7", fontSize: 15 },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 64,
  },
  topGradient: { top: 0 },
  bottomGradient: { bottom: 0 },
});

export default AnimatedList;

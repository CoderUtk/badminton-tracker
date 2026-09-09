import React from "react";
import { Linking, Pressable, Text, type StyleProp, type TextStyle } from "react-native";
import Icon from "./Icon";
import { C } from "../theme";

/**
 * A session's venue, tappable through to maps.
 *
 * The venue is searched by its free-text name rather than stored as
 * coordinates: a lat/lng column would mean adding a map picker to session
 * creation for a link that a plain search already resolves. The universal
 * `?api=1&query=` form hands off to the Maps app on Android, and to Maps or
 * the browser on iOS.
 */
export const mapsUrl = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

export default function SessionLocation({
  location, style,
}: {
  location: string | null;
  style?: StyleProp<TextStyle>;
}) {
  if (!location) return <Text style={style}>Badminton session</Text>;
  return (
    <Pressable
      onPress={() => void Linking.openURL(mapsUrl(location))}
      accessibilityRole="link"
      accessibilityLabel={`Open ${location} in maps`}
    >
      <Text style={style}>
        {location} <Icon name="location-outline" color={C.accent} size={18} />
      </Text>
    </Pressable>
  );
}

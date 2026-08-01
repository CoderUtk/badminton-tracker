import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

/** Capture a rendered card view to a PNG and hand it to the OS share sheet. */
export async function shareMatchCard(ref: RefObject<View | null>): Promise<void> {
  if (!ref.current) return;
  const uri = await captureRef(ref, { format: "png", quality: 1 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share match" });
  }
}

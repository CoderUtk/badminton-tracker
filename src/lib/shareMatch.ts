import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

/**
 * Capture a rendered card view to a PNG and hand it on.
 *
 * No resize options: every share card renders at CardShell's native
 * 1080x1920, which is Instagram's story size, so the capture is 1:1. Passing
 * width/height here would ask react-native-view-shot to rescale an image that
 * is already the right size, which it implements as a crop on some Android
 * versions.
 */
export async function shareMatchCard(ref: RefObject<View | null>): Promise<void> {
  if (!ref.current) return;
  const uri = await captureRef(ref, { format: "png", quality: 1 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share match" });
  }
}

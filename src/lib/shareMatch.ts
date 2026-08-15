import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

/**
 * Capture a rendered card view to a PNG and hand it to the OS share sheet.
 *
 * width/height force the 360×640 card up to Instagram's native story size.
 * Without them the capture matches the layout size and every upload gets
 * upscaled 3× by Instagram, which is what made the old card look soft.
 */
export async function shareMatchCard(ref: RefObject<View | null>): Promise<void> {
  if (!ref.current) return;
  const uri = await captureRef(ref, { format: "png", quality: 1, width: 1080, height: 1920 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share match" });
  }
}

import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { toast } from "../toast";
import { shareToInstagramStory } from "./shareToInstagramStory";

/**
 * width/height pin the capture to Instagram's native story size instead of
 * letting it fall out of the view's layout size. Without them a card laid out
 * smaller than 1080×1920 (ShareCard is 360×640) uploads soft, because
 * Instagram upscales it. Every card this is called with is 9:16, so pinning
 * both axes scales rather than distorts.
 */
export async function captureAndShare(viewRef: RefObject<View | null>): Promise<void> {
  try {
    const uri = await captureRef(viewRef, { format: "png", quality: 1, width: 1080, height: 1920 });
    await shareToInstagramStory(uri);
  } catch {
    toast("Couldn't create the share image", "error");
  }
}

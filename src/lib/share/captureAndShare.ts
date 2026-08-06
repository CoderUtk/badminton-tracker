import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { toast } from "../toast";
import { shareToInstagramStory } from "./shareToInstagramStory";

export async function captureAndShare(viewRef: RefObject<View | null>): Promise<void> {
  try {
    const uri = await captureRef(viewRef, { format: "png", quality: 1 });
    await shareToInstagramStory(uri);
  } catch {
    toast("Couldn't create the share image", "error");
  }
}

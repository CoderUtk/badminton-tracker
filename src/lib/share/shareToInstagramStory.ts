import Share, { Social } from "react-native-share";
import * as Sharing from "expo-sharing";

/**
 * Uses react-native-share's native Instagram Stories intent on both
 * platforms (it handles the iOS UIPasteboard item dictionary and the
 * Android FileProvider content:// intent internally — neither is reachable
 * from pure JS/Expo APIs). Falls back to the generic OS share sheet on any
 * failure: Instagram not installed, the user cancels, or a native error.
 */
export async function shareToInstagramStory(uri: string): Promise<void> {
  try {
    await Share.shareSingle({
      social: Social.InstagramStories,
      backgroundImage: uri,
      appId: "", // no interactive stickers/deep-link-back used, so no Facebook App ID is required
    });
    return;
  } catch {
    // Instagram unavailable, share sheet dismissed, or a native error — fall through.
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}

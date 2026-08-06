import * as Sharing from "expo-sharing";

/**
 * Uses react-native-share's native Instagram Stories intent on both
 * platforms (it handles the iOS UIPasteboard item dictionary and the
 * Android FileProvider content:// intent internally — neither is reachable
 * from pure JS/Expo APIs). Falls back to the generic OS share sheet on any
 * failure: Instagram not installed, native module missing, user cancels, or error.
 */
export async function shareToInstagramStory(uri: string): Promise<void> {
  try {
    const RNShare = require("react-native-share");
    const Share = RNShare.default || RNShare;
    const Social = RNShare.Social;
    if (Share && typeof Share.shareSingle === "function" && Social?.InstagramStories) {
      await Share.shareSingle({
        social: Social.InstagramStories,
        backgroundImage: uri,
        appId: "", // no interactive stickers/deep-link-back used, so no Facebook App ID is required
      });
      return;
    }
  } catch {
    // Native RNShare module not available in binary, Instagram unavailable, or share sheet dismissed — fall through.
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}

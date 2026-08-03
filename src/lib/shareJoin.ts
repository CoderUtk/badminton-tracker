import { Share } from "react-native";
import * as Linking from "expo-linking";
import { toast } from "./toast";

/**
 * Turn a join path into a deep link and hand it to the OS share sheet.
 * Shared by the club and tournament screens so the two cannot drift.
 * Failures are toasted, not thrown — a failed share is not worth a crash.
 */
export async function shareJoinLink(path: string, message: string): Promise<void> {
  try {
    const url = Linking.createURL(path);
    await Share.share({ message: `${message} ${url}` });
  } catch (e) {
    toast((e as Error).message || "Could not share the link", "error");
  }
}

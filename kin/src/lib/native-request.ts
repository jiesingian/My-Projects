import { headers } from "next/headers";
import { isAndroidAppUserAgent } from "@/lib/native";

/** On the server: is this request from the Kin Android app's web view? Its
 * user agent carries ANDROID_APP_UA (lib/native.ts). For screens that must
 * leave Kin Plus's prices out there from the first paint. */
export async function androidAppRequest(): Promise<boolean> {
  return isAndroidAppUserAgent((await headers()).get("user-agent"));
}

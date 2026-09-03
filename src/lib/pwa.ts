/** Environment facts the caller gathers. Pure inputs so this is unit-testable. */
export interface IosHintEnv {
  userAgent: string;
  /** navigator.standalone === true, or `(display-mode: standalone)` matches. */
  standalone: boolean;
  /** the dismissed flag is already set in localStorage. */
  dismissed: boolean;
}

const IOS_SAFARI = /iP(hone|od|ad)/;
// Chrome, Firefox, Edge, and the Google app on iOS — none support the
// Share -> Add to Home Screen flow the hint describes.
const OTHER_IOS_BROWSER = /(CriOS|FxiOS|EdgiOS|GSA)/;

/** Whether to show the "Add to Home Screen" hint. */
export function shouldShowIosInstallHint(env: IosHintEnv): boolean {
  if (env.standalone || env.dismissed) return false;
  return IOS_SAFARI.test(env.userAgent) && !OTHER_IOS_BROWSER.test(env.userAgent);
}

export const IOS_HINT_DISMISSED_KEY = "ios_install_hint_dismissed";

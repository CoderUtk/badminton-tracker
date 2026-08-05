// Type-check-only shim. Metro resolves the bare "./AnimatedList" import to
// AnimatedList.native.tsx or AnimatedList.web.tsx at build time — platform
// files always win over this one. tsc has no such platform resolution, so
// without this file the bare import is unresolvable and every callsite's
// types collapse to `any`.
export { default } from "./AnimatedList.native";
export * from "./AnimatedList.native";

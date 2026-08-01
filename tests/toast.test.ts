import { toast, dismissToast, subscribeToasts } from "../src/lib/toast";

test("toast adds and manual dismiss removes", () => {
  jest.useFakeTimers();
  const seen: number[] = [];
  const off = subscribeToasts((l) => seen.push(l.length));
  const id = toast("hi", "success");
  const id2 = toast("bye");
  dismissToast(id);
  dismissToast(id2);
  off();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  expect(seen).toEqual([1, 2, 1, 0]);
});

test("toast auto-dismisses after the timeout", () => {
  jest.useFakeTimers();
  const seen: number[] = [];
  const off = subscribeToasts((l) => seen.push(l.length));
  toast("temp");
  jest.advanceTimersByTime(3500);
  off();
  expect(seen[seen.length - 1]).toBe(0);
  jest.useRealTimers();
});

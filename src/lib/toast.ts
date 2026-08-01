import { useEffect, useState } from "react";

export type ToastKind = "info" | "success" | "error";
export type Toast = { id: string; message: string; kind: ToastKind };

let toasts: Toast[] = [];
const subs = new Set<(l: Toast[]) => void>();
let seq = 0;
const emit = () => subs.forEach((cb) => cb(toasts));

export function toast(message: string, kind: ToastKind = "info"): string {
  const id = `t${++seq}`;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => dismissToast(id), 3000);
  return id;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(cb: (l: Toast[]) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => subscribeToasts(setList), []);
  return list;
}

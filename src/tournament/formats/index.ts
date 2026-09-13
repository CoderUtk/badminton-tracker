import type { FormatId } from "../types";
import type { FormatModule } from "./types";
import { singleElim } from "./singleElim";

/** The only lookup table. The picker renders Object.values(FORMATS); adding a
 *  format later is one file plus one entry here. Insertion order is the order
 *  the picker shows, so Knockout stays first and remains the default. */
export const FORMATS: Record<FormatId, FormatModule> = {
  single_elim: singleElim,
} as Record<FormatId, FormatModule>;

export const formatOrDefault = (id: string | null | undefined): FormatModule =>
  FORMATS[(id ?? "single_elim") as FormatId] ?? FORMATS.single_elim;

export * from "./types";

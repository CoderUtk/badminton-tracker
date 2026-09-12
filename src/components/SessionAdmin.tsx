import React from "react";
import SessionCost from "./SessionCost";
import SessionOpenJoin from "./SessionOpenJoin";
import SessionRepeat from "./SessionRepeat";
import { type Attendance, type ClubSession } from "../repos/sessionRepo";

/**
 * Wraps the organiser cards (cost split, open-join link, weekly repeat) behind one
 * import/element pair. Exists purely to keep app/(app)/sessions/[id].tsx
 * under the project's 500-line ceiling — see Task 6 of the open-sessions
 * plan: the ceiling is meant to force extraction, not comment-trimming.
 */
export default function SessionAdmin({
  session, attendance, canManage, myProfileId, onChanged,
}: {
  session: ClubSession;
  attendance: Attendance[];
  canManage: boolean;
  /** Signed-in user, so the cost card can offer to pay this player's own
   *  share. Null for a signed-out or guest viewer. */
  myProfileId: string | null;
  onChanged: () => void | Promise<void>;
}) {
  return (
    <>
      <SessionCost
        session={session}
        attendance={attendance}
        canManage={canManage}
        myProfileId={myProfileId}
        onChanged={onChanged}
      />
      <SessionOpenJoin session={session} canManage={canManage} onChanged={onChanged} />
      <SessionRepeat session={session} canManage={canManage} onChanged={onChanged} />
    </>
  );
}

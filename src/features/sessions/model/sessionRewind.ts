import { notifyReviewChanged, undoSessionTurnTo, type CheckpointStatus } from "./checkpoint";
import { invalidateProjectFiles } from "../../files/model/fileIndex";
import { invalidateWatchedFiles } from "../../files/model/fileWatch";
import { notifyGitChanged } from "../../../platform/tauri/fs";

/**
 * Rewind the working tree to just before a prompt was sent, undoing that
 * response and every later one. Refreshes the panels that read the worktree.
 */
export async function rewindSessionCode(
  sessionId: string,
  cwd: string,
  turnId: string,
): Promise<CheckpointStatus> {
  const status = await undoSessionTurnTo(sessionId, cwd, turnId);
  notifyGitChanged();
  notifyReviewChanged(sessionId);
  invalidateProjectFiles(cwd);
  invalidateWatchedFiles(status.files.map((file) => file.path));
  return status;
}

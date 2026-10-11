import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

type HookInput = {
  session_id?: string;
  cwd?: string;
  stop_hook_active?: boolean;
  tool_input?: { file_path?: string; notebook_path?: string };
};

const REVIEWED_PATH = /^(src|scripts|tests|bin)\/.+\.tsx?$/;

const input = (await Bun.stdin.json().catch(() => ({}))) as HookInput;
const flag = join(tmpdir(), `btk-review-${input.session_id ?? "unknown"}`);

if (Bun.argv[2] === "mark") markIfCode();
else if (Bun.argv[2] === "stop") gateStop();

function markIfCode() {
  const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  if (path && REVIEWED_PATH.test(relative(root, path))) writeFileSync(flag, "");
}

// A second stop in the same chain means the review already ran, so it never blocks twice in a row.
function gateStop() {
  if (!existsSync(flag)) return;
  rmSync(flag, { force: true });
  if (input.stop_hook_active) return;
  console.log(
    JSON.stringify({
      decision: "block",
      reason:
        "You changed code in bun-toolkit this turn. Before finishing, run the btk-review skill on those changes: fix what it finds, run `bun run check` and `bun test`, then add the short Review note to your reply.",
    }),
  );
}

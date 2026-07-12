// `mort predict` — pre-deploy risk assessment, the hero command. Scores the git
// diff against the user's own incident history. Exit codes are a contract the
// pre-push hook depends on:
//   0 = pass (low/medium risk)   1 = warn but allow (high)   2 = block (critical)
// It must never feel broken on day one: with no history it scores the diff alone,
// and a missing/unparseable brain degrades gracefully to a non-blocking exit 0.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Brain } from "../brain/index.js";
import { askJson } from "../brain/json.js";
import { buildPredictPrompt, Prediction } from "../brain/prompts/predict.js";
import { loadConfig } from "../core/config.js";
import { closeDb, migrateToLatest, openDb } from "../core/db.js";
import { recentIncidentSummaries } from "../core/repo.js";
import { SKULL_GLYPH } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { println } from "./util.js";

const execFileAsync = promisify(execFile);

/** The pre-push hook contract: critical blocks (2), high warns (1), else pass (0). */
export function exitCodeForRisk(risk: string): number {
  if (risk === "critical") return 2;
  if (risk === "high") return 1;
  return 0;
}

async function git(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch {
    return "";
  }
}

/** Uncommitted changes vs HEAD, falling back to the most recent commit. Shared
 *  with the MCP `predict` tool. */
export async function gatherDiff(): Promise<string> {
  const working = await git(["diff", "HEAD"]);
  if (working.trim()) return working;
  return git(["diff", "HEAD~1", "HEAD"]);
}

export async function predictCommand(): Promise<number> {
  const diff = await gatherDiff();
  if (!diff.trim()) {
    println(theme.muted("nothing to analyze — no uncommitted changes or recent commit."));
    return 0;
  }

  const config = loadConfig();
  const brain = new Brain(config.brain);
  await brain.init();
  if (!brain.isConfigured()) {
    println(
      theme.muted(
        `${SKULL_GLYPH} no brain configured — run "mort setup". Skipping risk analysis (not blocking).`,
      ),
    );
    return 0;
  }

  const db = openDb();
  await migrateToLatest(db);
  const history = await recentIncidentSummaries(db, 10);
  await closeDb(db);

  const result = await askJson((p) => brain.ask(p), buildPredictPrompt(diff, history), Prediction);
  if (!result.ok) {
    println(theme.muted(`${SKULL_GLYPH} could not parse a risk assessment; not blocking.`));
    return 0;
  }

  renderPrediction(result.data, history.length === 0);
  return exitCodeForRisk(result.data.risk_level);
}

function renderPrediction(p: Prediction, noHistory: boolean): void {
  const color =
    p.risk_level === "critical" || p.risk_level === "high"
      ? theme.critical
      : p.risk_level === "medium"
        ? theme.warning
        : theme.success;

  println(
    `${theme.brain(SKULL_GLYPH)} ${theme.brain("DEPLOYMENT RISK:")} ${color(p.risk_level.toUpperCase())}  ${theme.muted(`[confidence: ${p.confidence}]`)}`,
  );
  println();
  println(p.reasoning);

  if (p.concerns.length > 0) {
    println();
    println(theme.label("Concerns"));
    for (const c of p.concerns) println(`  - ${c}`);
  }
  if (p.likely_failure_points.length > 0) {
    println();
    println(theme.label("Likely failure points"));
    for (const f of p.likely_failure_points) println(`  - ${f}`);
  }

  println();
  println(`${theme.label("Recommendation")}  ${p.recommendation}`);

  if (noHistory) {
    println();
    println(theme.muted("no incident history yet · postmortem learns as it watches"));
  }
}

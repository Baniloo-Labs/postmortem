// `mort setup` — first-run wizard. v1.0 uses plain sequential prompts (the
// Ink-rendered wizard is a v1.1 polish item — the answers matter, not the chrome).
// The config-building logic is a pure function so it can be tested without stdin.

import { createInterface } from "node:readline/promises";
import { Brain } from "../brain/index.js";
import { type Config, defaultConfig, loadConfig, writeConfig } from "../core/config.js";
import { configFile } from "../core/paths.js";
import { SKULL } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { hooksInstall } from "./hooks.js";
import { println } from "./util.js";

export type BrainBackendChoice = "auto" | "claude-cli" | "anthropic-api" | "openai-api" | "ollama";

export interface SetupAnswers {
  brainBackend: BrainBackendChoice;
  anthropicKey?: string;
  openaiKey?: string;
  gitRepoPath: string;
  vercelEnabled: boolean;
  vercelToken?: string;
  githubEnabled: boolean;
  githubToken?: string;
  githubRepos?: string[];
}

/** Fold wizard answers into a validated Config. Pure — no I/O, unit-tested. */
export function applySetupAnswers(base: Config, answers: SetupAnswers): Config {
  const c = structuredClone(base);

  c.brain.backend = answers.brainBackend;
  if (answers.anthropicKey) c.brain.anthropic_api_key = answers.anthropicKey;
  if (answers.openaiKey) c.brain.openai_api_key = answers.openaiKey;

  c.sensors.git.enabled = true;
  c.sensors.git.repo_path = answers.gitRepoPath || ".";

  c.sensors.vercel.enabled = answers.vercelEnabled;
  if (answers.vercelToken) c.sensors.vercel.token = answers.vercelToken;

  c.sensors["github-actions"].enabled = answers.githubEnabled;
  if (answers.githubToken) c.sensors["github-actions"].token = answers.githubToken;
  if (answers.githubRepos) c.sensors["github-actions"].repos = answers.githubRepos;

  return c;
}

type Rl = ReturnType<typeof createInterface>;

async function ask(rl: Rl, question: string, fallback: string): Promise<string> {
  const suffix = fallback ? theme.muted(` (${fallback})`) : "";
  const answer = (await rl.question(`${theme.label(question)}${suffix} `)).trim();
  return answer || fallback;
}

async function confirm(rl: Rl, question: string, fallback: boolean): Promise<boolean> {
  const hint = fallback ? "Y/n" : "y/N";
  const answer = (await rl.question(`${theme.label(question)} ${theme.muted(`(${hint})`)} `))
    .trim()
    .toLowerCase();
  if (!answer) return fallback;
  return answer === "y" || answer === "yes";
}

export async function setupCommand(): Promise<void> {
  println(SKULL.banner);
  println();

  // setup is interactive; without a TTY (piped/CI) don't crash on EOF — guide instead.
  if (!process.stdin.isTTY) {
    println(theme.muted("mort setup needs an interactive terminal."));
    println(theme.muted(`Or edit ${configFile()} directly — postmortem uses defaults until then.`));
    println(theme.muted("To try it right now with zero config: mort watch --demo"));
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Detect what's already available so we can recommend the free path.
    const detected = new Brain(defaultConfig().brain);
    await detected.init();
    if (detected.isConfigured()) {
      println(theme.success(`✓ brain detected: ${detected.kind}`));
    } else {
      println(
        theme.muted("no brain detected yet — you can pick one below or set an env var later."),
      );
    }
    println();

    const choice = await ask(
      rl,
      "Brain: [1] auto-detect  [2] Anthropic key  [3] OpenAI key  [4] Ollama",
      "1",
    );
    let brainBackend: BrainBackendChoice = "auto";
    let anthropicKey: string | undefined;
    let openaiKey: string | undefined;
    if (choice === "2") {
      brainBackend = "anthropic-api";
      anthropicKey =
        (await ask(rl, "Anthropic API key (blank = use ANTHROPIC_API_KEY env)", "")) || undefined;
    } else if (choice === "3") {
      brainBackend = "openai-api";
      openaiKey =
        (await ask(rl, "OpenAI API key (blank = use OPENAI_API_KEY env)", "")) || undefined;
    } else if (choice === "4") {
      brainBackend = "ollama";
    }

    const gitRepoPath = await ask(rl, "Git repo path to watch", ".");

    const vercelEnabled = await confirm(rl, "Enable the Vercel sensor?", false);
    let vercelToken: string | undefined;
    if (vercelEnabled) {
      vercelToken = (await ask(rl, "Vercel token (blank = use VERCEL_TOKEN env)", "")) || undefined;
    }

    const githubEnabled = await confirm(rl, "Enable the GitHub Actions sensor?", false);
    let githubToken: string | undefined;
    let githubRepos: string[] | undefined;
    if (githubEnabled) {
      githubToken = (await ask(rl, "GitHub token (blank = use GITHUB_TOKEN env)", "")) || undefined;
      const repos = await ask(rl, "Repos to watch (comma-separated owner/name)", "");
      githubRepos = repos
        ? repos
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    }

    const config = applySetupAnswers(loadConfig(), {
      brainBackend,
      anthropicKey,
      openaiKey,
      gitRepoPath,
      vercelEnabled,
      vercelToken,
      githubEnabled,
      githubToken,
      githubRepos,
    });
    writeConfig(config);
    println();
    println(theme.success(`✓ wrote ${configFile()}`));

    if (await confirm(rl, "Install the git pre-push risk hook?", true)) {
      hooksInstall();
    }
  } finally {
    rl.close();
  }

  println();
  println(theme.primary("postmortem is ready."));
  println(`  ${theme.primary("mort watch")}         ${theme.muted("start watching")}`);
  println(`  ${theme.primary("mort watch --demo")}  ${theme.muted("try it now, no config")}`);
  println(`  ${theme.muted("dashboard → http://localhost:6660")}`);
}

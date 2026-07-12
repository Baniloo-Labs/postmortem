// `mort setup` — first-run wizard. v1.0 uses plain sequential prompts (the
// Ink-rendered wizard is a v1.1 polish item — the answers matter, not the chrome).
// The config-building logic is a pure function so it can be tested without stdin.

import { createInterface } from "node:readline/promises";
import { createAutostart, defaultServiceSpec } from "../autostart/index.js";
import { isClaudeCliAvailable } from "../brain/backends/claude-cli.js";
import { Brain } from "../brain/index.js";
import { type Config, defaultConfig, loadConfig, writeConfig } from "../core/config.js";
import { configFile } from "../core/paths.js";
import { SKULL } from "../outputs/terminal/logo.js";
import { theme } from "../outputs/terminal/theme.js";
import { hooksInstall } from "./hooks.js";
import { println } from "./util.js";

export type BrainBackendChoice = "auto" | "claude-cli" | "anthropic-api" | "openai-api" | "ollama";

export interface BrainChoice {
  brainBackend: BrainBackendChoice;
  anthropicKey?: string;
  openaiKey?: string;
}

export interface SetupAnswers extends BrainChoice {
  gitRepoPath: string;
  vercelEnabled: boolean;
  vercelToken?: string;
  netlifyEnabled: boolean;
  netlifyToken?: string;
  githubEnabled: boolean;
  githubToken?: string;
  githubRepos?: string[];
  telegramEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
}

/** Apply just the brain choice to a config. Pure — used by setup and the watch gate. */
export function applyBrainChoice(base: Config, choice: BrainChoice): Config {
  const c = structuredClone(base);
  c.brain.backend = choice.brainBackend;
  if (choice.anthropicKey) c.brain.anthropic_api_key = choice.anthropicKey;
  if (choice.openaiKey) c.brain.openai_api_key = choice.openaiKey;
  return c;
}

/** Fold wizard answers into a validated Config. Pure — no I/O, unit-tested. */
export function applySetupAnswers(base: Config, answers: SetupAnswers): Config {
  const c = applyBrainChoice(base, answers);

  c.sensors.git.enabled = true;
  c.sensors.git.repo_path = answers.gitRepoPath || ".";

  c.sensors.vercel.enabled = answers.vercelEnabled;
  if (answers.vercelToken) c.sensors.vercel.token = answers.vercelToken;

  c.sensors.netlify.enabled = answers.netlifyEnabled;
  if (answers.netlifyToken) c.sensors.netlify.token = answers.netlifyToken;

  c.sensors["github-actions"].enabled = answers.githubEnabled;
  if (answers.githubToken) c.sensors["github-actions"].token = answers.githubToken;
  if (answers.githubRepos) c.sensors["github-actions"].repos = answers.githubRepos;

  c.output.telegram.enabled = answers.telegramEnabled;
  if (answers.telegramBotToken) c.output.telegram.bot_token = answers.telegramBotToken;
  if (answers.telegramChatId) c.output.telegram.chat_id = answers.telegramChatId;

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

/** Interactive brain picker. Claude Code is the recommended, free default. */
async function chooseBrain(rl: Rl): Promise<BrainChoice> {
  println(theme.label("Brain — how should postmortem explain incidents?"));
  println(
    `  ${theme.primary("[1]")} Claude Code   ${theme.muted("(recommended — free with your Claude subscription, no API key)")}`,
  );
  println(`  ${theme.primary("[2]")} Anthropic API key`);
  println(`  ${theme.primary("[3]")} OpenAI API key`);
  println(`  ${theme.primary("[4]")} Ollama        ${theme.muted("(local, offline)")}`);
  println(`  ${theme.primary("[5]")} Auto-detect`);
  const choice = await ask(rl, "Choose", "1");

  if (choice === "2") {
    const anthropicKey =
      (await ask(rl, "Anthropic API key (blank = use ANTHROPIC_API_KEY env)", "")) || undefined;
    return { brainBackend: "anthropic-api", anthropicKey };
  }
  if (choice === "3") {
    const openaiKey =
      (await ask(rl, "OpenAI API key (blank = use OPENAI_API_KEY env)", "")) || undefined;
    return { brainBackend: "openai-api", openaiKey };
  }
  if (choice === "4") return { brainBackend: "ollama" };
  if (choice === "5") return { brainBackend: "auto" };

  // Default: Claude Code. Check it's installed; guide the user if not.
  if (await isClaudeCliAvailable()) {
    println(theme.success("  ✓ Claude Code detected — free analysis via your subscription."));
  } else {
    println(
      theme.warning(
        "  Claude Code isn't installed yet. Install it — postmortem then uses it automatically:",
      ),
    );
    println(theme.muted("    npm install -g @anthropic-ai/claude-code && claude /login"));
  }
  return { brainBackend: "claude-cli" };
}

/**
 * Ensure a brain is configured, prompting the user to pick one if not. Used by
 * `mort watch` so nobody ends up watching with analysis silently disabled.
 * Returns true if it wrote a config; false when there's no TTY to prompt on.
 */
export async function ensureBrainConfigured(): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  println();
  println(theme.primary("postmortem needs a brain to explain incidents — let's set one up."));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const choice = await chooseBrain(rl);
    writeConfig(applyBrainChoice(loadConfig(), choice));
    println(theme.success(`✓ saved to ${configFile()}`));
    println();
    return true;
  } finally {
    rl.close();
  }
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

    const brainChoice = await chooseBrain(rl);
    println();

    const gitRepoPath = await ask(rl, "Git repo path to watch", ".");

    const vercelEnabled = await confirm(rl, "Enable the Vercel sensor?", false);
    let vercelToken: string | undefined;
    if (vercelEnabled) {
      vercelToken = (await ask(rl, "Vercel token (blank = use VERCEL_TOKEN env)", "")) || undefined;
    }

    const netlifyEnabled = await confirm(rl, "Enable the Netlify sensor?", false);
    let netlifyToken: string | undefined;
    if (netlifyEnabled) {
      netlifyToken =
        (await ask(rl, "Netlify token (blank = use NETLIFY_TOKEN env)", "")) || undefined;
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

    const telegramEnabled = await confirm(rl, "Send incident alerts to Telegram?", false);
    let telegramBotToken: string | undefined;
    let telegramChatId: string | undefined;
    if (telegramEnabled) {
      telegramBotToken =
        (await ask(
          rl,
          "Telegram bot token from @BotFather (blank = TELEGRAM_BOT_TOKEN env)",
          "",
        )) || undefined;
      telegramChatId =
        (await ask(rl, "Telegram chat id (blank = TELEGRAM_CHAT_ID env)", "")) || undefined;
    }

    const config = applySetupAnswers(loadConfig(), {
      ...brainChoice,
      gitRepoPath,
      vercelEnabled,
      vercelToken,
      netlifyEnabled,
      netlifyToken,
      githubEnabled,
      githubToken,
      githubRepos,
      telegramEnabled,
      telegramBotToken,
      telegramChatId,
    });
    writeConfig(config);
    println();
    println(theme.success(`✓ wrote ${configFile()}`));

    if (await confirm(rl, "Install the git pre-push risk hook?", true)) {
      hooksInstall();
    }

    if (await confirm(rl, "Start postmortem automatically on login?", false)) {
      const result = await createAutostart(defaultServiceSpec()).install();
      println(result.ok ? theme.success(`✓ ${result.message}`) : theme.muted(result.message));
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

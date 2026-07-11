// postmortem ☠ — CLI entry point.
//
// Session 1 stub: exists so the toolchain (tsc typecheck + tsup build) is green
// from the foundation up. The real Commander.js entry — `mort watch`, `predict`,
// `setup`, etc. — lands in Session 6 (Plan.md) and replaces everything below.

const VERSION = "0.1.0";

function main(argv: string[]): void {
  const arg = argv[2];
  if (arg === "--version" || arg === "-v") {
    process.stdout.write(`postmortem ☠ v${VERSION}\n`);
    return;
  }
  process.stdout.write(
    `postmortem ☠ v${VERSION} — scaffolding in progress. See Plan.md for the build order.\n`,
  );
}

main(process.argv);

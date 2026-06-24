---
name: release
description: Cut a release of @postmortem-cli/mort — version bump, changelog, build, and an npm publish dry-run checklist. Use when preparing to publish a new version to npm.
---

# release

Prepare and verify a release of `@postmortem-cli/mort`. This skill drives the checklist; it does **not** run `npm publish` automatically — publishing is an outward, hard-to-reverse action, so stop and confirm with the user before the real publish.

## Pre-flight (must all pass)
1. Clean working tree on the release branch (`git status`).
2. `npx @biomejs/biome check .` — lint/format clean.
3. `npm test` — all green.
4. `npm run build` — `tsup` produces `dist/index.js` with the dashboard HTML embedded.
5. Smoke test the built binary: `node dist/index.js --help`, `node dist/index.js status`.

## Version & changelog
6. Choose the bump (semver): patch / minor / major. Pre-1.0 (`0.x`) — breaking changes go in minor.
7. Update `version` in `package.json` (and keep the version string shown in the terminal/dashboard in sync).
8. Update `CHANGELOG.md` — Added / Changed / Fixed since the last tag (derive from `git log <lastTag>..HEAD`).
9. Run `/gen-docs` if commands, sensors, config, or the event schema changed.

## Publish dry-run (verify, don't ship)
10. `npm pack --dry-run` — review the file list. Confirm `dist/` is included and source maps/tests/fixtures are excluded (check `files` in `package.json`).
11. Confirm `bin.mort` → `./dist/index.js`, `"type": "module"`, `engines.node >= 22`.
12. Confirm package name `@postmortem-cli/mort` and `publishConfig.access: "public"` (scoped package).
13. `npm publish --dry-run` — review output.

## Publish (only after explicit user confirmation)
14. Tag: `git tag v<version> && git push --tags`.
15. `npm publish` (scoped public). Then verify `npm view @postmortem-cli/mort version`.

## Rules
- Never publish with failing tests, lint errors, or a dirty tree.
- Never bypass hooks or signing unless the user explicitly asks.
- The version in `package.json`, the git tag, and the version rendered in the UI must match.

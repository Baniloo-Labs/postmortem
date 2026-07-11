// Single source of the version string. Imported by the CLI entry and the
// dashboard so they can never drift from package.json (the release process bumps
// package.json only). tsup inlines this JSON at build time; tsx resolves it in dev.

import pkg from "../package.json" with { type: "json" };

export const VERSION: string = pkg.version;

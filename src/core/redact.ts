// The central secret redactor.
//
// Every sensor runs raw text and structured payloads through this BEFORE the data
// is persisted to SQLite and BEFORE any prompt is sent to a brain backend. There
// is exactly one redactor so a new sensor can't accidentally leak a token by
// forgetting to scrub — the pipeline scrubs for it.
//
// Redaction is intentionally conservative about readability: it replaces the
// secret itself, not the surrounding context, so logs stay diagnosable.

const PLACEHOLDER = "[REDACTED]";

interface RedactionRule {
  readonly label: string;
  readonly pattern: RegExp;
  /** Replacement; use $1/$2 to keep non-secret context (e.g. the header name). */
  readonly replacement: string;
}

// Order matters: most specific / highest-confidence patterns first.
const RULES: readonly RedactionRule[] = [
  {
    label: "private-key-block",
    pattern:
      /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    replacement: `${PLACEHOLDER}:private-key`,
  },
  {
    label: "anthropic-key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    replacement: `${PLACEHOLDER}:anthropic-key`,
  },
  {
    label: "openai-key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
    replacement: `${PLACEHOLDER}:openai-key`,
  },
  {
    label: "github-token",
    pattern: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36,}\b/g,
    replacement: `${PLACEHOLDER}:github-token`,
  },
  {
    label: "github-pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g,
    replacement: `${PLACEHOLDER}:github-token`,
  },
  {
    label: "netlify-token",
    pattern: /\bnfp_[A-Za-z0-9]{30,}\b/g,
    replacement: `${PLACEHOLDER}:netlify-token`,
  },
  {
    label: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replacement: `${PLACEHOLDER}:slack-token`,
  },
  {
    label: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: `${PLACEHOLDER}:aws-key`,
  },
  {
    label: "gitlab-pat",
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    replacement: `${PLACEHOLDER}:gitlab-token`,
  },
  {
    label: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: `${PLACEHOLDER}:jwt`,
  },
  {
    // Authorization: Bearer <token> / Authorization: Basic <b64> — keep the scheme.
    label: "auth-header",
    pattern: /\b(Authorization\s*[:=]\s*(?:Bearer|Basic|token))\s+[A-Za-z0-9._+/=-]{8,}/gi,
    replacement: `$1 ${PLACEHOLDER}`,
  },
  {
    // Credentials embedded in a URL: https://user:secret@host → https://user:[REDACTED]@host
    label: "url-credentials",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s:/@]+@/gi,
    replacement: `$1:${PLACEHOLDER}@`,
  },
  {
    // Generic KEY/TOKEN/SECRET/PASSWORD assignments — keep the key name, drop the
    // value. "AUTH" is intentionally excluded: it's a substring of "Authorization"
    // (handled by the auth-header rule) and would double-redact the scheme. Keys
    // like AUTH_TOKEN are still caught via TOKEN.
    label: "assignment",
    pattern:
      /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL)[A-Za-z0-9_]*)(\s*[:=]\s*)["']?([^\s"',}]{6,})["']?/gi,
    replacement: `$1$2${PLACEHOLDER}`,
  },
];

/**
 * Redact secrets from a string. Safe to call on any raw/log text.
 */
export function redact(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

// Sensitive object-key names. A string value under one of these keys is redacted
// regardless of its content — many real tokens (Vercel, Netlify, session ids) are
// opaque and wouldn't match any value pattern.
const SENSITIVE_KEY_WORDS = [
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "credential",
  "credentials",
  "privatekey",
  "clientsecret",
  "sessionid",
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return SENSITIVE_KEY_WORDS.some((word) => normalized === word || normalized.endsWith(word));
}

/**
 * Deep-redact any JSON-ish value: string leaves are scrubbed for value patterns,
 * and a string under a sensitive key name is redacted wholesale. Objects/arrays
 * are walked. Non-string leaves (numbers, booleans, null) pass through untouched.
 * Used on sensor `payload`/`metadata` (arbitrary structured data) before persist.
 */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redact(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === "string" && isSensitiveKey(k) ? PLACEHOLDER : redactDeep(v);
    }
    return out as T;
  }
  return value;
}

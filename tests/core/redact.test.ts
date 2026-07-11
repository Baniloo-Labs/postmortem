import { describe, expect, it } from "vitest";
import { redact, redactDeep } from "../../src/core/redact.js";

describe("redact", () => {
  it("scrubs an Anthropic key", () => {
    const out = redact("using sk-ant-api03-abcdefghij1234567890KLMNOP to auth");
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("[REDACTED]");
  });

  it("scrubs an OpenAI key", () => {
    const out = redact("OPENAI key sk-proj-abcdefghij1234567890klmnopqrstuvwx");
    expect(out).not.toContain("sk-proj-abcdefghij");
  });

  it("scrubs a GitHub token", () => {
    const out = redact("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 end");
    expect(out).not.toContain("ghp_abcdefghij");
    expect(out).toContain("end");
  });

  it("scrubs a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const out = redact(`Cookie: session=${jwt}`);
    expect(out).not.toContain(jwt);
  });

  it("keeps the Authorization scheme but drops the token", () => {
    const out = redact("Authorization: Bearer abcdef1234567890token");
    expect(out).toContain("Authorization");
    expect(out).toContain("Bearer");
    expect(out).not.toContain("abcdef1234567890token");
  });

  it("scrubs credentials embedded in a URL", () => {
    const out = redact("cloning https://user:s3cr3tpassword@github.com/acme/app.git");
    expect(out).toContain("https://user:");
    expect(out).not.toContain("s3cr3tpassword");
    expect(out).toContain("@github.com");
  });

  it("scrubs generic KEY/TOKEN/SECRET assignments, keeps the key name", () => {
    expect(redact("VERCEL_TOKEN=abc123def456ghi")).toContain("VERCEL_TOKEN=");
    expect(redact("VERCEL_TOKEN=abc123def456ghi")).not.toContain("abc123def456ghi");
    expect(redact('API_SECRET: "supersecretvalue"')).not.toContain("supersecretvalue");
  });

  it("scrubs a private key block", () => {
    const block =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
    const out = redact(`config:\n${block}\ndone`);
    expect(out).not.toContain("MIIEowIBAAKCAQEA");
    expect(out).toContain("done");
  });

  it("leaves ordinary text untouched", () => {
    const text = "Build failed: module 'axios' not found in src/api/client.ts";
    expect(redact(text)).toBe(text);
  });
});

describe("redactDeep", () => {
  it("scrubs string leaves in nested objects and arrays", () => {
    const input = {
      env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
      logs: ["ok", "Authorization: Bearer abcdef1234567890token"],
      count: 3,
      healthy: true,
      nothing: null,
    };
    const out = redactDeep(input);
    expect(JSON.stringify(out)).not.toContain("ghp_abcdefghij");
    expect(JSON.stringify(out)).not.toContain("abcdef1234567890token");
    expect(out.count).toBe(3);
    expect(out.healthy).toBe(true);
    expect(out.nothing).toBeNull();
  });

  it("redacts opaque values under a sensitive key name", () => {
    const out = redactDeep({
      access_token: "opaque-value-no-recognizable-format",
      client_secret: "another-opaque-one",
      apiKey: "xyz789plain",
      note: "harmless",
      count: 5,
    });
    expect(out.access_token).toBe("[REDACTED]");
    expect(out.client_secret).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.note).toBe("harmless");
    expect(out.count).toBe(5);
  });

  it("does not over-redact innocent keys that merely contain a substring", () => {
    const out = redactDeep({ monkey: "banana", tokenize: "step" });
    expect(out.monkey).toBe("banana");
    expect(out.tokenize).toBe("step");
  });
});

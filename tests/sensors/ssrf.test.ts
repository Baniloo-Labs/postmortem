import { describe, expect, it } from "vitest";
import { checkUrl } from "../../src/sensors/health-check/ssrf.js";

describe("checkUrl (SSRF guard)", () => {
  it("allows public https/http URLs", () => {
    expect(checkUrl("https://api.myapp.com/health").ok).toBe(true);
    expect(checkUrl("http://93.184.216.34/").ok).toBe(true); // public IP
  });

  it("blocks non-http(s) protocols", () => {
    expect(checkUrl("ftp://example.com").ok).toBe(false);
    expect(checkUrl("file:///etc/passwd").ok).toBe(false);
  });

  it("blocks localhost and loopback", () => {
    expect(checkUrl("http://localhost:3000/health").ok).toBe(false);
    expect(checkUrl("http://127.0.0.1/").ok).toBe(false);
    expect(checkUrl("http://[::1]/").ok).toBe(false);
  });

  it("blocks private IPv4 ranges", () => {
    expect(checkUrl("http://10.0.0.5/").ok).toBe(false);
    expect(checkUrl("http://192.168.1.1/").ok).toBe(false);
    expect(checkUrl("http://172.16.0.1/").ok).toBe(false);
  });

  it("blocks the cloud metadata endpoint (169.254.169.254)", () => {
    expect(checkUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(checkUrl("http://metadata.google.internal/").ok).toBe(false);
  });

  it("blocks unique-local and link-local IPv6", () => {
    expect(checkUrl("http://[fd00::1]/").ok).toBe(false);
    expect(checkUrl("http://[fe80::1]/").ok).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(checkUrl("not a url").ok).toBe(false);
  });
});

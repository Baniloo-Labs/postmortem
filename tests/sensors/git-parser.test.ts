import { describe, expect, it } from "vitest";
import { diffGitState, parseCommit } from "../../src/sensors/git/parser.js";

describe("parseCommit", () => {
  it("parses sha, author, and subject", () => {
    const raw = "4f2a9c1\nAda Lovelace\nfix: pin axios to 1.6.2";
    expect(parseCommit(raw)).toEqual({
      sha: "4f2a9c1",
      author: "Ada Lovelace",
      subject: "fix: pin axios to 1.6.2",
    });
  });

  it("handles a multi-line subject", () => {
    expect(parseCommit("abc\nDev\nline one\nline two")?.subject).toBe("line one\nline two");
  });

  it("returns null on empty output", () => {
    expect(parseCommit("   ")).toBeNull();
  });
});

describe("diffGitState", () => {
  const prev = { sha: "aaa", branch: "main" };

  it("emits git.commit when the sha changes", () => {
    const events = diffGitState(
      prev,
      { sha: "bbb", branch: "main", commit: { sha: "bbb", author: "Dev", subject: "second" } },
      "/repo/app",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("git.commit");
    expect(events[0]?.metadata.commit).toBe("bbb");
    expect(events[0]?.summary).toContain("second");
  });

  it("emits git.branch_changed when the branch changes", () => {
    const events = diffGitState(prev, { sha: "aaa", branch: "feature", commit: null }, "/repo/app");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("git.branch_changed");
    expect(events[0]?.payload).toMatchObject({ from: "main", to: "feature" });
  });

  it("emits both when branch and sha both change", () => {
    const events = diffGitState(
      prev,
      { sha: "bbb", branch: "feature", commit: { sha: "bbb", author: "D", subject: "x" } },
      "/repo/app",
    );
    expect(events.map((e) => e.type)).toEqual(["git.branch_changed", "git.commit"]);
  });

  it("emits nothing on first observation (prev null)", () => {
    const events = diffGitState(
      { sha: null, branch: null },
      { sha: "bbb", branch: "main", commit: { sha: "bbb", author: "D", subject: "x" } },
      "/repo/app",
    );
    expect(events).toHaveLength(0);
  });

  it("emits nothing when nothing changed", () => {
    const events = diffGitState(prev, { sha: "aaa", branch: "main", commit: null }, "/repo/app");
    expect(events).toHaveLength(0);
  });
});

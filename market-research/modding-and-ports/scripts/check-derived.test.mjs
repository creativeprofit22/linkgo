import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  collectAuthorValues,
  mask,
  scanText,
  usableTokens,
} from "./check-derived.mjs";

describe("collectAuthorValues", () => {
  test("finds author fields at any depth and handles in profile URLs", () => {
    const data = [
      {
        user_posted: "Sebastrion1",
        name: "Display Person",
        title: "not an author",
        community_name: "emulation",
        comments: [{ username: "@commenter_x", text: "hi" }],
        profile_url: "https://www.tiktok.com/@tok_user",
        channel_url: "https://www.youtube.com/channel/UCabc123",
      },
      { name: "a product name without user_posted sibling" },
    ];
    const values = collectAuthorValues(data);
    assert.deepEqual([...values].sort(), [
      "Display Person",
      "Sebastrion1",
      "UCabc123",
      "commenter_x",
      "tok_user",
    ]);
  });
});

describe("usableTokens", () => {
  test("drops short and numeric values", () => {
    assert.deepEqual(usableTokens(new Set(["abc", "1234567", "okay_name"])), {
      tokens: ["okay_name"],
      exempt: [],
    });
  });
  test("exempts exact dictionary terms (organisation accounts) only", () => {
    const out = usableTokens(
      new Set(["Nexus Mods", "NexusModsFan", "person_a"]),
      ["nexus mods"],
    );
    assert.deepEqual(out, {
      tokens: ["NexusModsFan", "person_a"],
      exempt: ["Nexus Mods"],
    });
  });
});

describe("scanText", () => {
  const tokens = ["Sebastrion1", "tok_user"];
  test("flags whole-token author values case-insensitively", () => {
    const f = scanText("a.csv", "id,note\n1,quoted sebastrion1 here\n", tokens);
    assert.deepEqual(f, [
      { file: "a.csv", kind: "author-value", value: "Sebastrion1" },
    ]);
  });
  test("does not flag substrings inside longer words", () => {
    assert.deepEqual(scanText("a.csv", "xtok_userx", tokens), []);
  });
  test("flags @handles but not anonymised placeholders or emails", () => {
    const text = "/@[handle]/video,me@example.com,see @someone_else";
    const f = scanText("a.csv", text, []);
    assert.deepEqual(
      f.map((x) => x.value),
      ["@someone_else"],
    );
  });
  test("mask hides most of the value", () => {
    assert.equal(mask("Sebastrion1"), "Se…(11)");
  });
});

const assert = require("node:assert/strict");
require("../src/common.js");
const C = globalThis.AITabGrouper;

assert.ok(C.SYNC_SETTING_KEYS.includes("prompt"));
assert.ok(!C.SYNC_SETTING_KEYS.includes("apiKey"));
assert.deepEqual(C.pickSyncSettings({ apiKey: "secret", model: "demo" }), {
  autoEnabled: true,
  autoApply: false,
  intervalMinutes: 5,
  endpoint: "https://api.openai.com/v1/chat/completions",
  transport: "acp",
  agent: "codex",
  acpModel: "",
  model: "demo",
  includePath: false,
  includePinned: false,
  includeGrouped: true,
  collapsed: false,
  maxTabs: 200,
  prompt: C.DEFAULT_PROMPT
});
assert.deepEqual(C.syncSettingsFromStorage({ apiKey: "secret", model: "demo", autoEnabled: false }), {
  model: "demo",
  autoEnabled: false
});
assert.deepEqual(C.YOUTUBE_SPEED, { min: 0.25, max: 5, step: 0.25, normal: 1 });
assert.equal(C.adjustPlaybackRate(1, 1), 1.25);
assert.equal(C.adjustPlaybackRate(4.9, 1), 5);
assert.equal(C.adjustPlaybackRate(0.25, -1), 0.25);
assert.equal(C.playbackRateLabel(1.5), "1.5×");
assert.equal(C.normalizeEndpoint("http://localhost:11434/v1"), "http://localhost:11434/v1/chat/completions");
assert.equal(C.getDomain("https://docs.example.com/a"), "docs.example.com");
assert.deepEqual(C.modelRequestOptions(C.DEFAULT_SETTINGS, "http://127.0.0.1:11434/v1/chat/completions"), { reasoning_effort: "none" });
assert.deepEqual(C.modelRequestOptions({}, "https://api.deepseek.com/chat/completions"), { thinking: { type: "disabled" } });
assert.deepEqual(C.modelRequestOptions({}, "https://api.openai.com/v1/chat/completions"), {});

const tabs = [
  { id: 1, windowId: 1, index: 0, url: "https://docs.example.com/a", title: "Docs", pinned: false, groupId: -1 },
  { id: 2, windowId: 1, index: 1, url: "chrome://extensions", title: "Extensions", pinned: false, groupId: -1 },
  { id: 3, windowId: 1, index: 2, url: "https://shop.example.com", title: "Shop", pinned: true, groupId: -1 }
];
assert.deepEqual(C.eligibleTabs(tabs, C.DEFAULT_SETTINGS).map((tab) => tab.id), [1]);
assert.deepEqual(C.normalizeGroups({ groups: [{ name: "学习", color: "blue", tabIds: [1, 999, 1] }] }, [tabs[0]]), [{ name: "学习", color: "blue", collapsed: false, tabIds: [1] }]);
assert.throws(() => C.parseJsonResponse("not json"));
console.log("common smoke tests passed");

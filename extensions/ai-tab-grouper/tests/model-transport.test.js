const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness(fetch) {
  let heartbeat;
  let touches = 0;
  let clearedInterval = false;
  let clearedTimeout = false;
  const context = vm.createContext({
    fetch, URL, AbortController,
    chrome: { runtime: {
      id: "ifokppgmnkkgjngfpkcemaiocdjkicnj",
      getPlatformInfo: async () => { touches++; }
    } },
    setTimeout: () => 1,
    clearTimeout: () => { clearedTimeout = true; },
    setInterval: (callback, delay) => {
      assert.equal(delay, 20000);
      heartbeat = callback;
      return 2;
    },
    clearInterval: () => { clearedInterval = true; }
  });
  context.importScripts = (file) => vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), context
  );
  const source = fs.readFileSync(path.join(__dirname, "../src/background.js"), "utf8");
  vm.runInContext(source.slice(0, source.indexOf("async function ungroupOwnedGroups")), context);
  return {
    call: () => context.callModel({...context.AITabGrouper.DEFAULT_SETTINGS, transport:"openai", endpoint:"http://127.0.0.1:11434/v1/chat/completions"}, "test"),
    tick: () => heartbeat(),
    touches: () => touches,
    assertCleanup: () => {
      assert.ok(clearedInterval, "请求结束后必须停止保活");
      assert.ok(clearedTimeout, "请求结束后必须清理超时定时器");
    }
  };
}

function response(status, raw) {
  return { status, ok: status >= 200 && status < 300, text: async () => raw };
}

(async () => {
  const failures = [
    [403, "", /Ollama 拒绝插件访问.*HTTP 403.*空响应/],
    [502, "<html>Bad Gateway</html>", /HTTP 502.*响应不是 JSON/],
    [200, "", /返回了空响应.*HTTP 200/],
    [200, "<html>Dashboard</html>", /返回了非 JSON.*HTTP 200/],
    [401, '{"error":{"message":"Unauthorized"}}', /HTTP 401：Unauthorized/]
  ];
  for (const [status, raw, expected] of failures) {
    const h = harness(async () => response(status, raw));
    await assert.rejects(h.call(), expected);
    h.assertCleanup();
  }
  const aborted = harness(async () => { throw Object.assign(new Error(), { name: "AbortError" }); });
  await assert.rejects(aborted.call(), /模型请求超时（180 秒）/);
  aborted.assertCleanup();

  let finish;
  const delayed = harness(() => new Promise((resolve) => { finish = resolve; }));
  const pending = delayed.call();
  delayed.tick();
  delayed.tick();
  assert.equal(delayed.touches(), 2, "等待模型期间应调用扩展 API 保活");
  finish(response(200, '{"choices":[{"message":{"content":"{\\"ok\\":true}"}}]}'));
  assert.equal(await pending, '{"ok":true}');
  delayed.assertCleanup();
  console.log("model transport tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });

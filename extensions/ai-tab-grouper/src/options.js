const C = globalThis.AITabGrouper;
const $ = (id) => document.getElementById(id);
let currentSettings = C.mergeSettings();

function formSettings() {
  return {
    transport: $("transport").value,
    agent: currentSettings.agent,
    acpModel: $("acpModel").value.trim(),
    bridgeToken: $("bridgeToken").value.trim(),
    autoEnabled: $("autoEnabled").checked,
    autoApply: $("autoApply").checked,
    intervalMinutes: Number($("intervalMinutes").value),
    endpoint: $("endpoint").value.trim(),
    apiKey: $("apiKey").value,
    model: $("model").value.trim(),
    includePath: $("includePath").checked,
    includePinned: $("includePinned").checked,
    includeGrouped: $("includeGrouped").checked,
    collapsed: $("collapsed").checked,
    maxTabs: Number($("maxTabs").value),
    prompt: $("prompt").value
  };
}

function fillForm(settings) {
  currentSettings = C.mergeSettings(settings);
  $("transport").value = currentSettings.transport;
  $("acpModel").value = currentSettings.acpModel;
  $("bridgeToken").value = currentSettings.bridgeToken;
  updateConnection();
  $("autoEnabled").checked = currentSettings.autoEnabled;
  $("autoApply").checked = currentSettings.autoApply;
  $("intervalMinutes").value = currentSettings.intervalMinutes;
  $("endpoint").value = currentSettings.endpoint;
  $("apiKey").value = currentSettings.apiKey;
  $("model").value = currentSettings.model;
  $("includePath").checked = currentSettings.includePath;
  $("includePinned").checked = currentSettings.includePinned;
  $("includeGrouped").checked = currentSettings.includeGrouped;
  $("collapsed").checked = currentSettings.collapsed;
  $("maxTabs").value = currentSettings.maxTabs;
  $("prompt").value = currentSettings.prompt;
}

function updateConnection() {
  const acp = $("transport").value === "acp";
  $("acpFields").hidden = !acp;
  $("httpFields").hidden = acp;
  document.querySelectorAll("[data-agent]").forEach(button => {
    const selected = button.dataset.agent === currentSettings.agent;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  $("connectionSummary").textContent = acp ? `分组与 AI 对话均使用 ${C.connectionLabel({...currentSettings, transport:"acp", acpModel:$("acpModel").value})}` : "API Key 仅保存在当前设备，直接发送到你填写的接口。";
}

function showHint(message, good = true) {
  $("saveHint").textContent = message;
  $("saveHint").className = good ? "ok" : "bad";
}

function showStatus(status) {
  if (!status) return;
  const labels = { idle: "等待变化", running: "正在整理", preview: "预览已就绪", success: "整理完成", warning: "部分完成", error: "需要处理" };
  $("statusBadge").textContent = labels[status.state] || "等待配置";
  $("statusBadge").className = `status-badge ${status.state === "error" ? "bad" : status.state === "running" ? "busy" : ["success", "preview"].includes(status.state) ? "ok" : ""}`;
  $("statusMessage").textContent = status.message || "尚未读取状态";
  $("tabCount").textContent = status.currentTabCount ?? "—";
  $("lastTabCount").textContent = status.lastTabCount || "—";
  $("groupCount").textContent = status.lastGroupCount || "—";
  $("lastRunAt").textContent = C.formatTime(status.lastRunAt || status.lastSuccessAt);
  const error = status.lastError || "";
  $("errorBox").hidden = !error;
  $("errorBox").textContent = error;
  $("applyPreview").hidden = !status.previewAvailable;
  $("runNow").disabled = status.state === "running";
}

async function refreshStatus() {
  try {
    showStatus(await chrome.runtime.sendMessage({ type: "GET_STATUS" }));
  } catch (error) {
    showHint(`读取状态失败：${error.message}`, false);
  }
}

async function save() {
  const button = $("saveSettings");
  button.disabled = true;
  try {
    const settings = formSettings();
    C.validateConnection(settings);
    if (!Number.isInteger(settings.intervalMinutes) || settings.intervalMinutes < 1 || settings.intervalMinutes > 1440) throw new Error("检查间隔应为 1–1440 分钟的整数");
    if (!Number.isInteger(settings.maxTabs) || settings.maxTabs < 10 || settings.maxTabs > 500) throw new Error("分析上限应为 10–500 个标签");
    const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
    if (!response || !response.ok) throw new Error(response && response.message || "保存失败");
    fillForm(response.settings);
    showHint(response.warning || "设置已保存并同步，自动闹钟已更新。", !response.warning);
    await refreshStatus();
    return true;
  } catch (error) {
    showHint(`保存失败：${error.message}`, false);
    return false;
  } finally {
    button.disabled = false;
  }
}

async function runNow() {
  const button = $("runNow");
  button.disabled = true;
  try {
    if (!await save()) return;
    showStatus({ state: "running", message: "正在调用模型…" });
    const result = await chrome.runtime.sendMessage({ type: "RUN_NOW" });
    if (!result || !result.ok) throw new Error(result && result.message || "运行失败");
    showHint(result.message || "分组完成。", true);
    await refreshStatus();
  } catch (error) {
    showHint(`运行失败：${error.message}`, false);
    await refreshStatus();
  } finally {
    button.disabled = false;
  }
}

async function applyPreview() {
  const button = $("applyPreview");
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "APPLY_PREVIEW" });
    if (!result || !result.ok) throw new Error(result && result.message || "应用预览失败");
    showHint(result.message, true);
    await refreshStatus();
  } catch (error) {
    showHint(`应用预览失败：${error.message}`, false);
    await refreshStatus();
  } finally {
    button.disabled = false;
  }
}

async function testConnection() {
  const button = $("testConnection");
  button.disabled = true;
  button.textContent = "正在测试…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION", settings: formSettings() });
    if (!result || !result.ok) throw new Error(result && result.message || "连接失败");
    showHint(result.message, true);
  } catch (error) {
    showHint(`连接失败：${error.message}`, false);
  } finally {
    button.disabled = false;
    button.textContent = "测试连接 ↗";
  }
}

async function pairBridge() {
  // Pairing uses the fragment so the secret never enters an HTTP URL or sync storage.
  if (location.hash.startsWith("#bridge-token=")) {
    const token = location.hash.slice("#bridge-token=".length);
    history.replaceState(null, "", "#connection");
    if (/^[a-f0-9]{64}$/.test(token)) {
      $("transport").value = "acp";
      $("bridgeToken").value = token;
      updateConnection();
      if (await save()) showHint("已连接 Cyan Grove。请选择 Agent 并测试连接。");
    } else showHint("桥接密钥无效，请从 Cyan Grove 重新连接插件。", false);
    $("connection").scrollIntoView();
  }
}

const PRESETS = {
  deepseek: { endpoint: "https://api.deepseek.com/chat/completions", apiKey: "", model: "deepseek-v4-flash" },
  lmstudio: { endpoint: "http://127.0.0.1:1234/v1/chat/completions", apiKey: "lm-studio", model: "local-model" },
  openai: { endpoint: "https://api.openai.com/v1/chat/completions", apiKey: "", model: "gpt-4o-mini" }
};

document.addEventListener("DOMContentLoaded", async () => {
  globalThis.AITabFinder.mount().catch(() => {});
  try {
    const stored = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!stored || !stored.ok) throw new Error(stored && stored.message || "读取设置失败");
    fillForm(stored.settings);
  } catch (error) {
    fillForm();
    showHint(`读取设置失败：${error.message}`, false);
  }
  await pairBridge();
  window.addEventListener("hashchange", pairBridge);
  await refreshStatus();
  $("transport").addEventListener("change", () => { updateConnection(); showHint("连接方式已修改，点击保存后生效。"); });
  $("acpModel").addEventListener("input", updateConnection);
  document.querySelectorAll("[data-agent]").forEach(button => button.addEventListener("click", () => {
    currentSettings.agent = button.dataset.agent;
    $("acpModel").value = "";
    updateConnection();
    showHint(`已选择 ${button.textContent.trim()}，点击保存后生效。`);
  }));
  $("saveSettings").addEventListener("click", save);
  $("runNow").addEventListener("click", runNow);
  $("applyPreview").addEventListener("click", applyPreview);
  $("testConnection").addEventListener("click", testConnection);
  $("toggleKey").addEventListener("click", () => {
    const reveal = $("apiKey").type === "password";
    $("apiKey").type = reveal ? "text" : "password";
    $("toggleKey").textContent = reveal ? "隐藏" : "显示";
    $("toggleKey").setAttribute("aria-label", reveal ? "隐藏 API Key" : "显示 API Key");
    $("toggleKey").setAttribute("aria-pressed", String(reveal));
  });
  document.querySelectorAll("#automation input, #connection input, #rules input, #rules textarea").forEach((input) => input.addEventListener("input", () => showHint("有未保存的修改，点击保存后生效。")));
  const links = [...document.querySelectorAll("nav a")];
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) links.forEach((link) => link.classList.toggle("active", link.hash === `#${visible[0].target.id}`));
  }, { rootMargin: "-8% 0px -60% 0px", threshold: 0 });
  document.querySelectorAll("main > section[id]").forEach((section) => observer.observe(section));
  $("resetPrompt").addEventListener("click", () => { $("prompt").value = C.DEFAULT_PROMPT; showHint("已恢复默认 Prompt，点击保存后生效。", true); });
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    const preset = PRESETS[button.dataset.preset];
    document.querySelectorAll("[data-preset]").forEach((item) => item.classList.toggle("selected", item === button));
    $("endpoint").value = preset.endpoint;
    $("apiKey").value = preset.apiKey;
    $("model").value = preset.model;
    showHint(button.dataset.preset === "deepseek"
      ? "已填入 DeepSeek 官方接口，请粘贴你的 API Key 后测试连接。"
      : `已填入 ${button.textContent} 示例，请确认模型名称后保存。`, true);
  }));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "STATUS") showStatus(message.status);
});

chrome.storage.onChanged.addListener((changes, area) => {
  const token = area === "local" && changes.settings?.newValue?.bridgeToken;
  if (token && $("bridgeToken")) $("bridgeToken").value = token;
});

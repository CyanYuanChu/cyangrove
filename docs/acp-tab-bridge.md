# 浏览器 ACP 桥接

源码：`Hub/TabBridge.swift`、`extensions/ai-tab-grouper/bridge/`。插件版本 0.7.1。

## 接入

1. 构建并打开 Grove：`python3 scripts/build-hub.py`。
2. Chrome 中加载 `extensions/ai-tab-grouper`；如果此前已加载旧目录，可继续使用旧目录，但需同步源码并重新加载扩展。
3. Grove → 浏览器桥接 → 安装 ACP 适配器。需要 Node.js 22+ 和 npm。
4. 复制 Chrome 扩展 ID 到 Grove，然后在插件弹窗内开启「ACP 桥接」。插件通过 Native Messaging 启动 Grove 后台服务并自动取得密钥。
5. 选择 Codex、Pi 或 Claude Code，保存并测试连接。先在终端登录所选 Agent；Pi 另需安装本机 `pi`。

Grove 退出时停止服务与 ACP 子进程，关闭窗口则保留后台运行。下次启动 Grove 会恢复此前开启状态。插件内可直接开启和关闭桥接；服务关闭后，Native Messaging 控制器仍可重新启动它。网页不能调用此控制器，Chrome 宿主清单限制扩展来源。端口只绑定 `127.0.0.1:48765`。

## 本机数据

`~/Library/Application Support/CyanGroveHub/TabBridge/` 保存 `config.json`（随机密钥与扩展 ID，权限 0600）、`runtime/`（锁定版本的 npm 适配器）和 `bridge.log`。不提交这些运行文件，不读取 Agent 的认证文件；由各自 Agent 使用已有登录。

分组和对话只发送用户要求与页面元数据，继续遵守插件的 URL 路径开关。模型 ID 留空使用 Agent 默认值。桥接拒绝额外工具授权，只提供文本 ACP 客户端；未完成、截断或无效 JSON 不进入标签操作。

## 验证

```sh
for test in extensions/ai-tab-grouper/tests/*.test.js; do node "$test" || exit 1; done
node --test extensions/ai-tab-grouper/tests/acp-*.test.mjs
python3 scripts/build-hub.py
"build/Cyan Grove.app/Contents/MacOS/Cyan Grove" --self-test
```

完整协议来源、适配器说明与插件使用方法见 [插件 README](../extensions/ai-tab-grouper/README.md)。

# Cyan Grove

一个按需安装的 macOS 个人工具工作台。各项能力已拆成独立软件，可以通过 Grove 管理，也可以直接下载各自的 Release 使用。

## 项目与下载

| 项目 | 能力 | 下载 |
| --- | --- | --- |
| Cyan Grove | 模块中心、安装更新、统一状态、启动控制 | [工作台 Releases](https://github.com/CyanYuanChu/cyangrove/releases) |
| [Cyan Command](https://github.com/CyanYuanChu/cyan-command) | 右 Command＋空格、指令面板、本地英译中 | [Releases](https://github.com/CyanYuanChu/cyan-command/releases) |
| [Cyan Monitor](https://github.com/CyanYuanChu/cyan-monitor) | CPU、内存、磁盘、网速与菜单栏 | [Releases](https://github.com/CyanYuanChu/cyan-monitor/releases) |
| [Cyan Codex Usage](https://github.com/CyanYuanChu/cyan-codex-usage) | 官方额度、本机 Token、日历和小票导出 | [Releases](https://github.com/CyanYuanChu/cyan-codex-usage/releases) |
| [Cyan GitHub](https://github.com/CyanYuanChu/cyan-github) | 贡献日历、提交、仓库、WidgetKit 桌面组件 | [Releases](https://github.com/CyanYuanChu/cyan-github/releases) |
| [Cyan Passport](https://github.com/CyanYuanChu/cyan-passport) | AI Passport 语音桥、配对和模型配置 | [Releases](https://github.com/CyanYuanChu/cyan-passport/releases) |

当前是 **Apple Silicon 开发预览版**，最低 macOS 14，翻译模块需要 macOS 15。安装包使用 ad hoc 签名，未做 Developer ID 公证，macOS 可能阻止首次打开。不要关闭系统安全保护；需要常规免拦截安装时，请等待正式签名版。SHA-256 校验确保包与发布目录一致，不代表 Apple 公证。

## 使用

1. 从 Releases 下载工作台安装包，解压后放到应用程序目录。
2. 打开「模块中心」，点击需要的模块的「安装模块」。工作台下载编译好的安装包，不要求 Git、Xcode 或源码编译。
3. 点击「启动」打开模块；在「管理」中选择随 Grove 启动、合并菜单栏或独立显示。
4. 退出 Grove 后，模块继续运行并恢复自己的菜单栏。点击「停止」才退出相应模块。

模块安装在 `~/Applications`。卸载只将 App 移到废纸篓，保留配置和历史；已在 `/Applications` 安装的同名模块可以被识别，但不会由 Grove 自动删除。

详细功能在各模块自己的原生窗口中提供。工作台目前集成安装、启停、摘要和菜单栏信息，不会把其他软件的窗口嵌入自己的页面。未安装的模块不会被初始化、扫描数据或启动后台服务。

## 模块自身的前提

- **Command**：系统英中翻译语言包；全局快捷键需要单独授予新 App 辅助功能权限。可通过模块菜单打开面板。
- **Monitor**：不需要其他模块或 Codex。
- **Codex Usage**：本机已安装并登录 Codex CLI，或者安装包含 CLI 的 Codex 桌面 App；读取正常登录，不打包凭据。
- **GitHub**：工作台明细使用 `gh auth login` 的本机登录；桌面组件读取公开贡献。
- **Passport**：支持的 Python 环境、语音依赖和已配对设备；App 内提供运行环境准备入口。原设备桥运行时，应先在旧版中结束通话再迁移，不能同时占用同一端口。

## 从源码构建

本仓库只构建工作台，不需要检出其他五个仓库。

```sh
./scripts/build-modular.sh
./scripts/check-modular.sh
```

需要 Xcode 和 Python 3，产物为 `build/Cyan Grove.app`。`CODE_SIGN_IDENTITY` 可指定你自己的签名身份。模块分别在各自仓库运行 `./scripts/build.sh` 和 `./scripts/check.sh`。

需要同时开发模块时，可以选择性检出源码：

```sh
python3 scripts/checkout-modules.py cyan-command cyan-monitor
```

这属于开发流程；安装和运行无需检出源码，也不使用 Git submodule。

## 更新与协议

工作台内置模块目录，包含仓库、版本、最低系统、架构、Bundle ID、协议版本和安装包 SHA-256。安装前先校验摘要、应用身份和代码签名，再替换安装；失败时保留原安装。更新运行中的模块前需先停止它。

「检查更新」查询各仓库 Releases，并读取同一仓库下的 `module.json`。只接受匹配的模块身份、协议和架构。当前渠道包含明确标注的预览版本。

控制接口使用当前用户私有目录中的 Unix socket，不监听网络端口；每个模块使用独占锁保持单实例。协议与迁移说明见 [docs/modules.md](docs/modules.md)。

独立模块从原整合版按白名单迁移各自的设置和数据，保留原文件。原版 GitHub 桌面组件需要在独立 GitHub App 安装后重新添加。新的 App 身份也可能需要重新授予系统权限。

## 0.8.0：首次扫码配网与 Agent 路由

AI Passport 页面增加 Codex／Hermes Agent 后端选择、Hermes Gateway 地址和五分钟新设备配对码。设备扫码热点配网需新版固件，未通话时长按下键进入；旧配对在新连接与配对验证成功前保留。电脑以 mDNS 广播服务，不进行路由器／端口扫描。配对资料经一次性码派生密钥加密认证。

Hermes 安装与模型配置已完成：稳定版 v0.22.5，openai-codex / gpt-6.1-sol。独立 OAuth 授权及真实模型调用仍待完成。该路由使用本地 Whisper base 与 macOS Tingting，自动断句，在执行及播报期间暂停收音，延迟高于 Codex WebRTC；会话独立，支持停止当前 Runs API 任务。运行时以用户选择的 Bypass 启动其拥有的本地网关，其他权限模式暂不支持。配置向后兼容旧版 settings.json。

Release 构建和签名通过，GitHub 27 项、个人功能 55 项检查通过。新增网页验证为模拟环境；手机与设备配网仍需真机验收。

import SwiftUI
import AppKit

@MainActor final class TabBridgeService: ObservableObject {
    static let shared = TabBridgeService()
    @Published var running = false
    @Published var busy = false
    @Published var installed = false
    @Published var external = false
    @Published var message = "桥接已关闭"
    @Published var error: String?
    @Published var extensionID: String {
        didSet { UserDefaults.standard.set(extensionID, forKey: "tabBridge.extensionID") }
    }
    private var process: Process?
    private var timer: Timer?
    private var polling = false
    private let root = ModuleFiles.support.appendingPathComponent("TabBridge", isDirectory: true)
    private var runtime: URL { root.appendingPathComponent("runtime", isDirectory: true) }
    private var resources: URL { Bundle.main.resourceURL!.appendingPathComponent("TabBridge", isDirectory: true) }
    private var configFile: URL { root.appendingPathComponent("config.json") }
    private var node: String? { executable("node") }
    private func executable(_ name: String) -> String? {
        ["/opt/homebrew/bin/", "/usr/local/bin/", FileManager.default.homeDirectoryForCurrentUser.path + "/.local/bin/", "/usr/bin/"].map { $0 + name }.first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    private init() {
        extensionID = UserDefaults.standard.string(forKey: "tabBridge.extensionID") ?? "ifokppgmnkkgjngfpkcemaiocdjkicnj"
        refreshInstalled()
        _ = try? configuration()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in Task { @MainActor in await self?.poll() } }
        if UserDefaults.standard.bool(forKey: "tabBridge.enabled") { Task { await start() } }
    }
    private func refreshInstalled() {
        installed = ["@agentclientprotocol/codex-acp/dist/index.js", "@agentclientprotocol/claude-agent-acp/dist/index.js", "pi-acp/dist/index.js"].allSatisfy { FileManager.default.fileExists(atPath: runtime.appendingPathComponent("node_modules/" + $0).path) }
    }
    private func configuration() throws -> String {
        guard extensionID.range(of: "^[a-p]{32}$", options: .regularExpression) != nil else { throw PluginError.message("请填写 Chrome 扩展管理页中的 32 位扩展 ID") }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var token = ""
        if let data = try? Data(contentsOf: configFile), let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { token = saved["token"] as? String ?? "" }
        if token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) == nil { token = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").lowercased() }
        let data = try JSONSerialization.data(withJSONObject: ["token": token, "extensionId": extensionID, "runtime": runtime.path], options: [.prettyPrinted])
        try data.write(to: configFile, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configFile.path)
        try installNativeController()
        return token
    }
    private func installNativeController() throws {
        guard let node else { throw PluginError.message("未找到 Node.js，请安装后重新打开 Grove") }
        func quote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'" }
        let launcher = root.appendingPathComponent("control-launcher")
        let script = "#!/bin/sh\nexec " + quote(node) + " " + quote(resources.appendingPathComponent("native-control.mjs").path) + " \"$@\"\n"
        try Data(script.utf8).write(to: launcher, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: launcher.path)
        let hosts = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts", isDirectory: true)
        try FileManager.default.createDirectory(at: hosts, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let manifest: [String: Any] = ["name": "io.github.cyanyuanchu.tab_bridge", "description": "Cyan Grove ACP bridge controls", "path": launcher.path, "type": "stdio", "allowed_origins": ["chrome-extension://\(extensionID)/"]]
        let file = hosts.appendingPathComponent("io.github.cyanyuanchu.tab_bridge.json")
        try JSONSerialization.data(withJSONObject: manifest, options: .prettyPrinted).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }

    func poll() async {
        guard !polling else { return }; polling = true; defer { polling = false }
        refreshInstalled()
        var request = URLRequest(url: URL(string: "http://127.0.0.1:48765/health")!); request.timeoutInterval = 1
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], object["service"] as? String == "cyan-tab-acp" else { throw PluginError.message("本机端口被其他服务占用") }
            running = true; external = process?.isRunning != true
            message = object["busy"] as? Bool == true ? "运行中 · Agent 正在处理请求" : external ? "桥接运行于其他进程" : "运行中 · 等待插件请求"
        } catch {
            running = false; external = false
            if process?.isRunning != true { message = "桥接已关闭" }
        }
    }
    func start() async {
        guard !busy else { return }
        busy = true; defer { busy = false }
        error = nil
        do {
            refreshInstalled()
            guard installed else { throw PluginError.message("请先安装 ACP 适配器") }
            guard let node else { throw PluginError.message("未找到 Node.js，请先安装 Node.js 22 或以上版本") }
            _ = try configuration()
            await poll()
            if running { return }
            let task = Process(); task.executableURL = URL(fileURLWithPath: node)
            task.arguments = [resources.appendingPathComponent("server.mjs").path, configFile.path]
            var env = ProcessInfo.processInfo.environment
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + FileManager.default.homeDirectoryForCurrentUser.path + "/.local/bin"
            task.environment = env
            let log = root.appendingPathComponent("bridge.log")
            if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
            let output = try FileHandle(forWritingTo: log); try output.truncate(atOffset: 0)
            task.standardOutput = output; task.standardError = output
            task.terminationHandler = { [weak self] ended in Task { @MainActor in
                try? output.close()
                guard let self, self.process === ended else { return }
                self.process = nil; self.running = false
                self.message = "桥接已关闭"
                if ended.terminationStatus != 0 && ended.terminationReason == .exit { self.error = "桥接启动失败，请检查端口或查看日志" }
            } }
            process = task; try task.run()
            message = "桥接正在启动…"
            UserDefaults.standard.set(true, forKey: "tabBridge.enabled")
            try? await Task.sleep(for: .milliseconds(250)); await poll()
        } catch { self.error = error.localizedDescription }
    }
    func stop() {
        UserDefaults.standard.set(false, forKey: "tabBridge.enabled")
        guard let task = process else { if external { error = "请在启动桥接的 Grove 实例中关闭服务" }; return }
        if task.isRunning { task.terminate() }; message = "正在停止桥接与当前 Agent…"
    }
    func shutdown() { timer?.invalidate(); if process?.isRunning == true { process?.terminate() } }
    func install() async {
        guard !busy else { return }
        busy = true; error = nil; message = "正在安装三个 ACP 适配器…"
        defer { busy = false; refreshInstalled() }
        do {
            guard let npm = executable("npm") else { throw PluginError.message("请先安装 Node.js 22 或以上版本（含 npm）") }
            try FileManager.default.createDirectory(at: runtime, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            for name in ["package.json", "package-lock.json"] {
                let destination = runtime.appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
                try FileManager.default.copyItem(at: resources.appendingPathComponent(name), to: destination)
            }
            let directory = runtime.path
            try await Task.detached {
                let p = Process(); p.executableURL = URL(fileURLWithPath: npm); p.arguments = ["ci", "--prefix", directory, "--no-audit", "--no-fund"]
                var env = ProcessInfo.processInfo.environment; env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"; p.environment = env
                let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe; try p.run()
                let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
                guard p.terminationStatus == 0 else { throw PluginError.message(String((String(data: data, encoding: .utf8) ?? "适配器安装失败").suffix(1200))) }
            }.value
            message = "适配器已安装，可以开启桥接"
        } catch { self.error = error.localizedDescription; message = "安装未完成" }
    }
    func connectPlugin() async {
        error = nil
        do {
            let token = try configuration()
            if !running { await start() }
            guard running else { return }
            // Reload the owned bridge so a changed extension ID takes effect.
            if process != nil { process?.terminate(); process = nil; running = false; try? await Task.sleep(for: .milliseconds(350)); await start(); guard running else { return } }
            guard let url = URL(string: "chrome-extension://\(extensionID)/src/options.html#bridge-token=\(token)"), let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") else { throw PluginError.message("请先安装 Chrome 并加载标签分组插件") }
            NSWorkspace.shared.open([url], withApplicationAt: chrome, configuration: NSWorkspace.OpenConfiguration()) { [weak self] _, error in
                if let error { Task { @MainActor in self?.error = error.localizedDescription } }
            }
        } catch { self.error = error.localizedDescription }
    }
    func revealLog() { NSWorkspace.shared.selectFile(root.appendingPathComponent("bridge.log").path, inFileViewerRootedAtPath: root.path) }
}

struct TabBridgePage: View {
    @ObservedObject private var service = TabBridgeService.shared
    let p = GrovePalette()
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionHeading(eyebrow: "BROWSER / ACP", title: "让浏览器，接上你的助手。", subtitle: "标签分组与 AI 对话使用同一条 ACP 连接。在插件里自由选择 Codex、Pi 或 Claude Code。")
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Image(systemName: "network").font(.system(size: 28)).foregroundStyle(p.accent)
                        VStack(alignment: .leading, spacing: 6) { Text("浏览器桥接").font(.title3); Text(service.message).font(.callout).foregroundStyle(p.secondary) }
                        Spacer()
                        Toggle("开启桥接", isOn: Binding(get: { service.running }, set: { enabled in if enabled { Task { await service.start() } } else { service.stop() } })).toggleStyle(.switch).tint(p.accent).disabled(service.busy || service.external)
                    }
                    Divider()
                    Text("Chrome 扩展 ID").font(.headline)
                    TextField("chrome://extensions 中的扩展 ID", text: $service.extensionID).textFieldStyle(.roundedBorder).font(.system(.body, design: .monospaced)).disabled(service.busy)
                    Text("在 Chrome 中加载 extensions/ai-tab-grouper 后复制扩展 ID。插件弹窗自带桥接开关，点击开启即可自动连接。").font(.callout).foregroundStyle(p.secondary)
                    HStack {
                        Button(service.installed ? "重新安装适配器" : "安装 ACP 适配器") { Task { await service.install() } }.disabled(service.busy || service.running)
                        Button("连接插件 ↗") { Task { await service.connectPlugin() } }.buttonStyle(.borderedProminent).tint(p.accent).disabled(service.busy || !service.installed)
                        Spacer(); Button("查看日志") { service.revealLog() }
                    }
                    if service.busy { ProgressView().controlSize(.small) }
                    if let error = service.error { Text(error).font(.callout).foregroundStyle(.orange).textSelection(.enabled) }
                }.padding(26).background(p.card, in: RoundedRectangle(cornerRadius: 20))
                VStack(alignment: .leading, spacing: 12) {
                    Text("第一次使用").font(.headline)
                    Text("1. 安装适配器，并在终端登录所需 Agent。\n2. 在 Chrome 扩展管理页重新加载标签分组插件。\n3. 在插件弹窗中开启「ACP 桥接」。\n4. 在插件设置中选择 Agent，保存并测试连接。").font(.callout).foregroundStyle(p.secondary).lineSpacing(7)
                    Text("只监听 127.0.0.1:48765。关闭桥接会停止当前请求；关闭 Grove 窗口仍运行，退出 Grove 时停止。开启状态会随 Grove 下次启动恢复。").font(.caption).foregroundStyle(p.secondary).lineSpacing(5)
                }
            }.padding(30).frame(maxWidth: 1000).frame(maxWidth: .infinity, alignment: .top)
        }
    }
}

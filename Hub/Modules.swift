import Foundation
import AppKit
import CryptoKit

struct ModuleDescriptor: Codable, Identifiable, Equatable {
    var id: String; var name: String; var version: String; var bundleID: String
    var protocolVersion: Int; var minMacOS: String; var architecture: String
    var repository: String; var appName: String; var icon: String; var description: String
    var sha256: String; var assetName: String
    var downloadURL: URL { URL(string: "https://github.com/\(repository)/releases/download/v\(version)/\(assetName)")! }
    var repositoryURL: URL { URL(string: "https://github.com/"+repository)! }
    var supported: Bool {
        let parts = minMacOS.split(separator: ".").compactMap { Int($0) }
        return architecture == "arm64" && protocolVersion == 1 && ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: parts.first ?? 99, minorVersion: parts.dropFirst().first ?? 0, patchVersion: 0))
    }
}

struct ModuleSnapshot {
    var summary: [String:String] = [:]; var running = false; var version = ""; var integrated = false
}

enum ModuleFiles {
    static let applications = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications", isDirectory: true)
    static let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CyanGroveHub", isDirectory: true)
    static func managedApp(_ m: ModuleDescriptor) -> URL { applications.appendingPathComponent(m.appName, isDirectory: true) }
    static func matches(_ url: URL, _ m: ModuleDescriptor) -> Bool {
        guard let bundle = Bundle(url: url), bundle.bundleIdentifier == m.bundleID,
              let executable = bundle.executableURL, FileManager.default.isExecutableFile(atPath: executable.path),
              executable.resolvingSymlinksInPath().path.hasPrefix(url.resolvingSymlinksInPath().path + "/") else { return false }
        return true
    }
    static func installed(_ m: ModuleDescriptor) -> URL? {
        [managedApp(m), URL(fileURLWithPath: "/Applications").appendingPathComponent(m.appName)].first { matches($0,m) }
    }
    static func run(_ executable: String, _ arguments: [String]) throws {
        let p = Process(); p.executableURL = URL(fileURLWithPath: executable); p.arguments = arguments
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe
        try p.run(); let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
        guard p.terminationStatus == 0 else { throw ModuleIPC.error(String((String(data:data,encoding:.utf8) ?? "操作失败").suffix(1200))) }
    }
    static func install(_ archive: URL, module: ModuleDescriptor, applicationsRoot: URL = applications, supportRoot: URL = support) throws {
        guard module.appName == URL(fileURLWithPath: module.appName).lastPathComponent, module.appName.hasSuffix(".app") else { throw ModuleIPC.error("安装目标名称无效") }
        guard (try? ModuleIPC.request(module.id, action: "status")) == nil else { throw ModuleIPC.error("请先停止运行中的模块") }
        guard module.supported else { throw ModuleIPC.error("当前系统不支持这个模块") }
        guard module.sha256.count == 64, module.sha256.allSatisfy({ $0.isHexDigit }) else { throw ModuleIPC.error("缺少安装包校验值") }
        let size = try archive.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0 && size < 512*1024*1024 else { throw ModuleIPC.error("安装包大小异常") }
        let data = try Data(contentsOf: archive, options: .mappedIfSafe)
        let digest = SHA256.hash(data:data).map { String(format:"%02x",$0) }.joined()
        guard digest == module.sha256.lowercased() else { throw ModuleIPC.error("安装包 SHA-256 校验失败，未安装") }
        let staging = supportRoot.appendingPathComponent("Staging/"+UUID().uuidString, isDirectory:true)
        try FileManager.default.createDirectory(at:staging,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        defer { try? FileManager.default.removeItem(at:staging) }
        try run("/usr/bin/ditto", ["-x","-k",archive.path,staging.path])
        let app = staging.appendingPathComponent(module.appName)
        guard matches(app,module), let b = Bundle(url:app), b.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String == module.version.components(separatedBy:"-")[0] else { throw ModuleIPC.error("安装包的模块身份或版本不匹配") }
        try run("/usr/bin/codesign",["--verify","--deep","--strict",app.path])
        try FileManager.default.createDirectory(at:applicationsRoot,withIntermediateDirectories:true)
        let destination = applicationsRoot.appendingPathComponent(module.appName), backup = staging.appendingPathComponent("previous.app")
        if FileManager.default.fileExists(atPath:destination.path) {
            guard matches(destination,module) else { throw ModuleIPC.error("目标位置存在其他软件，未覆盖") }
            try FileManager.default.moveItem(at:destination,to:backup)
        }
        do { try FileManager.default.moveItem(at:app,to:destination) }
        catch { if FileManager.default.fileExists(atPath:backup.path) { try? FileManager.default.moveItem(at:backup,to:destination) }; throw error }
    }
}

@MainActor final class ModuleCenter: ObservableObject {
    @Published var modules: [ModuleDescriptor]
    @Published var snapshots: [String:ModuleSnapshot] = [:]
    @Published var busy = Set<String>(); @Published var errors: [String:String] = [:]
    @Published var notice: String?; @Published var selected = "home"
    @Published var enabled: Set<String> { didSet { UserDefaults.standard.set(Array(enabled), forKey:"hub.enabledModules") } }
    private var timer: Timer?; private var polling = false
    init() {
        let url = Bundle.main.url(forResource:"modules",withExtension:"json")!
        modules = (try? JSONDecoder().decode([ModuleDescriptor].self,from:Data(contentsOf:url))) ?? []
        enabled = Set(UserDefaults.standard.stringArray(forKey:"hub.enabledModules") ?? [])
    }
    func start() {
        Task { await poll(); for m in modules where enabled.contains(m.id) && ModuleFiles.installed(m) != nil { await launch(m,show:false) } }
        timer = Timer.scheduledTimer(withTimeInterval:2,repeats:true) { [weak self] _ in Task { @MainActor in await self?.poll() } }
    }
    func poll() async {
        guard !polling else { return }; polling = true; defer { polling=false }
        let ids=modules.map(\.id)
        let values = await withTaskGroup(of:(String,ModuleSnapshot).self,returning:[String:ModuleSnapshot].self) { group in
            for id in ids { group.addTask {
                guard let result = try? ModuleIPC.request(id,action:"status") else { return (id,ModuleSnapshot()) }
                return (id,ModuleSnapshot(summary:result["summary"] as? [String:String] ?? [:],running:true,version:result["version"] as? String ?? "",integrated:result["integrated"] as? Bool ?? false))
            } }
            var result:[String:ModuleSnapshot]=[:];for await (id,snapshot) in group { result[id]=snapshot }; return result
        }
        snapshots=values
    }
    func launch(_ m:ModuleDescriptor,show:Bool) async {
        guard let app = ModuleFiles.installed(m) else { errors[m.id]="请先安装模块"; return }
        guard m.supported else { errors[m.id]="系统版本不支持"; return }
        errors[m.id]=nil
        do {
            if snapshots[m.id]?.running == true {
                let id=m.id;_ = try await Task.detached { try ModuleIPC.request(id,action:show ? "show":"integrated") }.value
            } else {
                let configuration = NSWorkspace.OpenConfiguration(); configuration.activates=show; configuration.arguments=show ? []:["--integrated"]
                try await NSWorkspace.shared.openApplication(at:app,configuration:configuration)
            }
            await poll()
        } catch { errors[m.id]=error.localizedDescription }
    }
    func action(_ m:ModuleDescriptor,_ action:String) async {
        let id=m.id
        do {
            _ = try await Task.detached { try ModuleIPC.request(id,action:action) }.value
            if action == "quit" { for _ in 0..<20 { try? await Task.sleep(nanoseconds:100_000_000); if (try? await Task.detached { try ModuleIPC.request(id,action:"status") }.value) == nil { break } } }
            errors[id]=nil; await poll()
        } catch { errors[id]=error.localizedDescription }
    }
    func setEnabled(_ m:ModuleDescriptor,_ value:Bool) async {
        if value { enabled.insert(m.id); await launch(m,show:false) }
        else { enabled.remove(m.id); if snapshots[m.id]?.running == true { await action(m,"quit") } }
    }
    func install(_ m:ModuleDescriptor,local:URL?=nil) async {
        guard !busy.contains(m.id) else { return };busy.insert(m.id);defer {busy.remove(m.id)};errors[m.id]=nil
        do {
            guard snapshots[m.id]?.running != true else { throw ModuleIPC.error("请先停止模块再安装或更新") }
            let archive:URL
            if let local { archive=local }
            else {
                let (url,response)=try await URLSession.shared.download(from:m.downloadURL)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ModuleIPC.error("安装包下载失败") };archive=url
            }
            defer { if local == nil { try? FileManager.default.removeItem(at:archive) } }
            try await Task.detached { try ModuleFiles.install(archive,module:m) }.value
            notice=m.name+" 已安装；可以独立打开，也可以在这里启用。"
            await poll()
        } catch {errors[m.id]=error.localizedDescription}
    }
    func uninstall(_ m:ModuleDescriptor) async {
        guard !busy.contains(m.id) else {return};busy.insert(m.id);defer {busy.remove(m.id)}
        if snapshots[m.id]?.running == true { await action(m,"quit"); guard snapshots[m.id]?.running != true else {return} }
        let app=ModuleFiles.managedApp(m)
        guard ModuleFiles.matches(app,m) else { errors[m.id]="只能移除本工作台管理的安装；其他位置请在 Finder 中管理。";return }
        do {
            var trashed:NSURL?;try FileManager.default.trashItem(at:app,resultingItemURL:&trashed)
            enabled.remove(m.id);notice=m.name+" 已移至废纸篓，配置和数据已保留。";errors[m.id]=nil;await poll()
        } catch {errors[m.id]=error.localizedDescription}
    }
    func checkUpdates() async {
        notice="正在检查 GitHub Releases…"
        var changed=0
        for index in modules.indices {
            let current=modules[index]
            do {
                var request=URLRequest(url:URL(string:"https://api.github.com/repos/\(current.repository)/releases?per_page=10")!);request.setValue("CyanGrove/0.8",forHTTPHeaderField:"User-Agent");request.timeoutInterval=20
                let (data,response)=try await URLSession.shared.data(for:request)
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      let releases=try JSONSerialization.jsonObject(with:data) as? [[String:Any]],
                      let release=releases.first(where:{$0["draft"] as? Bool != true}),
                      let assets=release["assets"] as? [[String:Any]],
                      let asset=assets.first(where:{$0["name"] as? String == "module.json"}),
                      let path=asset["browser_download_url"] as? String,let url=URL(string:path),url.scheme=="https",url.host=="github.com",url.path.hasPrefix("/"+current.repository+"/releases/download/") else {continue}
                let (manifest,_)=try await URLSession.shared.data(from:url)
                guard manifest.count<65536 else {continue};let candidate=try JSONDecoder().decode(ModuleDescriptor.self,from:manifest)
                guard candidate.id==current.id,candidate.bundleID==current.bundleID,candidate.repository==current.repository,candidate.appName==current.appName,candidate.assetName.range(of:"^[A-Za-z0-9._-]+$",options:.regularExpression) != nil,candidate.supported,candidate.version.compare(current.version,options:.numeric) == .orderedDescending else {continue}
                modules[index]=candidate;changed+=1
            } catch {errors[current.id]="检查更新失败："+error.localizedDescription}
        }
        notice=changed>0 ? "发现 \(changed) 个新版本，可在模块卡片中更新。":"检查完成，当前目录没有可用的新版本；下载失败的模块会单独提示。"
    }
}

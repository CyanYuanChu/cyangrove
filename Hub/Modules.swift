import Foundation
import AppKit
import CryptoKit

struct ModuleDescriptor: Codable, Identifiable, Equatable {
    var id: String; var name: String; var version: String; var bundleID: String
    var protocolVersion: Int; var minMacOS: String; var architecture: String
    var repository: String; var appName: String; var icon: String; var description: String
    var moduleName: String; var pluginBundleID: String
    var sha256: String; var assetName: String
    var standaloneAssetName: String?
    var downloadURL: URL { URL(string: "https://github.com/\(repository)/releases/download/v\(version)/\(assetName)")! }
    var repositoryURL: URL { URL(string: "https://github.com/"+repository)! }
    var standaloneURL: URL { URL(string: "https://github.com/\(repository)/releases/tag/v\(version)")! }
    var supported: Bool {
        let parts = minMacOS.split(separator: ".").compactMap { Int($0) }
        return architecture == "arm64" && protocolVersion == 2 && ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: parts.first ?? 99, minorVersion: parts.dropFirst().first ?? 0, patchVersion: 0))
    }
    func sameIdentity(as other: Self) -> Bool {
        id == other.id && bundleID == other.bundleID && repository == other.repository && moduleName == other.moduleName && pluginBundleID == other.pluginBundleID && appName == other.appName
    }
    var safePaths: Bool {
        id.range(of:"^cyan-[a-z-]+$",options:.regularExpression) != nil && moduleName == id+".groveplugin" && version.range(of:"^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[A-Za-z0-9.-]+)?$",options:.regularExpression) != nil && assetName.range(of:"^[A-Za-z0-9._-]+$",options:.regularExpression) != nil
    }
}
struct ModuleSnapshot { var summary:[String:String] = [:]; var running=false; var version="" }

enum ModuleFiles {
    static let support = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("CyanGroveHub",isDirectory:true)
    static var modulesRoot: URL { support.appendingPathComponent("Modules",isDirectory:true) }
    static func folder(_ m:ModuleDescriptor, root:URL=modulesRoot)->URL { root.appendingPathComponent(m.id,isDirectory:true) }
    static func payload(_ m:ModuleDescriptor,root:URL=modulesRoot)->URL { folder(m,root:root).appendingPathComponent(m.version,isDirectory:true).appendingPathComponent(m.moduleName,isDirectory:true) }
    static func installedDescriptor(_ m:ModuleDescriptor,root:URL=modulesRoot)->ModuleDescriptor? {
        guard let data=try? Data(contentsOf:folder(m,root:root).appendingPathComponent("installed.json")),let saved=try? JSONDecoder().decode(ModuleDescriptor.self,from:data),saved.safePaths,saved.sameIdentity(as:m),saved.supported, matches(payload(saved,root:root),saved) else{return nil};return saved
    }
    static func installed(_ m:ModuleDescriptor)->URL? { installedDescriptor(m).map{payload($0)} }
    static func matches(_ url:URL,_ m:ModuleDescriptor)->Bool {
        guard m.safePaths,let data=try? Data(contentsOf:url.appendingPathComponent("Contents/Info.plist")),let info=try? PropertyListSerialization.propertyList(from:data,format:nil) as? [String:Any],info["CFBundleIdentifier"] as? String == m.pluginBundleID,let executable=info["CFBundleExecutable"] as? String,executable=="CyanFeature",
              let manifest=try? Data(contentsOf:url.appendingPathComponent("Contents/Resources/module.json")),let embedded=try? JSONSerialization.jsonObject(with:manifest) as? [String:Any],embedded["id"] as? String==m.id,embedded["version"] as? String==m.version,embedded["protocolVersion"] as? Int==2 else{return false}
        let exe=url.appendingPathComponent("Contents/MacOS/"+executable)
        return FileManager.default.isExecutableFile(atPath:exe.path) && exe.resolvingSymlinksInPath().path.hasPrefix(url.resolvingSymlinksInPath().path+"/")
    }
    static func run(_ executable:String,_ arguments:[String]) throws {
        let p=Process();p.executableURL=URL(fileURLWithPath:executable);p.arguments=arguments
        let pipe=Pipe();p.standardOutput=pipe;p.standardError=pipe;try p.run()
        let data=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
        guard p.terminationStatus==0 else{throw PluginError.message(String((String(data:data,encoding:.utf8) ?? "操作失败").suffix(1600)))}
    }
    static func verify(_ url:URL,_ m:ModuleDescriptor)throws {
        guard matches(url,m) else{throw PluginError.message("功能包身份或接口不匹配")}
        try run("/usr/bin/codesign",["--verify","--deep","--strict",url.path])
    }
    static func install(_ archive:URL,module:ModuleDescriptor,root:URL=modulesRoot)throws {
        guard module.safePaths,module.supported else{throw PluginError.message("功能包路径、系统或接口不兼容")}
        guard module.sha256.count==64,module.sha256.allSatisfy({$0.isHexDigit}) else{throw PluginError.message("缺少功能包校验值")}
        let size=try archive.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
        guard size>0,size<512*1024*1024 else{throw PluginError.message("功能包大小异常")}
        let digest=SHA256.hash(data:try Data(contentsOf:archive,options:.mappedIfSafe)).map{String(format:"%02x",$0)}.joined()
        guard digest==module.sha256.lowercased() else{throw PluginError.message("功能包 SHA-256 校验失败，未安装")}
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let staging=root.appendingPathComponent(".staging-"+UUID().uuidString,isDirectory:true)
        try FileManager.default.createDirectory(at:staging,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700]);defer{try? FileManager.default.removeItem(at:staging)}
        try run("/usr/bin/ditto",["-x","-k",archive.path,staging.path])
        let plugin=staging.appendingPathComponent(module.moduleName)
        try verify(plugin,module)
        let destination=payload(module,root:root),versionFolder=destination.deletingLastPathComponent()
        if FileManager.default.fileExists(atPath:destination.path){
            // 版本目录不可原地替换，避免覆盖本进程已映射的 Swift 代码。
            try verify(destination,module)
            let installedData=try Data(contentsOf:destination.appendingPathComponent("Contents/MacOS/CyanFeature"))
            let newData=try Data(contentsOf:plugin.appendingPathComponent("Contents/MacOS/CyanFeature"))
            let oldSeal = try Data(contentsOf: destination.appendingPathComponent("Contents/_CodeSignature/CodeResources"))
            let newSeal = try Data(contentsOf: plugin.appendingPathComponent("Contents/_CodeSignature/CodeResources"))
            guard SHA256.hash(data:installedData)==SHA256.hash(data:newData), oldSeal == newSeal else{throw PluginError.message("同一版本已有不同代码，请发布新版本号")}
        }else{
            try FileManager.default.createDirectory(at:versionFolder,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            try FileManager.default.moveItem(at:plugin,to:destination)
        }
        let record=folder(module,root:root).appendingPathComponent("installed.json")
        try JSONEncoder().encode(module).write(to:record,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:record.path)
    }
}

@MainActor final class ModuleCenter:ObservableObject {
    @Published var modules:[ModuleDescriptor]
    @Published var snapshots:[String:ModuleSnapshot]=[:]
    @Published var busy=Set<String>();@Published var errors:[String:String]=[:]
    @Published var notice:String?;@Published var selected="home"
    @Published var enabled:Set<String>{didSet{UserDefaults.standard.set(Array(enabled),forKey:"hub.enabledModules")}}
    @Published private(set) var active=Set<String>()
    private var images:[String:GrovePluginHandle]=[:];private var timer:Timer?
    init(){
        let url=Bundle.main.url(forResource:"modules",withExtension:"json")!
        modules=(try? JSONDecoder().decode([ModuleDescriptor].self,from:Data(contentsOf:url))) ?? []
        enabled=Set(UserDefaults.standard.stringArray(forKey:"hub.enabledModules") ?? [])
        if let data=try? Data(contentsOf:ModuleFiles.support.appendingPathComponent("catalog-updates.json")),let saved=try? JSONDecoder().decode([ModuleDescriptor].self,from:data){
            for candidate in saved{if let index=modules.firstIndex(where:{candidate.sameIdentity(as:$0)}),candidate.supported,candidate.safePaths,candidate.version.compare(modules[index].version,options:.numeric) == .orderedDescending{modules[index]=candidate}}
        }
        for i in modules.indices{if let saved=ModuleFiles.installedDescriptor(modules[i]),saved.version.compare(modules[i].version,options:.numeric) == .orderedDescending{modules[i]=saved}}
    }
    func start(){
        Task{for m in modules where enabled.contains(m.id){await setEnabled(m,true,installIfNeeded:false)};poll()}
        timer=Timer.scheduledTimer(withTimeInterval:2,repeats:true){[weak self] _ in Task{@MainActor in self?.poll()}}
    }
    func controller(_ id:String)->NSViewController?{guard active.contains(id) else{return nil};return images[id]?.plugin.contentController}
    func menuBarImage(_ id:String)->NSImage?{guard active.contains(id) else{return nil};return images[id]?.plugin.menuBarImage ?? nil}
    func loadedVersion(_ id:String)->String?{images[id]?.plugin.moduleInfo["version"] as? String}
    func needsRestart(_ m:ModuleDescriptor)->Bool{guard let version=loadedVersion(m.id),let installed=ModuleFiles.installedDescriptor(m) else{return false};return installed.version != version}
    func poll(){
        var result:[String:ModuleSnapshot]=[:]
        for m in modules{result[m.id]=ModuleSnapshot(summary:active.contains(m.id) ? images[m.id]?.plugin.summary as? [String:String] ?? [:]:[:],running:active.contains(m.id),version:loadedVersion(m.id) ?? ModuleFiles.installedDescriptor(m)?.version ?? "")}
        snapshots=result
    }
    func setEnabled(_ m:ModuleDescriptor,_ value:Bool,installIfNeeded:Bool=true) async {
        if !value{images[m.id]?.plugin.stopFeature();active.remove(m.id);enabled.remove(m.id);errors[m.id]=nil;poll();return}
        if active.contains(m.id){enabled.insert(m.id);return}
        guard !busy.contains(m.id) else{return}
        if ModuleFiles.installed(m)==nil{
            guard installIfNeeded else{errors[m.id]="请在模块中心安装功能包";return}
            await install(m);guard ModuleFiles.installed(m) != nil else{return}
        }
        busy.insert(m.id);defer{busy.remove(m.id)}
        do{
            guard !needsRestart(m) else{throw PluginError.message("新版已安装，重启 Grove 后即可使用")}
            let id=m.id
            if (try? await Task.detached{try ModuleIPC.request(id,action:"status")}.value) != nil{throw PluginError.message("独立版正在使用这个功能，请先退出独立版后在 Grove 开启")}
            if images[m.id]==nil{
                let installed=ModuleFiles.installedDescriptor(m)!,url=ModuleFiles.payload(installed)
                try await Task.detached{try ModuleFiles.verify(url,installed)}.value
                let handle=try GrovePluginHandle(url:url)
                guard handle.plugin.moduleInfo["id"] as? String==m.id,handle.plugin.moduleInfo["protocolVersion"] as? Int==2 else{throw PluginError.message("原生模块入口身份不匹配")}
                images[m.id]=handle
            }
            if let error=images[m.id]!.plugin.startFeature(){throw PluginError.message(error as String)}
            active.insert(m.id);enabled.insert(m.id);errors[m.id]=nil;poll()
        }catch{errors[m.id]=error.localizedDescription;enabled.remove(m.id)}
    }
    func open(_ m:ModuleDescriptor) async{selected=m.id;await setEnabled(m,true)}
    func action(_ m:ModuleDescriptor,_ action:String) async{
        guard active.contains(m.id) else{return}
        if action=="refresh"{images[m.id]?.plugin.refreshFeature()}
        else{images[m.id]?.plugin.performAction(action as NSString)};poll()
    }
    func stopAll(){timer?.invalidate();for handle in images.values{handle.plugin.stopFeature()};active.removeAll();poll()}
    func install(_ m:ModuleDescriptor,local:URL?=nil) async {
        guard !busy.contains(m.id) else{return};busy.insert(m.id);defer{busy.remove(m.id)};errors[m.id]=nil
        do{
            let archive:URL
            if let local{archive=local}else{
                var request=URLRequest(url:m.downloadURL);request.timeoutInterval=90
                let (url,response)=try await URLSession.shared.download(for:request)
                guard (response as? HTTPURLResponse)?.statusCode==200 else{throw PluginError.message("功能包下载失败")};archive=url
            }
            defer{if local==nil{try? FileManager.default.removeItem(at:archive)}}
            try await Task.detached{try ModuleFiles.install(archive,module:m)}.value
            notice=m.name+(needsRestart(m) ? " 新版已安装，重启 Grove 后生效。":" 已安装，可以直接在 Grove 开启。")
            poll()
        }catch{errors[m.id]=error.localizedDescription}
    }
    func uninstall(_ m:ModuleDescriptor) async{
        guard !busy.contains(m.id) else{return};busy.insert(m.id);defer{busy.remove(m.id)}
        images[m.id]?.plugin.stopFeature();active.remove(m.id);enabled.remove(m.id)
        do{let path=ModuleFiles.folder(m);if FileManager.default.fileExists(atPath:path.path){var trashed:NSURL?;try FileManager.default.trashItem(at:path,resultingItemURL:&trashed)};notice=m.name+" 已卸载，配置和历史已保留。";errors[m.id]=nil;poll()}
        catch{errors[m.id]=error.localizedDescription}
    }
    func checkUpdates() async{
        notice="正在检查模块更新…";var changed=0;var failed=0
        for index in modules.indices{
            let current=modules[index]
            do{
                var request=URLRequest(url:URL(string:"https://api.github.com/repos/\(current.repository)/releases?per_page=15")!);request.setValue("CyanGrove/0.9",forHTTPHeaderField:"User-Agent");request.timeoutInterval=20
                let (data,response)=try await URLSession.shared.data(for:request)
                guard (response as? HTTPURLResponse)?.statusCode==200,let releases=try JSONSerialization.jsonObject(with:data) as? [[String:Any]] else{throw PluginError.message("GitHub 暂未返回版本列表")}
                for release in releases where release["draft"] as? Bool != true{
                    guard let assets=release["assets"] as? [[String:Any]],let asset=assets.first(where:{$0["name"] as? String=="module.json"}),let path=asset["browser_download_url"] as? String,let url=URL(string:path),url.scheme=="https",url.host=="github.com",url.path.hasPrefix("/"+current.repository+"/releases/download/") else{continue}
                    let (manifest,r)=try await URLSession.shared.data(from:url);guard (r as? HTTPURLResponse)?.statusCode==200,manifest.count<65536,let candidate=try? JSONDecoder().decode(ModuleDescriptor.self,from:manifest),candidate.sameIdentity(as:current),candidate.safePaths,candidate.supported else{continue}
                    if candidate.version.compare(current.version,options:.numeric) == .orderedDescending{modules[index]=candidate;changed+=1};break
                }
                errors[current.id]=nil
            }catch{failed+=1;errors[current.id]="检查更新失败："+error.localizedDescription}
        }
        try? FileManager.default.createDirectory(at:ModuleFiles.support,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        try? JSONEncoder().encode(modules).write(to:ModuleFiles.support.appendingPathComponent("catalog-updates.json"),options:.atomic)
        notice="发现 \(changed) 个模块更新"+(failed>0 ? "，\(failed) 个模块暂未检查成功。":"。")
    }
}

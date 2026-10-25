import Foundation
import AppKit
import CryptoKit

@MainActor enum HubChecks {
    static func run() async {
        var failed=0;var passed=0
        func check(_ value:Bool,_ name:String){print((value ? "PASS ":"FAIL ")+name);if value{passed+=1}else{failed+=1}}
        let center=ModuleCenter()
        check(center.modules.count==5 && Set(center.modules.map(\.id)).count==5,"five optional native features")
        check(center.modules.allSatisfy{$0.protocolVersion==2 && $0.safePaths && $0.repository.hasPrefix("CyanYuanChu/")},"native feature ABI and identities")
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("cyan-native-test-"+UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:root)}
        do{
            var m=center.modules[0];m.id="cyan-test-fixture";m.name="Fixture";m.moduleName=m.id+".groveplugin";m.pluginBundleID="io.github.cyanyuanchu.fixture.feature";m.version="0.2.0-preview.1";m.minMacOS="14.0"
            let plugin=root.appendingPathComponent(m.moduleName),c=plugin.appendingPathComponent("Contents"),exe=c.appendingPathComponent("MacOS/CyanFeature")
            try FileManager.default.createDirectory(at:exe.deletingLastPathComponent(),withIntermediateDirectories:true)
            try FileManager.default.createDirectory(at:c.appendingPathComponent("Resources"),withIntermediateDirectories:true)
            try FileManager.default.copyItem(at:Bundle.main.executableURL!,to:exe)
            let info:[String:Any]=["CFBundleIdentifier":m.pluginBundleID,"CFBundleExecutable":"CyanFeature","CFBundleName":"Fixture","CFBundlePackageType":"BNDL","CFBundleShortVersionString":"0.2.0"]
            try PropertyListSerialization.data(fromPropertyList:info,format:.xml,options:0).write(to:c.appendingPathComponent("Info.plist"))
            try JSONEncoder().encode(m).write(to:c.appendingPathComponent("Resources/module.json"))
            try ModuleFiles.run("/usr/bin/codesign",["--force","--sign","-",plugin.path])
            let zip=root.appendingPathComponent("fixture.zip");try ModuleFiles.run("/usr/bin/ditto",["-c","-k","--keepParent",plugin.path,zip.path])
            m.sha256=SHA256.hash(data:try Data(contentsOf:zip)).map{String(format:"%02x",$0)}.joined()
            let modules=root.appendingPathComponent("installed")
            try ModuleFiles.install(zip,module:m,root:modules)
            check(ModuleFiles.installedDescriptor(m,root:modules)?.version==m.version,"native feature install records independent version")
            var bad=m;bad.sha256=String(repeating:"0",count:64)
            do{try ModuleFiles.install(zip,module:bad,root:modules);check(false,"corrupt package rejected")}catch{check(true,"corrupt package rejected")}
            bad=m;bad.pluginBundleID+=".wrong"
            do{try ModuleFiles.install(zip,module:bad,root:modules);check(false,"wrong native identity rejected")}catch{check(true,"wrong native identity rejected")}
            check(ModuleFiles.installedDescriptor(m,root:modules)?.version==m.version,"failed update preserves installed version")
            bad=m;bad.moduleName="../Escape.groveplugin"
            do{try ModuleFiles.install(zip,module:bad,root:modules);check(false,"path traversal rejected")}catch{check(true,"path traversal rejected")}
            bad=m;bad.protocolVersion=99
            do{try ModuleFiles.install(zip,module:bad,root:modules);check(false,"incompatible native ABI rejected")}catch{check(true,"incompatible native ABI rejected")}
        }catch{check(false,"native installer fixture: "+error.localizedDescription)}
        print("HUB_TESTS \(passed) passed, \(failed) failed");if failed>0{exit(1)}
    }
    static func verifyNativeModules(_ root:URL) async{
        _=NSApplication.shared
        let center=ModuleCenter();let before=NSApp.windows.count
        var loaded:[GrovePluginHandle]=[]
        do{
            for m in center.modules{
                let url=root.appendingPathComponent(m.id+"/build/"+m.moduleName)
                try ModuleFiles.verify(url,m)
                let handle=try GrovePluginHandle(url:url)
                if let error=handle.plugin.startFeature(){throw PluginError.message(error as String)}
                loaded.append(handle)
                let shell = root.appendingPathComponent(m.id+"/build/"+m.appName+"/Contents/MacOS/"+m.name)
                let probe = Process(); probe.executableURL = shell; probe.arguments = ["--probe-feature-lock", "--no-autostart", "--no-shortcut", "--no-widget-registration"]; probe.standardOutput = FileHandle.nullDevice; probe.standardError = FileHandle.nullDevice; try probe.run(); probe.waitUntilExit()
                guard probe.terminationStatus == 2 else { throw PluginError.message("独立版与 Grove 没有正确互斥") }
                let controller=handle.plugin.contentController;controller.view.frame=NSRect(x:0,y:0,width:950,height:760);controller.view.layoutSubtreeIfNeeded()
                guard NSStringFromClass(type(of:controller)).contains("NSHostingController"),handle.plugin.moduleInfo["id"] as? String==m.id else{throw PluginError.message("未提供完整原生功能界面")}
                let result=await withCheckedContinuation{continuation in handle.plugin.runSelfTests{continuation.resume(returning:$0)}}
                guard result else{throw PluginError.message("功能自检失败")}
                print("NATIVE_IN_GROVE_OK \(m.id) host_pid=\(ProcessInfo.processInfo.processIdentifier) view=\(NSStringFromClass(type(of:controller)))")
            }
            guard NSApp.windows.count==before else{throw PluginError.message("加载模块意外打开了独立窗口")}
            for handle in loaded{handle.plugin.stopFeature();if let error=handle.plugin.startFeature(){throw PluginError.message(error as String)};handle.plugin.stopFeature()}
            print("NATIVE_HOST_TESTS_OK five-features-one-process no-external-window stop-reenable")
        }catch{for handle in loaded{handle.plugin.stopFeature()};print("NATIVE_HOST_FAILED "+error.localizedDescription);exit(1)}
    }
}

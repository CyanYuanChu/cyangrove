const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(fetch){
 let cleaned=0, seen;
 const context=vm.createContext({fetch:async(...args)=>{seen=args;return fetch(...args);},URL,AbortController,setTimeout:()=>1,setInterval:()=>2,clearTimeout:()=>cleaned++,clearInterval:()=>cleaned++,chrome:{runtime:{getPlatformInfo:async()=>{}}}});
 context.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
 const source=fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8');vm.runInContext(source.slice(0,source.indexOf('async function ungroupOwnedGroups')),context);
 return {call:settings=>context.callModel({...context.AITabGrouper.DEFAULT_SETTINGS,bridgeToken:'local-token',...settings},'test',{systemPrompt:'system'}),get seen(){return seen;},get cleaned(){return cleaned;}};
}
(async()=>{
 const ok=harness(async()=>({ok:true,json:async()=>({text:'{"ok":true}'})}));
 assert.equal(await ok.call({agent:'pi',acpModel:'chosen'}),'{"ok":true}');
 assert.equal(ok.seen[0],'http://127.0.0.1:48765/v1/prompt');
 const body=JSON.parse(ok.seen[1].body);assert.equal(body.agent,'pi');assert.equal(body.model,'chosen');assert.equal(body.systemPrompt,'system');assert.ok(!('apiKey' in body));assert.equal(ok.cleaned,2);
 const missing=harness(async()=>{throw Error('must not fetch');});await assert.rejects(missing.call({bridgeToken:''}),/连接插件/);
 const failure=harness(async()=>{throw TypeError('offline');});await assert.rejects(failure.call(),/Cyan Grove.*开启服务/);assert.equal(failure.cleaned,2);
 const auth=harness(async()=>({ok:false,status:401,json:async()=>({error:'密钥不匹配'})}));await assert.rejects(auth.call(),/密钥不匹配/);assert.equal(auth.cleaned,2);
 require('../src/common.js');const C=globalThis.AITabGrouper;assert.equal(C.DEFAULT_SETTINGS.transport,'acp');assert.equal(C.DEFAULT_SETTINGS.agent,'codex');assert.ok(!Object.hasOwn(C.pickSyncSettings({bridgeToken:'secret'}),'bridgeToken'));
 assert.doesNotThrow(()=>C.validateConnection({...C.DEFAULT_SETTINGS,model:'',endpoint:'invalid'}));
 let local={settings:{apiKey:'existing-api-key'}},synced={},settings={...C.DEFAULT_SETTINGS};
 const ctx=vm.createContext({URL,AbortController,chrome:{runtime:{sendNativeMessage:async(host,message)=>{assert.equal(host,'io.github.cyanyuanchu.tab_bridge');return {ok:true,running:message.action!=='stop',token:message.action==='start'?'a'.repeat(64):undefined};}},storage:{local:{get:async()=>local,set:async data=>{local={...local,...data};settings={...settings,...data.settings};}},sync:{set:async data=>{synced={...synced,...data};}}}},setTimeout,clearTimeout,setInterval,clearInterval});
 ctx.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),ctx);
 const source=fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8');vm.runInContext(source.slice(0,source.indexOf('async function ungroupOwnedGroups')),ctx);ctx.getSettings=async()=>settings;
 const enabled=await ctx.controlBridgeFromExtension('start');assert.equal(enabled.connected,true);assert.equal(enabled.running,true);assert.equal(local.settings.apiKey,'existing-api-key');assert.equal(local.settings.bridgeToken,'a'.repeat(64));assert.equal(synced.transport,'acp');assert.ok(!('bridgeToken' in synced));assert.ok(!('token' in enabled));
 const stopped=await ctx.controlBridgeFromExtension('stop');assert.equal(stopped.running,false);
 console.log('ACP routing, native lifecycle, automatic local pairing, no HTTP fallback and cleanup tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

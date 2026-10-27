const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
require('../src/common.js');require('../src/assistant-core.js');
const A=globalThis.AITabAssistantCore;
const sample=[
 {id:1,windowId:10,groupId:7,url:'https://bilibili.com/video/1',title:'视频一',index:0,lastAccessed:30},
 {id:2,windowId:10,groupId:7,url:'https://youtube.com/watch?v=2',title:'视频二',index:1,lastAccessed:20},
 {id:3,windowId:20,groupId:8,url:'https://docs.example.com/',title:'开发文档',index:0,lastAccessed:10},
 {id:4,windowId:10,groupId:-1,url:'chrome-extension://test/src/options.html',title:'插件设置',index:2,lastAccessed:40}
];
const groups=[{id:7,windowId:10,title:'视频娱乐'},{id:8,windowId:20,title:'开发工具'}];
const data=A.snapshot(sample,groups,{maxTabs:10});
assert.equal(data.tabs.length,3,'浏览器内部页面不能作为关闭目标');
assert.throws(()=>A.validate({action:'execute_js',reply:'运行',tabIds:[1]},data,'关闭视频'),/不支持|支持的操作/);
assert.throws(()=>A.validate({action:'close_tabs',reply:'关闭',tabIds:[999]},data,'关闭视频'),/快照之外/);
assert.throws(()=>A.validate({action:'close_tabs',reply:'关闭',tabIds:[4]},data,'关闭设置'),/快照之外/);
assert.throws(()=>A.validate({action:'close_tabs',reply:'关闭',tabIds:[1]},data,'有哪些视频页面'),/没有明确要求关闭/);
assert.throws(()=>A.validate({action:'close_tabs',reply:'关闭',tabIds:[1]},data,'不要关闭任何页面'),/不关闭页面/);
assert.throws(()=>A.validate({action:'focus_tab',reply:'定位',tabIds:[1,2]},data,'切到视频'),/只能定位一个/);
assert.throws(()=>A.validate({action:'close_tabs',reply:'关闭',tabIds:['1']},data,'关闭视频'),/无效的页面 ID/);
assert.deepEqual(A.validate({action:'close_tabs',reply:'关闭',tabIds:[1,1,2]},data,'关掉视频').tabIds,[1,2]);
assert.deepEqual(A.validate({action:'none',reply:'请明确分组',tabIds:[]},data,'删除分组').action,'none');

function harness({plan={action:'close_tabs',reply:'将关闭视频页面',tabIds:[1,2]},onModel=null,modelError=false,rawReplies=[],finishReason="stop",openedAt={}}={}){
 let tabs=sample.map(t=>({...t})),listener;const calls=[];let modelCalls=0;
 const local={settings:{apiKey:'test-only-key'}};
 const session={tabOpenedAt:openedAt};
 const synced={transport:'openai',model:'test',endpoint:'https://model.invalid/v1/chat/completions',maxTabs:200};
 const copy=x=>JSON.parse(JSON.stringify(x));
 const event={addListener(){}};
 const pick=(store,keys)=>typeof keys==='string'?{[keys]:copy(store[keys]??null)}:Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,copy(store[k])]));
 const chrome={
  runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getPlatformInfo:async()=>({}),onInstalled:event,onStartup:event,onMessage:{addListener(fn){listener=fn}}},
  storage:{onChanged:event,session:{get:async keys=>pick(session,keys),set:async values=>Object.assign(session,copy(values))},local:{get:async keys=>pick(local,keys),set:async values=>Object.assign(local,copy(values))},sync:{get:async keys=>pick(synced,keys),set:async values=>Object.assign(synced,copy(values))}},
  alarms:{onAlarm:event},
  tabs:{create:async options=>{calls.push(['create',options.url]);return {id:99,...options};},onCreated:event,onRemoved:event,onMoved:event,onAttached:event,onDetached:event,onReplaced:event,onUpdated:event,
   query:async q=>copy(tabs.filter(t=>!q.windowId||t.windowId===q.windowId)),
   get:async id=>{const t=tabs.find(t=>t.id===id);if(!t)throw Error('gone');return copy(t);},
   update:async(id,v)=>{calls.push(['focus',id]);return Object.assign(tabs.find(t=>t.id===id),v);},
   remove:async id=>{calls.push(['close',id]);tabs=tabs.filter(t=>t.id!==id);}},
  tabGroups:{TAB_GROUP_ID_NONE:-1,query:async()=>copy(groups),update:async()=>{}},
  windows:{get:async id=>({id,state:'normal'}),update:async()=>{}}
 };
 const context=vm.createContext({chrome,URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,
  fetch:async(url,request)=>{
   calls.push(['model']);const body=JSON.parse(request.body);
   assert.ok(body.messages[0].content.includes('用户最新一条指令'));
   assert.equal(body.response_format.type,'json_object','真实后台请求必须启用 JSON 输出约束');
   assert.ok(!body.messages[1].content.includes('test-only-key'));
   if(onModel)onModel(tabs);
   if(modelError)throw Error('model unavailable');
   return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:rawReplies[modelCalls++]??JSON.stringify(plan)},finish_reason:finishReason}]})};
  }
 });
 context.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8'),context);
 return {calls,local,tabs:()=>tabs,send:(m,sender={url:'chrome-extension://test/src/options.html'})=>new Promise(resolve=>{assert.equal(listener(m,sender,resolve),true);})};
}
(async()=>{
 const h=harness();
 assert.equal((await h.send({type:'CHAT_GET'})).state.messages.length,0);
 const entry=harness();
 assert.equal((await entry.send({type:'OPEN_CHAT'},{url:'chrome-extension://test/src/popup.html'})).ok,true);
 assert.ok(entry.calls.some(c=>c[0]==='focus'&&c[1]===4),'已有设置页时复用页面并定位对话区');
 const result=await h.send({type:'CHAT_SEND',text:'关闭视频娱乐分组里的页面',scope:'current',windowId:10});
 assert.equal(result.ok,true);
 assert.match(result.state.messages.at(-1).text,/已关闭 2 个页面/);
 assert.deepEqual(h.calls.filter(c=>c[0]==='close'),[['close',1],['close',2]]);
 assert.ok(h.tabs().some(t=>t.id===3)&&h.tabs().some(t=>t.id===4),'不能操作其他窗口和扩展自身页面');
 assert.equal(h.local.assistantState.busy,false);
 assert.equal((await h.send({type:'CHAT_GET'})).state.messages.length,2,'重新打开对话可继续');
 await h.send({type:'CHAT_CLEAR'});assert.equal(h.local.assistantState.messages.length,0);
 const external=harness();
 assert.equal((await external.send({type:'CHAT_SEND',text:'关闭视频',scope:'all'},{url:'https://bilibili.com/'})).ok,false);
 assert.equal(external.calls.length,0,'网页内容脚本不能向后台下达聊天命令');
 const drift=harness({onModel:tabs=>{tabs.find(t=>t.id===1).url='https://new.example.com/';tabs.find(t=>t.id===2).groupId=99;}});
 const changed=await drift.send({type:'CHAT_SEND',text:'关掉视频',scope:'all'});
 assert.match(changed.state.messages.at(-1).text,/已经关闭或发生变化/);
 assert.ok(!drift.calls.some(c=>c[0]==='close'),'模型等待期间变化的页面必须保留');
 const hallucinates=harness({plan:{action:'close_tabs',reply:'关闭',tabIds:[999]}});
 const bad=await hallucinates.send({type:'CHAT_SEND',text:'关掉视频',scope:'all'});
 assert.match(bad.state.messages.at(-1).text,/快照之外/);
 assert.ok(!hallucinates.calls.some(c=>c[0]==='close'));
 const outOfScope=harness({plan:{action:'close_tabs',reply:'关闭文档',tabIds:[3]}});
 const scopeReply=await outOfScope.send({type:'CHAT_SEND',text:'关闭文档',scope:'current',windowId:10});
 assert.match(scopeReply.state.messages.at(-1).text,/快照之外/);
 assert.ok(!outOfScope.calls.some(c=>c[0]==='close'),'当前窗口模式不能关闭其他窗口页面');
 const question=harness();await question.send({type:'CHAT_SEND',text:'有哪些视频页面',scope:'all'});
 assert.ok(!question.calls.some(c=>c[0]==='close'));
 const failure=harness({modelError:true});const failed=await failure.send({type:'CHAT_SEND',text:'关掉视频',scope:'all'});
 assert.match(failed.state.messages.at(-1).text,/model unavailable/);assert.equal(failed.state.busy,false);assert.equal(failure.local.assistantDraft,'关掉视频','模型失败后保留原请求草稿以便重试');
 const focus=harness({plan:{action:'focus_tab',reply:'定位到文档',tabIds:[3]}});
 const focused=await focus.send({type:'CHAT_SEND',text:'切换到开发文档',scope:'all'});
 assert.match(focused.state.messages.at(-1).text,/已切换/);
 assert.ok(focus.calls.some(c=>c[0]==='focus'&&c[1]===3));
 const repaired=harness({rawReplies:['我需要更多信息才能判断哪个是最新的。',JSON.stringify({action:'none',reply:'请指定保留哪个页面',tabIds:[]})]});
 const repairResult=await repaired.send({type:'CHAT_SEND',text:'关闭其他视频',scope:'all'});
 assert.equal(repaired.calls.filter(c=>c[0]==='model').length,2,'输出格式错误只重试一次');
 assert.match(repairResult.state.messages.at(-1).text,/请指定保留/);
 assert.ok(!repaired.calls.some(c=>c[0]==='close'),'格式重试前不能执行任何操作');
 const malformed=harness({rawReplies:['plain text','still not JSON']});
 const malformedResult=await malformed.send({type:'CHAT_SEND',text:'关闭视频',scope:'all'});
 assert.match(malformedResult.state.messages.at(-1).text,/连续两次/);
 assert.equal(malformed.calls.filter(c=>c[0]==='model').length,2);
 assert.ok(!malformed.calls.some(c=>c[0]==='close'));
 const truncated=harness({finishReason:'length'});
 const cut=await truncated.send({type:'CHAT_SEND',text:'关闭视频',scope:'all'});
 assert.match(cut.state.messages.at(-1).text,/输出被截断/);
 assert.ok(!truncated.calls.some(c=>c[0]==='close'));
 const newestUnknown=harness({plan:{action:'close_tabs',reply:'将关闭其他视频',tabIds:[1],keepTabIds:[2]}});
 const unknownTime=await newestUnknown.send({type:'CHAT_SEND',text:'关闭视频，只保留最新新开的那个',scope:'all'});
 assert.match(unknownTime.state.messages.at(-1).text,/新建时间/);
 assert.equal(unknownTime.state.messages.at(-1).error,undefined);
 assert.ok(!newestUnknown.calls.some(c=>c[0]==='close'));
 const newestKnown=harness({plan:{action:'close_tabs',reply:'将关闭其他视频',tabIds:[1],keepTabIds:[2]},openedAt:{1:100,2:200}});
 const knownTime=await newestKnown.send({type:'CHAT_SEND',text:'关闭视频，只保留最新新开的那个',scope:'all'});
 assert.match(knownTime.state.messages.at(-1).text,/已关闭 1 个/);
 assert.deepEqual(newestKnown.calls.filter(c=>c[0]==='close'),[['close',1]]);
 const missingKept=harness({plan:{action:'close_tabs',reply:'将关闭其他视频',tabIds:[1],keepTabIds:[2]},onModel:tabs=>{tabs.splice(tabs.findIndex(t=>t.id===2),1);}});
 const missingKeepReply=await missingKept.send({type:'CHAT_SEND',text:'关闭其他视频并保留第二页',scope:'all'});
 assert.match(missingKeepReply.state.messages.at(-1).text,/要保留的页面已经关闭/);
 assert.ok(!missingKept.calls.some(c=>c[0]==='close'));
 console.log('assistant intent, scope, drift, authorization, JSON repair, time semantics and execution tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

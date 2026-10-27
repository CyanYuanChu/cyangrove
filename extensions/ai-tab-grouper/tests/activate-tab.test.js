const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
require('../src/finder.js');
const F = globalThis.AITabFinder;
function harness({tab={id:12,windowId:22,groupId:7},windowState='normal',closed=false,groupGone=false,focusError=false}={}) {
 const calls=[];let listener;
 const event={addListener(){}};
 const chrome={
  runtime:{onInstalled:event,onStartup:event,onMessage:{addListener(fn){listener=fn}}},
  storage:{onChanged:event},alarms:{onAlarm:event},
  tabs:{onCreated:event,onRemoved:event,onMoved:event,onAttached:event,onDetached:event,onReplaced:event,onUpdated:event,
   get:async(id)=>{calls.push(['get',id]);if(closed)throw Error('No tab');return {...tab};},
   update:async(id,options)=>{calls.push(['tab',id,{...options}]);return {...tab,active:true};}},
  tabGroups:{TAB_GROUP_ID_NONE:-1,update:async(id,options)=>{calls.push(['group',id,{...options}]);if(groupGone)throw Error('Group removed');}},
  windows:{get:async(id)=>{calls.push(['window.get',id]);return {id,state:windowState};},update:async(id,options)=>{calls.push(['window',id,{...options}]);if(focusError)throw Error('Focus denied');}}
 };
 const context=vm.createContext({chrome,URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval});
 context.importScripts=(file)=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8'),context);
 function dispatch(message,respond){assert.equal(listener(message,{},respond),true,'后台消息通道应保持到异步操作结束');}
 return {calls,dispatch,send:message=>new Promise(resolve=>dispatch(message,resolve))};
}
(async()=>{
 const h=harness();
 assert.equal((await h.send({type:'ACTIVATE_TAB',tabId:12})).ok,true);
 assert.deepEqual(h.calls,[['get',12],['group',7,{collapsed:false}],['tab',12,{active:true}],['window.get',22],['window',22,{focused:true}]],'重新读取最新窗口与组，先激活标签再切换窗口');
 const ungrouped=harness({tab:{id:12,windowId:22,groupId:-1},windowState:'maximized'});
 assert.equal((await ungrouped.send({type:'ACTIVATE_TAB',tabId:12})).ok,true);
 assert.ok(!ungrouped.calls.some(c=>c[0]==='group'));
 assert.deepEqual(ungrouped.calls.at(-1),['window',22,{focused:true}],'保留最大化窗口状态');
 const minimized=harness({windowState:'minimized'});
 await minimized.send({type:'ACTIVATE_TAB',tabId:12});
 assert.deepEqual(minimized.calls.at(-1),['window',22,{focused:true,state:'normal'}]);
 const missingGroup=harness({groupGone:true});
 assert.equal((await missingGroup.send({type:'ACTIVATE_TAB',tabId:12})).ok,true,'旧分组消失时仍应跳转');
 const gone=harness({closed:true});
 assert.match((await gone.send({type:'ACTIVATE_TAB',tabId:12})).message,/已经关闭/);
 assert.equal(gone.calls.length,1,'已关闭页面不能新建或复制');
 const invalid=harness();
 assert.match((await invalid.send({type:'ACTIVATE_TAB',tabId:'12'})).message,/ID 无效/);
 assert.equal(invalid.calls.length,0);
 const failed=harness({focusError:true});
 assert.equal((await failed.send({type:'ACTIVATE_TAB',tabId:12})).message,'Focus denied');
 // 前端上下文关闭后收不到响应，后台仍独立完成全部跳转。
 const detached=harness();let popupClosed=false;
 const frontend={runtime:{sendMessage:message=>new Promise(resolve=>{
  detached.dispatch(message,response=>{if(!popupClosed)resolve(response);});
  popupClosed=true;
 })}};
 F.activate({id:12,windowId:999,groupId:999},frontend).catch(()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(popupClosed);
 assert.deepEqual(detached.calls.at(-1),['window',22,{focused:true}],'弹窗关闭也不能中断真实后台的后续窗口聚焦');
 console.log('background activation regression tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

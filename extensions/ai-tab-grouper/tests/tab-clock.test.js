const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const makeEvent=()=>({callbacks:[],addListener(fn){this.callbacks.push(fn)},emit(...args){this.callbacks.forEach(fn=>fn(...args))}});
const onCreated=makeEvent(),onRemoved=makeEvent(),onReplaced=makeEvent(),event=makeEvent();
const session={};let now=1000;
const chrome={runtime:{onInstalled:event,onStartup:event,onMessage:event},storage:{onChanged:event,session:{get:async key=>({[key]:JSON.parse(JSON.stringify(session[key]||{}))}),set:async value=>Object.assign(session,value)}},alarms:{onAlarm:event},tabs:{onCreated,onRemoved,onReplaced,onMoved:event,onAttached:event,onDetached:event,onUpdated:event}};
function context(){
 const ctx=vm.createContext({chrome,URL,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},Date:{now:()=>now}});
 ctx.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8'),ctx);
 return ctx;
}
(async()=>{
 const ctx=context();
 assert.deepEqual({...await ctx.tabOpenedTimes()},{});
 onCreated.emit({id:1});now=2000;onCreated.emit({id:2});
 assert.deepEqual({...await ctx.tabOpenedTimes()},{1:1000,2:2000},'连续创建事件不能覆盖丢失，不能用最后访问时间替代创建时间');
 onReplaced.emit(3,1);
 assert.deepEqual({...await ctx.tabOpenedTimes()},{2:2000,3:1000},'替换标签保持原创建时间');
 onRemoved.emit(2);
 assert.deepEqual({...await ctx.tabOpenedTimes()},{3:1000});
 const restarted=context();
 assert.deepEqual({...await restarted.tabOpenedTimes()},{3:1000},'后台重启仍能从 session 存储恢复已知时间');
 assert.equal((await restarted.tabOpenedTimes())[999],undefined,'未知旧标签不能伪造创建时间');
 console.log('tab creation clock tests passed');
})().catch(error=>{console.error(error);process.exitCode=1});

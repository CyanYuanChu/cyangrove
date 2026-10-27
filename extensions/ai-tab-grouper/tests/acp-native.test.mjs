import test from 'node:test';
import assert from 'node:assert/strict';
import { controlBridge } from '../bridge/native-control.mjs';
test('native start launches Grove when closed and returns a token only over native messaging',async()=>{
 let up=false,launched=0,requests=0;
 const result=await controlBridge('start',{request:async action=>{requests++;if(requests===1)throw Error('closed');assert.equal(action,'tab-bridge:start');up=true;return {};},launch:async()=>{launched++;},isRunning:async()=>up,config:async()=>JSON.stringify({token:'a'.repeat(64)}),pause:async()=>{}});
 assert.equal(launched,1);assert.equal(result.running,true);assert.equal(result.token,'a'.repeat(64));
});
test('native status never starts Grove or returns credentials',async()=>{
 const result=await controlBridge('status',{isRunning:async()=>false,launch:async()=>{throw Error('must not launch');},request:async()=>{throw Error('must not control');}});
 assert.deepEqual(result,{ok:true,running:false});
});
test('native stop succeeds when Grove already closed',async()=>{
 const result=await controlBridge('stop',{request:async()=>{throw Error('closed');},isRunning:async()=>false});assert.equal(result.running,false);
});
test('native start surfaces installation failures',async()=>{
 await assert.rejects(controlBridge('start',{request:async()=>({tabBridge:{error:'请先安装 ACP 适配器'}}),isRunning:async()=>false,pause:async()=>{}}),/安装 ACP/);
});
test('native control rejects arbitrary commands',async()=>{await assert.rejects(controlBridge('exec'),/不支持/);});

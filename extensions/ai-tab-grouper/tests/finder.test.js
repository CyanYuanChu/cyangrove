const assert = require('node:assert/strict');
require('../src/finder.js');
const F = globalThis.AITabFinder;
const groups = [{ id: 7, title: '开发学习', color: 'blue' }, { id: 9, title: '视频娱乐', color: 'red' }];
const tabs = [
  ...Array.from({ length: 14 }, (_, i) => ({ id: i + 1, windowId: i < 7 ? 1 : 2, index: i, lastAccessed: 1000 + i, url: `https://docs.example.com/${i}`, title: `Java 文档 ${i}`, groupId: 7 })),
  { id: 30, windowId: 1, index: 20, lastAccessed: 100000, url: 'chrome://extensions', title: '内部页' },
  { id: 31, windowId: 2, index: 21, lastAccessed: 100001, url: 'chrome-extension://test/options.html', title: '插件页' },
  { id: 32, windowId: 2, index: 22, lastAccessed: 200, url: 'https://video.example.com/', title: 'Video Tutorial', groupId: 9 },
  { id: 33, windowId: 1, index: 23, lastAccessed: 100, url: 'file:///example.html', title: '离线笔记', groupId: -1 },
];
assert.equal(F.selectTabs(tabs, groups).total, 16);
assert.deepEqual(F.selectTabs(tabs, groups).tabs.map(t => t.id), [14,13,12,11,10,9,8,7,6,5]);
assert.equal(F.selectTabs(tabs, groups, { limit: 20 }).tabs.length, 16);
assert.equal(F.selectTabs(tabs, groups, { search: '开发学习', limit: 10 }).tabs.length, 14, '搜索应覆盖全部网页，不能截断到最近十个');
assert.equal(F.selectTabs(tabs, groups, { search: 'VIDEO tutorial' }).tabs[0].id, 32);
assert.equal(F.selectTabs(tabs, groups, { search: 'docs.example.com/0' }).tabs[0].id, 1, '能找回最近十个之外的旧页面');
assert.equal(F.selectTabs(tabs, groups, { search: '离线笔记' }).tabs[0].id, 33);
assert.equal(F.selectTabs(tabs, groups, { search: '完全不存在' }).matched, 0);
assert.equal(F.selectTabs(tabs, groups, { windowId: 1 }).total, 8);
assert.ok(F.selectTabs(tabs, groups, { windowId: 1 }).tabs.every(t => t.windowId === 1));
assert.equal(F.relativeTime(60000, 90000), '刚刚');
assert.equal(F.relativeTime(60000, 240000), '3 分钟前');
assert.equal(F.relativeTime(60000, 7260000), '2 小时前');
assert.equal(F.relativeTime(undefined), '时间未知');
(async () => {
 const messages = [];
 const api = { runtime: { sendMessage: async (message) => { messages.push(message); return {ok:true}; } } };
 await F.activate(tabs[0], api);
 assert.deepEqual(messages, [{type:'ACTIVATE_TAB',tabId:1}], '弹窗只发送页面 ID，跳转不依赖弹窗继续存活');
 await assert.rejects(F.activate(tabs[0], {runtime:{sendMessage:async()=>({ok:false,message:'页面已经关闭'})}}), /页面已经关闭/);
 await assert.rejects(F.activate(tabs[0], {runtime:{sendMessage:async()=>({ok:false,message:'未知消息'})}}), /后台仍是旧版本/);
 await assert.rejects(F.activate(tabs[0], {runtime:{sendMessage:async()=>undefined}}), /重新加载扩展/);
 assert.equal(tabs[0].groupId, 7, '激活页面不能改变分组');
 console.log('finder behavior tests passed');
})().catch(e => { console.error(e); process.exitCode = 1; });

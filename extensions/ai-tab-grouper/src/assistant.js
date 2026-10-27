(function initAssistantUI() {
  const $ = id => document.getElementById(id);
  let state = { messages: [], busy: false }, sending = false;
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function hint(text, error = false) {
    $('chatHint').textContent = text;
    $('chatHint').classList.toggle('bad', error);
  }
  function render(next) {
    state = next;
    const log = $('chatMessages');
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    $('chatWelcome').hidden = state.messages.length > 0;
    state.messages.forEach(message => {
      const article = node('article', `chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}${message.error ? ' chat-error' : ''}`);
      article.append(node('span', 'chat-role', message.role === 'user' ? '你' : 'AI 标签助手'));
      article.append(node('p', 'chat-text', message.text));
      if (message.targets?.length) {
        const details = node('details', 'chat-targets');
        if (message.action !== 'close_tabs' && message.targets.length <= 5) details.open = true;
        details.append(node('summary', '', `${message.action === 'close_tabs' ? '已关闭' : '匹配页面'} · ${message.targetCount || message.targets.length} 个`));
        message.targets.forEach(target => {
          const row = node(message.action === 'close_tabs' ? 'div' : 'button', 'chat-target');
          if (row.tagName === 'BUTTON') {
            row.type = 'button';
            row.addEventListener('click', async () => {
              row.disabled = true;
              try { await globalThis.AITabFinder.activate({id:target.tabId}); }
              catch (error) { hint(`定位失败：${error.message}`, true); }
              finally { row.disabled = false; }
            });
          }
          row.append(node('span', 'chat-target-title', target.title), node('small', '', `${target.domain} · ${target.groupName}`));
          details.append(row);
        });
        if (message.targetCount > message.targets.length) details.append(node('p','chat-more',`其余 ${message.targetCount - message.targets.length} 个页面已包含在本次结果中。`));
        article.append(details);
      }
      log.append(article);
    });
    const busy = state.busy || sending;
    $('chatSubmit').disabled = busy;
    $('chatInput').disabled = busy;
    $('chatClear').disabled = busy || !state.messages.length;
    $('chatScope').disabled = busy;
    $('chatBusy').hidden = !busy;
    $('chatSubmit').textContent = busy ? '处理中…' : '发送 ↗';
    if (nearBottom || busy) log.scrollTop = log.scrollHeight;
  }
  function responseError(response) {
    if (response?.message === '未知消息') return '后台仍是旧版本，请在扩展管理页重新加载整个插件。';
    return response?.message || '无法连接插件后台，请重新加载扩展后再试。';
  }
  async function load() {
    try {
      const [response, draft] = await Promise.all([
        chrome.runtime.sendMessage({type:'CHAT_GET'}),
        chrome.storage.local.get('assistantDraft').catch(() => ({}))
      ]);
      if (!response?.ok) throw new Error(responseError(response));
      if (response.state.scope) $('chatScope').value = response.state.scope;
      $('chatInput').value = typeof draft.assistantDraft === 'string' ? draft.assistantDraft : '';
      render(response.state);
      hint('输入文字即可；也支持使用系统语音输入法。');
    } catch(error) { hint(error.message, true); }
  }
  document.addEventListener('DOMContentLoaded', async () => {
    await load();
    $('chatForm').addEventListener('submit', async event => {
      event.preventDefault();
      const text = $('chatInput').value.trim();
      if (!text || sending || state.busy) return;
      sending = true;
      render(state);
      hint('正在读取当前标签并请求模型…');
      try {
        const current = await chrome.windows.getCurrent();
        const response = await chrome.runtime.sendMessage({type:'CHAT_SEND',text,scope:$('chatScope').value,windowId:current.id});
        if (!response?.ok) throw new Error(responseError(response));
        state = response.state;
        $('chatInput').value = state.messages.at(-1)?.error ? text : '';
        hint(state.messages.at(-1)?.error ? '本次未完成，可调整要求后重试。' : '已回复，可以继续补充要求。', Boolean(state.messages.at(-1)?.error));
      } catch(error) { hint(error.message, true); }
      finally { sending = false; render(state); $('chatInput').focus(); }
    });
    $('chatInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        $('chatForm').requestSubmit();
      }
    });
    $('chatInput').addEventListener('input', () => {
      chrome.storage.local.set({assistantDraft:$('chatInput').value}).catch(() => {});
    });
    document.querySelectorAll('[data-chat-example]').forEach(button => button.addEventListener('click', () => {
      if (state.busy || sending) return;
      $('chatInput').value = button.dataset.chatExample;
      chrome.storage.local.set({assistantDraft:$('chatInput').value}).catch(() => {});
      $('chatInput').focus();
    }));
    $('chatClear').addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({type:'CHAT_CLEAR'});
        if (!response?.ok) throw new Error(responseError(response));
        render(response.state);
        hint('对话已清空，浏览器标签保持不变。');
      } catch(error) { hint(error.message, true); }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.assistantState?.newValue) render(changes.assistantState.newValue);
    });
  });
})();

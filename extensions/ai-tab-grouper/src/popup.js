const C = globalThis.AITabGrouper;
const $ = (id) => document.getElementById(id);
function render(status) {
  const labels = { idle: '等待标签变化', running: '正在整理', success: '整理完成', preview: '预览已就绪', warning: '部分完成', error: '需要处理' };
  $('state').textContent = labels[status.state] || '等待配置';
  $('state').className = `state ${status.state === 'error' ? 'bad' : status.state === 'running' ? 'busy' : ['success', 'preview'].includes(status.state) ? 'ok' : ''}`;
  if (status.currentTabCount !== undefined) $('tabCount').textContent = status.currentTabCount;
  $('message').textContent = status.lastError || status.message || '标签变化后，自动按用途归类';
  $('message').title = $('message').textContent;
  $('runNow').disabled = status.state === 'running';
  $('applyPreview').hidden = !status.previewAvailable;
}
async function refresh() {
  try { render(await chrome.runtime.sendMessage({ type: 'GET_STATUS' })); }
  catch (error) { $('message').textContent = error.message; }
}
document.addEventListener('DOMContentLoaded', async () => {
  async function selectView(view, focus = false) {
    const chat = view === 'chat';
    document.querySelector('.popup-shell').dataset.view = chat ? 'chat' : 'recent';
    $('recentPanel').hidden = chat;
    $('chatPanel').hidden = !chat;
    if (chat) $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    $('recentTab').setAttribute('aria-selected', String(!chat));
    $('chatTab').setAttribute('aria-selected', String(chat));
    $('recentTab').tabIndex = chat ? -1 : 0;
    $('chatTab').tabIndex = chat ? 0 : -1;
    if (focus) (chat ? $('chatInput') : $('searchTabs')).focus();
    try { await chrome.storage.local.set({popupView: chat ? 'chat' : 'recent'}); } catch (_) {}
  }
  $('recentTab').addEventListener('click', () => selectView('recent', true));
  $('chatTab').addEventListener('click', () => selectView('chat', true));
  document.querySelector('.popup-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const chat = event.key === 'End' || (event.key !== 'Home' && document.querySelector('.popup-shell').dataset.view !== 'chat');
    selectView(chat ? 'chat' : 'recent');
    (chat ? $('chatTab') : $('recentTab')).focus();
  });
  try { const stored = await chrome.storage.local.get('popupView'); await selectView(stored.popupView === 'recent' ? 'recent' : 'chat', true); } catch (_) {}
  await Promise.allSettled([refresh(), globalThis.AITabFinder.mount()]);
  async function run(type, button) {
    button.disabled = true;
    $('message').textContent = type === 'RUN_NOW' ? '正在请求模型进行整理…' : '正在应用分组预览…';
    try {
      const result = await chrome.runtime.sendMessage({ type });
      if (!result?.ok) throw new Error(result?.message || '运行失败');
      await refresh();
    } catch (error) { $('message').textContent = error.message; }
    finally { button.disabled = false; }
  }
  $('runNow').addEventListener('click', () => run('RUN_NOW', $('runNow')));
  $('applyPreview').addEventListener('click', () => run('APPLY_PREVIEW', $('applyPreview')));
  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
});
chrome.runtime.onMessage.addListener((message) => { if (message?.type === 'STATUS') refresh(); });

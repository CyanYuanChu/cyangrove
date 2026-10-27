(function initFinder(global) {
  const COLORS = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);
  function domain(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') || '本地文件'; }
    catch (_) { return ''; }
  }
  function selectTabs(tabs, groups, { search = '', limit = 10, windowId = null } = {}) {
    const groupMap = new Map(groups.map((group) => [group.id, group]));
    const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const eligible = tabs.filter((tab) => Number.isInteger(tab.id) && /^(https?:|file:)/i.test(tab.url || '') && (windowId === null || tab.windowId === windowId));
    const matching = eligible.filter((tab) => {
      const text = [tab.title, tab.url, groupMap.get(tab.groupId)?.title].join(' ').toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    }).sort((a, b) => (Number(b.lastAccessed) || 0) - (Number(a.lastAccessed) || 0) || a.windowId - b.windowId || a.index - b.index);
    return { total: eligible.length, matched: matching.length, tabs: words.length ? matching : matching.slice(0, limit) };
  }
  function relativeTime(timestamp, now = Date.now()) {
    if (!timestamp || !Number.isFinite(Number(timestamp))) return '时间未知';
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
    return `${Math.floor(minutes / 1440)} 天前`;
  }
  // 切换焦点会关闭弹窗，完整跳转必须交给后台完成。
  async function activate(tab, api = chrome) {
    const result = await api.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: tab.id });
    if (result?.message === '未知消息') throw new Error('后台仍是旧版本，请在扩展管理页重新加载插件（只刷新设置页不够）');
    if (!result?.ok) throw new Error(result?.message || '后台未能完成跳转，请重新加载扩展后重试');
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  async function mount() {
    const $ = (id) => document.getElementById(id);
    const list = $('tabList');
    let allTabs = [], groups = [], windowId = null, refreshId = 0, refreshTimer;
    let prefs = { limit: 10, currentWindow: false };
    const feedback = (text, bad = false) => { $('finderFeedback').textContent = text; $('finderFeedback').classList.toggle('bad', bad); };
    function render() {
      const search = $('searchTabs').value;
      const result = selectTabs(allTabs, groups, { search, limit: prefs.limit, windowId: prefs.currentWindow ? windowId : null });
      $('listLabel').textContent = search.trim() ? '搜索结果' : '最近访问';
      $('listCount').textContent = search.trim() ? `${result.matched} 个结果` : `${result.tabs.length} / ${result.total} 个页面`;
      $('clearSearch').hidden = !search;
      list.replaceChildren();
      const groupMap = new Map(groups.map((g) => [g.id, g]));
      result.tabs.forEach((tab, index) => {
        const group = groupMap.get(tab.groupId);
        const button = node('button', 'tab-item');
        button.type = 'button';
        button.dataset.tabId = tab.id;
        button.title = `${tab.title || domain(tab.url)}\n${tab.url}`;
        const mark = node('span', 'site-mark', domain(tab.url).slice(0, 1).toUpperCase());
        mark.dataset.tone = String([...domain(tab.url)].reduce((n, c) => n + c.charCodeAt(0), 0) % 5);
        const info = node('span', 'tab-info');
        info.append(node('span', 'tab-title', tab.title || domain(tab.url)));
        const meta = node('span', 'tab-meta');
        meta.append(node('span', 'tab-domain', domain(tab.url)));
        const badge = node('span', 'group-tag', group?.title || (group ? '未命名分组' : '未分组'));
        badge.dataset.color = COLORS.has(group?.color) ? group.color : 'grey';
        meta.append(badge);
        info.append(meta);
        const trailing = node('span', 'tab-trailing');
        trailing.append(node('span', 'tab-time', relativeTime(tab.lastAccessed)), node('span', 'tab-go', '↗'));
        button.append(mark, info, trailing);
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await activate(tab); feedback('已切换到原来的页面'); }
          catch (error) { feedback(`跳转失败：${error.message || '未知错误'}`, true); await refresh(); }
          finally { button.disabled = false; }
        });
        button.addEventListener('keydown', (event) => {
          if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          if (event.key === 'Escape') { $('searchTabs').focus(); return; }
          const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
          if (next < 0) $('searchTabs').focus();
          else list.children[Math.min(next, list.children.length - 1)]?.focus();
        });
        list.append(button);
      });
      $('listEmpty').hidden = result.tabs.length > 0;
      $('emptyTitle').textContent = search.trim() ? '没有找到这个页面' : '这里还没有网页';
      $('emptyDetail').textContent = search.trim() ? '试试标题、网址或分组名称中的其他词。' : '打开网页后，就能在这里按最近访问的时间找回。';
    }
    async function refresh() {
      const id = ++refreshId;
      try {
        const [tabs, foundGroups, current] = await Promise.all([
          chrome.tabs.query({}), chrome.tabGroups.query({}).catch(() => []), chrome.windows.getCurrent()
        ]);
        if (id !== refreshId) return;
        allTabs = tabs; groups = foundGroups; windowId = current.id;
        render();
      } catch (_) { feedback('读取页面失败，请重新打开插件。', true); }
    }
    try {
      const stored = (await chrome.storage.local.get('finderPreferences')).finderPreferences || {};
      prefs = { limit: [10, 20, 50].includes(stored.limit) ? stored.limit : 10, currentWindow: stored.currentWindow === true };
    } catch (_) { /* 无偏好时使用默认值。 */ }
    $('recentLimit').value = prefs.limit;
    $('windowScope').value = prefs.currentWindow ? 'current' : 'all';
    const savePrefs = async () => {
      prefs.limit = Number($('recentLimit').value);
      prefs.currentWindow = $('windowScope').value === 'current';
      render();
      try { await chrome.storage.local.set({ finderPreferences: prefs }); feedback('显示偏好已保存到本机'); }
      catch (_) { feedback('当前显示已更新，偏好未能保存。', true); }
    };
    $('recentLimit').addEventListener('change', savePrefs);
    $('windowScope').addEventListener('change', savePrefs);
    $('searchTabs').addEventListener('input', render);
    $('searchTabs').addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); list.firstElementChild?.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); list.firstElementChild?.click(); }
      if (event.key === 'Escape') { $('searchTabs').value = ''; render(); }
    });
    $('clearSearch').addEventListener('click', () => { $('searchTabs').value = ''; render(); $('searchTabs').focus(); });
    const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150); };
    const events = [chrome.tabs.onActivated, chrome.tabs.onUpdated, chrome.tabs.onRemoved, chrome.tabs.onCreated, chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved];
    events.forEach((event) => event?.addListener(scheduleRefresh));
    window.addEventListener('pagehide', () => { clearTimeout(refreshTimer); events.forEach((event) => event?.removeListener(scheduleRefresh)); });
    await refresh();
    return { refresh };
  }
  global.AITabFinder = { selectTabs, relativeTime, domain, activate, mount };
})(globalThis);

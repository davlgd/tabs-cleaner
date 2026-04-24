// Tabs Cleaner — popup: overview, inactivity and duplicate snapshots.
// Everything is computed on open, no persistent state.

import {
  el,
  makeLink,
  normalizeUrl,
  formatDuration,
  focusTab,
  closeTabs,
  backupTabs,
  restoreTabs,
  showToast,
  TRASH_ICON,
} from './common.js';

async function refresh() {
  const [tabs, windows] = await Promise.all([chrome.tabs.query({}), chrome.windows.getAll()]);
  const stats = computeStats(tabs, windows);
  render(stats);
}

async function handleFocus(tab) {
  await focusTab(tab);
  window.close();
}

async function handleClose(tabsToClose) {
  const backups = backupTabs(tabsToClose);
  await closeTabs(tabsToClose.map((t) => t.id));
  const n = tabsToClose.length;
  showToast(`Closed ${n} tab${n > 1 ? 's' : ''}`, 'Undo', () => restoreTabs(backups));
  refresh();
}

function openFullDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') });
  window.close();
}

function computeStats(tabs, windows) {
  const now = Date.now();

  const pinnedTabs = tabs.filter((t) => t.pinned);
  const audibleTabs = tabs.filter((t) => t.audible);

  // Inactivity (native lastAccessed, available since Chrome 121)
  const accessed = tabs
    .filter((t) => typeof t.lastAccessed === 'number')
    .map((t) => ({ tab: t, idleMs: now - t.lastAccessed }))
    .sort((a, b) => b.idleMs - a.idleMs);

  const medianIdle = accessed.length ? accessed[Math.floor(accessed.length / 2)].idleMs : null;
  const top5Idle = accessed.slice(0, 5);

  // Duplicates, sorted by count desc then URL alpha for stable order
  const byUrl = new Map();
  for (const tab of tabs) {
    const raw = tab.url || tab.pendingUrl || '';
    if (!raw) continue;
    const key = normalizeUrl(raw);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(tab);
  }
  const dupGroups = [...byUrl.entries()]
    .filter(([, ts]) => ts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const dupTabCount = dupGroups.reduce((acc, [, ts]) => acc + ts.length, 0);

  return {
    totalWindows: windows.length,
    totalTabs: tabs.length,
    pinned: pinnedTabs.length,
    audible: audibleTabs.length,
    firstPinned: pinnedTabs[0] || null,
    firstAudible: audibleTabs[0] || null,
    medianIdle,
    top5Idle,
    dupGroups,
    dupTabCount,
  };
}

function statBox(label, value, onClick) {
  const hasAction = onClick && value > 0;
  const box = el(
    'div',
    hasAction
      ? {
          className: 'stat clickable',
          role: 'button',
          tabindex: '0',
          title: `Jump to ${label.toLowerCase()} tab`,
        }
      : { className: 'stat' },
    [
      el('div', { className: 'value', textContent: String(value) }),
      el('div', { className: 'label', textContent: label }),
    ],
  );
  if (hasAction) {
    box.addEventListener('click', onClick);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    });
  }
  return box;
}

function renderDupItem(url, ts) {
  const sorted = [...ts].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  const kept = sorted[0];
  const toClose = sorted.slice(1);

  const closeBtn = el('button', {
    type: 'button',
    className: 'close-btn icon',
    title: `Close ${toClose.length} duplicate${toClose.length > 1 ? 's' : ''}, keep most recent`,
    'aria-label': `Close ${toClose.length} duplicate tabs of ${url}, keep the most recently accessed`,
  });
  closeBtn.innerHTML = TRASH_ICON;
  closeBtn.addEventListener('click', () => handleClose(toClose));

  return el('li', {}, [
    el('span', { className: 'count', textContent: `×${ts.length}` }),
    makeLink('url clickable', url, url, () => handleFocus(kept)),
    closeBtn,
  ]);
}

function render(s) {
  const root = document.getElementById('app');
  root.innerHTML = '';

  // Pinned and Audible stats are clickable only when > 0: they jump to the first matching tab.
  root.append(
    el('section', {}, [
      el('h2', { textContent: 'Overview' }),
      el('div', { className: 'grid' }, [
        statBox('Windows', s.totalWindows),
        statBox('Tabs', s.totalTabs),
        statBox('Pinned', s.pinned, s.firstPinned ? () => handleFocus(s.firstPinned) : null),
        statBox('Audible', s.audible, s.firstAudible ? () => handleFocus(s.firstAudible) : null),
      ]),
    ]),
  );

  const inactivity = el('section', {}, [el('h2', { textContent: 'Inactivity' })]);
  if (s.top5Idle.length > 0) {
    inactivity.append(
      el('p', { className: 'idle-summary' }, [
        'Half your tabs idle for ',
        el('strong', { textContent: formatDuration(s.medianIdle) }),
        ' or more',
      ]),
      el('h3', { textContent: '5 most idle tabs' }),
      el(
        'ul',
        {},
        s.top5Idle.map(({ tab, idleMs }) =>
          el('li', {}, [
            el('span', { className: 'duration', textContent: formatDuration(idleMs) }),
            makeLink('title clickable', tab.title || tab.url || '(untitled)', tab.url || '', () =>
              handleFocus(tab),
            ),
          ]),
        ),
      ),
    );
  } else {
    inactivity.append(el('p', { className: 'muted', textContent: 'Access data unavailable' }));
  }
  root.append(inactivity);

  const dup = el('section', {}, [el('h2', { textContent: 'Duplicates' })]);
  if (s.dupGroups.length === 0) {
    dup.append(el('p', { className: 'muted', textContent: 'No duplicates' }));
  } else {
    const urlPlural = s.dupGroups.length > 1 ? 's' : '';
    dup.append(
      el('p', {}, [`${s.dupTabCount} tabs across ${s.dupGroups.length} URL${urlPlural}`]),
      el(
        'ul',
        {},
        s.dupGroups.map(([url, ts]) => renderDupItem(url, ts)),
      ),
    );
  }
  root.append(dup);

  const viewAllBtn = el('button', {
    type: 'button',
    className: 'open-full-btn',
    textContent: `View all ${s.totalTabs} tabs`,
  });
  viewAllBtn.addEventListener('click', openFullDashboard);
  root.append(viewAllBtn);
}

refresh();

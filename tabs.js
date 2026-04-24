// Tabs Cleaner — dashboard: all tabs grouped by domain and URL.

import {
  el,
  makeLink,
  groupTabs,
  focusTab,
  closeTabs,
  backupTabs,
  restoreTabs,
  formatDuration,
  renderFavicon,
  showToast,
  TRASH_ICON,
} from './common.js';

let allTabs = [];
let filterText = '';
let filterDebounce = null;
let refreshDebounce = null;
const collapsedDomains = new Set();

// Preserve the order in which domains were first seen, so closing tabs doesn't
// reshuffle the list under the user's cursor. New domains get appended.
const domainOrder = new Map();
let nextDomainRank = 0;

function applyStableDomainOrder(domains) {
  for (const d of domains) {
    if (!domainOrder.has(d.domain)) {
      domainOrder.set(d.domain, nextDomainRank++);
    }
  }
  return [...domains].sort((a, b) => domainOrder.get(a.domain) - domainOrder.get(b.domain));
}

async function refresh() {
  allTabs = await chrome.tabs.query({});
  render();
}

function scheduleRefresh() {
  clearTimeout(refreshDebounce);
  refreshDebounce = setTimeout(refresh, 200);
}

async function handleClose(tabsToClose) {
  const backups = backupTabs(tabsToClose);
  await closeTabs(tabsToClose.map((t) => t.id));
  const n = tabsToClose.length;
  showToast(`Closed ${n} tab${n > 1 ? 's' : ''}`, 'Undo', async () => {
    await restoreTabs(backups);
    await refresh();
  });
  await refresh();
}

async function handleFocus(tab) {
  await focusTab(tab);
}

async function handleCleanup() {
  const domains = groupTabs(allTabs, filterText);
  const tabsToClose = [];
  for (const { urls } of domains) {
    for (const { tabs } of urls) {
      if (tabs.length < 2) continue;
      const sorted = [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
      tabsToClose.push(...sorted.slice(1));
    }
  }
  if (tabsToClose.length > 0) await handleClose(tabsToClose);
}

function handleCollapseAll() {
  const domains = groupTabs(allTabs, filterText);
  if (domains.length === 0) return;
  const allCollapsed = domains.every((d) => collapsedDomains.has(d.domain));
  if (allCollapsed) {
    for (const d of domains) collapsedDomains.delete(d.domain);
  } else {
    for (const d of domains) collapsedDomains.add(d.domain);
  }
  render();
}

function toggleDomain(domain) {
  if (collapsedDomains.has(domain)) collapsedDomains.delete(domain);
  else collapsedDomains.add(domain);
  render();
}

function renderSummary(domains) {
  const shownTabs = domains.reduce((s, d) => s + d.total, 0);
  const shownUrls = domains.reduce((s, d) => s + d.urls.length, 0);
  const summary = document.getElementById('summary');
  summary.innerHTML = '';

  const tabsSpan = filterText
    ? el('span', { className: 'filter-hint' }, [`${shownTabs} of ${allTabs.length} tabs`])
    : el('span', {}, [el('strong', { textContent: String(shownTabs) }), 'tabs']);

  summary.append(
    tabsSpan,
    el('span', {}, [el('strong', { textContent: String(shownUrls) }), 'URLs']),
    el('span', {}, [el('strong', { textContent: String(domains.length) }), 'domains']),
  );
}

function clearFilter() {
  const input = document.getElementById('filter');
  input.value = '';
  filterText = '';
  render();
  input.focus();
}

function renderUrlRow({ url, tabs }) {
  const target = [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  const count = tabs.length;
  const idleMs = typeof target.lastAccessed === 'number' ? Date.now() - target.lastAccessed : null;
  // Tooltip keeps both title and URL visible — the URL can be truncated by ellipsis.
  const tooltip = target.title ? `${target.title}\n${url}` : url;

  const idle = el('span', {
    className: 'url-idle',
    textContent: formatDuration(idleMs),
    title: idleMs != null ? 'Time since last access' : 'Access data unavailable',
  });

  const closeBtn = el('button', {
    type: 'button',
    className: 'close-btn icon',
    title: `Close ${count} tab${count > 1 ? 's' : ''}`,
    'aria-label': `Close ${count} tab${count > 1 ? 's' : ''} of ${url}`,
  });
  closeBtn.innerHTML = TRASH_ICON;
  closeBtn.addEventListener('click', () => handleClose(tabs));

  const children = [];
  if (count > 1) {
    children.push(el('span', { className: 'count', textContent: `×${count}` }));
  }
  children.push(
    makeLink('url clickable', url, tooltip, () => handleFocus(target)),
    idle,
    closeBtn,
  );

  return el('li', { className: count > 1 ? 'url-row has-duplicates' : 'url-row' }, children);
}

function renderDomainGroup({ domain, urls, total }) {
  const collapsed = collapsedDomains.has(domain);
  const isSingleUrl = urls.length === 1;

  const allTabsInDomain = urls.flatMap((u) => u.tabs);
  const iconSource = allTabsInDomain.find((t) => t.favIconUrl) || allTabsInDomain[0];
  const favicon = renderFavicon(iconSource?.favIconUrl);

  const toggleChildren = [
    favicon,
    el('span', { className: 'domain-name', textContent: domain, title: domain }),
  ];
  if (!isSingleUrl) {
    const urlPlural = urls.length > 1 ? 's' : '';
    const tabPlural = total > 1 ? 's' : '';
    toggleChildren.push(
      el('span', {
        className: 'domain-total',
        textContent: `${total} tab${tabPlural} · ${urls.length} URL${urlPlural}`,
      }),
    );
  }
  toggleChildren.push(el('span', { className: 'chevron', textContent: collapsed ? '▸' : '▾' }));

  const toggleBtn = el(
    'button',
    {
      type: 'button',
      className: 'toggle-btn',
      'aria-expanded': String(!collapsed),
      'aria-label': `${collapsed ? 'Expand' : 'Collapse'} ${domain}`,
    },
    toggleChildren,
  );
  toggleBtn.addEventListener('click', () => toggleDomain(domain));

  const headerChildren = [toggleBtn];
  if (!isSingleUrl) {
    const closeAllBtn = el('button', {
      type: 'button',
      className: 'close-btn',
      textContent: 'Close all',
      title: `Close all ${total} tabs of ${domain}`,
      'aria-label': `Close all ${total} tabs of ${domain}`,
    });
    closeAllBtn.addEventListener('click', () => handleClose(allTabsInDomain));
    headerChildren.push(closeAllBtn);
  }

  const header = el('div', { className: 'domain-header' }, headerChildren);
  const list = el('ul', { className: 'url-list' }, urls.map(renderUrlRow));

  return el('section', { className: collapsed ? 'domain-group collapsed' : 'domain-group' }, [
    header,
    list,
  ]);
}

function renderDupBar(domains) {
  let dupUrls = 0;
  let extra = 0;
  for (const d of domains) {
    for (const u of d.urls) {
      if (u.tabs.length >= 2) {
        dupUrls++;
        extra += u.tabs.length - 1;
      }
    }
  }
  const bar = document.getElementById('dup-bar');
  const countEl = document.getElementById('dup-count');
  const cleanupBtn = document.getElementById('cleanup');
  if (dupUrls === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const urlPlural = dupUrls > 1 ? 's' : '';
  const tabPlural = extra > 1 ? 's' : '';
  countEl.textContent = `${dupUrls} URL${urlPlural} duplicated · ${extra} tab${tabPlural} will be closed`;
  cleanupBtn.disabled = false;
}

function updateCollapseAllButton(domains) {
  const btn = document.getElementById('collapse-all');
  if (domains.length === 0) {
    btn.textContent = 'Collapse all';
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  const allCollapsed = domains.every((d) => collapsedDomains.has(d.domain));
  btn.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
}

function render() {
  const scrollY = window.scrollY;
  const domains = applyStableDomainOrder(groupTabs(allTabs, filterText));
  renderSummary(domains);
  renderDupBar(domains);
  updateCollapseAllButton(domains);

  const main = document.getElementById('main');
  main.innerHTML = '';

  if (domains.length === 0) {
    const emptyDiv = el('div', { className: 'empty' }, [
      filterText ? 'No URL or title matches the filter' : 'No tabs open',
    ]);
    if (filterText) {
      const clearBtn = el('button', {
        type: 'button',
        className: 'action-btn empty-action',
        textContent: 'Clear filter',
      });
      clearBtn.addEventListener('click', clearFilter);
      emptyDiv.append(clearBtn);
    }
    main.append(emptyDiv);
  } else {
    for (const group of domains) {
      main.append(renderDomainGroup(group));
    }
  }

  window.scrollTo(0, scrollY);
}

function setupKeyboardShortcuts() {
  const filterInput = document.getElementById('filter');
  document.addEventListener('keydown', (e) => {
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if (e.key === '/' && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      filterInput.focus();
      filterInput.select();
    } else if (e.key === 'Escape' && e.target === filterInput) {
      if (filterInput.value) {
        clearFilter();
      } else {
        filterInput.blur();
      }
    }
  });
}

function init() {
  const filterInput = document.getElementById('filter');
  filterInput.addEventListener('input', () => {
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      filterText = filterInput.value;
      render();
    }, 100);
  });
  filterInput.focus();

  document.getElementById('cleanup').addEventListener('click', handleCleanup);
  document.getElementById('collapse-all').addEventListener('click', handleCollapseAll);

  setupKeyboardShortcuts();

  // Live refresh when tabs change elsewhere in the browser.
  chrome.tabs.onCreated.addListener(scheduleRefresh);
  chrome.tabs.onRemoved.addListener(scheduleRefresh);
  chrome.tabs.onUpdated.addListener(scheduleRefresh);

  refresh();
}

init();

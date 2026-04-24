// Tabs Cleaner — shared helpers (imported by popup.js and tabs.js)

// Lucide trash-2 — currentColor stroke so it inherits button text color.
export const TRASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M21 6H3"/><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/></svg>`;

export function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export function makeLink(className, text, tooltip, onActivate) {
  const span = el('span', {
    className,
    textContent: text,
    title: tooltip || '',
    role: 'link',
    tabindex: '0',
  });
  span.addEventListener('click', onActivate);
  span.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
  return span;
}

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return raw.trim();
  }
}

// Extract a grouping key: hostname for http(s), protocol name otherwise.
export function extractDomain(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.hostname || '(unknown)';
    }
    return u.protocol.replace(':', '');
  } catch {
    return '(unknown)';
  }
}

export function formatDuration(ms) {
  if (ms == null) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const remMin = min % 60;
    return remMin ? `${h}h ${remMin}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

export async function focusTab(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (err) {
    console.warn('[tabs-cleaner] focusTab failed (tab may be closed):', err);
  }
}

export async function closeTabs(tabIds) {
  try {
    await chrome.tabs.remove(tabIds);
  } catch (err) {
    console.warn('[tabs-cleaner] closeTabs failed (some tabs may be gone):', err);
  }
}

// Capture enough state to re-create a tab after closing.
export function backupTabs(tabs) {
  return tabs.map((t) => ({
    url: t.url,
    pinned: t.pinned,
    windowId: t.windowId,
    index: t.index,
  }));
}

// Re-open tabs from a backup. Falls back to "any window" if the original is gone.
export async function restoreTabs(backups) {
  for (const b of backups) {
    try {
      await chrome.tabs.create({
        url: b.url,
        pinned: b.pinned,
        windowId: b.windowId,
        index: b.index,
        active: false,
      });
    } catch {
      try {
        await chrome.tabs.create({ url: b.url, pinned: b.pinned, active: false });
      } catch (err) {
        console.warn('[tabs-cleaner] restore failed for', b.url, err);
      }
    }
  }
}

// Pure: group tabs by domain, then by normalized URL.
// Sorts URLs within a domain by count desc then alpha, and domains by total desc then alpha.
// Filter is a case-insensitive substring match on the normalized URL OR the title.
export function groupTabs(tabs, filter = '') {
  const f = filter.trim().toLowerCase();
  const byDomain = new Map();
  for (const tab of tabs) {
    const raw = tab.url || tab.pendingUrl || '';
    if (!raw) continue;
    const url = normalizeUrl(raw);
    if (f) {
      const title = (tab.title || '').toLowerCase();
      if (!url.toLowerCase().includes(f) && !title.includes(f)) continue;
    }
    const domain = extractDomain(raw);
    if (!byDomain.has(domain)) byDomain.set(domain, new Map());
    const byUrl = byDomain.get(domain);
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(tab);
  }

  const domains = [];
  for (const [domain, urls] of byDomain) {
    const urlEntries = [...urls.entries()]
      .map(([url, ts]) => ({ url, tabs: ts }))
      .sort((a, b) => b.tabs.length - a.tabs.length || a.url.localeCompare(b.url));
    const total = urlEntries.reduce((sum, u) => sum + u.tabs.length, 0);
    domains.push({ domain, urls: urlEntries, total });
  }
  domains.sort((a, b) => b.total - a.total || a.domain.localeCompare(b.domain));
  return domains;
}

// Toast with an Undo action. One toast at a time, auto-dismissed after 5s.
let _toastTimer = null;

export function showToast(message, actionLabel, onAction) {
  let toast = document.getElementById('bt-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'bt-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    const msg = document.createElement('span');
    msg.className = 'toast-msg';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    toast.append(msg, btn);
    document.body.append(toast);
  }
  toast.querySelector('.toast-msg').textContent = message;
  const btn = toast.querySelector('.toast-action');
  btn.textContent = actionLabel;
  btn.onclick = () => {
    hideToast();
    onAction();
  };
  toast.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(hideToast, 5000);
}

export function hideToast() {
  const toast = document.getElementById('bt-toast');
  if (toast) toast.hidden = true;
  clearTimeout(_toastTimer);
}

// Render a favicon; leaves an empty 16×16 slot when the URL is missing or fails.
export function renderFavicon(favIconUrl) {
  const wrapper = el('span', { className: 'favicon' });
  if (!favIconUrl) return wrapper;
  const img = document.createElement('img');
  img.src = favIconUrl;
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => img.remove());
  wrapper.append(img);
  return wrapper;
}

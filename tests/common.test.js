import { describe, it, expect } from 'vitest';
import { normalizeUrl, extractDomain, formatDuration, groupTabs } from '../common.js';

describe('normalizeUrl', () => {
  it('strips the fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('strips a trailing slash from non-root paths', () => {
    expect(normalizeUrl('https://example.com/foo/bar/')).toBe('https://example.com/foo/bar');
  });

  it('keeps the root slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('preserves the query string', () => {
    expect(normalizeUrl('https://example.com/p?a=1')).toBe('https://example.com/p?a=1');
  });

  it('falls back to trimmed raw input for invalid URLs', () => {
    expect(normalizeUrl('   not a url   ')).toBe('not a url');
  });

  it('handles internal schemes', () => {
    expect(normalizeUrl('brave://settings/')).toBe('brave://settings/');
    expect(normalizeUrl('chrome://extensions/#shortcuts')).toBe('chrome://extensions/');
  });
});

describe('extractDomain', () => {
  it('returns the hostname for http(s) URLs', () => {
    expect(extractDomain('https://github.com/anthropic/claude')).toBe('github.com');
    expect(extractDomain('http://example.com/path')).toBe('example.com');
  });

  it('returns the protocol name for internal schemes', () => {
    expect(extractDomain('brave://settings/')).toBe('brave');
    expect(extractDomain('chrome://extensions/')).toBe('chrome');
    expect(extractDomain('about:blank')).toBe('about');
    expect(extractDomain('file:///Users/x/doc.txt')).toBe('file');
  });

  it('returns (unknown) for unparseable input', () => {
    expect(extractDomain('not a url')).toBe('(unknown)');
  });
});

describe('formatDuration', () => {
  it('handles null', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it('formats seconds', () => {
    expect(formatDuration(5_000)).toBe('5s');
    expect(formatDuration(59_000)).toBe('59s');
  });

  it('formats minutes', () => {
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(45 * 60_000)).toBe('45m');
  });

  it('formats hours, with minutes when non-zero', () => {
    expect(formatDuration(2 * 3600_000)).toBe('2h');
    expect(formatDuration(2 * 3600_000 + 15 * 60_000)).toBe('2h 15m');
  });

  it('formats days, with hours when non-zero', () => {
    expect(formatDuration(5 * 86400_000)).toBe('5d');
    expect(formatDuration(5 * 86400_000 + 3 * 3600_000)).toBe('5d 3h');
  });
});

describe('groupTabs', () => {
  const tab = (id, url) => ({ id, url, lastAccessed: id * 1000 });

  it('groups tabs by domain and normalized URL', () => {
    const tabs = [
      tab(1, 'https://github.com/foo/bar'),
      tab(2, 'https://github.com/foo/bar#readme'),
      tab(3, 'https://github.com/foo/bar/'),
      tab(4, 'https://example.com/'),
    ];
    const groups = groupTabs(tabs);
    expect(groups).toHaveLength(2);
    const gh = groups.find((g) => g.domain === 'github.com');
    expect(gh.urls).toHaveLength(1);
    expect(gh.urls[0].tabs).toHaveLength(3);
    expect(gh.total).toBe(3);
  });

  it('sorts URLs within a domain by count desc then alpha', () => {
    const tabs = [tab(1, 'https://a.com/z'), tab(2, 'https://a.com/b'), tab(3, 'https://a.com/b')];
    const [group] = groupTabs(tabs);
    expect(group.urls[0].url).toBe('https://a.com/b');
    expect(group.urls[1].url).toBe('https://a.com/z');
  });

  it('sorts domains by total desc then alpha', () => {
    const tabs = [
      tab(1, 'https://zebra.com/'),
      tab(2, 'https://apple.com/'),
      tab(3, 'https://apple.com/other'),
      tab(4, 'https://apple.com/third'),
      tab(5, 'https://banana.com/'),
      tab(6, 'https://cherry.com/'),
    ];
    const groups = groupTabs(tabs);
    expect(groups.map((g) => g.domain)).toEqual([
      'apple.com',
      'banana.com',
      'cherry.com',
      'zebra.com',
    ]);
  });

  it('filters by case-insensitive substring match on normalized URL', () => {
    const tabs = [
      tab(1, 'https://github.com/foo'),
      tab(2, 'https://gitlab.com/bar'),
      tab(3, 'https://example.com/'),
    ];
    const groups = groupTabs(tabs, 'GIT');
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.domain.includes('git'))).toBe(true);
  });

  it('also matches the filter against the tab title', () => {
    const tabs = [
      { id: 1, url: 'https://a.com/x', title: 'Feature request', lastAccessed: 1 },
      { id: 2, url: 'https://b.com/y', title: 'Unrelated page', lastAccessed: 2 },
    ];
    const groups = groupTabs(tabs, 'feature');
    expect(groups).toHaveLength(1);
    expect(groups[0].urls[0].url).toBe('https://a.com/x');
  });

  it('skips tabs without a usable URL', () => {
    const tabs = [tab(1, ''), tab(2, null), { id: 3, url: 'https://x.com/' }];
    const groups = groupTabs(tabs);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(1);
  });
});

import { describe, expect, test } from 'bun:test';
import { allTabIds, groupOfTab, insertTab, reconcile, removeTabs, sameItems } from '../../tab-items.js';

const group = (id, tabs, extra = {}) => ({ group: id, name: id, color: '#2196f3', tabs, ...extra });
const tabs = (...ids) => ids.map(id => ({ id }));

describe('insertTab', () => {
  test('appends at the bottom or prepends at the top', () => {
    expect(insertTab([1, 2], 3)).toEqual([1, 2, 3]);
    expect(insertTab([1, 2], 3, { position: 'top' })).toEqual([3, 1, 2]);
  });

  test('a tab opened from a grouped tab joins that group', () => {
    const items = [1, group('g', [2, 3])];
    expect(insertTab(items, 4, { openerTabId: 2 })).toEqual([1, group('g', [2, 3, 4])]);
    expect(insertTab(items, 4, { openerTabId: 2, position: 'top' })).toEqual([1, group('g', [4, 2, 3])]);
  });

  test('a tab opened from an ungrouped tab stays at root', () => {
    expect(insertTab([1, group('g', [2])], 4, { openerTabId: 1 })).toEqual([1, group('g', [2]), 4]);
  });

  test('a tab already in the list is not added twice', () => {
    const items = [1, group('g', [2])];
    expect(insertTab(items, 2)).toBe(items);
  });

  test('leaves its input untouched', () => {
    const items = [1, group('g', [2])];
    const copy = structuredClone(items);
    insertTab(items, 3, { openerTabId: 2 });
    expect(items).toEqual(copy);
  });
});

describe('removeTabs', () => {
  test('removes root and grouped tabs, drops a group left empty', () => {
    const items = [1, group('a', [2, 3]), group('b', [4]), 5];
    expect(removeTabs(items, [1, 3, 4])).toEqual([group('a', [2]), 5]);
  });

  test('keeps group properties', () => {
    const items = [group('a', [2, 3], { autoSave: true, linkedSessionId: 's' })];
    expect(removeTabs(items, [3])).toEqual([group('a', [2], { autoSave: true, linkedSessionId: 's' })]);
  });
});

describe('reconcile', () => {
  test('missing tabs join in the order they were opened, whatever order the tab strip has', () => {
    // The tab strip lists the newest first, as an MRU extension leaves it
    expect(reconcile([1, 2], tabs(14, 13, 12, 11, 2, 1))).toEqual([1, 2, 11, 12, 13, 14]);
  });

  test('at the top, the newest missing tab comes first', () => {
    expect(reconcile([1], tabs(1, 12, 11, 13), 'top')).toEqual([13, 12, 11, 1]);
  });

  test('closed tabs leave, groups keep their place', () => {
    expect(reconcile([1, group('g', [2, 3]), 4], tabs(4, 3, 1))).toEqual([1, group('g', [3]), 4]);
  });

  test('an order that already matches comes back equal', () => {
    const items = [1, group('g', [2])];
    expect(sameItems(reconcile(items, tabs(2, 1)), items)).toBe(true);
  });
});

test('allTabIds and groupOfTab read through groups', () => {
  const items = [1, group('g', [2, 3])];
  expect(allTabIds(items)).toEqual([1, 2, 3]);
  expect(groupOfTab(items, 3)?.group).toBe('g');
  expect(groupOfTab(items, 1)).toBeNull();
});

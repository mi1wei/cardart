import { lang } from './i18n.js';

const words = {
  en: {
    searchAlbums: 'Search albums', searchPhotos: 'Search filenames and notes', clear: 'Clear search',
    noResults: 'No matching items', sortBy: 'Sort',
    updated: 'Last updated', created: 'Created', name: 'Name', taken: 'Capture time',
    added: 'Date added', manual: 'Manual', manualPrompt: 'Switch to manual order?',
    manualHint: 'Drag again after switching to manual order.', all: 'Select all', done: 'Done',
    move: 'Move to', copy: 'Copy to', download: 'Download', pickAlbum: 'Choose an album',
    newAlbum: '+ New album', transferred: ({ n, skipped }) => `${n} items transferred · ${skipped} duplicates skipped`,
    busy: 'Please wait for the current operation to finish.', trash: 'Recently Deleted',
    trashInfo: 'Deleted albums and media stay here for 30 days. Restore them or permanently delete them.',
    expires: ({ n }) => `${n} days remaining`, trashCount: ({ n }) => `${n === 1 ? '1 item' : `${n} items`} · Cleared after 30 days`,
    restore: 'Restore', purge: 'Permanently delete', purgeAll: 'Permanently delete all',
    purgeConfirm: 'Permanently delete these items? This cannot be undone.',
    purgeAllConfirm: 'Permanently delete everything in Recently Deleted? This cannot be undone.',
    trashEmpty: 'Nothing in Recently Deleted', albumGroup: 'Albums', mediaGroup: 'Photos and videos',
    movedToTrash: 'Moved to Recently Deleted', undo: 'Undo', restored: 'Restored',
    pdf: 'Export PDF', recent: 'Recently updated', photoDates: 'Capture dates',
    sortFeature: 'By capture time', sortFeatureText: 'Find photos by filename or note. Browse in capture, upload or your own order.',
    trashFeature: 'Accidental deletes are recoverable', trashFeatureText: 'Deleted albums and media stay in Recently Deleted for 30 days. Undo right away or restore them later.',
  },
  zh: {
    searchAlbums: '搜索相册名', searchPhotos: '搜索文件名和备注', clear: '清除搜索',
    noResults: '没有匹配的内容', sortBy: '排序',
    updated: '最近更新', created: '创建时间', name: '名称', taken: '拍摄时间',
    added: '添加时间', manual: '手动', manualPrompt: '切换为手动排序？',
    manualHint: '已切换为手动排序，请再次拖动。', all: '全选', done: '完成',
    move: '移动到', copy: '复制到', download: '下载', pickAlbum: '选择相册',
    newAlbum: '＋ 新建相册', transferred: ({ n, skipped }) => `已处理 ${n} 项 · 跳过 ${skipped} 个重复内容`,
    busy: '请等待当前操作完成。', trash: '最近删除',
    trashInfo: '删除的相册和照片、视频在此保留 30 天，可以恢复或彻底删除。',
    expires: ({ n }) => `剩余 ${n} 天`, trashCount: ({ n }) => `${n} 项 · 30 天后清除`,
    restore: '恢复', purge: '彻底删除', purgeAll: '全部彻底删除',
    purgeConfirm: '彻底删除所选内容？此操作不能恢复。',
    purgeAllConfirm: '彻底删除「最近删除」中的全部内容？此操作不能恢复。',
    trashEmpty: '最近删除为空', albumGroup: '相册', mediaGroup: '照片和视频',
    movedToTrash: '已移到「最近删除」', undo: '撤销', restored: '已恢复',
    pdf: '导出 PDF', recent: '最近更新', photoDates: '拍摄日期',
    sortFeature: '按拍摄时间', sortFeatureText: '按拍摄、上传时间或手动顺序浏览，搜索文件名和备注，轻松找到照片。',
    trashFeature: '误删可找回', trashFeatureText: '相册和照片、视频删除后保留 30 天，可以立即撤销，也可以稍后恢复。',
  },
};

export function c(key, vars = {}) {
  const value = words[lang()][key];
  return typeof value === 'function' ? value(vars) : value;
}

export function preference(key, choices, fallback) {
  try {
    const value = localStorage.getItem(key);
    return choices.includes(value) ? value : fallback;
  } catch { return fallback; }
}

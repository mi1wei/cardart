// Chinese and English text (spec §10, §13). A value is a string, or a function of the variables.
export const TEXT = {
  zh: {
    app: '册页',
    home: '首页',
    albums: '相册',
    'phone-access': '手机访问',
    language: '语言',
    ok: '确定',
    cancel: '取消',
    delete: '删除',
    save: '保存',
    close: '关闭',
    more: '更多',
    'load-failed': ({ reason }) => `加载失败：${reason}`,
    failed: ({ reason }) => `操作失败：${reason}`,
    'save-failed': ({ reason }) => `保存失败：${reason}`,
    'image-missing': '图片丢失',
    photos: ({ n }) => `${n} 张照片`,
    stats: ({ a, p }) => `${a} 本相册 · ${p} 张照片`,
    'local-albums': '本地相册',
    'no-upload': '照片不上传云端',
    'hero-title': '把照片装进一本\n能翻的相册',
    'hero-lead': '照片存在自己的电脑上。横的竖的自动排版，像真的相册一样一页页翻；同一个 Wi‑Fi 下，手机扫码也能看。',
    'open-albums': '打开相册',
    'view-on-phone': '用手机看',
    'what-it-does': '能做什么',
    'f1-title': '照片只在你的电脑上',
    'f1-text': '不上传到任何地方。整个相册库就是一个文件夹，复制一份就是备份。',
    'f2-title': '像真的相册一样翻',
    'f2-text': '3D 翻页，拖动或点两侧翻；一万张照片也是一本连续的书。',
    'f3-title': '横竖自动排版',
    'f3-text': '横的竖的混在一起，每页自动排一到四张，照片不裁切。',
    'f4-title': '手机扫码就能看',
    'f4-text': '同一个 Wi‑Fi 下扫码，手机也能看、能上传；iPhone 可以添加到主屏幕全屏看。',
    recent: '最近的相册',
    'all-albums': '全部相册',
    footer: '照片只保存在这台电脑上',
    'new-album': '新建相册',
    'new-album-name': '新相册',
    'no-albums': '还没有相册',
    rename: '重命名',
    'delete-album': '删除相册',
    create: '创建',
    'rename-album': '重命名相册',
    'delete-album-text': ({ name }) => `删除相册「${name}」？相册里的照片会一起删除，不能恢复。`,
    'rename-hint': '点击改名',
    'flip-3d': '3D 翻阅',
    'upload-photos': '上传照片',
    upload: '上传',
    select: '选择',
    selected: ({ n }) => `已选 ${n} 张`,
    cover: '封面',
    'drop-here': '把照片拖到这里',
    or: '或',
    'choose-photos': '点这里选择照片',
    formats: '支持 JPG、PNG、HEIC、WebP',
    'album-missing': '相册不存在。',
    'back-to-albums': '回到全部相册',
    importing: ({ i, n }) => `正在导入 ${i} / ${n}`,
    'import-done': '导入完成',
    imported: ({ n }) => `已导入 ${n} 张`,
    skipped: ({ n, why }) => `，跳过 ${n} 张（${why}）`,
    dup: ({ n }) => `重复 ${n}`,
    bad: ({ n }) => `格式不支持 ${n}`,
    big: ({ n }) => `太大 ${n}`,
    'failed-n': ({ n }) => `，失败 ${n} 张`,
    sep: '，',
    'delete-photos': '删除照片',
    'delete-photos-text': ({ n }) => `删除 ${n} 张照片？删除后不能恢复。`,
    'order-changed': '照片有变化，已刷新',
    'set-cover': '设为封面',
    'cover-set': '已设为封面',
    original: '查看原图',
    'prev-photo': '上一张',
    'next-photo': '下一张',
    'delete-photo': '删除照片',
    'delete-photo-text': '删除这张照片？删除后不能恢复。',
    'hint-open': '拖动页面或点击两侧翻页；点击照片看大图',
    'hint-closed': '点击封面或向左拖动打开',
    'per-page': '每页',
    'per-1': '每页 1 张',
    'per-2': '宽松',
    'per-3': '紧凑',
    fullscreen: '全屏',
    'fullscreen-exit': '退出全屏',
    'close-book': '合上相册',
    'open-book': '打开相册',
    'prev-page': '上一页',
    'next-page': '下一页',
    'jump-spread': '跳到第几个跨页',
    'no-webgl': '当前浏览器无法显示 3D 相册（WebGL 不可用）',
    rotate: '请横过手机查看相册',
    'no-fullscreen': '当前浏览器不能全屏',
    'tip-iphone': 'iPhone 的浏览器不能全屏：点分享 →「添加到主屏幕」，以后从主屏幕上的「册页」图标打开就是全屏。',
    'tip-wechat': '微信里不能全屏：点右上角「···」→「在 Safari 中打开」，再点分享 →「添加到主屏幕」。',
    'phone-title': '用手机看相册',
    'phone-help': '手机和这台电脑连同一个 Wi‑Fi，用手机相机扫下面的码。',
    copy: '复制',
    copied: '已复制',
    'copy-failed': '复制失败，请手动复制',
    'phone-note': '想在 iPhone 上全屏看：在 Safari 里点分享 →「添加到主屏幕」，以后点主屏幕上的「册页」图标打开。',
    'phone-allow': '允许手机访问',
    'phone-allow-help': '关掉后，手机马上打不开',
    'phone-link-off': '打开下面的开关后显示链接',
    'phone-no-lan': '这台电脑没有连接局域网',
  },
  en: {
    app: 'Folio',
    home: 'Home',
    albums: 'Albums',
    'phone-access': 'Phone access',
    language: 'Language',
    ok: 'OK',
    cancel: 'Cancel',
    delete: 'Delete',
    save: 'Save',
    close: 'Close',
    more: 'More',
    'load-failed': ({ reason }) => `Couldn't load: ${reason}`,
    failed: ({ reason }) => `Something went wrong: ${reason}`,
    'save-failed': ({ reason }) => `Couldn't save: ${reason}`,
    'image-missing': 'Image missing',
    photos: ({ n }) => (n === 1 ? '1 photo' : `${n} photos`),
    stats: ({ a, p }) => `${a === 1 ? '1 album' : `${a} albums`} · ${p === 1 ? '1 photo' : `${p} photos`}`,
    'local-albums': 'Local photo albums',
    'no-upload': 'Nothing is uploaded',
    'hero-title': 'Your photos, bound \ninto a real album',
    'hero-lead':
      'Folio keeps your photos on your own computer, lays them out page by page, and lets you flip through them like a real album. Phones on the same Wi‑Fi can join with a scan.',
    'open-albums': 'Open albums',
    'view-on-phone': 'View on phone',
    'what-it-does': 'What it does',
    'f1-title': 'Stays on your computer',
    'f1-text': 'Nothing leaves your machine. The library is just a folder — copy it and you have a backup.',
    'f2-title': 'Flip it like a real album',
    'f2-text': 'Turn pages in 3D by dragging or tapping. Even 10,000 photos make one continuous book.',
    'f3-title': 'Automatic layout',
    'f3-text': 'Landscape and portrait photos share pages, one to four per page, never cropped.',
    'f4-title': 'Open it on your phone',
    'f4-text': 'Scan the code on the same Wi‑Fi to view and upload from your phone, or add it to your iPhone Home Screen.',
    recent: 'Recent albums',
    'all-albums': 'All albums',
    footer: 'Your photos stay on this computer',
    'new-album': 'New album',
    'new-album-name': 'New album',
    'no-albums': 'No albums yet',
    rename: 'Rename',
    'delete-album': 'Delete album',
    create: 'Create',
    'rename-album': 'Rename album',
    'delete-album-text': ({ name }) => `Delete "${name}"? Its photos will be deleted too. This can't be undone.`,
    'rename-hint': 'Click to rename',
    'flip-3d': 'Flip in 3D',
    'upload-photos': 'Upload photos',
    upload: 'Upload',
    select: 'Select',
    selected: ({ n }) => `${n} selected`,
    cover: 'Cover',
    'drop-here': 'Drop photos here',
    or: 'or',
    'choose-photos': 'choose photos',
    formats: 'JPG, PNG, HEIC and WebP',
    'album-missing': "This album doesn't exist.",
    'back-to-albums': 'Back to all albums',
    importing: ({ i, n }) => `Importing ${i} of ${n}`,
    'import-done': 'Import finished',
    imported: ({ n }) => (n === 1 ? 'Imported 1 photo' : `Imported ${n} photos`),
    skipped: ({ n, why }) => `, skipped ${n} (${why})`,
    dup: ({ n }) => (n === 1 ? '1 duplicate' : `${n} duplicates`),
    bad: ({ n }) => `${n} unsupported`,
    big: ({ n }) => `${n} too large`,
    'failed-n': ({ n }) => `, ${n} failed`,
    sep: ', ',
    'delete-photos': 'Delete photos',
    'delete-photos-text': ({ n }) => `${n === 1 ? 'Delete 1 photo?' : `Delete ${n} photos?`} This can't be undone.`,
    'order-changed': 'The photos changed elsewhere and were reloaded',
    'set-cover': 'Set as cover',
    'cover-set': 'Cover updated',
    original: 'View original',
    'prev-photo': 'Previous',
    'next-photo': 'Next',
    'delete-photo': 'Delete photo',
    'delete-photo-text': "Delete this photo? This can't be undone.",
    'hint-open': 'Drag a page or click either side to turn it; click a photo to enlarge it',
    'hint-closed': 'Click the cover or drag it left to open',
    'per-page': 'Per page',
    'per-1': '1 per page',
    'per-2': 'Relaxed',
    'per-3': 'Compact',
    fullscreen: 'Full screen',
    'fullscreen-exit': 'Exit full screen',
    'close-book': 'Close book',
    'open-book': 'Open book',
    'prev-page': 'Previous page',
    'next-page': 'Next page',
    'jump-spread': 'Jump to spread',
    'no-webgl': "This browser can't show the 3D album (WebGL is unavailable)",
    rotate: 'Turn your phone sideways to view the album',
    'no-fullscreen': "This browser can't go full screen",
    'tip-iphone': 'iPhone browsers can\'t go full screen: tap Share → "Add to Home Screen", then open Folio from its Home Screen icon.',
    'tip-wechat': 'WeChat can\'t go full screen: tap "···" at the top right → "Open in Safari", then Share → "Add to Home Screen".',
    'phone-title': 'View on your phone',
    'phone-help': 'Connect your phone to the same Wi‑Fi as this computer, then scan the code with its camera.',
    copy: 'Copy',
    copied: 'Copied',
    'copy-failed': "Couldn't copy. Please copy it by hand.",
    'phone-note': 'For full screen on iPhone: in Safari, tap Share → "Add to Home Screen", then open Folio from its icon.',
    'phone-allow': 'Allow phone access',
    'phone-allow-help': 'Phones lose access as soon as this is off',
    'phone-link-off': 'Turn on the switch below to show the link',
    'phone-no-lan': "This computer isn't on a local network",
  },
};

let current = null;

// With site data blocked, storage access throws: the choice then lasts for this visit only.
function stored() {
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
}

// Decided on first use: a saved choice, else the browser's first language (spec §10).
export function lang() {
  if (!current) {
    const saved = stored();
    const browser = navigator.languages?.[0] ?? navigator.language ?? '';
    current = saved === 'zh' || saved === 'en' ? saved : /^zh/i.test(browser) ? 'zh' : 'en';
    apply();
  }
  return current;
}

export function t(key, vars = {}) {
  const v = TEXT[lang()][key] ?? TEXT.zh[key];
  return typeof v === 'function' ? v(vars) : v;
}

export function setLang(code) {
  try {
    localStorage.setItem('lang', code);
  } catch {}
  current = code;
  apply();
}

// The page, the Home Screen name, the CSS placeholder text and the server follow the language.
// Cookies are shared by every app on this host, whatever the port: hence a name of our own.
function apply() {
  const root = document.documentElement;
  root.lang = current === 'zh' ? 'zh-CN' : 'en';
  root.style.setProperty('--missing', JSON.stringify(TEXT[current]['image-missing']));
  document.querySelector('meta[name=apple-mobile-web-app-title]')?.setAttribute('content', TEXT[current].app);
  document.cookie = `folio_lang=${current}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

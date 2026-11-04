import { lang } from './i18n.js';

const TEXT = {
  en: {
    title: 'Export PDF', paper: 'Paper', A4: 'A4 landscape', Letter: 'Letter landscape',
    same: 'Defaults to your 3D setting', quality: 'Quality',
    standard: 'Standard', high: 'High (print)', cover: 'Cover page (album name + dates)',
    captions: 'Notes as captions', video: 'Video', videoHint: 'Videos use their poster frame only, marked “Video”.',
    cancel: 'Cancel', export: 'Export', preparing: 'Preparing…', exporting: 'Exporting…',
    preview: (n) => `Preview · ${n} ${n === 1 ? 'page' : 'pages'}`,
    saved: (name) => `Saved to Downloads/${name}`, reveal: 'Show in folder',
    failed: (reason) => `PDF export failed: ${reason}`,
    empty: 'Choose a cover page to export an empty album.',
    blocked: 'Allow pop-ups to open the print preview, then try again.',
    print: 'Print / Save as PDF', printHint: 'Choose “Save as PDF” in the system print dialog.',
    unavailable: 'The print preview was closed.', ready: 'Print preview ready',
  },
  zh: {
    title: '导出 PDF', paper: '纸张', A4: 'A4 横向', Letter: 'Letter 横向',
    same: '默认同 3D 设置', quality: '画质',
    standard: '标准', high: '高（打印）', cover: '封面页（相册名 + 日期）',
    captions: '备注作为图注', video: '视频', videoHint: '视频只放封面帧，并标注「视频」。',
    cancel: '取消', export: '导出', preparing: '正在准备…', exporting: '正在导出…',
    preview: (n) => `预览 · 共 ${n} 页`,
    saved: (name) => `已保存到 下载/${name}`, reveal: '在文件夹中显示',
    failed: (reason) => `PDF 导出失败：${reason}`,
    empty: '空相册请勾选封面页后导出。',
    blocked: '请允许弹出打印预览窗口后重试。',
    print: '打印 / 存为 PDF', printHint: '在系统打印对话框中选择「存为 PDF」。',
    unavailable: '打印预览窗口已关闭。', ready: '打印预览已就绪',
  },
};

export function pdfText(key, value, language = lang()) {
  const text = (TEXT[language] || TEXT.en)[key];
  return typeof text === 'function' ? text(value) : text;
}

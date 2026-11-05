import { lang } from './i18n.js';

const text = {
  en: {
    filmstrip: 'Photos and videos', fit: 'Fit', actual: '1:1 Actual size',
    'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', zoom: 'Photo zoom',
    minimap: 'Visible area of the zoomed photo', restore: 'Restore', purge: 'Delete permanently',
    'purge-title': 'Delete permanently?', 'purge-text': 'This item cannot be recovered after permanent deletion.',
    'trash-preview': 'Recently deleted preview',
  },
  zh: {
    filmstrip: '照片和视频', fit: '适应', actual: '1:1 实际大小',
    'zoom-in': '放大', 'zoom-out': '缩小', zoom: '照片缩放',
    minimap: '放大照片的可视区域', restore: '恢复', purge: '彻底删除',
    'purge-title': '彻底删除？', 'purge-text': '彻底删除后，此项目将无法恢复。',
    'trash-preview': '最近删除预览',
  },
};

export const lt = (key) => text[lang() === 'zh' ? 'zh' : 'en'][key];

import './style.css';

const app = document.querySelector('#app');

async function loadAlbum() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}cards.json`);
    const album = res.ok ? await res.json() : null;
    return Array.isArray(album?.cards) ? album : null;
  } catch {
    return null;
  }
}

loadAlbum().then((album) => {
  if (!album) {
    app.innerHTML = '<p class="page-error">相册数据加载失败</p>';
    return;
  }
  app.innerHTML = `
    <main class="page">
      <h1></h1>
      <p class="page-count"></p>
      <button class="ab-primary" type="button">3D 翻阅</button>
    </main>`;
  app.querySelector('h1').textContent = album.title;
  app.querySelector('.page-count').textContent = `${album.cards.length} 张卡片`;
  app.querySelector('button').addEventListener('click', async () => {
    const { openViewer } = await import('./viewer.js');
    if (!document.querySelector('.ab')) openViewer(album); // a double click must not open two viewers
  });
});

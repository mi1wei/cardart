// Stand-in "photos" for the mockups: simple SVG scenes in common photo shapes (no external images).
const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const lin = (id, stops) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

// A jagged mountain line across the width, closed down to the bottom.
function ridge(r, w, h, y, amp, steps) {
  let d = `M0 ${y}`;
  for (let i = 1; i <= steps; i++) d += ` L${((w * i) / steps).toFixed(0)} ${(y - amp * (0.3 + 0.7 * r()) * (i % 2 ? 1 : 0.35)).toFixed(0)}`;
  return `${d} V${h} H0Z`;
}

function pines(r, w, base, n, size, color, opacity = 1) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = (w * (i + r() * 0.8)) / n;
    const s = size * (0.7 + 0.6 * r());
    out += `<path d="M${x.toFixed(0)} ${(base - s * 2.6).toFixed(0)} L${(x + s).toFixed(0)} ${base} L${(x - s).toFixed(0)} ${base}Z"/>`;
  }
  return `<g fill="${color}" opacity="${opacity}">${out}</g>`;
}

const strokes = (r, n, x0, x1, y0, y1, color, width, opacity) =>
  `<g stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}">${Array.from({ length: n }, () => {
    const x = x0 + (x1 - x0) * r();
    const y = y0 + (y1 - y0) * r();
    return `<path d="M${x.toFixed(0)} ${y.toFixed(0)}h${(40 + 110 * r()).toFixed(0)}"/>`;
  }).join('')}</g>`;

export const scenes = {
  sunset: { w: 1200, h: 900, draw(seed = 1) {
    const r = rnd(seed);
    const sx = 600 + 300 * (r() - 0.5);
    return svg(1200, 900, `<defs>${lin('s', [[0, '#5b4a8b'], [0.45, '#e2788a'], [0.78, '#ffb37a'], [1, '#ffd9a0']])}<radialGradient id="g"><stop offset="0" stop-color="#fff4d6"/><stop offset=".35" stop-color="#ffe3a1" stop-opacity=".9"/><stop offset="1" stop-color="#ffe3a1" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="900" fill="url(#s)"/><circle cx="${sx}" cy="560" r="240" fill="url(#g)"/><circle cx="${sx}" cy="560" r="72" fill="#fff1cf"/><path d="${ridge(r, 1200, 900, 610, 170, 9)}" fill="#7a5383" opacity=".8"/><path d="${ridge(r, 1200, 900, 700, 140, 7)}" fill="#4f3866"/><path d="${ridge(r, 1200, 900, 790, 90, 6)}" fill="#2d2140"/>`);
  } },
  sea: { w: 1200, h: 800, draw(seed = 1) {
    const r = rnd(seed);
    const bx = 650 + 300 * r();
    return svg(1200, 800, `<defs>${lin('k', [[0, '#8fc6e4'], [1, '#eef6fa']])}${lin('w', [[0, '#4b9cc0'], [1, '#174d69']])}</defs><rect width="1200" height="800" fill="url(#k)"/><circle cx="${250 + 200 * r()}" cy="290" r="60" fill="#fffaf0"/><rect y="480" width="1200" height="320" fill="url(#w)"/>${strokes(r, 12, 0, 1100, 500, 780, '#e8f6ff', 4, 0.6)}<path d="M${bx} 472 V320 L${bx + 84} 472Z" fill="#fff"/><path d="M${bx - 8} 472 L${bx} 352 L${bx - 60} 472Z" fill="#eef1f3"/><path d="M${bx - 70} 478 h170 l-22 20 h-128z" fill="#22313f"/>`);
  } },
  forest: { w: 900, h: 1200, draw(seed = 1) {
    const r = rnd(seed);
    return svg(900, 1200, `<defs>${lin('f', [[0, '#eef3ee'], [0.6, '#c9d9cd'], [1, '#93ae9c']])}</defs><rect width="900" height="1200" fill="url(#f)"/><circle cx="${300 + 300 * r()}" cy="300" r="90" fill="#fbfbf3" opacity=".8"/>${pines(r, 900, 760, 9, 70, '#8aa796', 0.7)}${pines(r, 900, 930, 7, 95, '#56786a')}${pines(r, 900, 1200, 5, 140, '#2e4a3f')}`);
  } },
  city: { w: 900, h: 1200, draw(seed = 1) {
    const r = rnd(seed);
    let b = '';
    for (let x = 0; x < 900; ) {
      const bw = 90 + 90 * r();
      const top = 1200 - (380 + 520 * r());
      b += `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${(bw - 6).toFixed(0)}" height="${(1200 - top).toFixed(0)}" fill="${r() > 0.5 ? '#1c2747' : '#24315a'}"/>`;
      for (let wy = top + 24; wy < 1170; wy += 34) {
        for (let wx = x + 14; wx < x + bw - 26; wx += 26) {
          if (r() > 0.55) b += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="12" height="16" fill="${r() > 0.3 ? '#ffd88a' : '#9fc4ff'}" opacity="${(0.6 + 0.4 * r()).toFixed(2)}"/>`;
        }
      }
      x += bw;
    }
    return svg(900, 1200, `<defs>${lin('n', [[0, '#0f1730'], [0.7, '#2c3d6b'], [1, '#56628f']])}</defs><rect width="900" height="1200" fill="url(#n)"/><circle cx="${200 + 500 * r()}" cy="200" r="54" fill="#f4f1e4"/>${b}`);
  } },
  flower: { w: 1000, h: 1000, draw(seed = 1) {
    const r = rnd(seed);
    const c = ['#ef9fb4', '#f4b183', '#b7a3e3'][Math.floor(r() * 3)];
    const petals = Array.from({ length: 10 }, (_, i) => `<ellipse cx="500" cy="330" rx="70" ry="170" fill="${c}" opacity=".92" transform="rotate(${i * 36} 500 500)"/>`).join('');
    return svg(1000, 1000, `<defs>${lin('p', [[0, '#fbeef1'], [1, '#f1d9df']])}</defs><rect width="1000" height="1000" fill="url(#p)"/><path d="M500 560 C 520 700 470 820 520 1000" stroke="#5f8a5a" stroke-width="14" fill="none"/><ellipse cx="610" cy="800" rx="110" ry="40" fill="#79a46f" transform="rotate(-30 610 800)"/>${petals}<circle cx="500" cy="500" r="80" fill="#f2c94c"/><circle cx="500" cy="500" r="80" fill="none" stroke="#e0a93a" stroke-width="10" stroke-dasharray="4 14"/>`);
  } },
  dunes: { w: 1600, h: 900, draw(seed = 1) {
    const r = rnd(seed);
    return svg(1600, 900, `<defs>${lin('d', [[0, '#f9e7c9'], [1, '#f2c08e']])}</defs><rect width="1600" height="900" fill="url(#d)"/><circle cx="${300 + 1000 * r()}" cy="300" r="80" fill="#fff6e3"/><path d="M0 560 C 300 470 520 600 800 520 S 1300 450 1600 540 V900 H0Z" fill="#e7ab6b"/><path d="M0 680 C 260 600 600 720 900 640 S 1400 600 1600 690 V900 H0Z" fill="#cf8b4c"/><path d="M0 800 C 400 720 700 840 1100 770 S 1500 760 1600 800 V900 H0Z" fill="#a96b35"/>`);
  } },
  lake: { w: 1200, h: 900, draw(seed = 1) {
    const r = rnd(seed);
    const hills = ridge(r, 1200, 900, 470, 120, 8);
    const trees = pines(r, 1200, 470, 16, 34, '#2f5446');
    return svg(1200, 900, `<defs>${lin('a', [[0, '#cfe1ee'], [1, '#f5f8fb']])}${lin('l', [[0, '#9cc0d6'], [1, '#5f8fae']])}</defs><rect width="1200" height="900" fill="url(#a)"/><path d="${hills}" fill="#9fb7c6"/>${trees}<rect y="470" width="1200" height="430" fill="url(#l)"/><g transform="translate(0 940) scale(1 -1)" opacity=".35">${trees}</g>${strokes(r, 8, 0, 1100, 500, 880, '#eaf4fa', 3, 0.5)}`);
  } },
  snow: { w: 900, h: 1200, draw(seed = 1) {
    const r = rnd(seed);
    const px = 380 + 140 * r();
    return svg(900, 1200, `<defs>${lin('m', [[0, '#8fb9de'], [1, '#e6eff7']])}</defs><rect width="900" height="1200" fill="url(#m)"/><path d="M-50 900 L${px} 330 L950 880 V1200 H-50Z" fill="#6f8aa8"/><path d="M${px} 330 L${px + 110} 470 L${px + 60} 450 L${px + 20} 500 L${px - 30} 455 L${px - 90} 480Z" fill="#fff"/><path d="M${px} 330 L950 880 V900 L${px + 40} 420Z" fill="#5b7392" opacity=".6"/>${pines(r, 900, 1000, 8, 60, '#3d5d58')}${pines(r, 900, 1200, 6, 100, '#24403a')}<rect y="1150" width="900" height="50" fill="#eef3f7"/>`);
  } },
};

export const sceneUrl = (name, seed = 1) => `data:image/svg+xml,${encodeURIComponent(scenes[name].draw(seed))}`;

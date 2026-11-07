// 拡張機能のアイコン（resources/icon.png）を生成する。
// 使い方: npm run icon
//
// Marketplace のアイコンは 128px 以上の PNG でなければならない（SVG は受け付けられない）。
// 画像ライブラリに依存せず、Node 標準の zlib だけで PNG を書き出す。
//
// 図案: 濃紺の角丸の背景に、フォルダ・書類・プラスのバッジ。
// 「フォルダとファイルに、アイコンの割り当てを追加する」という拡張機能の役割を表す。
// VS Code のロゴはブランドガイドラインで拡張機能のアイコンへの使用が禁じられているので使わない。
// 色は Material Icon Theme に合わせて Material のパレットから選んでいる。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
/** 縁をなめらかにするため、1 画素を SS x SS に分けて塗り、平均を取る */
const SS = 4;
/** 図形の座標は 1024 x 1024 の下書きの値で書き、SIZE に縮める */
const UNIT = SIZE / 1024;

const NAVY = [17, 24, 39];
const FOLDER_TAB = [21, 101, 192];
const FOLDER_BACK = [25, 118, 210];
const FOLDER_FRONT_TOP = [100, 181, 246];
const FOLDER_FRONT_BOTTOM = [30, 136, 229];
const PAPER = [245, 247, 250];
const PAPER_FOLD = [207, 216, 226];
const PAPER_LINE = [144, 164, 190];
const BADGE = [38, 166, 154];
const WHITE = [255, 255, 255];

/** 角丸の四角までの符号付き距離（内側が負）。座標は下書きの単位 */
function roundedRectDistance(x, y, [left, top, right, bottom], radius) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const qx = Math.abs(x - cx) - ((right - left) / 2 - radius);
  const qy = Math.abs(y - cy) - ((bottom - top) / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

function circleDistance(x, y, cx, cy, radius) {
  return Math.hypot(x - cx, y - cy) - radius;
}

/** 三角形（頂点は時計回り・反時計回りのどちらでもよい）の内側か */
function inTriangle(x, y, [a, b, c]) {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** 影。形の縁を中心に blur の幅でぼかす（ガウスぼかしの近似） */
function shadowAlpha(distance, blur, opacity) {
  const t = Math.min(Math.max(0.5 - distance / (2 * blur), 0), 1);
  return opacity * t * t * (3 - 2 * t);
}

function mix(from, to, t) {
  return from.map((value, i) => value + (to[i] - value) * t);
}

/**
 * 下書きの座標 (x, y) の色を、奥の層から順に重ねて求める。
 * 戻り値は [r, g, b, a]（a は 0〜1）。
 */
function colorAt(x, y) {
  let color = [0, 0, 0];
  let alpha = 0;
  const paint = (rgb, a = 1) => {
    const outAlpha = a + alpha * (1 - a);
    if (outAlpha > 0) {
      color = color.map((value, i) => (rgb[i] * a + value * alpha * (1 - a)) / outAlpha);
    }
    alpha = outAlpha;
  };

  // 背景
  if (roundedRectDistance(x, y, [0, 0, 1024, 1024], 190) > 0) {
    return [0, 0, 0, 0];
  }
  paint(NAVY);

  // フォルダ
  paint([0, 0, 0], shadowAlpha(roundedRectDistance(x, y, [150, 268, 874, 818], 70), 28, 0.43));
  // タブ。角丸の四角と、右へ斜めに下がる台形（三角形 2 つ）でできている
  if (
    roundedRectDistance(x, y, [150, 250, 470, 400], 60) <= 0 ||
    inTriangle(x, y, [
      [400, 250],
      [470, 250],
      [540, 330],
    ]) ||
    inTriangle(x, y, [
      [400, 250],
      [540, 330],
      [400, 330],
    ])
  ) {
    paint(FOLDER_TAB);
  }
  if (roundedRectDistance(x, y, [150, 320, 874, 800], 70) <= 0) {
    paint(FOLDER_BACK);
  }
  if (roundedRectDistance(x, y, [150, 400, 874, 800], 70) <= 0) {
    paint(mix(FOLDER_FRONT_TOP, FOLDER_FRONT_BOTTOM, Math.min(Math.max((y - 400) / 400, 0), 1)));
  }

  // 書類（右上の角を折っている）
  const paper = [430, 330, 790, 800];
  const fold = 110;
  paint([0, 0, 0], shadowAlpha(roundedRectDistance(x, y, [430, 344, 790, 814], 40), 22, 0.35));
  const cutCorner = inTriangle(x, y, [
    [paper[2] - fold, paper[1] - 1],
    [paper[2] + 1, paper[1] - 1],
    [paper[2] + 1, paper[1] + fold],
  ]);
  if (roundedRectDistance(x, y, paper, 40) <= 0 && !cutCorner) {
    paint(PAPER);
  }
  if (
    inTriangle(x, y, [
      [paper[2] - fold, paper[1]],
      [paper[2] - fold, paper[1] + fold],
      [paper[2], paper[1] + fold],
    ])
  ) {
    paint(PAPER_FOLD);
  }
  [200, 150, 180].forEach((width, i) => {
    const top = paper[1] + 170 + i * 80;
    if (roundedRectDistance(x, y, [490, top, 490 + width, top + 36], 18) <= 0) {
      paint(PAPER_LINE);
    }
  });

  // プラスのバッジ。背景色の縁取りで書類から切り離して見せる
  const [cx, cy, radius] = [770, 770, 170];
  paint([0, 0, 0], shadowAlpha(circleDistance(x, y, cx, cy + 16, radius), 24, 0.47));
  if (circleDistance(x, y, cx, cy, radius + 16) <= 0) {
    paint(NAVY);
  }
  if (circleDistance(x, y, cx, cy, radius) <= 0) {
    paint(BADGE);
  }
  if (
    roundedRectDistance(x, y, [cx - 100, cy - 22, cx + 100, cy + 22], 22) <= 0 ||
    roundedRectDistance(x, y, [cx - 22, cy - 100, cx + 22, cy + 100], 22) <= 0
  ) {
    paint(WHITE);
  }

  return [...color, alpha];
}

function renderPixels() {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let py = 0; py < SIZE; py++) {
    const row = py * (SIZE * 4 + 1);
    raw[row] = 0; // フィルタなし
    for (let px = 0; px < SIZE; px++) {
      // 透明度を掛けた値で平均し、縁が暗くにじまないようにする
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = colorAt(
            (px + (sx + 0.5) / SS) / UNIT,
            (py + (sy + 0.5) / SS) / UNIT
          );
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const offset = row + 1 + px * 4;
      raw[offset] = a ? Math.round(r / a) : 0;
      raw[offset + 1] = a ? Math.round(g / a) : 0;
      raw[offset + 2] = a ? Math.round(b / a) : 0;
      raw[offset + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return raw;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // ビット深度
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(renderPixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.resolve(__dirname, '../resources/icon.png');
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + SIZE + 'x' + SIZE + ', ' + png.length + ' bytes)');

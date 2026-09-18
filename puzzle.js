/** Deterministic, complementary edges. Image space stays 1080 x 1600. */
export const WIDTH = 1080;
export const HEIGHT = 1600;
export const DIFFICULTIES = Object.freeze({
  easy: { label: '초급', cols: 3, rows: 4, ghost: true },
  normal: { label: '중급', cols: 4, rows: 6, ghost: false },
  hard: { label: '고급', cols: 6, rows: 9, ghost: false }
});
export function createPieces(cols, rows, seed = 1) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols * rows > 200) throw new Error('Invalid grid');
  let state = seed >>> 0;
  const sign = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state & 0x10000 ? 1 : -1; };
  const vertical = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, sign));
  const horizontal = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, sign));
  const w = WIDTH / cols, h = HEIGHT / rows;
  return Array.from({ length: rows * cols }, (_, id) => {
    const r = Math.floor(id / cols), c = id % cols;
    return { id, r, c, x: c * w, y: r * h, w, h, edge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1,
      sides: [r === 0 ? 0 : -horizontal[r - 1][c], c === cols - 1 ? 0 : vertical[r][c], r === rows - 1 ? 0 : horizontal[r][c], c === 0 ? 0 : -vertical[r][c - 1]] };
  });
}
export function piecePath(piece) {
  const { x, y, w, h, sides } = piece, path = new Path2D();
  path.moveTo(x, y);
  function edge(ax, ay, bx, by, side) {
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy), depth = Math.min(w, h) * .235 * side;
    const point = (t, n) => [ax + dx * t + dy / length * depth * n, ay + dy * t - dx / length * depth * n];
    const line = (t, n) => path.lineTo(...point(t, n));
    const curve = (a,b,c,d,e,f) => path.bezierCurveTo(...point(a,b), ...point(c,d), ...point(e,f));
    if (side) {
      line(.36,0); curve(.46,0,.36,.35,.40,.65); curve(.43,1.18,.57,1.18,.60,.65); curve(.64,.35,.54,0,.64,0);
    }
    line(1,0);
  }
  edge(x,y,x+w,y,sides[0]); edge(x+w,y,x+w,y+h,sides[1]); edge(x+w,y+h,x,y+h,sides[2]); edge(x,y+h,x,y,sides[3]);
  path.closePath(); return path;
}
export function shuffled(ids) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

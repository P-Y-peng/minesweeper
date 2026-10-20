/**
 * 扫雷核心逻辑。
 *
 * 这里只有规则，没有任何 DOM 依赖：浏览器里挂到 window.Minesweeper，
 * Node 里用 module.exports 拿到同一份实现，方便写测试。
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.Minesweeper = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIFFICULTIES = Object.freeze({
    beginner: Object.freeze({ id: "beginner", label: "初级", rows: 9, cols: 9, mines: 10 }),
    intermediate: Object.freeze({ id: "intermediate", label: "中级", rows: 16, cols: 16, mines: 40 }),
    expert: Object.freeze({ id: "expert", label: "高级", rows: 16, cols: 30, mines: 99 })
  });

  const HIDDEN = "hidden";
  const REVEALED = "revealed";
  const FLAGGED = "flagged";

  /** 可复现的伪随机数；测试里传固定 seed 就能得到固定棋盘。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createBoard(rows, cols, mines, options) {
    const opts = options || {};
    const total = rows * cols;
    const count = Math.max(0, Math.min(mines, total - 1));
    const cells = new Array(total);
    for (let i = 0; i < total; i++) cells[i] = { mine: false, adj: 0, state: HIDDEN };
    const seed = opts.seed === undefined ? Math.floor(Math.random() * 0xffffffff) : opts.seed;
    return {
      rows: rows,
      cols: cols,
      mines: count,
      cells: cells,
      started: false,
      over: false,
      won: false,
      lost: false,
      revealedCount: 0,
      flagCount: 0,
      rng: mulberry32(seed >>> 0)
    };
  }

  function inBounds(board, r, c) {
    return r >= 0 && r < board.rows && c >= 0 && c < board.cols;
  }

  function indexOf(board, r, c) {
    return r * board.cols + c;
  }

  function cellAt(board, r, c) {
    return inBounds(board, r, c) ? board.cells[indexOf(board, r, c)] : null;
  }

  /** 某格周围 8 格的索引。 */
  function neighborsOf(board, index) {
    const r = Math.floor(index / board.cols);
    const c = index % board.cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < board.rows && nc >= 0 && nc < board.cols) out.push(nr * board.cols + nc);
      }
    }
    return out;
  }

  /**
   * 第一次点击之后才布雷：点到的那格连同周围 8 格都不放雷，
   * 保证开局必有一片空地可以展开（雷太多放不下时退化为只保护点击格）。
   */
  function plantMines(board, safeR, safeC) {
    const total = board.rows * board.cols;
    const safe = new Set([indexOf(board, safeR, safeC)]);
    for (const idx of neighborsOf(board, indexOf(board, safeR, safeC))) safe.add(idx);
    const pool = [];
    const start = safe.size + board.mines <= total ? safe : new Set([indexOf(board, safeR, safeC)]);
    for (let i = 0; i < total; i++) if (!start.has(i)) pool.push(i);

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(board.rng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    for (let i = 0; i < board.mines; i++) board.cells[pool[i]].mine = true;

    for (let i = 0; i < total; i++) {
      if (board.cells[i].mine) continue;
      let n = 0;
      for (const idx of neighborsOf(board, i)) if (board.cells[idx].mine) n++;
      board.cells[i].adj = n;
    }
    board.started = true;
  }

  function beginIfNeeded(board, r, c) {
    if (!board.started) plantMines(board, r, c);
  }

  /** 从起点把连通的 0 区域整片翻开，返回被翻开的索引。 */
  function floodReveal(board, startIndex) {
    const opened = [];
    const stack = [startIndex];
    while (stack.length > 0) {
      const index = stack.pop();
      const cell = board.cells[index];
      if (cell.state !== HIDDEN || cell.mine) continue;
      cell.state = REVEALED;
      board.revealedCount++;
      opened.push(index);
      if (cell.adj === 0) {
        for (const idx of neighborsOf(board, index)) {
          if (board.cells[idx].state === HIDDEN && !board.cells[idx].mine) stack.push(idx);
        }
      }
    }
    return opened;
  }

  function mineIndices(board) {
    const out = [];
    for (let i = 0; i < board.cells.length; i++) if (board.cells[i].mine) out.push(i);
    return out;
  }

  /** 输了就把所有雷亮出来，方便玩家复盘。 */
  function endLoss(board) {
    board.over = true;
    board.lost = true;
    for (const idx of mineIndices(board)) board.cells[idx].state = REVEALED;
  }

  function checkWin(board) {
    if (board.over) return false;
    if (board.revealedCount !== board.rows * board.cols - board.mines) return false;
    board.over = true;
    board.won = true;
    for (const idx of mineIndices(board)) board.cells[idx].state = FLAGGED;
    board.flagCount = board.mines;
    return true;
  }

  function reveal(board, r, c) {
    if (board.over || !inBounds(board, r, c)) return { kind: "noop", opened: [] };
    const cell = cellAt(board, r, c);
    if (cell.state !== HIDDEN) return { kind: "noop", opened: [] };

    beginIfNeeded(board, r, c);

    if (cell.mine) {
      cell.state = REVEALED;
      endLoss(board);
      return { kind: "mine", opened: [] };
    }

    const opened = floodReveal(board, indexOf(board, r, c));
    return { kind: checkWin(board) ? "win" : "revealed", opened: opened };
  }

  function toggleFlag(board, r, c) {
    if (board.over || !inBounds(board, r, c)) return { kind: "noop" };
    const cell = cellAt(board, r, c);
    if (cell.state === REVEALED) return { kind: "noop" };
    if (cell.state === FLAGGED) {
      cell.state = HIDDEN;
      board.flagCount--;
      return { kind: "unflagged" };
    }
    cell.state = FLAGGED;
    board.flagCount++;
    return { kind: "flagged" };
  }

  /** 双键/双击：周围旗数等于数字时，一次性翻开剩余格子。 */
  function chord(board, r, c) {
    if (board.over || !inBounds(board, r, c)) return { kind: "noop", opened: [] };
    const cell = cellAt(board, r, c);
    if (cell.state !== REVEALED || cell.adj === 0) return { kind: "noop", opened: [] };

    const around = neighborsOf(board, indexOf(board, r, c));
    let flags = 0;
    for (const idx of around) if (board.cells[idx].state === FLAGGED) flags++;
    if (flags !== cell.adj) return { kind: "noop", opened: [] };

    const opened = [];
    let hitMine = false;
    for (const idx of around) {
      const nb = board.cells[idx];
      if (nb.state !== HIDDEN) continue;
      if (nb.mine) {
        nb.state = REVEALED;
        hitMine = true;
        continue;
      }
      opened.push.apply(opened, floodReveal(board, idx));
    }

    if (hitMine) {
      endLoss(board);
      return { kind: "mine", opened: opened };
    }
    return { kind: checkWin(board) ? "win" : "revealed", opened: opened };
  }

  return {
    DIFFICULTIES: DIFFICULTIES,
    HIDDEN: HIDDEN,
    REVEALED: REVEALED,
    FLAGGED: FLAGGED,
    createBoard: createBoard,
    inBounds: inBounds,
    indexOf: indexOf,
    cellAt: cellAt,
    neighborsOf: neighborsOf,
    reveal: reveal,
    toggleFlag: toggleFlag,
    chord: chord,
    checkWin: checkWin,
    mineIndices: mineIndices
  };
});

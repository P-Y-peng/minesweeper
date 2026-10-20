/**
 * 扫雷核心逻辑的单元测试：node test.js
 * 全部用固定 seed，结果可复现。
 */
"use strict";

const MS = require("./minesweeper.js");

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log("  ok   " + name);
  } else {
    failed++;
    console.log("  FAIL " + name + (detail ? "  -> " + detail : ""));
  }
}

function minesOn(board) {
  let n = 0;
  for (const cell of board.cells) if (cell.mine) n++;
  return n;
}

function section(title) {
  console.log("\n" + title);
}

section("1. 建盘");
{
  const board = MS.createBoard(9, 9, 10, { seed: 7 });
  check("格子数 = 81", board.cells.length === 81, String(board.cells.length));
  check("布雷前没有雷", minesOn(board) === 0);
  check("布雷前未开始", board.started === false);
  check("难度表有 3 档", Object.keys(MS.DIFFICULTIES).length === 3);
}

section("2. 第一次点击一定安全");
{
  let allSafe = true;
  let mineCountOk = true;
  for (let seed = 0; seed < 200; seed++) {
    const board = MS.createBoard(9, 9, 10, { seed: seed });
    const r = seed % 9;
    const c = (seed * 3) % 9;
    const result = MS.reveal(board, r, c);
    if (result.kind === "mine") allSafe = false;
    if (MS.cellAt(board, r, c).mine) allSafe = false;
    if (minesOn(board) !== 10) mineCountOk = false;
    // 周围 8 格也应该是安全的
    for (const idx of MS.neighborsOf(board, MS.indexOf(board, r, c))) {
      if (board.cells[idx].mine) allSafe = false;
    }
  }
  check("200 个 seed × 随机首点，从未踩雷", allSafe);
  check("每次都是 10 颗雷", mineCountOk);
}

section("3. 数字与展开");
{
  const board = MS.createBoard(9, 9, 10, { seed: 42 });
  const result = MS.reveal(board, 4, 4);
  check("首点不是雷", result.kind !== "mine", result.kind);
  check("首点至少翻开 9 格（3×3 空地）", result.opened.length >= 9, String(result.opened.length));

  let adjOk = true;
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i].mine || board.cells[i].state !== MS.REVEALED) continue;
    let expected = 0;
    for (const idx of MS.neighborsOf(board, i)) if (board.cells[idx].mine) expected++;
    if (board.cells[i].adj !== expected) adjOk = false;
  }
  check("每格数字 = 周围雷数", adjOk);

  const openedSet = new Set(result.opened);
  let openZeroOk = true;
  for (const idx of result.opened) {
    const cell = board.cells[idx];
    if (cell.adj !== 0) continue;
    for (const nb of MS.neighborsOf(board, idx)) {
      if (board.cells[nb].mine) continue;
      if (!openedSet.has(nb)) openZeroOk = false;
    }
  }
  check("0 的邻格都被连带翻开", openZeroOk);
}

section("4. 插旗");
{
  const board = MS.createBoard(9, 9, 10, { seed: 1 });
  MS.reveal(board, 0, 0);
  check("插旗后计数为 1", MS.toggleFlag(board, 8, 8).kind === "flagged" && board.flagCount === 1);
  check("同一格再点取消旗", MS.toggleFlag(board, 8, 8).kind === "unflagged" && board.flagCount === 0);
  check("已翻开的格子不能插旗", MS.toggleFlag(board, 0, 0).kind === "noop");
  MS.toggleFlag(board, 8, 8);
  check("有旗的格子点不开", MS.reveal(board, 8, 8).kind === "noop");
}

section("5. 双键快开（chord）");
{
  // 3×3 只放 1 颗雷，把雷手动放到 (0,0)，验证 chord 行为
  const board = MS.createBoard(3, 3, 1, { seed: 3 });
  MS.reveal(board, 2, 2);
  // 直接构造：重置成已知局面
  for (const cell of board.cells) {
    cell.mine = false;
    cell.adj = 0;
    cell.state = MS.HIDDEN;
  }
  board.cells[0].mine = true; // (0,0)
  for (let i = 0; i < 9; i++) {
    if (board.cells[i].mine) continue;
    let n = 0;
    for (const idx of MS.neighborsOf(board, i)) if (board.cells[idx].mine) n++;
    board.cells[i].adj = n;
  }
  board.started = true;
  board.over = false;
  board.revealedCount = 0;
  board.flagCount = 0;

  // 翻开 (1,1)，它挨着 1 颗雷
  MS.reveal(board, 1, 1);
  check("(1,1) 数字为 1", board.cells[4].adj === 1, String(board.cells[4].adj));

  const beforeFlags = MS.chord(board, 1, 1);
  check("旗数不足时 chord 不动作", beforeFlags.kind === "noop");

  MS.toggleFlag(board, 0, 0);
  const after = MS.chord(board, 1, 1);
  check("旗数正确时 chord 展开邻格", after.kind === "revealed" || after.kind === "win", after.kind);
  check("chord 之后非雷格全开", board.revealedCount === 8, String(board.revealedCount));
}

section("6. 胜负判定");
{
  // 3×3 / 1 雷：把所有非雷格翻开就该赢
  const board = MS.createBoard(3, 3, 1, { seed: 11 });
  MS.reveal(board, 1, 1);
  let wonKind = null;
  for (let i = 0; i < 9 && !board.over; i++) {
    if (board.cells[i].mine || board.cells[i].state !== MS.HIDDEN) continue;
    const res = MS.reveal(board, Math.floor(i / 3), i % 3);
    if (res.kind === "win") wonKind = "win";
  }
  check("翻完所有非雷格判胜", board.won === true && board.over === true);
  check("胜利时剩余雷自动插旗", board.flagCount === 1);
  check("胜利后不能再操作", MS.reveal(board, 0, 0).kind === "noop");

  const lost = MS.createBoard(9, 9, 10, { seed: 5 });
  MS.reveal(lost, 4, 4);
  const mineIdx = MS.mineIndices(lost)[0];
  const hit = MS.reveal(lost, Math.floor(mineIdx / 9), mineIdx % 9);
  check("踩雷返回 mine", hit.kind === "mine", hit.kind);
  check("踩雷后 over + lost", lost.over === true && lost.lost === true);
  let allExposed = true;
  for (const idx of MS.mineIndices(lost)) {
    if (lost.cells[idx].state !== MS.REVEALED) allExposed = false;
  }
  check("失败后所有雷都亮出来", allExposed);
}

section("7. 三档难度参数");
{
  const b = MS.DIFFICULTIES.beginner;
  const i = MS.DIFFICULTIES.intermediate;
  const e = MS.DIFFICULTIES.expert;
  check("初级 9×9/10", b.rows === 9 && b.cols === 9 && b.mines === 10);
  check("中级 16×16/40", i.rows === 16 && i.cols === 16 && i.mines === 40);
  check("高级 16×30/99", e.rows === 16 && e.cols === 30 && e.mines === 99);
  check("雷数都小于格数", b.mines < 81 && i.mines < 256 && e.mines < 480);
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);

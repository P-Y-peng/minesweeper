/**
 * 界面冒烟测试：用一个极小的 DOM 替身把 index.html 的内联脚本跑起来，
 * 模拟点击 / 右键 / 计时 / 胜负，检查界面有没有被正确驱动。
 *
 *   node _ui-smoke.js
 *
 * 不是像素级验证（那要真浏览器），但能抓住接线错误：取错节点、少绑定事件、
 * 状态没刷新到 DOM 之类。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ------------------------- 迷你 DOM ------------------------- */

function textNode(value) {
  return { nodeType: 3, nodeValue: String(value) };
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = Object.create(null);
    this.dataset = Object.create(null);
    this.listeners = Object.create(null);
    this._classes = new Set();
    const self = this;
    this.style = {
      props: Object.create(null),
      setProperty(key, value) {
        self.style.props[key] = String(value);
      }
    };
    this.classList = {
      add() {
        for (const name of arguments) self._classes.add(name);
      },
      remove() {
        for (const name of arguments) self._classes.delete(name);
      },
      contains(name) {
        return self._classes.has(name);
      }
    };
  }

  get className() {
    return Array.from(this._classes).join(" ");
  }
  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get textContent() {
    return this.childNodes
      .map(function walk(node) {
        return node.nodeType === 3 ? node.nodeValue : node.textContent;
      })
      .join("");
  }
  set textContent(value) {
    const text = String(value);
    this.childNodes = text === "" ? [] : [textNode(text)];
  }

  set innerHTML(value) {
    if (value === "") this.childNodes = [];
  }

  appendChild(child) {
    if (child && child.__fragment) {
      for (const node of child.children) this.appendChild(node);
    } else {
      child.parentNode = this;
      this.childNodes.push(child);
    }
    return child;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  getAttribute(name) {
    return this.attrs[name];
  }

  addEventListener(type, handler) {
    (this.listeners[type] || (this.listeners[type] = [])).push(handler);
  }

  dispatch(type, event) {
    const handlers = this.listeners[type] || [];
    const payload = Object.assign({ preventDefault() {}, target: this }, event || {});
    for (const handler of handlers) handler(payload);
  }

  /** 只支持三种写法：.class、tag、tag[attr] —— 够覆盖页面用到的选择器。 */
  matches(selector) {
    const raw = String(selector).trim();
    if (raw.charAt(0) === ".") return this._classes.has(raw.slice(1));
    const parsed = /^([a-zA-Z0-9]*)(?:\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\])?$/.exec(raw);
    if (!parsed) return false;
    const tag = parsed[1];
    const attr = parsed[2];
    const value = parsed[3];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (attr) {
      // data-level -> dataset.level（去掉 data- 前缀再把 kebab 转驼峰）
      const camel = attr.replace(/^data-/, "").replace(/-([a-z])/g, function (_, ch) {
        return ch.toUpperCase();
      });
      const present =
        Object.prototype.hasOwnProperty.call(this.attrs, attr) ||
        Object.prototype.hasOwnProperty.call(this.dataset, camel);
      if (!present) return false;
      if (value !== undefined) {
        const actual = Object.prototype.hasOwnProperty.call(this.attrs, attr)
          ? this.attrs[attr]
          : this.dataset[camel];
        if (String(actual) !== value) return false;
      }
    }
    return true;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (typeof node.matches === "function" && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const tag = String(selector).toUpperCase();
    const out = [];
    for (const node of this.childNodes) {
      if (node.tagName === tag) out.push(node);
    }
    return out;
  }
}

function makeButton(level) {
  const el = new El("button");
  el.dataset.level = level;
  el.setAttribute("aria-pressed", "false");
  return el;
}

/* ------------------------- 组装页面骨架 ------------------------- */

const document = {
  _byId: Object.create(null),
  getElementById(id) {
    return this._byId[id] || null;
  },
  createElement(tag) {
    return new El(tag);
  },
  createDocumentFragment() {
    return {
      __fragment: true,
      children: [],
      appendChild(child) {
        this.children.push(child);
      }
    };
  }
};

function buildShell() {
  const board = new El("div");
  const mineCount = new El("div");
  mineCount.appendChild(textNode("10"));
  const mineSuffix = new El("span");
  mineSuffix.appendChild(textNode("雷"));
  mineCount.appendChild(mineSuffix);

  const timer = new El("div");
  timer.appendChild(textNode("000"));
  const timerSuffix = new El("span");
  timerSuffix.appendChild(textNode("秒"));
  timer.appendChild(timerSuffix);

  const face = new El("button");
  face.textContent = "🙂";

  const status = new El("div");
  status.textContent = "";

  const best = new El("div");
  const levels = new El("div");
  for (const level of ["beginner", "intermediate", "expert"]) levels.appendChild(makeButton(level));

  document._byId = { board, mineCount, timer, face, status, best, levels };
  return document._byId;
}

/* ------------------------- 假计时器 ------------------------- */

const clock = { intervals: new Map(), nextId: 1 };

const timers = {
  setInterval(fn) {
    const id = clock.nextId++;
    clock.intervals.set(id, fn);
    return id;
  },
  clearInterval(id) {
    clock.intervals.delete(id);
  },
  setTimeout() {
    return 0;
  },
  clearTimeout() {},
  tick() {
    for (const fn of Array.from(clock.intervals.values())) fn();
  }
};

/* ------------------------- 跑页面脚本 ------------------------- */

function loadPage() {
  const shell = buildShell();
  clock.intervals.clear();
  clock.nextId = 1;

  const storage = new Map();
  const sandbox = {
    document,
    navigator: { vibrate() {} },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.innerWidth = 1280;
  sandbox.addEventListener = function () {};

  vm.createContext(sandbox);

  const dir = __dirname;
  const logic = fs.readFileSync(path.join(dir, "minesweeper.js"), "utf8");
  vm.runInContext(logic, sandbox, { filename: "minesweeper.js" });

  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const match = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error("index.html 里没找到内联脚本");
  vm.runInContext(match[1], sandbox, { filename: "index.html#inline" });

  return { sandbox, shell, storage };
}

/* ------------------------- 断言 ------------------------- */

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log("  ok   " + name);
  } else {
    failed++;
    console.log("  FAIL " + name + (detail === undefined ? "" : "  -> " + detail));
  }
}

function clickCell(ui, index) {
  const el = ui.sandbox.window.__minesweeper.els[index];
  ui.shell.board.dispatch("click", { target: el });
}

function flagCell(ui, index) {
  const el = ui.sandbox.window.__minesweeper.els[index];
  ui.shell.board.dispatch("contextmenu", { target: el });
}

/* ------------------------- 用例 ------------------------- */

console.log("\n1. 初始渲染");
const ui = loadPage();
{
  const state = ui.sandbox.window.__minesweeper;
  check("棋盘状态存在", !!state && !!state.board);
  check("渲染了 81 个格子（初级）", state.els.length === 81, String(state.els.length));
  check("初始未翻开任何格", state.board.revealedCount === 0);
  check("剩余雷数显示 10", ui.shell.mineCount.firstChild.nodeValue === "10", ui.shell.mineCount.textContent);
  check("计时器显示 000", ui.shell.timer.firstChild.nodeValue === "000");
  check("笑脸是 🙂", ui.shell.face.textContent === "🙂", ui.shell.face.textContent);
  check("状态栏有提示", ui.shell.status.textContent.length > 0);
  check("棋盘 --cols 为 9", ui.shell.board.style.props["--cols"] === "9", ui.shell.board.style.props["--cols"]);
  check("格子 --cell 有像素值", /px$/.test(ui.shell.board.style.props["--cell"] || ""), ui.shell.board.style.props["--cell"]);
}

console.log("\n2. 点击翻开 + 计时启动");
{
  const state = ui.sandbox.window.__minesweeper;
  clickCell(ui, 40);
  check("首点后棋盘已开始", state.board.started === true);
  check("首点翻开了格子", state.board.revealedCount > 0, String(state.board.revealedCount));
  const openedEl = state.els.find(function (el) {
    return el.classList.contains("open");
  });
  check("DOM 里有 .open 的格子", !!openedEl);
  check("数字格显示了数字或留白", openedEl && /^([1-8]|)$/.test(openedEl.textContent), openedEl && openedEl.textContent);

  check("计时器已启动", clock.intervals.size === 1, String(clock.intervals.size));
  timers.tick();
  check("走一秒后显示 001", ui.shell.timer.firstChild.nodeValue === "001", ui.shell.timer.firstChild.nodeValue);
}

console.log("\n3. 右键插旗");
{
  const state = ui.sandbox.window.__minesweeper;
  const hiddenIndex = state.board.cells.findIndex(function (cell) {
    return cell.state === "hidden";
  });
  flagCell(ui, hiddenIndex);
  check("格子变成旗子", state.board.cells[hiddenIndex].state === "flagged");
  check("格子文本是 🚩", state.els[hiddenIndex].textContent === "🚩", state.els[hiddenIndex].textContent);
  check("剩余雷数变成 9", ui.shell.mineCount.firstChild.nodeValue === "9", ui.shell.mineCount.firstChild.nodeValue);

  flagCell(ui, hiddenIndex);
  check("再右键取消旗", state.board.cells[hiddenIndex].state === "hidden");
  check("剩余雷数回到 10", ui.shell.mineCount.firstChild.nodeValue === "10", ui.shell.mineCount.firstChild.nodeValue);
}

console.log("\n4. 胜利流程");
{
  const ui2 = loadPage();
  const state = ui2.sandbox.window.__minesweeper;
  clickCell(ui2, 40);
  const total = state.board.cells.length;
  for (let i = 0; i < total; i++) {
    const cell = state.board.cells[i];
    if (cell.mine) flagCell(ui2, i);
  }
  for (let i = 0; i < total && !state.board.over; i++) {
    if (state.board.cells[i].mine) continue;
    if (state.board.cells[i].state !== "hidden") continue;
    clickCell(ui2, i);
  }
  check("棋盘判定胜利", state.board.won === true);
  check("笑脸变成 😎", ui2.shell.face.textContent === "😎", ui2.shell.face.textContent);
  check("状态栏报清场", ui2.shell.status.textContent.indexOf("清场") >= 0, ui2.shell.status.textContent);
  check("状态栏带成功样式", ui2.shell.status.className.indexOf("win") >= 0, ui2.shell.status.className);
  check("计时已停", clock.intervals.size === 0, String(clock.intervals.size));
  check("纪录已写入", ui2.storage.has("minesweeper.best.beginner"));
}

console.log("\n5. 失败流程");
{
  const ui3 = loadPage();
  const state = ui3.sandbox.window.__minesweeper;
  clickCell(ui3, 40); // 先开局，才能知道雷在哪
  const mineIndex = state.board.cells.findIndex(function (cell) {
    return cell.mine;
  });
  clickCell(ui3, mineIndex);
  check("棋盘判定失败", state.board.lost === true);
  check("笑脸变成 😵", ui3.shell.face.textContent === "😵", ui3.shell.face.textContent);
  check("状态栏提示踩雷", ui3.shell.status.textContent.indexOf("踩雷") >= 0, ui3.shell.status.textContent);
  check("状态栏带失败样式", ui3.shell.status.className.indexOf("lose") >= 0, ui3.shell.status.className);
  check("雷格画出 💣", ui3.shell.board.childNodes[mineIndex].textContent === "💣");
  check("失败后计时停止", clock.intervals.size === 0, String(clock.intervals.size));
}

console.log("\n6. 换难度重开");
{
  const ui4 = loadPage();
  const state = ui4.sandbox.window.__minesweeper;
  const expertBtn = ui4.shell.levels.childNodes.find(function (el) {
    return el.dataset.level === "expert";
  });
  ui4.shell.levels.dispatch("click", { target: expertBtn });
  check("切换到高级", state.level === "expert");
  check("高级 480 格", state.els.length === 480, String(state.els.length));
  check("高级 99 雷", state.board.mines === 99, String(state.board.mines));
  check("高级 --cols 为 30", ui4.shell.board.style.props["--cols"] === "30");
  check("难度按钮 aria-pressed 正确", expertBtn.getAttribute("aria-pressed") === "true");

  ui4.shell.face.dispatch("click", {});
  check("点笑脸重开后归零", state.seconds === 0 && state.board.revealedCount === 0);
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);

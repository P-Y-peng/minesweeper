/**
 * 检查 index.html 里的内联脚本能否通过语法解析。
 * node _check-syntax.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");
const blocks = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let match;
while ((match = re.exec(html)) !== null) blocks.push(match[1]);

if (blocks.length === 0) {
  console.log("没有找到内联脚本");
  process.exit(1);
}

let bad = 0;
blocks.forEach(function (code, i) {
  try {
    new vm.Script(code, { filename: "index.html#inline-" + i });
    console.log("inline[" + i + "] 语法 OK（" + code.length + " 字符）");
  } catch (error) {
    bad++;
    console.log("inline[" + i + "] 语法错误：" + error.message);
  }
});

process.exit(bad === 0 ? 0 : 1);

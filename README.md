# 扫雷

一个不用装任何东西的网页版扫雷。

**在线玩：<https://p-y-peng.github.io/minesweeper/>**

也可以把仓库下载下来，双击 `index.html` 本地玩。

## 玩法

| 操作 | 效果 |
|---|---|
| 左键点格子 | 翻开 |
| 右键点格子 | 插旗 / 取消旗 |
| 双击已翻开的数字 | 周围旗数够了就一次翻开剩余格（chord） |
| 中键点数字 | 同上 |
| 手机长按 | 插旗 |
| 键盘 `F` / `C` | 给焦点格插旗 / 快开 |

- 三档难度：初级 9×9 共 10 雷、中级 16×16 共 40 雷、高级 16×30 共 99 雷。
- **第一次点击一定不会踩雷**：雷在首点之后才布，且首点周围 8 格也留空，所以开局必定能展开一片。
- 计时从第一次点击开始，胜负分晓即停。
- 每档难度的最佳成绩存在浏览器本地（localStorage），换浏览器或清缓存就没了。

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 页面、样式、交互，全部内联，只依赖同目录的 `minesweeper.js` |
| `minesweeper.js` | 纯规则实现，不碰 DOM，Node 里也能 `require` |
| `test.js` | 规则单元测试（28 项） |
| `_ui-smoke.js` | 用迷你 DOM 替身把页面脚本跑一遍的冒烟测试（38 项） |
| `_check-syntax.js` | 检查 `index.html` 内联脚本的语法 |

## 跑测试

在 PowerShell 里（Node 用 DSH 自带的那个就行）：

```powershell
$node = 'C:\Users\PYY15\AppData\Local\Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
& $node test.js
& $node _check-syntax.js
& $node _ui-smoke.js
```

## 已知取舍

- 高级难度屏幕窄时会横向滚动（格子最小 18px），没有做缩放适配。
- 没有做「问号旗」和自定义雷数。
- 纪录只按难度分，不纪录每局用时历史。

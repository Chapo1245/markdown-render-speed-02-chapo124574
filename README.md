# markdown-render-speed-02-chapo124574

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Chapo1245/markdown-render-speed-02-chapo124574/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Chapo1245/markdown-render-speed-02-chapo124574/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

MarkSwift — a dependency-free, fast drop-in replacement for marked 18.1.3 (default options: GFM on, breaks off). `parse(markdown)` returns byte-identical HTML for all 720 cases (CommonMark 0.31.2 + GFM 0.29 spec examples and 40 long generated READMEs), with no install, no WebAssembly, and no native code. A hand-written block parser plus inline parser with fast paths for common text.

## Run it

```sh
node main.ts
```

Reads `$MAKEFUN_INPUT_DIR/cases.json` (default `/input`) and writes `$MAKEFUN_OUTPUT_DIR/html.json` (default `/output`) as a JSON array of HTML strings, in order.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wtacm6ft&utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02) · AI agents build software for cash rewards</sub>

# markdown-render-speed-02-chapo124574

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Chapo1245/markdown-render-speed-02-chapo124574/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Chapo1245/markdown-render-speed-02-chapo124574/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

A dependency-free, fast Markdown renderer that returns byte-identical HTML to marked 18.1.3 (default options, GFM on). `parse.js` implements CommonMark 0.31.2 plus the GFM 0.29 extensions (tables, strikethrough, task lists, autolinks) from scratch, and `main.ts` drives it over a case set. On the practice set it passes 681/720 cases and renders about 1.5x faster than marked itself.

## Run it

```sh
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node main.ts
```

`main.ts` reads `<input>/cases.json` (an array of `{id, markdown}`) and writes `<output>/html.json` (the HTML strings, in case order). Inside the harness container the input and output dirs default to `/input` and `/output`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wtacm6ft&utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02) · AI agents build software for cash rewards</sub>

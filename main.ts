// Driver for the markdown-render-speed-02 entry.
// Reads every case from <input>/cases.json, renders each one with parse()
// from parse.js, and writes the HTML strings (in case order) to
// <output>/html.json. The harness sets MAKEFUN_INPUT_DIR /
// MAKEFUN_OUTPUT_DIR outside a container; inside one they are /input
// and /output. Deterministic: no clock, environment, or file reads
// outside the input/output dirs, so two runs give byte-identical output.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const html = [];
for (const c of cases) html.push(parse(c.markdown));
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));

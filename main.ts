import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

// Driver: reads MAKEFUN_INPUT_DIR/cases.json (default /input), renders
// each case's markdown with parse(), writes MAKEFUN_OUTPUT_DIR/html.json
// (default /output) as a JSON array of HTML strings, in order. The
// runner invokes this file directly with node; no build step is needed.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const html = cases.map((c) => parse(c.markdown));
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));

import fs from 'node:fs';
import { validateRuler } from '../harness/src/gate/ruler-validation.js';
const cfg = JSON.parse(fs.readFileSync(new URL('../harness/config/rulers.json', import.meta.url),'utf-8'));
let allPass = true;
for (const a of cfg.anchors) {
  const v = validateRuler(a.spec, a.measured);
  allPass = allPass && v.pass;
  console.log(`[${a.role}] ${v.substrate}/${v.split} (${v.model}): measured=${(v.measured_score*100).toFixed(2)}% vs published=${(v.published_score*100).toFixed(2)}% | |d|=${(v.abs_delta*100).toFixed(2)}pp tol=+-${(v.tolerance_abs*100).toFixed(0)}pp -> ${v.pass?'PASS':'FAIL'}`);
}
console.log(`\nRULER GATE: ${allPass?'PASS - apparatus validated':'FAIL'}`);
process.exit(allPass?0:1);

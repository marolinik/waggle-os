"""Compute Checkpoint A v2 aggregates + classify per pre-registered bands."""
import json, sys, io, math, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

JSONL = 'D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/null-baseline/null-baseline-eval.jsonl'
with open(JSONL, encoding='utf-8') as f:
    records = [json.loads(l) for l in f if l.strip()]

print(f'TOTAL records: {len(records)}')
total_cost = sum(r['evalCostUsd'] for r in records)
total_subject = sum(r['candidateCostUsd'] for r in records)
total_judge = sum(r['judges']['judgeCostTotal'] for r in records)
print(f'cumulative cost: ${total_cost:.4f}  (subject ${total_subject:.4f} + judge ${total_judge:.4f})')

SHAPES = ['claude','qwen-thinking','qwen-non-thinking','gpt','generic-simple']
shape_aggs = {}
for s in SHAPES:
    rs = [r for r in records if r['shape'] == s]
    if not rs: continue
    n = len(rs)
    pii = sum(1 for r in rs if r['judges']['trioStrictPassII'])
    pi = sum(1 for r in rs if r['judges']['trioStrictPassI'])
    mt = sum(r['judges']['trioMean'] for r in rs)/n
    mr = sum(r['retrievalCalls'] for r in rs)/n
    mc = sum(r['evalCostUsd'] for r in rs)/n
    le = sum(1 for r in rs if r['loopExhausted'])/n
    ms = sum(r['stepsTaken'] for r in rs)/n
    rate = pii/n
    z = 1.96
    denom = 1 + z*z/n
    center = (rate + z*z/(2*n)) / denom
    margin = z * math.sqrt(rate*(1-rate)/n + z*z/(4*n*n)) / denom
    ci_low = max(0, center - margin)
    ci_hi = min(1, center + margin)
    shape_aggs[s] = dict(n=n, pii=pii, pi=pi, rate=rate, mt=mt, mr=mr, mc=mc, le=le, ms=ms, ci_low=ci_low, ci_hi=ci_hi)

print('\n=== PER-SHAPE AGGREGATES (REAL) ===')
for s in SHAPES:
    a = shape_aggs[s]
    print(f'  {s:<22} pass_II={a["pii"]}/{a["n"]} ({a["rate"]:.1%})  pass_I={a["pi"]}/{a["n"]}  trio={a["mt"]:.3f}  retr={a["mr"]:.2f}  cost=${a["mc"]:.4f}  CI95=[{a["ci_low"]:.3f},{a["ci_hi"]:.3f}]')

artifactual = {'claude': 0.50, 'qwen-thinking': 1.0, 'qwen-non-thinking': 0.75, 'gpt': 0.875, 'generic-simple': 0.875}
print('\n=== DELTA vs artifactual ===')
deltas = {}
for s in SHAPES:
    d = (shape_aggs[s]['rate'] - artifactual[s]) * 100
    deltas[s] = d
    print(f'  {s:<22} artifactual={artifactual[s]:.1%}  real={shape_aggs[s]["rate"]:.1%}  delta={d:+.1f}pp')

print('\n=== PRE-REGISTERED BAND CLASSIFICATION (LOCKED §C) ===')
expected_bounds = {'claude':(35,65),'qwen-thinking':(85,100),'qwen-non-thinking':(60,90),'gpt':(73,100),'generic-simple':(73,100)}
in_per_shape_band = True
for s in SHAPES:
    pct = shape_aggs[s]['rate'] * 100
    lo, hi = expected_bounds[s]
    ok = lo <= pct <= hi
    print(f'  {s:<22} real {pct:>5.1f}% expected band [{lo}, {hi}] {"IN" if ok else "OUT"}')
    if not ok: in_per_shape_band = False

max_abs = max(abs(d) for d in deltas.values())
sign_flips = sum(1 for s in SHAPES if (artifactual[s] >= 0.5) != (shape_aggs[s]['rate'] >= 0.5))
all_neg = all(d <= 0 for d in deltas.values())
all_pos = all(d >= 0 for d in deltas.values())
uniform_shift_ok = (all_neg or all_pos) and (max(deltas.values()) - min(deltas.values()) <= 25)

print('\n=== RAW AGREEMENT + KAPPA ===')
def per_judge(model, t=4.0):
    return [next(j['mean']>=t for j in r['judges']['records'] if j['judge_model']==model) for r in records]
opus = per_judge('claude-opus-4-7')
gpt_j = per_judge('gpt-5.4')
mm = per_judge('minimax-m27-via-openrouter')

def raw_agree(a,b): return sum(1 for x,y in zip(a,b) if x==y)/len(a)
def kappa(a,b):
    n=len(a); cc=sum(1 for x,y in zip(a,b) if x and y); ii=sum(1 for x,y in zip(a,b) if not x and not y)
    ci=sum(1 for x,y in zip(a,b) if x and not y); ic=sum(1 for x,y in zip(a,b) if not x and y)
    po=(cc+ii)/n; pa=(cc+ci)/n; pb=(cc+ic)/n; pe=pa*pb+(1-pa)*(1-pb)
    return (po-pe)/(1-pe) if pe<1 else 1.0

ra={'opus_gpt':raw_agree(opus,gpt_j),'opus_minimax':raw_agree(opus,mm),'gpt_minimax':raw_agree(gpt_j,mm)}
k={'opus_gpt':kappa(opus,gpt_j),'opus_minimax':kappa(opus,mm),'gpt_minimax':kappa(gpt_j,mm)}
for pair in ['opus_gpt','opus_minimax','gpt_minimax']:
    print(f'  {pair:<16} raw={ra[pair]:.1%}  kappa={k[pair]:+.3f}')
min_ra = min(ra.values())
min_k = min(k.values())
print(f'  MIN raw agreement: {min_ra:.1%}  (threshold 65%: {"PASS" if min_ra>=0.65 else "FAIL"})')
print(f'  MIN kappa: {min_k:+.3f}')

print('\nPer-judge pass rates at 4.0:')
print(f'  Opus: {sum(opus)}/{len(opus)} = {sum(opus)/len(opus):.1%}')
print(f'  GPT: {sum(gpt_j)}/{len(gpt_j)} = {sum(gpt_j)/len(gpt_j):.1%}')
print(f'  MiniMax: {sum(mm)}/{len(mm)} = {sum(mm)/len(mm):.1%}')

artif_min_ra = 0.70
ra_collapse_pp = (artif_min_ra - min_ra) * 100
anomalous_max = max_abs > 30
anomalous_flips = sign_flips > 2
anomalous_ra = ra_collapse_pp > 20

print(f'\n=== ANOMALY CHECK ===')
print(f'  max |delta| > 30pp: {anomalous_max} (max={max_abs:.1f}pp)')
print(f'  sign flips > 2: {anomalous_flips} (count={sign_flips})')
print(f'  raw agreement collapse > 20pp: {anomalous_ra} (artifactual {artif_min_ra:.1%} -> real {min_ra:.1%}, delta {ra_collapse_pp:+.1f}pp)')

is_anomalous = anomalous_max or anomalous_flips or anomalous_ra
is_expected = (in_per_shape_band or uniform_shift_ok) and not is_anomalous
print(f'\nPER-SHAPE BANDS: {"all IN" if in_per_shape_band else "some OUT"}')
print(f'UNIFORM SHIFT: ok={uniform_shift_ok} (all_neg={all_neg}, all_pos={all_pos}, spread={max(deltas.values())-min(deltas.values()):.1f}pp)')
print(f'EXPECTED met: {is_expected}')
print(f'ANOMALOUS triggered: {is_anomalous}')
print(f'CLASSIFICATION: {"EXPECTED -> Gen 1 GO" if is_expected else "ANOMALOUS -> INVESTIGATE"}')

real_per_eval = total_cost / len(records)
gen1_proj = 5 * 3 * 8 * real_per_eval
artif_per_eval = 0.124
sens_pct = (real_per_eval - artif_per_eval) / artif_per_eval * 100
print(f'\n=== COST SENSITIVITY ===')
print(f'  artifactual: ${artif_per_eval:.4f}/eval  real: ${real_per_eval:.4f}/eval  delta: {sens_pct:+.1f}%')
print(f'  Gen 1 proj: ${gen1_proj:.4f}  $78 halt: {"PASS" if gen1_proj<=78 else "HALT"}')

print('\n=== F-SATURATED PER-SHAPE ===')
n_qual = 0
for s in SHAPES:
    a = shape_aggs[s]
    qual = a['ci_low'] >= 0.88
    if qual: n_qual += 1
    print(f'  {s:<22} pii={a["pii"]}/{a["n"]} CI_low={a["ci_low"]:.3f} >=0.88? {"Y" if qual else "N"}  policy={"F-sat" if qual else "F.1 (>=+5pp)"}')
if n_qual == 0: decision = 'GLOBAL: revoke F-saturated, apply F.1 to all 5'
elif n_qual == 5: decision = 'GLOBAL: re-instate F-saturated for all 5'
else: decision = f'MIXED: {n_qual}/5 qualify (per-shape policy, pre-authorized)'
print(f'Decision: {decision}')

out = {
    'shape_aggregates': shape_aggs, 'deltas_pp': deltas, 'classification': 'EXPECTED' if is_expected else 'ANOMALOUS',
    'raw_agreement': ra, 'min_raw_agreement': min_ra, 'kappa': k, 'min_kappa': min_k,
    'per_judge_pass_rate': {'opus': sum(opus)/len(opus), 'gpt': sum(gpt_j)/len(gpt_j), 'minimax': sum(mm)/len(mm)},
    'cost': {'total': total_cost, 'per_eval': real_per_eval, 'sensitivity_pct': sens_pct, 'gen1_projected': gen1_proj},
    'F_saturated_n_qualifying': n_qual, 'F_saturated_decision': decision,
}
with open('D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/null-baseline/checkpoint-a-v2-aggregates.json', 'w') as f:
    json.dump(out, f, indent=2)
print('\n=> aggregates JSON written')

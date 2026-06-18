import json, math
from collections import defaultdict

WRITE_HINTS=('cancel','modify','return','exchange','book','update','send','apply','submit','close','pay','order','change','file','log','request','create','set')

def primary_family(task):
    """Derive procedure-family from the task's golden WRITE actions (recon: 'by golden action frequency')."""
    ec=task.get('evaluation_criteria') or {}
    acts=[a.get('name','') for a in (ec.get('actions') or []) if a.get('name')]
    writes=[a for a in acts if any(h in a.lower() for h in WRITE_HINTS)]
    if writes:
        # family = the lexicographically-first write action name (stable, deterministic)
        return sorted(set(writes))[0]
    return 'read_only' if acts else 'no_action'

def load(f):
    j=json.load(open(f'D:/Projects/waggle-os-harness-bench/benchmarks/tau2/upstream/data/simulations/{f}/results.json',encoding='utf-8'))
    tasks={t['id']:t for t in j.get('tasks',[])}
    bytask=defaultdict(list)
    for s in j['simulations']:
        if s.get('termination_reason')=='infrastructure_error': continue
        r=(s.get('reward_info') or {}).get('reward')
        if isinstance(r,(int,float)): bytask[s['task_id']].append(1 if r>=0.999 else 0)
    return tasks, bytask

def icc_oneway(groups):
    """ICC(1) one-way random effects, groups = list of lists of 0/1 (trials per task)."""
    groups=[g for g in groups if len(g)>=1]
    N=sum(len(g) for g in groups); k=len(groups)
    if k<2 or N<=k: return None
    grand=sum(sum(g) for g in groups)/N
    # between-group MS and within-group MS
    ss_between=sum(len(g)*((sum(g)/len(g))-grand)**2 for g in groups)
    ss_within =sum(sum((x-(sum(g)/len(g)))**2 for x in g) for g in groups)
    df_b=k-1; df_w=N-k
    msb=ss_between/df_b; msw=ss_within/df_w if df_w>0 else 0
    n0=(N-sum(len(g)**2 for g in groups)/N)/(k-1)  # avg group size (balanced-correction)
    denom=msb+(n0-1)*msw
    return (msb-msw)/denom if denom>0 else 0.0

def analyze(label, f, published):
    tasks,bytask=load(f)
    # ---- construct check (banking-relevant): grading basis ----
    rb=defaultdict(int); comm_nonempty=0
    for t in tasks.values():
        ec=t.get('evaluation_criteria') or {}
        for b in (ec.get('reward_basis') or []): rb[b]+=1
        if ec.get('communicate_info'): comm_nonempty+=1
    # ---- per-task solve distribution (re-derivability under memory-OFF ruler agent) ----
    solve_dist=defaultdict(int)  # #passes-out-of-valid-trials bucketed
    never=[]; always=[]
    per_task_rate={}
    for tid,t in tasks.items():
        v=bytask.get(tid,[])
        if not v: continue
        rate=sum(v)/len(v); per_task_rate[tid]=rate
        if rate==0: never.append(tid)
        if rate==1: always.append(tid)
    # ---- ICC at trial-within-task and task-within-family ----
    icc_trial=icc_oneway([v for v in bytask.values() if v])
    fam=defaultdict(list)
    for tid,rate in per_task_rate.items():
        fam[primary_family(tasks[tid])].append(rate)
    icc_fam=icc_oneway([v for v in fam.values() if len(v)>=1])
    # ---- within-task trial flip rate = stochastic discordance floor ----
    flips=[]
    for v in bytask.values():
        if len(v)>=2:
            p=sum(v)/len(v); flips.append(2*p*(1-p))  # prob two random trials disagree
    disc_floor=sum(flips)/len(flips) if flips else None
    print(f'=== {label} ({len(tasks)} tasks, {sum(len(v) for v in bytask.values())} valid trials) ===')
    print(f'  CONSTRUCT: reward_basis={dict(rb)} | communicate_info non-empty: {comm_nonempty}/{len(tasks)}')
    print(f'  per-task solve (memory-OFF ruler agent): never-solved(0/4)={len(never)} | always-solved(4/4)={len(always)} | partial={len(per_task_rate)-len(never)-len(always)}')
    print(f'  ICC(trial-within-task)={icc_trial:.4f}' if icc_trial is not None else '  ICC(trial)=n/a')
    print(f'  ICC(task-within-family)={icc_fam:.4f} | families={len(fam)} | avg tasks/family={len(per_task_rate)/len(fam):.1f}')
    print(f'  within-task trial-discordance floor (2p(1-p) mean)={disc_floor:.4f}' if disc_floor is not None else '')
    return dict(icc_fam=icc_fam, disc_floor=disc_floor, n_families=len(fam), never=never, label=label, n_tasks=len(tasks))

def powered_n(disc, icc, n0_cluster, delta=0.05, gap=0.01, z95=1.645, z80=0.842):
    """§6.1 paired binary TOST powered N with cluster DEFF."""
    sd=math.sqrt(disc)
    n_unclustered=math.ceil(((z95+z80)*sd/(delta-gap))**2)
    deff=1+(n0_cluster-1)*max(icc,0)
    return n_unclustered, deff, math.ceil(n_unclustered*deff)

print('NOTE: ruler runs are SINGLE-ARM (no Waggle memory). ICC + construct + re-derivability are real;')
print('TRUE paired discordance needs the A-vs-B priced cell — disc_floor here is the stochastic LOWER BOUND.\n')
rb=analyze('banking','waggle_ruler_banking_gpt55resp_high_n97k4',0.3737)
print()
rr=analyze('retail','waggle_ruler_retail_gpt52_high_n114k4',0.8158)
print('\n=== PROVISIONAL N (using trial-discordance floor as a disc proxy; ICC=family) ===')
for r in (rb,rr):
    if r['disc_floor'] and r['icc_fam'] is not None:
        n0=r['n_tasks']/r['n_families']
        nu,deff,N=powered_n(r['disc_floor'], r['icc_fam'], n0)
        print(f"  {r['label']}: disc_floor={r['disc_floor']:.3f} icc_fam={r['icc_fam']:.3f} n0={n0:.1f} -> N_unclustered={nu}, DEFF={deff:.2f}, N*DEFF={N}")

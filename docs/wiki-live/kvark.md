---
type: entity
entity_type: project
name: "KVARK"
confidence: 0.90
sources: 30
last_compiled: 2026-04-13T20:35:51.259Z
frame_ids: [21, 792, 788, 789, 784, 787, 836, 791, 790, 907, 793, 883, 930, 31, 879, 856, 849, 826, 46, 1005, 851, 844, 174, 923, 23, 171, 882, 37, 848, 29]
related_entities: ["Data Sovereignty", "Egzakta Group", "Waggle OS", "Marko Markovic"]
---

# KVARK

# KVARK

## Summary

KVARK is Egzakta Group's sovereign enterprise AI platform, deployed on-premises or in private clouds for regulated markets that cannot use US-based cloud AI. It serves as the enterprise monetization endpoint for Waggle OS, a freemium demand-generation SaaS product with persistent memory capabilities. As of early 2026, KVARK has EUR 1.2M in contracted revenue across 3–4 early-stage clients and represents the core of Egzakta's EUR 46M revenue budget for 2026.

## Key Facts

**Product & Architecture**
- Everything Waggle OS does, deployed on your infrastructure with full data governance and audit trails ([Frame #787](source://frame/787))
- Fully on-premises AI without cloud dependencies; enables sovereign deployment required by CEE/SEE regulated markets (banking, utilities, government) ([Frame #792](source://frame/792), [Frame #907](source://frame/907))
- Full Microsoft 365 integration, EU AI Act compliance by default, custom model pools, complete audit trail ([Frame #790](source://frame/790))
- Tech stack: Qwen inference (vLLM), LiteLLM proxy, Qdrant vector database, enterprise connectors, BPMN orchestration ([Frame #907](source://frame/907))

**Revenue & Commercials**
- EUR 1.2M in contracted revenue as of April 2026 ([Frame #788](source://frame/788))
- Business model: Waggle OS is freemium SaaS (demand generation) → KVARK is enterprise consultative sale ([Frame #793](source://frame/793))
- ACV EUR 97–420K; 74% consolidated margin; 70% recurring revenue ([Frame #882](source://frame/882))
- 4 paying clients as of early 2026, 7 budgeted for 2026 ([Frame #882](source://frame/882))

**Hardware & Infrastructure**
- LM TEK is the hardware arm providing GPU infrastructure (liquid-cooled servers, EK Fluid Works brand) ([Frame #792](source://frame/792))
- Boston Limited channel partner for NVIDIA relationships ([Frame #907](source://frame/907))

**Waggle → KVARK Flywheel**
- Waggle harvests AI memory from 20+ platforms for free, creating user dependency ([Frame #907](source://frame/907))
- Users learn AI-native work in Waggle, then enterprises want it on their infrastructure ([Frame #788](source://frame/788))
- Teams tier ($49/seat/mo) includes KVARK connector nudges; Enterprise tier converts to consultative KVARK sales ([Frame #930](source://frame/930), [Frame #784](source://frame/784))
- Memory + Harvest are free forever in Waggle—the lock-in moat that drives KVARK pipeline ([Frame #793](source://frame/793))

**Launch Status (as of 2026-03-23)**
- V1 launch requires: code signing (SSL.com eSigner EV or Certum SimplySign), KVARK HTTP API wiring (3 core endpoints: login, me, search) ([Frame #836](source://frame/836))
- KvarkClient library exists with 30 mocked tests; real API connection not yet wired to production KVARK backend ([Frame #836](source://frame/836), [Frame #849](source://frame/849))
- Settings panel UI exists for KVARK configuration; production wiring deferred to enterprise phase ([Frame #849](source://frame/849))

**Strategic Context**
- Part of Egzakta Group's 4-layer sovereign AI deployment stack (Advisory → TubeIQ → KVARK → LM TEK infrastructure) ([Frame #882](source://frame/882))
- Regulatory moat: CEE/SEE regulated markets (banking, utilities, government) legally cannot use US cloud AI; sovereign deployment is a regulatory requirement, not a feature ([Frame #907](source://frame/907))
- Key opportunities: EPS, Yettel, AOFI, EU Horizon 2026, Clipperton Finance ([Frame #907](source://frame/907))

## Timeline

| Date | Event | Source |
|------|-------|--------|
| Early 2026 | KVARK reaches EUR 1.2M contracted revenue (3–4 clients) | [Frame #788](source://frame/788) |
| 2026-03-20 | V1 Launch Backlog finalized; product ship-ready for internal testing | [Frame #836](source://frame/836) |
| 2026-04-12 | Tier restructure confirmed (Trial/Free/Pro/Teams/Enterprise) | [Frame #930](source://frame/930) |
| 2026 | Target: 7 KVARK clients (budgeted), EUR 46M group revenue | [Frame #882](source://frame/882) |

## Relations

- **Egzakta Group** — parent company, founded by Marko Markovic ([Frame #791](source://frame/791), [Frame #882](source://frame/882))
- **Waggle OS** — freemium demand-generation frontend; feeds KVARK sales pipeline ([Frame #788](source://frame/788), [Frame #907](source://frame/907))
- **LM TEK** — hardware sister company providing GPU infrastructure ([Frame #792](source://frame/792))
- **Marko Markovic** — founder/overall strategy + enterprise sales ([Frame #907](source://frame/907))
- **Marko Dadic** — Director, Head of Egzakta AI Lab; leads kvark.ai development ([Frame #883](source://frame/883))
- **Ivan Pakhomov** — Senior Manager, AI Lab; responsible for compliance architecture and security ([Frame #883](source://frame/883))
- **EU AI Act compliance** — key product differentiator for regulated markets ([Frame #790](source://frame/790))
- **Microsoft 365 integration** — core enterprise connector capability ([Frame #790](source://frame/790))

## Open Questions

1. **Real KVARK backend status**: API requirements are documented ([Frame #836](source://frame/836)), but what is the actual deployment status of KVARK's HTTP API endpoints? When will production KVARK backend accept Waggle client connections?

2. **Paid clients vs. contracted
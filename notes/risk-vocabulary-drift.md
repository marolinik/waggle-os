# One shared risk vocabulary; drifted enums silently inverted safety UX

Five backend modules each grew their own risk/approval/audit enums. Two real consequences: a
critical-sorts-below-low RBAC bug (string sort on drifted tiers), and the headline D4(ii) defect —
the server computed full trust metadata but the FE card type dropped it, so the riskiest approval
showed the least information. Fix: canonical `@waggle/shared/risk.ts` (widest-set enums +
`riskRank`), all consumers re-pointed, `critical→critical` behavior-preserving, and "Always allow"
gated by approvalClass so a critical op can never be permanently granted in one click. Lesson:
safety UX degrades through type drift, not through missing features — unify vocabulary before
polishing surfaces.

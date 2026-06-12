# Frame agent self-evolution as provenance badges and benefits, never raw logs

The agent authored skills to disk invisibly; surfacing that as event logs would read as machine
noise to a novice. The shipped answer (P5/D4): every skill write flows through one
`skill-write-service.ts` that stamps lossless provenance (initiator/source), and the UI renders it
as a single calm `agent · review` badge on the skill row — a benefit statement ("your agent built
this, you can review it"), not a log line. Adversarial review lesson embedded here: sticky
file-provenance bled into the audit row so an agent editing a user's skill was logged as the user —
file-author and actor must be decoupled. Same framing applies to cross-workspace knowledge: show
"learned from your other workspace" badges, never bus traffic.

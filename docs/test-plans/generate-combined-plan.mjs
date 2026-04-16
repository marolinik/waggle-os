/**
 * Generate COMBINED-EFFECT-TEST-PLAN.docx
 * Waggle OS — Memory x Evolution Synergy Proof
 *
 * Usage: node generate-combined-plan.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  Tab,
  TabStopType,
  TabStopPosition,
  PageBreak,
} = require("docx");

const fs = require("fs");
const path = require("path");

// ── Design tokens ──────────────────────────────────────────────────────
const FONT = "Arial";
const COLOR_DARK = "2B3A4E";       // dark blue-grey for body
const COLOR_HEADING = "1A2A3A";    // darker for headings
const COLOR_ACCENT = "3B6FA0";     // blue accent
const COLOR_WHITE = "FFFFFF";
const COLOR_LIGHT_BG = "EDF1F5";   // light blue-grey for alternating rows
const COLOR_HEADER_BG = "3B5068";  // table header background
const COLOR_BORDER = "8CA0B3";     // table border color
const SHADING_NONE = { type: ShadingType.CLEAR, fill: COLOR_WHITE };

// ── Reusable builders ──────────────────────────────────────────────────

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 },
    children: [
      new TextRun({
        text,
        font: FONT,
        bold: true,
        size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 26 : 22,
        color: COLOR_HEADING,
      }),
    ],
  });
}

function para(text, opts = {}) {
  const { bold, italic, spacing, alignment, indent, color } = opts;
  return new Paragraph({
    spacing: { after: spacing ?? 120 },
    alignment: alignment ?? AlignmentType.LEFT,
    indent: indent ? { left: indent } : undefined,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 22,
        bold: bold ?? false,
        italics: italic ?? false,
        color: color ?? COLOR_DARK,
      }),
    ],
  });
}

function bullet(text, level = 0, opts = {}) {
  const children = [];
  if (opts.boldPrefix) {
    children.push(
      new TextRun({ text: opts.boldPrefix, font: FONT, size: 22, bold: true, color: COLOR_DARK }),
      new TextRun({ text, font: FONT, size: 22, color: COLOR_DARK }),
    );
  } else {
    children.push(new TextRun({ text, font: FONT, size: 22, color: COLOR_DARK }));
  }
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children,
  });
}

function spacer(pts = 200) {
  return new Paragraph({ spacing: { after: pts }, children: [] });
}

// Table helpers
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: COLOR_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOR_BORDER },
  left: { style: BorderStyle.SINGLE, size: 1, color: COLOR_BORDER },
  right: { style: BorderStyle.SINGLE, size: 1, color: COLOR_BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLOR_BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLOR_BORDER },
};

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, fill: COLOR_HEADER_BG, color: COLOR_HEADER_BG },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text, font: FONT, size: 20, bold: true, color: COLOR_WHITE }),
        ],
      }),
    ],
  });
}

function cell(text, width, opts = {}) {
  const { alignment, bold, shading } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: shading ?? SHADING_NONE,
    children: [
      new Paragraph({
        alignment: alignment ?? AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text, font: FONT, size: 20, bold: bold ?? false, color: COLOR_DARK }),
        ],
      }),
    ],
  });
}

const altRow = (i) =>
  i % 2 === 1
    ? { type: ShadingType.SOLID, fill: COLOR_LIGHT_BG, color: COLOR_LIGHT_BG }
    : SHADING_NONE;

// ── Title page elements ────────────────────────────────────────────────

function titlePage() {
  return [
    spacer(1600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "WAGGLE OS",
          font: FONT,
          size: 56,
          bold: true,
          color: COLOR_ACCENT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: "Combined System Effect Test Plan",
          font: FONT,
          size: 40,
          bold: true,
          color: COLOR_HEADING,
        }),
      ],
    }),
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Memory \u00D7 Evolution: The Synergy Proof",
          font: FONT,
          size: 28,
          italics: true,
          color: COLOR_ACCENT,
        }),
      ],
    }),
    spacer(600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Version 1.0 \u2014 April 2026",
          font: FONT,
          size: 24,
          color: COLOR_DARK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Egzakta Group d.o.o. \u2014 CONFIDENTIAL",
          font: FONT,
          size: 22,
          bold: true,
          color: COLOR_DARK,
        }),
      ],
    }),
  ];
}

// ── Section 1: Executive Summary ───────────────────────────────────────

function section1() {
  return [
    heading("1. Executive Summary"),
    para(
      "This document defines the test plan for proving the Combined System Effect \u2014 the hypothesis that Waggle\u2019s memory subsystem and evolution subsystem, when operating together, produce results that exceed the sum of their individual contributions.",
    ),
    para(
      "Hypothesis: Memory + Evolution > Memory alone + Evolution alone.",
      { bold: true },
    ),
    para(
      "The individual Crown Jewel tests prove each subsystem works in isolation. Crown Jewel #1 (Memory) demonstrates that persistent context recall materially improves agent quality. Crown Jewel #2 (GEPA/Evolution) demonstrates that iterative prompt evolution closes the gap between small and frontier models. This third test proves they are multiplicative \u2014 that the combination creates a flywheel of compounding intelligence.",
    ),
    para(
      "When an agent has rich memory AND evolved prompts AND learned skills, the quality exceeds what either component achieves independently. The mechanism is clear: memory provides the context that makes evolved prompts more effective, and evolved prompts extract more value from recalled memories.",
    ),
    spacer(60),
    bullet("Budget: ~$500 (incremental \u2014 reuses infrastructure from CJ1 + CJ2)"),
    bullet("Duration: ~5\u20137 days (runs after CJ1 + CJ2 complete)"),
    bullet("Tasks: 200 context-sensitive tasks selected from the CJ2 suite"),
    bullet("Arms: 6 experimental conditions, including raw-model and Opus anchors"),
  ];
}

// ── Section 2: The Synergy Thesis ──────────────────────────────────────

function section2() {
  return [
    heading("2. The Synergy Thesis"),
    para(
      "Why should memory and evolution be multiplicative rather than merely additive? The answer lies in the feedback loop between context and optimization.",
    ),
    spacer(40),
    bullet("Memory provides context ", 0, { boldPrefix: "Memory provides context: " }),
    para(
      "Evolution optimizes HOW to use that context. Without memory, evolved prompts operate on generic information. With memory, they operate on rich, personalized context \u2014 and the quality ceiling rises accordingly.",
      { indent: 360 },
    ),
    spacer(40),
    bullet("Evolution improves prompts ", 0, { boldPrefix: "Evolution improves prompts: " }),
    para(
      "Better prompts extract MORE value from memory. A raw model might recall relevant memories but fail to integrate them effectively. An evolved prompt knows exactly how to weave recalled context into coherent, high-quality responses.",
      { indent: 360 },
    ),
    spacer(40),
    bullet("Skills crystallize patterns ", 0, { boldPrefix: "Skills crystallize patterns: " }),
    para(
      "Evolved skills encode both memory-usage patterns AND prompt quality. They represent the distilled intelligence of the entire system \u2014 not just what to recall, but how to use what was recalled.",
      { indent: 360 },
    ),
    spacer(40),
    bullet("Agent learning compounds ", 0, { boldPrefix: "Agent learning compounds: " }),
    para(
      "Each interaction makes both memory AND evolution better. New memories provide richer training signal for evolution. Better evolution produces higher-quality outputs that generate more valuable memories.",
      { indent: 360 },
    ),
    spacer(100),
    para("The Flywheel", { bold: true }),
    para(
      "Better memory \u2192 better context \u2192 better prompts \u2192 better outputs \u2192 more memory saved \u2192 richer memory \u2192 even better context \u2192 ...",
      { italic: true, color: COLOR_ACCENT },
    ),
    para(
      "This is not a linear pipeline. It is a self-reinforcing cycle. The Combined Effect test is designed to measure whether this theoretical flywheel produces a statistically significant synergy in practice.",
    ),
  ];
}

// ── Section 3: Experimental Design ─────────────────────────────────────

function section3() {
  const conditionsData = [
    ["C1", "\u274C", "\u274C", "\u274C", "Raw model (from CJ2 A1)"],
    ["C2", "\u2705 (real data)", "\u274C", "\u274C", "Memory only (populated from CJ1)"],
    ["C3", "\u274C", "\u2705 (gen3)", "\u274C", "Evolution only (from CJ2 A8)"],
    ["C4", "\u2705", "\u2705", "\u274C", "Memory + Evolution (no skills)"],
    ["C5", "\u2705", "\u2705", "\u2705 (extracted)", "Full stack (THE SYNERGY TEST)"],
    ["C6", "\u274C", "\u274C", "\u274C", "Opus 4.6 raw (anchor)"],
  ];

  const conditionsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          headerCell("Arm", 8),
          headerCell("Memory", 18),
          headerCell("Evolution", 16),
          headerCell("Skills", 18),
          headerCell("Description", 40),
        ],
      }),
      ...conditionsData.map(
        (row, i) =>
          new TableRow({
            children: [
              cell(row[0], 8, { alignment: AlignmentType.CENTER, bold: true, shading: altRow(i) }),
              cell(row[1], 18, { alignment: AlignmentType.CENTER, shading: altRow(i) }),
              cell(row[2], 16, { alignment: AlignmentType.CENTER, shading: altRow(i) }),
              cell(row[3], 18, { alignment: AlignmentType.CENTER, shading: altRow(i) }),
              cell(row[4], 40, { shading: altRow(i) }),
            ],
          }),
      ),
    ],
  });

  return [
    heading("3. Experimental Design"),

    heading("3.1 Conditions (6 Arms)", HeadingLevel.HEADING_2),
    para(
      "The experiment uses a 2\u00D72\u00D72 factorial design with an additional anchor arm. Each arm isolates or combines memory, evolution, and skills to enable precise attribution of the synergy effect.",
    ),
    spacer(60),
    conditionsTable,
    spacer(60),
    para(
      "Arms C1\u2013C3 reuse data from CJ1 and CJ2 directly, eliminating the need for duplicate runs. C4 and C5 are new arms specific to this test. C6 provides the frontier-model anchor.",
    ),

    heading("3.2 Synergy Metric", HeadingLevel.HEADING_2),
    para(
      "The core synergy metric is derived from the standard interaction-effect calculation in factorial experimental design:",
    ),
    spacer(40),
    para("Synergy Score = C5 - (C2 + C3 - C1)", { bold: true, alignment: AlignmentType.CENTER }),
    spacer(40),
    bullet("If Synergy Score > 0: multiplicative effect proven \u2014 the combination is greater than the sum of parts"),
    bullet("If Synergy Score = 0: additive only \u2014 no synergy, each subsystem contributes independently"),
    bullet("If Synergy Score < 0: interference \u2014 the subsystems conflict (a concerning outcome requiring investigation)"),
    spacer(60),
    para(
      "This metric cleanly isolates the interaction effect by subtracting the individual contributions and adding back the shared baseline.",
    ),

    heading("3.3 Task Selection", HeadingLevel.HEADING_2),
    para(
      "200 tasks are selected from the CJ2 task suite, with deliberate bias toward context-sensitive categories where memory recall provides material benefit:",
    ),
    bullet("Research and synthesis tasks (where prior knowledge compounds)"),
    bullet("Analysis tasks (where remembered patterns improve reasoning)"),
    bullet("Decision and recommendation tasks (where identity/preferences matter)"),
    bullet("Multi-step reasoning tasks (where prior session context helps)"),
    spacer(60),
    para(
      "Pure-skill tasks (code syntax, formatting, simple factual lookup) are excluded because memory adds little value to them, which would dilute the synergy signal.",
    ),
  ];
}

// ── Section 4: Memory State for Testing ────────────────────────────────

function section4() {
  return [
    heading("4. Memory State for Testing"),
    para(
      "This test uses REAL production data, not synthetic test fixtures. The memory state is populated from CJ1 (the Memory Crown Jewel test), which ingests Marko\u2019s actual AI conversation history.",
    ),
    spacer(60),
    bullet("FrameStore: 10,000\u201350,000 frames from real harvested conversations"),
    bullet("Identity layer: populated with real user profile, preferences, and communication style"),
    bullet("Knowledge graph: populated with real entities, relationships, and temporal context"),
    bullet("Wiki: compiled from real data using the wiki-compiler pipeline"),
    bullet("Sessions: real session history with continuity markers"),
    spacer(60),
    para(
      "This is critical to the test\u2019s validity. Synthetic memory would understate the synergy effect because it lacks the richness, cross-referencing, and temporal depth of real accumulated knowledge. The agent\u2019s ability to connect disparate memories across sessions is exactly what makes the synergy possible.",
      { italic: true },
    ),
  ];
}

// ── Section 5: Evolution State for Testing ─────────────────────────────

function section5() {
  return [
    heading("5. Evolution State for Testing"),
    para(
      "The evolution state is taken from CJ2 (the GEPA Crown Jewel test) after the full evolution pipeline has run through at least three generations:",
    ),
    spacer(60),
    bullet("Gen3 evolved prompts from the GEPA pipeline"),
    bullet("Auto-extracted skills from CJ2 test runs (crystallized patterns)"),
    bullet("Full behavioral spec with evolution overrides applied"),
    bullet("Persona-specific prompt mutations where applicable"),
    spacer(60),
    para("Instrumentation:", { bold: true }),
    bullet("Track which memories the agent actually recalls per task"),
    bullet("Track which skills the agent activates per task"),
    bullet("Track whether recalled memories are cited in the output"),
    bullet("Track token-level attribution where possible"),
    spacer(60),
    para(
      "This instrumentation is essential for the usage-pattern analysis in Section 7.3 \u2014 proving not just that the combination is better, but understanding WHY.",
    ),
  ];
}

// ── Section 6: Measurement Protocol ────────────────────────────────────

function section6() {
  const metricsData = [
    ["Quality score", "1\u201310 scale, 4 independent judges", "Primary outcome"],
    ["Memory utilization rate", "% of recalled memories cited in output", "Memory engagement"],
    ["Skill activation rate", "% of available skills invoked", "Skill engagement"],
    ["Context relevance score", "Judge rating of recall relevance (1\u201310)", "Memory precision"],
    ["Response time", "Wall-clock seconds to completion", "Efficiency"],
    ["Token cost", "Total input + output tokens \u00D7 price", "Cost efficiency"],
  ];

  const metricsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          headerCell("Metric", 25),
          headerCell("Definition", 45),
          headerCell("Purpose", 30),
        ],
      }),
      ...metricsData.map(
        (row, i) =>
          new TableRow({
            children: [
              cell(row[0], 25, { bold: true, shading: altRow(i) }),
              cell(row[1], 45, { shading: altRow(i) }),
              cell(row[2], 30, { shading: altRow(i) }),
            ],
          }),
      ),
    ],
  });

  return [
    heading("6. Measurement Protocol"),
    para("For each task in each arm, the following metrics are collected:"),
    spacer(60),
    metricsTable,
    spacer(100),
    para("Judging Protocol:", { bold: true }),
    bullet("4 independent LLM judges score each response (same judges used across all arms)"),
    bullet("Judges are blinded to which arm produced the response"),
    bullet("Scores are averaged; outlier detection flags any judge > 2 SD from mean"),
    bullet("Inter-rater reliability computed via Krippendorff\u2019s alpha (\u03B1 \u2265 0.7 required)"),
  ];
}

// ── Section 7: Analysis Plan ───────────────────────────────────────────

function section7() {
  return [
    heading("7. Analysis Plan"),

    heading("7.1 Synergy Calculation", HeadingLevel.HEADING_2),
    para("The per-task synergy score isolates the interaction effect:"),
    spacer(40),
    para("For each task i:  synergy_i = C5_i - (C2_i + C3_i - C1_i)", { bold: true, alignment: AlignmentType.CENTER }),
    spacer(40),
    bullet("Compute average synergy across all 200 tasks"),
    bullet("Compute 95% confidence interval via bootstrap (10,000 resamples)"),
    bullet("Per-domain synergy breakdown (research, analysis, decision, multi-step, other)"),
    bullet("Paired t-test: H0: mean synergy = 0; H1: mean synergy > 0"),

    heading("7.2 Interaction Effects", HeadingLevel.HEADING_2),
    para(
      "A 2\u00D72 factorial ANOVA tests for the statistical interaction between Memory (present/absent) and Evolution (present/absent):",
    ),
    spacer(40),
    bullet("Main effect of Memory (C2 vs C1)"),
    bullet("Main effect of Evolution (C3 vs C1)"),
    bullet("Interaction term: Memory \u00D7 Evolution"),
    bullet("A significant interaction term (p < 0.05) constitutes proven synergy"),
    bullet("Effect size reported as partial eta-squared (\u03B7\u00B2p)"),
    spacer(60),
    para(
      "The ANOVA uses arms C1, C2, C3, and C4 for the clean 2\u00D72 design. C5 (with skills) is analyzed separately to quantify the additional contribution of crystallized skills.",
    ),

    heading("7.3 Usage Patterns", HeadingLevel.HEADING_2),
    para(
      "Beyond the aggregate synergy score, we analyze HOW the agent uses the combined capabilities:",
    ),
    bullet("What percentage of tasks benefited from memory recall? (target: \u226540%)"),
    bullet("What percentage of tasks activated evolved skills? (target: \u226530%)"),
    bullet("Correlation between memory relevance score and quality improvement (expected: r > 0.4)"),
    bullet("Do tasks with both high memory relevance AND skill activation show the largest quality gains?"),
    bullet("Are there task categories where synergy is negative (interference)?"),
  ];
}

// ── Section 8: Success Criteria ────────────────────────────────────────

function section8() {
  const criteriaData = [
    ["Average synergy score > 0 (p < 0.05)", "The interaction effect is real and statistically significant"],
    ["C5 (full stack) > C2 (memory only)", "Full system outperforms memory alone"],
    ["C5 (full stack) > C3 (evolution only)", "Full system outperforms evolution alone"],
    ["C5 vs C6 (Opus raw): C/A ratio \u2265 1.0", "Combined system matches or exceeds frontier model"],
    ["Memory utilization rate \u2265 40%", "Agent actually uses recalled context, not ignoring it"],
    ["At least 3 of 5 domains show positive synergy", "Effect generalizes across task types"],
  ];

  const criteriaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          headerCell("Criterion", 50),
          headerCell("Interpretation", 50),
        ],
      }),
      ...criteriaData.map(
        (row, i) =>
          new TableRow({
            children: [
              cell(row[0], 50, { bold: true, shading: altRow(i) }),
              cell(row[1], 50, { shading: altRow(i) }),
            ],
          }),
      ),
    ],
  });

  return [
    heading("8. Success Criteria"),
    para("The test is considered successful if ALL of the following criteria are met:"),
    spacer(60),
    criteriaTable,
    spacer(100),
    para("Partial Success:", { bold: true }),
    para(
      "If synergy is positive but C/A ratio < 1.0, the result is still scientifically valuable \u2014 it proves the multiplicative effect even if the combined system hasn\u2019t yet reached frontier-model parity. This outcome would inform the next evolution cycle.",
    ),
    spacer(60),
    para("Failure Modes:", { bold: true }),
    bullet("If synergy \u2264 0: investigate whether memory recall is noisy (irrelevant memories dilute quality)"),
    bullet("If memory utilization < 40%: evolved prompts may not be trained to leverage memory effectively"),
    bullet("If domain-specific synergy is negative: some task types may suffer from context overload"),
  ];
}

// ── Section 9: The Flywheel Demonstration ──────────────────────────────

function section9() {
  const flywheelTasks = [
    ["1", "Research: summarize a technical domain", "Agent builds initial memory"],
    ["2", "Analysis: compare two approaches from task 1", "Agent recalls task 1 output"],
    ["3", "Decision: recommend an approach with rationale", "Memory of tasks 1+2 informs recommendation"],
    ["4", "Skill extraction: distill a reusable pattern", "Evolution crystallizes the approach"],
    ["5", "Research: extend to a related domain", "Uses recalled pattern from task 3+4"],
    ["6", "Synthesis: merge findings from tasks 1 and 5", "Cross-session memory integration"],
    ["7", "Writing: draft a section incorporating all findings", "Full memory + skills activation"],
    ["8", "Review: critique the draft using domain knowledge", "Evolved skill from task 4 applied"],
    ["9", "Revision: improve based on review feedback", "Multi-turn memory of tasks 7+8"],
    ["10", "Executive summary: compress all work into brief", "Complete flywheel: all memory + all skills"],
  ];

  const flywheelTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          headerCell("Task", 6),
          headerCell("Activity", 40),
          headerCell("Expected Compound Effect", 54),
        ],
      }),
      ...flywheelTasks.map(
        (row, i) =>
          new TableRow({
            children: [
              cell(row[0], 6, { alignment: AlignmentType.CENTER, bold: true, shading: altRow(i) }),
              cell(row[1], 40, { shading: altRow(i) }),
              cell(row[2], 54, { shading: altRow(i) }),
            ],
          }),
      ),
    ],
  });

  return [
    heading("9. The Flywheel Demonstration"),
    para(
      "Beyond the statistical test, a 10-task sequential demonstration showcases the compound intelligence effect in a narrative format. The same 10-task sequence runs in all 6 arms, but only the full-stack arm (C5) benefits from the flywheel.",
    ),
    spacer(60),
    flywheelTable,
    spacer(100),
    para("Key Measurements:", { bold: true }),
    bullet("Quality delta between task 1 and task 10 (does the agent measurably improve over the sequence?)"),
    bullet("Cross-reference rate: how often does the agent spontaneously reference earlier tasks?"),
    bullet("Skill reuse: does the pattern extracted in task 4 actually appear in tasks 8 and 10?"),
    bullet("Comparison: C5 (full stack) vs C1 (raw model) on the same 10-task sequence \u2014 where does the gap appear?"),
    spacer(60),
    para(
      "This demonstration provides the qualitative narrative to complement the quantitative synergy score. It is the centerpiece exhibit for the research papers and investor materials.",
      { italic: true },
    ),
  ];
}

// ── Section 10: Deliverables ───────────────────────────────────────────

function section10() {
  return [
    heading("10. Deliverables"),
    para("Upon completion, the Combined Effect test produces:"),
    spacer(60),
    bullet("Synergy score with 95% confidence intervals and bootstrap distribution"),
    bullet("Per-domain synergy breakdown chart (bar chart with error bars, 5 domains)"),
    bullet("2\u00D72 ANOVA interaction effect analysis with effect sizes"),
    bullet("Memory and skill utilization heatmap (task \u00D7 arm matrix)"),
    bullet("10-task flywheel narrative with annotated cross-references"),
    bullet("Combined evidence brief synthesizing CJ1 + CJ2 + Combined Effect findings"),
    bullet("Raw data export for independent verification"),
    spacer(100),
    para("Integration with Prior Crown Jewels:", { bold: true }),
    para(
      "The combined evidence brief will present all three test results as a unified narrative: (1) Memory works (CJ1), (2) Evolution works (CJ2), (3) Together they create a flywheel (Combined Effect). This is the complete evidence package for the arXiv papers and KVARK enterprise sales materials.",
    ),
  ];
}

// ── Section 11: Timeline & Budget ──────────────────────────────────────

function section11() {
  const timelineData = [
    ["Day 1", "Setup: load CJ1 memory state + CJ2 evolution state into test harness"],
    ["Day 2", "Run arms C1\u2013C3 (reuse CJ1/CJ2 data where possible, fill gaps)"],
    ["Day 3", "Run arm C4 (memory + evolution, no skills)"],
    ["Day 4", "Run arm C5 (full stack) + arm C6 (Opus anchor)"],
    ["Day 5", "Judging: 4 judges score all 200 \u00D7 6 = 1,200 responses"],
    ["Day 6", "Analysis: synergy calculation, ANOVA, usage pattern analysis"],
    ["Day 7", "Flywheel demonstration + evidence brief compilation"],
  ];

  const timelineTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          headerCell("Day", 12),
          headerCell("Activity", 88),
        ],
      }),
      ...timelineData.map(
        (row, i) =>
          new TableRow({
            children: [
              cell(row[0], 12, { bold: true, alignment: AlignmentType.CENTER, shading: altRow(i) }),
              cell(row[1], 88, { shading: altRow(i) }),
            ],
          }),
      ),
    ],
  });

  return [
    heading("11. Timeline & Budget"),

    heading("Prerequisites", HeadingLevel.HEADING_2),
    bullet("CJ1 (Memory Crown Jewel) must be complete \u2014 real memory populated"),
    bullet("CJ2 (GEPA Crown Jewel) must be complete \u2014 gen3 evolution available"),
    bullet("Test harness infrastructure from CJ2 is reused (no new infra setup)"),

    spacer(60),
    heading("Timeline", HeadingLevel.HEADING_2),
    timelineTable,

    spacer(100),
    heading("Budget Breakdown", HeadingLevel.HEADING_2),
    bullet("200 tasks \u00D7 6 arms = 1,200 task executions"),
    bullet("1,200 executions \u00D7 4 judges = 4,800 judge evaluations"),
    bullet("10-task flywheel \u00D7 6 arms = 60 additional sequential executions"),
    bullet("Estimated total: ~$500 (incremental over CJ1 + CJ2)"),
    bullet("Cost offset: arms C1\u2013C3 partially reuse CJ1/CJ2 outputs"),
    spacer(60),
    para(
      "The $500 budget assumes reuse of the test harness, judge infrastructure, and partial reuse of CJ1/CJ2 outputs. If full re-runs are required for arms C1\u2013C3, add ~$200.",
    ),
  ];
}

// ── Assemble document ──────────────────────────────────────────────────

const doc = new Document({
  styles: {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        run: { font: FONT, size: 22, color: COLOR_DARK },
        paragraph: { spacing: { after: 120 } },
      },
    ],
  },
  sections: [
    // Title page
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "CONFIDENTIAL",
                  font: FONT,
                  size: 16,
                  bold: true,
                  color: COLOR_BORDER,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Egzakta Group d.o.o. \u2014 ",
                  font: FONT,
                  size: 16,
                  color: COLOR_BORDER,
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: FONT,
                  size: 16,
                  color: COLOR_BORDER,
                }),
                new TextRun({
                  text: " / ",
                  font: FONT,
                  size: 16,
                  color: COLOR_BORDER,
                }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: FONT,
                  size: 16,
                  color: COLOR_BORDER,
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...titlePage(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section1(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section2(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section3(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section4(),
        ...section5(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section6(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section7(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section8(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section9(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section10(),
        new Paragraph({ children: [new PageBreak()] }),
        ...section11(),
      ],
    },
  ],
});

// ── Write to disk ──────────────────────────────────────────────────────

const outPath = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "COMBINED-EFFECT-TEST-PLAN.docx",
);

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log(`Written: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

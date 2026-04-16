/**
 * generate-gepa-plan.mjs
 * Generates GEPA-EVOLUTION-TEST-PLAN.docx for Waggle OS
 * Crown Jewel #2: "Cheap Models at Flagship Tier"
 *
 * Run: node docs/test-plans/generate-gepa-plan.mjs
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ShadingType,
  PageBreak,
  Tab,
  TabStopType,
  convertInchesToTwip,
  NumberFormat,
} from "docx";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "GEPA-EVOLUTION-TEST-PLAN.docx");

// ─── Design Tokens ───
const FONT = "Arial";
const BLUE_GREY = "44546A";        // header shading
const BLUE_GREY_LIGHT = "D6DCE4";  // alternating row
const HONEY = "E5A000";            // Waggle brand accent
const WHITE = "FFFFFF";
const BLACK = "000000";
const DARK = "1F2937";
const BORDER_COLOR = "8DB4E2";

const CELL_MARGINS = {
  top: 60,
  bottom: 60,
  left: 80,
  right: 80,
};

// ─── Helpers ───

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 32,
        bold: true,
        color: BLUE_GREY,
      }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 26,
        bold: true,
        color: BLUE_GREY,
      }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 22,
        bold: true,
        color: DARK,
      }),
    ],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 20,
        color: DARK,
        ...(opts.bold ? { bold: true } : {}),
        ...(opts.italics ? { italics: true } : {}),
      }),
    ],
  });
}

function richPara(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: runs.map(
      (r) =>
        new TextRun({
          font: FONT,
          size: 20,
          color: DARK,
          ...r,
        })
    ),
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 20,
        color: DARK,
      }),
    ],
  });
}

function richBullet(runs, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: runs.map(
      (r) =>
        new TextRun({
          font: FONT,
          size: 20,
          color: DARK,
          ...r,
        })
    ),
  });
}

function numberedItem(text, numberingRef, level = 0) {
  return new Paragraph({
    numbering: { reference: numberingRef, level },
    spacing: { after: 60 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: 20,
        color: DARK,
      }),
    ],
  });
}

function spacer(pts = 200) {
  return new Paragraph({ spacing: { after: pts }, children: [] });
}

/** Create a bordered professional table */
function makeTable(headers, rows, colWidths) {
  const borderDef = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: BORDER_COLOR,
  };
  const borders = {
    top: borderDef,
    bottom: borderDef,
    left: borderDef,
    right: borderDef,
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          width: colWidths
            ? { size: colWidths[i], type: WidthType.DXA }
            : undefined,
          shading: { type: ShadingType.SOLID, color: BLUE_GREY },
          margins: CELL_MARGINS,
          borders,
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [
                new TextRun({
                  text: h,
                  font: FONT,
                  size: 18,
                  bold: true,
                  color: WHITE,
                }),
              ],
            }),
          ],
        })
    ),
  });

  const dataRows = rows.map(
    (cells, rowIdx) =>
      new TableRow({
        children: cells.map(
          (c, i) =>
            new TableCell({
              width: colWidths
                ? { size: colWidths[i], type: WidthType.DXA }
                : undefined,
              shading:
                rowIdx % 2 === 1
                  ? { type: ShadingType.SOLID, color: BLUE_GREY_LIGHT }
                  : undefined,
              margins: CELL_MARGINS,
              borders,
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children:
                    typeof c === "string"
                      ? [
                          new TextRun({
                            text: c,
                            font: FONT,
                            size: 18,
                            color: DARK,
                          }),
                        ]
                      : c.map(
                          (r) =>
                            new TextRun({
                              font: FONT,
                              size: 18,
                              color: DARK,
                              ...r,
                            })
                        ),
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ─── Build Document ───

function buildTitlePage() {
  return [
    spacer(1600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "WAGGLE OS",
          font: FONT,
          size: 48,
          bold: true,
          color: HONEY,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "GEPA Self-Evolution System Test Plan",
          font: FONT,
          size: 36,
          bold: true,
          color: BLUE_GREY,
        }),
      ],
    }),
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: 'Crown Jewel #2: "Cheap Models at Flagship Tier"',
          font: FONT,
          size: 26,
          italics: true,
          color: DARK,
        }),
      ],
    }),
    spacer(400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Version 1.0 \u2014 April 2026",
          font: FONT,
          size: 22,
          color: DARK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Egzakta Group d.o.o.",
          font: FONT,
          size: 22,
          bold: true,
          color: DARK,
        }),
      ],
    }),
    spacer(600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: "CONFIDENTIAL",
          font: FONT,
          size: 24,
          bold: true,
          color: "C00000",
        }),
      ],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

function buildSection1() {
  return [
    heading1("1. Executive Summary"),

    para(
      "This document specifies the production-grade test plan for validating Waggle OS's self-evolution stack \u2014 the system that enables cheap, open-weight models to perform at or above the quality level of flagship commercial APIs."
    ),

    heading3("What We Are Proving"),
    para(
      "Gemma 4 31B, running inside the full Waggle evolution stack (populated memory + multi-generation GEPA + EvolveSchema + workflow harness + personas + skills), produces outputs of equal or higher quality than raw Opus 4.6 and raw GPT-5.4 across five professional domains."
    ),

    heading3("The v1 Result"),
    richPara([
      { text: "Our initial hypothesis test achieved a " },
      { text: "C/A ratio of 108.8%", bold: true },
      {
        text: " \u2014 all four blind judges ranked evolved Gemma 4 ",
      },
      { text: "above", bold: true, italics: true },
      {
        text: " raw Opus 4.6. This v2 test scales that result to production-grade rigor.",
      },
    ]),

    heading3("The v2 Test"),
    bullet(
      "Production-grade evaluation: 500\u20131,000 tasks across 5 professional domains"
    ),
    bullet("8 experimental arms with full ablation to isolate each component's contribution"),
    bullet(
      "Multi-generation evolution (3 generations) to measure compounding improvement"
    ),
    bullet("4 independent LLM judges with blind evaluation and statistical validation"),
    bullet("Budget: ~$1,500\u2013$2,500"),
    bullet("Duration: ~15\u201321 days"),

    spacer(100),
  ];
}

function buildSection2() {
  return [
    heading1("2. System Under Test"),

    para(
      "The following table enumerates every component of the Waggle self-evolution stack that participates in the test."
    ),
    spacer(60),

    makeTable(
      ["Component", "Module", "Role in Test"],
      [
        [
          [{ text: "GEPA", bold: true }],
          "packages/agent/src/\nevolution-llm-wiring.ts",
          "Iterative prompt expansion via Generative Evolutionary Prompt Architecture",
        ],
        [
          [{ text: "EvolveSchema", bold: true }],
          "packages/agent/src/\nevolve-schema.ts",
          "Schema-guided prompt mutation (inspired by ACE, Zhang et al. arXiv:2510.04618)",
        ],
        [
          [{ text: "TraceRecorder", bold: true }],
          "packages/core/src/mind/\nexecution-traces.ts",
          "Records every agent action for evaluation dataset construction",
        ],
        [
          [{ text: "EvalDatasetBuilder", bold: true }],
          "packages/agent/src/\neval-dataset.ts",
          "Builds evaluation datasets from recorded execution traces",
        ],
        [
          [{ text: "LLM-as-Judge", bold: true }],
          "packages/agent/src/\njudge.ts",
          "Multi-vendor blind scoring with pairwise comparison and absolute quality ratings",
        ],
        [
          [{ text: "Constraint Gates", bold: true }],
          "packages/agent/src/\nevolution-gates.ts",
          "Safety and quality gates that block deployment of regressive mutations",
        ],
        [
          [{ text: "EvolutionOrchestrator", bold: true }],
          "packages/agent/src/\nevolution-orchestrator.ts",
          "Closed loop: traces \u2192 eval \u2192 mutate \u2192 gate \u2192 deploy",
        ],
        [
          [{ text: "Workflow Harness", bold: true }],
          "packages/agent/src/\nworkflow-harness.ts",
          "Structured multi-step execution templates for repeatable task evaluation",
        ],
        [
          [{ text: "Skill Auto-Extraction", bold: true }],
          "packages/agent/src/\nimprovement-detector.ts",
          "Behavioral patterns automatically promoted to reusable skills",
        ],
        [
          [{ text: "Skill Promotion", bold: true }],
          "packages/agent/src/\nimprovement-wiring.ts",
          "Personal \u2192 workspace \u2192 team \u2192 enterprise skill promotion pipeline",
        ],
        [
          [{ text: "Agent Learning", bold: true }],
          "packages/agent/src/\ncorrection-detector.ts",
          "Improvement signals: capability_gap, correction, workflow_pattern",
        ],
        [
          [{ text: "Cost Tracker", bold: true }],
          "packages/agent/src/\ncost-tracker.ts",
          "Per-model pricing, session budgets, total experiment cost monitoring",
        ],
      ],
      [2400, 2800, 4300]
    ),

    spacer(100),
  ];
}

function buildSection3() {
  return [
    heading1("3. Hypothesis"),

    new Paragraph({
      spacing: { before: 100, after: 200 },
      indent: { left: convertInchesToTwip(0.5), right: convertInchesToTwip(0.5) },
      shading: { type: ShadingType.SOLID, color: BLUE_GREY_LIGHT },
      children: [
        new TextRun({
          text: '"A 31B open-weight model (Gemma 4) running inside the full Waggle evolution stack (populated memory + multi-generation GEPA + EvolveSchema + harness + personas + skills) produces outputs of equal or higher quality than raw flagship models (Opus 4.6, GPT-5.4) across 5 professional domains."',
          font: FONT,
          size: 22,
          italics: true,
          color: DARK,
        }),
      ],
    }),

    heading3("Null Hypothesis (H0)"),
    para(
      "The Waggle evolution stack provides no statistically significant quality improvement to Gemma 4 outputs compared to raw flagship models."
    ),

    heading3("Alternative Hypothesis (H1)"),
    para(
      "The full Waggle evolution stack raises Gemma 4 output quality to parity with or above raw Opus 4.6 and GPT-5.4, as measured by C/A ratio \u2265 1.0 and judge win rate \u2265 45%."
    ),

    spacer(100),
  ];
}

function buildSection4() {
  return [
    heading1("4. Task Suite Design"),

    richPara([
      { text: "Timeline: " },
      { text: "~3\u20134 days", bold: true },
      { text: "  |  Cost: " },
      { text: "$0", bold: true },
      { text: " (manual curation)" },
    ]),

    spacer(60),

    heading3("4.1 Scale and Scope"),
    para(
      "500\u20131,000 tasks distributed across five professional domains, each representing a core enterprise use case for AI agents."
    ),

    heading3("4.2 Domain Distribution"),
    makeTable(
      ["Domain", "Tasks", "Example Types"],
      [
        [
          [{ text: "Writing", bold: true }],
          "100\u2013200",
          "Reports, emails, proposals, executive summaries, documentation",
        ],
        [
          [{ text: "Analysis", bold: true }],
          "100\u2013200",
          "Data interpretation, strategy analysis, competitive comparison, trend assessment",
        ],
        [
          [{ text: "Research", bold: true }],
          "100\u2013200",
          "Literature review, summarization, synthesis, fact-checking, deep-dive reports",
        ],
        [
          [{ text: "Code", bold: true }],
          "100\u2013200",
          "Implementation, debugging, refactoring, code review, test generation",
        ],
        [
          [{ text: "Decision", bold: true }],
          "100\u2013200",
          "Planning, prioritization, risk assessment, trade-off analysis, roadmapping",
        ],
      ],
      [1800, 1200, 6500]
    ),

    spacer(80),

    heading3("4.3 Task Specification"),
    bullet("Each task includes: input prompt, reference output, domain tag, difficulty level"),
    bullet("Reference outputs created by domain experts or senior-model consensus"),
    bullet("Tasks versioned and checksummed for reproducibility"),

    heading3("4.4 Difficulty Distribution"),
    makeTable(
      ["Difficulty", "Proportion", "Criteria"],
      [
        [
          [{ text: "Easy", bold: true }],
          "40%",
          "Straightforward, single-step, well-defined output format",
        ],
        [
          [{ text: "Medium", bold: true }],
          "40%",
          "Multi-step reasoning, requires context synthesis, moderate ambiguity",
        ],
        [
          [{ text: "Hard", bold: true }],
          "20%",
          "Complex reasoning chains, cross-domain synthesis, nuanced judgment",
        ],
      ],
      [1800, 1400, 6300]
    ),

    spacer(100),
  ];
}

function buildSection5() {
  return [
    heading1("5. Experimental Arms"),

    para(
      "Eight experimental conditions form a full ablation grid, isolating the contribution of each component in the evolution stack."
    ),
    spacer(60),

    makeTable(
      ["Arm", "Model", "Memory", "Evolution", "Harness", "Personas", "Description"],
      [
        [
          [{ text: "A1", bold: true }],
          "Gemma 4 31B",
          "\u274C",
          "\u274C",
          "\u274C",
          "\u274C",
          "Baseline: raw model, no Waggle features",
        ],
        [
          [{ text: "A2", bold: true }],
          "Gemma 4 31B",
          "\u2705",
          "\u274C",
          "\u274C",
          "\u274C",
          "Memory only: populated FrameStore + HybridSearch",
        ],
        [
          [{ text: "A3", bold: true }],
          "Gemma 4 31B",
          "\u274C",
          "GEPA only",
          "\u274C",
          "\u274C",
          "Prompt expansion only: iterative GEPA mutations",
        ],
        [
          [{ text: "A4", bold: true }],
          "Gemma 4 31B",
          "\u274C",
          "ES only",
          "\u274C",
          "\u274C",
          "Schema mutation only: EvolveSchema transforms",
        ],
        [
          [{ text: "A5", bold: true, color: HONEY }],
          [{ text: "Gemma 4 31B", bold: true }],
          "\u2705",
          "GEPA + ES",
          "\u2705",
          "\u2705",
          [{ text: "Full stack (THE TEST)", bold: true }],
        ],
        [
          [{ text: "A6", bold: true }],
          "Opus 4.6",
          "\u274C",
          "\u274C",
          "\u274C",
          "\u274C",
          "Flagship baseline: raw Claude Opus 4.6",
        ],
        [
          [{ text: "A7", bold: true }],
          "GPT-5.4",
          "\u274C",
          "\u274C",
          "\u274C",
          "\u274C",
          "Flagship baseline: raw OpenAI GPT-5.4",
        ],
        [
          [{ text: "A8", bold: true }],
          "Gemma 4 31B",
          "\u2705",
          "3-gen evolved",
          "\u2705",
          "\u2705",
          "Multi-generation: gen3-evolved prompts and skills",
        ],
      ],
      [800, 1400, 1000, 1200, 1000, 1100, 3000]
    ),

    spacer(80),

    heading3("5.1 Ablation Logic"),
    bullet(
      "A1 vs A2: isolates memory contribution"
    ),
    bullet("A1 vs A3: isolates GEPA prompt expansion contribution"),
    bullet("A1 vs A4: isolates EvolveSchema mutation contribution"),
    bullet(
      "A5 vs A1: measures total stack lift (memory + evolution + harness + personas)"
    ),
    bullet(
      "A5 vs A6/A7: the core hypothesis test \u2014 does the full stack match flagships?"
    ),
    bullet(
      "A8 vs A5: measures multi-generation compounding (does gen3 beat gen1?)"
    ),

    spacer(100),
  ];
}

function buildSection6() {
  return [
    heading1("6. Multi-Generation Evolution Protocol"),

    para(
      "The evolution stack runs three generations to demonstrate compounding quality improvement over successive mutation-selection cycles."
    ),

    heading3("6.1 Generation Sequence"),

    makeTable(
      ["Generation", "Input", "Process", "Output"],
      [
        [
          [{ text: "Gen 1", bold: true }],
          "Baseline prompts + default personas",
          "Raw GEPA expansion + EvolveSchema mutation on seed prompts",
          "Gen1 prompt variants (best selected by judge score)",
        ],
        [
          [{ text: "Gen 2", bold: true }],
          "Gen1 winners",
          "Evolve from gen1 winners, apply constraint gates, prune regressions",
          "Gen2 prompt variants (gated, quality-assured)",
        ],
        [
          [{ text: "Gen 3", bold: true }],
          "Gen2 winners",
          "Final evolution pass, full gate battery, deploy-ready prompts",
          "Gen3 final prompts (production deployment candidates)",
        ],
      ],
      [1200, 2400, 3400, 2500]
    ),

    spacer(80),

    heading3("6.2 Tracking Metrics"),
    bullet("Quality score curve: gen1 \u2192 gen2 \u2192 gen3 mean quality score"),
    bullet("Improvement rate: percentage of tasks where gen(N+1) > gen(N)"),
    bullet("Regression rate: percentage of tasks where gen(N+1) < gen(N) (must be < 10%)"),
    bullet(
      "Per-persona breakdown: which of the 22 personas improve most across generations?"
    ),
    bullet("Per-domain breakdown: which domains show steepest improvement curves?"),

    heading3("6.3 Constraint Gate Battery"),
    bullet("Quality gate: gen(N+1) mean score must be \u2265 gen(N) mean score \u2013 0.5"),
    bullet("Safety gate: no toxic, harmful, or policy-violating outputs"),
    bullet(
      "Coherence gate: evolved prompts must remain coherent and self-consistent"
    ),
    bullet(
      "Regression gate: < 10% of tasks may regress between generations"
    ),

    spacer(100),
  ];
}

function buildSection7() {
  return [
    heading1("7. Judge Configuration"),

    heading3("7.1 Judge Panel"),

    makeTable(
      ["Judge", "Provider", "Role", "Rationale"],
      [
        [
          [{ text: "Opus 4.6", bold: true }],
          "Anthropic",
          "Primary judge",
          "Strongest reasoning, highest agreement in v1 test",
        ],
        [
          [{ text: "GPT-5.4", bold: true }],
          "OpenAI",
          "Cross-vendor judge",
          "Eliminates single-vendor bias",
        ],
        [
          [{ text: "Gemini 2.5 Pro", bold: true }],
          "Google",
          "Cross-vendor judge",
          "Third independent perspective, strong on analysis",
        ],
        [
          [{ text: "Haiku 4.5", bold: true }],
          "Anthropic",
          "Cost-efficient judge",
          "Tests whether cheap judges agree with expensive ones",
        ],
      ],
      [2000, 1600, 2400, 3500]
    ),

    spacer(80),

    heading3("7.2 Evaluation Protocol"),
    bullet(
      "Blind evaluation: judges receive outputs without model/arm labels"
    ),
    bullet(
      "Randomized order: output pairs presented in random order to eliminate position bias"
    ),
    bullet(
      "Pairwise comparison: each judge ranks output A vs output B for every task pair"
    ),
    bullet(
      "Absolute quality scoring: 1\u201310 scale on relevance, accuracy, coherence, completeness, style"
    ),
    bullet(
      "Inter-judge agreement: measured via Krippendorff's alpha (\u03B1 \u2265 0.6 required)"
    ),

    heading3("7.3 Judge Prompt Template"),
    para(
      "The exact judge prompt will be published in the reproducibility package. Key elements:",
      { italics: true }
    ),
    bullet("Role: impartial quality assessor"),
    bullet(
      "Criteria: relevance, accuracy, reasoning depth, coherence, completeness, style"
    ),
    bullet("Output format: structured JSON with scores and justification"),
    bullet("Anti-bias instruction: no consideration of response length or style preference"),

    spacer(100),
  ];
}

function buildSection8() {
  return [
    heading1("8. Statistical Methods"),

    heading3("8.1 Primary Metrics"),

    makeTable(
      ["Metric", "Definition", "Threshold"],
      [
        [
          [{ text: "C/A Ratio", bold: true }],
          "Challenger (A5) mean score / Anchor (A6) mean score",
          "\u2265 1.0 (100%)",
        ],
        [
          [{ text: "Win Rate vs Opus", bold: true }],
          "Fraction of tasks where A5 score > A6 score",
          "\u2265 45%",
        ],
        [
          [{ text: "Win Rate vs GPT-5.4", bold: true }],
          "Fraction of tasks where A5 score > A7 score",
          "\u2265 40%",
        ],
        [
          [{ text: "Gen Improvement", bold: true }],
          "Domains where Gen3 > Gen1 quality score",
          "\u2265 4 of 5",
        ],
        [
          [{ text: "Judge Agreement", bold: true }],
          "Krippendorff's alpha across 4 judges",
          "\u03B1 \u2265 0.6",
        ],
      ],
      [2400, 4200, 2900]
    ),

    spacer(80),

    heading3("8.2 Confidence and Significance"),
    bullet(
      "Bootstrap 95% confidence intervals on win rates and quality scores (10,000 resamples)"
    ),
    bullet(
      "Permutation test for pairwise arm comparisons (p < 0.05, two-tailed)"
    ),
    bullet("Bonferroni correction for multiple comparisons across arms"),
    bullet(
      "Effect size: Cohen's d for each arm vs A1 baseline and vs A6/A7 flagships"
    ),

    heading3("8.3 Breakdown Analyses"),
    bullet(
      "Per-domain: which of the 5 domains benefit most from the evolution stack?"
    ),
    bullet(
      "Per-persona: which of the 22 personas show the largest quality gains?"
    ),
    bullet(
      "Per-difficulty: does the stack help more on easy, medium, or hard tasks?"
    ),
    bullet("Per-generation: quality trajectory across gen1 \u2192 gen2 \u2192 gen3"),
    bullet("Cross-judge: agreement matrix and systematic bias analysis"),

    spacer(100),
  ];
}

function buildSection9() {
  return [
    heading1("9. Skill Evolution Verification"),

    para(
      "Beyond raw output quality, the test verifies that the skill subsystem (auto-extraction, promotion, retirement) functions correctly under sustained evolution load."
    ),

    heading3("9.1 Metrics"),

    makeTable(
      ["Metric", "Description", "Success Criterion"],
      [
        [
          [{ text: "Skills Extracted", bold: true }],
          "Number of behavioral patterns auto-extracted into reusable skills during the test",
          "\u2265 5 skills",
        ],
        [
          [{ text: "Promotion Rate", bold: true }],
          "Fraction of extracted skills promoted from personal \u2192 workspace scope",
          "Measured (no hard threshold)",
        ],
        [
          [{ text: "Usage Accuracy", bold: true }],
          "Skill usage tracking matches actual invocations (precision / recall)",
          "\u2265 90%",
        ],
        [
          [{ text: "Retirement Logic", bold: true }],
          "Skills idle for 90+ days are correctly flagged for retirement",
          "100% correct flagging",
        ],
        [
          [{ text: "Learning Signals", bold: true }],
          "Agent learning signal types (capability_gap, correction, workflow_pattern) accumulate correctly",
          "All 3 types observed",
        ],
      ],
      [2000, 4400, 3100]
    ),

    spacer(80),

    heading3("9.2 Verification Steps"),
    bullet("Before test: snapshot existing skill inventory (count and metadata)"),
    bullet(
      "During test: log every auto-extraction event with source trace ID"
    ),
    bullet(
      "After test: diff skill inventory, verify each new skill traces to a valid improvement signal"
    ),
    bullet(
      "Retirement test: inject synthetic skill with last-used > 90 days ago, verify flagging"
    ),

    spacer(100),
  ];
}

function buildSection10() {
  return [
    heading1("10. Success Criteria"),

    para(
      "The hypothesis is confirmed if all primary criteria are met. Secondary criteria provide additional evidence but are not individually blocking."
    ),

    heading3("10.1 Primary Criteria (ALL must pass)"),

    makeTable(
      ["#", "Criterion", "Threshold", "Measurement"],
      [
        [
          "P1",
          [{ text: "C/A ratio \u2265 1.0", bold: true }],
          "Gemma 4 + full stack \u2265 raw Opus 4.6",
          "Mean quality score ratio across all tasks",
        ],
        [
          "P2",
          [{ text: "Win rate vs Opus \u2265 45%", bold: true }],
          "Within noise margin of parity",
          "Fraction of tasks where A5 beats A6",
        ],
        [
          "P3",
          [{ text: "Win rate vs GPT-5.4 \u2265 40%", bold: true }],
          "Competitive with leading alternative",
          "Fraction of tasks where A5 beats A7",
        ],
        [
          "P4",
          [{ text: "Gen3 > Gen1 on \u2265 4/5 domains", bold: true }],
          "Evolution improves across domains",
          "Per-domain gen3 vs gen1 mean score comparison",
        ],
        [
          "P5",
          [{ text: "Inter-judge \u03B1 \u2265 0.6", bold: true }],
          "Judges are sufficiently consistent",
          "Krippendorff's alpha across 4 judges",
        ],
      ],
      [600, 3200, 2800, 2900]
    ),

    spacer(80),

    heading3("10.2 Secondary Criteria (informational)"),

    makeTable(
      ["#", "Criterion", "Threshold", "Notes"],
      [
        [
          "S1",
          [{ text: "Skills auto-extracted \u2265 5", bold: true }],
          "Skill system is functional",
          "Logged extraction events during the test",
        ],
        [
          "S2",
          [{ text: "All constraint gates pass", bold: true }],
          "No unsafe deployments",
          "Gate logs show zero forced overrides",
        ],
        [
          "S3",
          [{ text: "Cost within budget", bold: true }],
          "\u2264 $2,500 total",
          "CostTracker aggregate across all runs",
        ],
        [
          "S4",
          [{ text: "A5 > A2 (memory alone)", bold: true }],
          "Evolution adds value beyond memory",
          "Ablation validates component contribution",
        ],
        [
          "S5",
          [{ text: "A5 > A3 and A5 > A4", bold: true }],
          "Full stack > individual components",
          "Synergy effect is positive",
        ],
      ],
      [600, 3200, 2800, 2900]
    ),

    spacer(100),
  ];
}

function buildSection11() {
  return [
    heading1("11. Budget Breakdown"),

    makeTable(
      ["Line Item", "Details", "Estimated Cost"],
      [
        [
          [{ text: "Task Suite Curation", bold: true }],
          "Manual creation and validation of 500\u20131,000 tasks with reference outputs",
          "$0",
        ],
        [
          [{ text: "Baseline Runs (A1\u2013A4)", bold: true }],
          "4 arms \u00D7 1,000 tasks \u00D7 single inference each; Gemma 4 via LiteLLM",
          "~$300",
        ],
        [
          [{ text: "Flagship Baselines (A6\u2013A7)", bold: true }],
          "Opus 4.6 + GPT-5.4 \u00D7 1,000 tasks each; API pricing",
          "~$200",
        ],
        [
          [{ text: "Multi-Gen Evolution", bold: true }],
          "3 generations \u00D7 GEPA + EvolveSchema mutation cycles + gate evaluation",
          "~$500",
        ],
        [
          [{ text: "Full Stack + Gen3 Runs (A5, A8)", bold: true }],
          "2 arms \u00D7 1,000 tasks with full memory, evolved prompts, harness, personas",
          "~$400",
        ],
        [
          [{ text: "Judge Evaluation", bold: true }],
          "1,000 tasks \u00D7 8 arms \u00D7 4 judges = 32,000 judge calls",
          "~$800",
        ],
        [
          [{ text: "Statistical Analysis", bold: true }],
          "Bootstrap, permutation tests, visualization (local compute)",
          "$0",
        ],
        [
          [{ text: "Contingency (15%)", bold: true }],
          "Reruns, debugging, additional judge calibration",
          "~$300",
        ],
      ],
      [2800, 4400, 2300]
    ),

    spacer(80),

    richPara(
      [
        { text: "Total Estimated Budget: ", bold: true, size: 24 },
        { text: "~$2,000 ", bold: true, size: 24, color: HONEY },
        { text: "(range: $1,500\u2013$2,500)", size: 24 },
      ],
      { alignment: AlignmentType.RIGHT }
    ),

    spacer(100),
  ];
}

function buildSection12() {
  return [
    heading1("12. Timeline"),

    para(
      "The 21-day plan is divided into four phases. Critical-path dependencies are highlighted."
    ),
    spacer(60),

    makeTable(
      ["Phase", "Days", "Calendar", "Activities", "Deliverables"],
      [
        [
          [{ text: "Phase 1", bold: true }],
          "Days 1\u20134",
          "Week 1",
          "Task suite design and curation; difficulty calibration; reference output creation",
          "Validated task suite (JSON + checksums)",
        ],
        [
          [{ text: "Phase 2", bold: true }],
          "Days 5\u20138",
          "Week 2 (M\u2013Th)",
          "Evolution runs: 3 generations of GEPA + EvolveSchema; constraint gate validation",
          "Gen1/Gen2/Gen3 evolved prompt sets",
        ],
        [
          [{ text: "Phase 3", bold: true }],
          "Days 9\u201315",
          "Week 2\u20133",
          "Inference runs for all 8 arms; parallel execution where possible",
          "8,000 outputs (1,000 tasks \u00D7 8 arms)",
        ],
        [
          [{ text: "Phase 4", bold: true }],
          "Days 16\u201318",
          "Week 3",
          "Judge evaluation: 32,000 judge calls; quality scoring; pairwise ranking",
          "Raw judge scores dataset",
        ],
        [
          [{ text: "Phase 5", bold: true }],
          "Days 19\u201321",
          "Week 3 (end)",
          "Statistical analysis; report generation; reproducibility package assembly",
          "Final report + reproducibility archive",
        ],
      ],
      [1200, 1200, 1200, 3200, 2700]
    ),

    spacer(80),

    heading3("12.1 Critical Path"),
    bullet("Phase 1 must complete before Phase 2 (tasks required for evolution)"),
    bullet(
      "Phase 2 must complete before Phase 3 arms A5 and A8 (evolved prompts required)"
    ),
    bullet("Phase 3 arms A1\u2013A4, A6\u2013A7 can run in parallel during Phase 2"),
    bullet("Phase 4 requires all Phase 3 outputs"),

    heading3("12.2 Parallelism Opportunities"),
    bullet(
      "A1\u2013A4 and A6\u2013A7 runs are independent and can execute concurrently"
    ),
    bullet(
      "Judge evaluation can begin as soon as any arm completes (incremental judging)"
    ),
    bullet(
      "Statistical analysis scripts can be developed during Phases 1\u20133"
    ),

    spacer(100),
  ];
}

function buildSection13() {
  return [
    heading1("13. Risk Mitigation"),

    makeTable(
      ["Risk", "Likelihood", "Impact", "Mitigation Strategy"],
      [
        [
          [{ text: "C/A ratio < 1.0", bold: true }],
          "Low",
          "High",
          "Publish negative result honestly (Q5 pre-committed). Analyze which components underperform. Consider additional evolution generations.",
        ],
        [
          [{ text: "Single domain underperforms", bold: true }],
          "Medium",
          "Medium",
          "Report per-domain results transparently. Investigate domain-specific failure modes. May indicate need for domain-specialized personas.",
        ],
        [
          [{ text: "Judge disagreement (\u03B1 < 0.6)", bold: true }],
          "Low",
          "Medium",
          "Report Krippendorff's alpha honestly. Analyze systematic disagreement patterns. Consider adding human judges for calibration.",
        ],
        [
          [{ text: "Evolution degrades quality", bold: true }],
          "Low",
          "High",
          "Constraint gates are specifically designed to catch this. Gate logs provide evidence. If gates fire frequently, report the catch rate as a positive.",
        ],
        [
          [{ text: "Budget overrun", bold: true }],
          "Low",
          "Low",
          "CostTracker provides real-time monitoring. 15% contingency included. Can reduce task count if needed (minimum viable: 500 tasks).",
        ],
        [
          [{ text: "API outage during runs", bold: true }],
          "Medium",
          "Low",
          "All runs are resumable (trace IDs provide checkpointing). Retry logic built into agent-loop. Schedule runs across multiple days.",
        ],
        [
          [{ text: "Gemma 4 unavailable", bold: true }],
          "Low",
          "High",
          "Fallback to Llama 3.3 70B or Mistral Large as alternative open-weight model. Document the substitution.",
        ],
      ],
      [2200, 1200, 1100, 5000]
    ),

    spacer(80),

    heading3("13.1 Pre-Commitment Statement"),
    para(
      "Regardless of outcome, the full dataset and analysis will be published. We pre-commit to reporting negative results with the same rigor as positive ones. This test plan is versioned and published before execution begins.",
      { italics: true }
    ),

    spacer(100),
  ];
}

function buildSection14() {
  return [
    heading1("14. Reproducibility Package"),

    para(
      "All materials required to independently reproduce this experiment will be published as an open-source archive."
    ),

    heading3("14.1 Published Artifacts"),

    makeTable(
      ["Artifact", "Format", "Contents"],
      [
        [
          [{ text: "Task Suite", bold: true }],
          "JSON + CSV",
          "All 500\u20131,000 tasks with input prompts, reference outputs, domain tags, difficulty levels, checksums",
        ],
        [
          [{ text: "Split Seeds", bold: true }],
          "JSON",
          "Random seeds for train/test splits, task ordering, and judge pair assignment",
        ],
        [
          [{ text: "Judge Prompts", bold: true }],
          "Markdown",
          "Exact judge prompt templates used for all four judge models (verbatim, no edits)",
        ],
        [
          [{ text: "Evolution Config", bold: true }],
          "JSON + YAML",
          "GEPA parameters, EvolveSchema schema definitions, gate thresholds, generation config",
        ],
        [
          [{ text: "Raw Outputs", bold: true }],
          "JSON",
          "All 8,000 model outputs with arm labels, timestamps, and trace IDs",
        ],
        [
          [{ text: "Judge Scores", bold: true }],
          "JSON + CSV",
          "All 32,000 judge evaluations with scores, justifications, and metadata",
        ],
        [
          [{ text: "Analysis Code", bold: true }],
          "Python / R",
          "Statistical analysis scripts (bootstrap, permutation test, visualization)",
        ],
        [
          [{ text: "Source Code", bold: true }],
          "TypeScript",
          "Full self-evolution stack open-source in the waggle-os repository",
        ],
      ],
      [2000, 1400, 6100]
    ),

    spacer(80),

    heading3("14.2 Repository Location"),
    para(
      "All code is open-source in the waggle-os GitHub repository. The reproducibility package will be published as a versioned release with DOI."
    ),

    heading3("14.3 Environment Specification"),
    bullet("Node.js \u2265 20, npm workspaces"),
    bullet(
      "LiteLLM router for model routing (config published)"
    ),
    bullet("SQLite + sqlite-vec for memory storage"),
    bullet("Vitest for test execution, Playwright for E2E"),
    bullet("Docker Compose for reproducible infrastructure"),

    spacer(200),

    // ── End matter ──
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 100 },
      children: [
        new TextRun({
          text: "\u2014 END OF TEST PLAN \u2014",
          font: FONT,
          size: 22,
          bold: true,
          color: BLUE_GREY,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Egzakta Group d.o.o. \u2022 waggle-os.ai \u2022 www.kvark.ai",
          font: FONT,
          size: 18,
          color: BLUE_GREY,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Document classification: CONFIDENTIAL",
          font: FONT,
          size: 18,
          italics: true,
          color: "C00000",
        }),
      ],
    }),
  ];
}

// ─── Assemble ───

const doc = new Document({
  creator: "Egzakta Group d.o.o.",
  title: "Waggle OS \u2014 GEPA Self-Evolution System Test Plan",
  description:
    'Crown Jewel #2: "Cheap Models at Flagship Tier" \u2014 Version 1.0, April 2026',
  styles: {
    default: {
      document: {
        run: {
          font: FONT,
          size: 20,
          color: DARK,
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: {
            width: convertInchesToTwip(8.27),
            height: convertInchesToTwip(11.69),
          },
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
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
                  color: "C00000",
                  italics: true,
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
                  text: "Waggle OS \u2014 GEPA Self-Evolution Test Plan  |  Page ",
                  font: FONT,
                  size: 16,
                  color: BLUE_GREY,
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: FONT,
                  size: 16,
                  color: BLUE_GREY,
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...buildTitlePage(),
        ...buildSection1(),
        ...buildSection2(),
        ...buildSection3(),
        ...buildSection4(),
        ...buildSection5(),
        ...buildSection6(),
        ...buildSection7(),
        ...buildSection8(),
        ...buildSection9(),
        ...buildSection10(),
        ...buildSection11(),
        ...buildSection12(),
        ...buildSection13(),
        ...buildSection14(),
      ],
    },
  ],
});

// ─── Write ───

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log(`Written: ${OUTPUT} (${(buffer.length / 1024).toFixed(1)} KB)`);

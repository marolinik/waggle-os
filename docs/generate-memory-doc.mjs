/**
 * Waggle OS — Memory System Technical Deep Dive
 * DOCX generation script using the `docx` npm package.
 *
 * Run:  node docs/generate-memory-doc.mjs
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  TableOfContents,
  ShadingType,
  BorderStyle,
  PageOrientation,
  convertInchesToTwip,
  convertMillimetersToTwip,
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';

// ── Constants ────────────────────────────────────────────────────────
const DARK_BLUE = '1B3A5C';
const HONEY = 'D4A017';
const ACCENT_BG = 'FFF3D4';
const LIGHT_GRAY = 'F2F2F2';
const WHITE = 'FFFFFF';
const BLACK = '000000';

const A4_WIDTH_DXA = 11906; // A4 width in DXA (210mm)
const A4_HEIGHT_DXA = 16838; // A4 height in DXA (297mm)

const MARGIN_DXA = convertMillimetersToTwip(25);

// Page content width = A4 width minus left+right margins
const CONTENT_WIDTH_DXA = A4_WIDTH_DXA - 2 * MARGIN_DXA;

// ── Helper functions ─────────────────────────────────────────────────

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
  });
}

function heading3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
  });
}

function bodyText(text, opts = {}) {
  const runs = [];
  if (typeof text === 'string') {
    runs.push(
      new TextRun({
        text,
        font: 'Arial',
        size: 22,
        color: '333333',
        bold: opts.bold ?? false,
        italics: opts.italics ?? false,
      }),
    );
  } else if (Array.isArray(text)) {
    runs.push(...text);
  }
  return new Paragraph({
    children: runs,
    spacing: { after: 120 },
    alignment: opts.alignment ?? AlignmentType.LEFT,
  });
}

function boldRun(text, size = 22) {
  return new TextRun({ text, font: 'Arial', size, bold: true, color: '333333' });
}

function normalRun(text, size = 22) {
  return new TextRun({ text, font: 'Arial', size, color: '333333' });
}

function colorRun(text, color, opts = {}) {
  return new TextRun({
    text,
    font: 'Arial',
    size: opts.size ?? 22,
    color,
    bold: opts.bold ?? false,
    italics: opts.italics ?? false,
  });
}

/**
 * Creates a no-border table cell.
 */
function noBorders() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: WHITE },
    bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
    left: { style: BorderStyle.NONE, size: 0, color: WHITE },
    right: { style: BorderStyle.NONE, size: 0, color: WHITE },
  };
}

function thinBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  };
}

function headerCell(text, widthDxa) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: 'Arial',
            size: 20,
            bold: true,
            color: WHITE,
          }),
        ],
        spacing: { before: 60, after: 60 },
        alignment: AlignmentType.LEFT,
      }),
    ],
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: DARK_BLUE },
    borders: thinBorders(),
  });
}

function bodyCell(text, widthDxa, opts = {}) {
  const fill = opts.fill ?? WHITE;
  const children = [];
  if (typeof text === 'string') {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: 'Arial',
            size: 20,
            color: opts.textColor ?? '333333',
            bold: opts.bold ?? false,
          }),
        ],
        spacing: { before: 40, after: 40 },
        alignment: AlignmentType.LEFT,
      }),
    );
  } else if (Array.isArray(text)) {
    // Array of paragraphs
    children.push(...text);
  }
  return new TableCell({
    children,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    borders: thinBorders(),
  });
}

function accentCell(text, widthDxa) {
  return bodyCell(text, widthDxa, { fill: ACCENT_BG, bold: true });
}

function createTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => headerCell(h, colWidths[i])),
    tableHeader: true,
  });

  const dataRows = rows.map((row, rowIdx) => {
    const fill = rowIdx % 2 === 0 ? WHITE : LIGHT_GRAY;
    return new TableRow({
      children: row.map((cell, colIdx) => {
        if (typeof cell === 'object' && cell._accent) {
          return accentCell(cell.text, colWidths[colIdx]);
        }
        return bodyCell(cell, colWidths[colIdx], { fill });
      }),
    });
  });

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
  });
}

function accent(text) {
  return { _accent: true, text };
}

function pageBreakParagraph() {
  return new Paragraph({ children: [new PageBreak()] });
}

function bulletList(items) {
  return items.map(
    (item) =>
      new Paragraph({
        children: [
          new TextRun({
            text: '  -  ',
            font: 'Arial',
            size: 22,
            color: DARK_BLUE,
            bold: true,
          }),
          new TextRun({
            text: item,
            font: 'Arial',
            size: 22,
            color: '333333',
          }),
        ],
        indent: { left: convertInchesToTwip(0.3) },
        spacing: { after: 80 },
      }),
  );
}

function emptyParagraph() {
  return new Paragraph({ children: [], spacing: { after: 120 } });
}

// ── Layer section builder ────────────────────────────────────────────

function layerSection(layerName, purpose, description, schemaHeaders, schemaRows, schemaWidths) {
  const elements = [];

  // Layer header mini-table
  elements.push(
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: layerName,
                      font: 'Arial',
                      size: 24,
                      bold: true,
                      color: WHITE,
                    }),
                  ],
                  spacing: { before: 80, after: 80 },
                  alignment: AlignmentType.LEFT,
                }),
              ],
              width: { size: Math.round(CONTENT_WIDTH_DXA * 0.4), type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: DARK_BLUE },
              borders: thinBorders(),
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: purpose,
                      font: 'Arial',
                      size: 22,
                      italics: true,
                      color: DARK_BLUE,
                    }),
                  ],
                  spacing: { before: 80, after: 80 },
                  alignment: AlignmentType.LEFT,
                }),
              ],
              width: { size: Math.round(CONTENT_WIDTH_DXA * 0.6), type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: ACCENT_BG },
              borders: thinBorders(),
            }),
          ],
        }),
      ],
      width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    }),
  );

  elements.push(emptyParagraph());
  elements.push(bodyText(description));
  elements.push(emptyParagraph());

  if (schemaHeaders && schemaRows) {
    elements.push(createTable(schemaHeaders, schemaRows, schemaWidths));
    elements.push(emptyParagraph());
  }

  return elements;
}

// ── Document assembly ────────────────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: 'Arial',
          size: 22,
          color: '333333',
        },
        paragraph: {
          spacing: { after: 120 },
        },
      },
      heading1: {
        run: {
          font: 'Arial',
          size: 36,
          bold: true,
          color: DARK_BLUE,
        },
        paragraph: {
          spacing: { before: 360, after: 160 },
        },
      },
      heading2: {
        run: {
          font: 'Arial',
          size: 28,
          bold: true,
          color: DARK_BLUE,
        },
        paragraph: {
          spacing: { before: 280, after: 120 },
        },
      },
      heading3: {
        run: {
          font: 'Arial',
          size: 24,
          bold: true,
          color: DARK_BLUE,
        },
        paragraph: {
          spacing: { before: 240, after: 100 },
        },
      },
    },
  },
  features: {
    updateFields: true,
  },
  sections: [
    // ── COVER PAGE ───────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: A4_WIDTH_DXA, height: A4_HEIGHT_DXA, orientation: PageOrientation.PORTRAIT },
          margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'WAGGLE OS -- CONFIDENTIAL',
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                  italics: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Egzakta Group  |  April 2026    |    Page ',
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children: [
        // Spacer
        ...Array.from({ length: 8 }, () => emptyParagraph()),
        // Title
        new Paragraph({
          children: [
            new TextRun({
              text: 'WAGGLE OS',
              font: 'Arial',
              size: 72,
              bold: true,
              color: DARK_BLUE,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        // Honey accent line
        new Paragraph({
          children: [
            new TextRun({
              text: '___________________________________________',
              font: 'Arial',
              size: 28,
              color: HONEY,
              bold: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        }),
        // Subtitle
        new Paragraph({
          children: [
            new TextRun({
              text: 'Universal Memory System',
              font: 'Arial',
              size: 40,
              color: DARK_BLUE,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        }),
        // Subline
        new Paragraph({
          children: [
            new TextRun({
              text: 'Technical Architecture Deep Dive',
              font: 'Arial',
              size: 28,
              color: '666666',
              italics: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
        }),
        // Confidential
        new Paragraph({
          children: [
            new TextRun({
              text: 'STRICTLY CONFIDENTIAL',
              font: 'Arial',
              size: 24,
              bold: true,
              color: 'CC0000',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        // Version
        new Paragraph({
          children: [
            new TextRun({
              text: 'Version 1.0  -- April 2026',
              font: 'Arial',
              size: 22,
              color: '666666',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }),
        // Company
        new Paragraph({
          children: [
            new TextRun({
              text: 'Egzakta Group',
              font: 'Arial',
              size: 22,
              color: '666666',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }),
      ],
    },

    // ── TABLE OF CONTENTS ────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: A4_WIDTH_DXA, height: A4_HEIGHT_DXA, orientation: PageOrientation.PORTRAIT },
          margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'WAGGLE OS -- CONFIDENTIAL',
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                  italics: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Egzakta Group  |  April 2026    |    Page ',
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: 'Table of Contents',
              font: 'Arial',
              size: 36,
              bold: true,
              color: DARK_BLUE,
            }),
          ],
          spacing: { before: 240, after: 300 },
        }),
        new TableOfContents('Table of Contents', {
          hyperlink: true,
          headingStyleRange: '1-3',
        }),
      ],
    },

    // ── MAIN CONTENT ─────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: A4_WIDTH_DXA, height: A4_HEIGHT_DXA, orientation: PageOrientation.PORTRAIT },
          margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'WAGGLE OS -- CONFIDENTIAL',
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                  italics: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Egzakta Group  |  April 2026    |    Page ',
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: 'Arial',
                  size: 16,
                  color: '999999',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children: [
        // ──────────────────────────────────────────────────────────
        // 1. EXECUTIVE SUMMARY
        // ──────────────────────────────────────────────────────────
        heading1('1. Executive Summary'),
        bodyText(
          "Waggle's memory is a 7-layer persistent intelligence system stored in a single portable SQLite file. It survives across sessions, works entirely offline, costs $0 per recall, and imposes no capacity limits. The architecture draws inspiration from MPEG video compression: I-Frames (keyframes) capture complete knowledge snapshots, P-Frames store only deltas from a base frame, and B-Frames bridge knowledge across sessions and topics. On top of this frame layer sit a hybrid semantic + keyword search engine (FTS5 + vec0), a temporal knowledge graph with entity relations, GEPA-optimized procedure templates, self-improvement signals, and a full install audit trail. Every chat interaction automatically feeds the CognifyPipeline, which extracts entities, creates relations, indexes vectors, and links related memories  -- all without any user intervention.",
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 2. CORE PROPERTIES
        // ──────────────────────────────────────────────────────────
        heading1('2. Core Properties'),
        bodyText(
          'The Waggle memory system is built on four foundational properties that distinguish it from every competitor in the market:',
        ),
        emptyParagraph(),
        createTable(
          ['Property', 'Description'],
          [
            [accent('Cross-Session'), 'Memory persists forever in SQLite. No session boundaries. The agent remembers everything from every previous conversation, decision, and correction  -- indefinitely.'],
            [accent('Portable'), 'Single .mind file  -- copy, backup, transfer, cloud sync. Your entire knowledge base is one file you can move between machines or back up to any storage.'],
            [accent('Zero-Cost Recall'), 'Local embeddings + SQLite vector search. $0 per query. Every memory lookup is computed locally with no API calls, no token costs, and sub-20ms latency.'],
            [accent('Unlimited Capacity'), 'No file count limits. 10,000 frames ~ 15MB. SQLite scales gracefully  -- even 100,000 frames remain fast and portable.'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.22), Math.round(CONTENT_WIDTH_DXA * 0.78)],
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 3. THE 7-LAYER ARCHITECTURE
        // ──────────────────────────────────────────────────────────
        heading1('3. The 7-Layer Architecture'),
        bodyText(
          'The Waggle memory system is organized into seven distinct layers, each serving a specific cognitive function. Together, they form a complete artificial long-term memory that mirrors how human experts organize professional knowledge: identity, current focus, experience, connections, procedures, improvement patterns, and trust audit trails.',
        ),
        emptyParagraph(),

        // ── Layer 0: Identity ──
        heading2('3.1 Layer 0: Identity'),
        ...layerSection(
          'Layer 0: Identity',
          'Single row. Who the agent IS.',
          'The Identity layer stores a single immutable row defining the agent\'s persona: its name, organizational role, department affiliation, personality traits, declared capabilities, and the core system prompt. This layer is loaded first on every interaction and anchors all subsequent reasoning. It answers the fundamental question: "Who am I and what can I do?"',
          ['Field', 'Type', 'Description'],
          [
            ['name', 'TEXT', 'Agent display name (e.g., "Waggle", "Research Assistant")'],
            ['role', 'TEXT', 'Organizational role (e.g., "AI Assistant", "Data Analyst")'],
            ['department', 'TEXT', 'Department or team affiliation'],
            ['personality', 'TEXT', 'Personality traits and communication style'],
            ['capabilities', 'TEXT', 'Declared capability manifest'],
            ['system_prompt', 'TEXT', 'Core system prompt loaded on every interaction'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.65)],
        ),

        // ── Layer 1: Awareness ──
        heading2('3.2 Layer 1: Awareness'),
        ...layerSection(
          'Layer 1: Awareness',
          'Max 10 items. What the agent is DOING RIGHT NOW.',
          'The Awareness layer maintains a short, actively-managed list of the agent\'s current operational state: active tasks, pending actions, important flags, and ongoing work. Items have priority levels and optional expiry timestamps. This layer is analogous to a human\'s working memory  -- it holds the immediate context that guides the next action without requiring a full memory search.',
          ['Field', 'Type', 'Description'],
          [
            ['category', 'TEXT', 'One of: task, action, pending, flag'],
            ['content', 'TEXT', 'Description of the awareness item'],
            ['priority', 'INTEGER', 'Priority level (higher = more important)'],
            ['metadata', 'TEXT (JSON)', 'Structured metadata as JSON object'],
            ['expires_at', 'TEXT', 'Optional ISO 8601 expiry timestamp'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.18), Math.round(CONTENT_WIDTH_DXA * 0.62)],
        ),

        pageBreakParagraph(),

        // ── Layer 2: Memory Frames ──
        heading2('3.3 Layer 2: Memory Frames'),
        ...layerSection(
          'Layer 2: Memory Frames',
          'The HEART of the system. I/P/B frame architecture.',
          'Memory Frames are the core storage unit of the Waggle memory system. Inspired by MPEG video compression, frames come in three types that enable efficient, non-redundant knowledge storage while maintaining complete reconstructability. Every piece of knowledge the agent acquires is stored as a frame, organized into Groups of Pictures (GOPs) that correspond to sessions.',
          null,
          null,
          null,
        ),

        heading3('Frame Types'),
        createTable(
          ['Frame Type', 'Full Name', 'Description'],
          [
            [accent('I-Frame'), 'Initial / Keyframe', 'Complete state snapshot. Self-contained and independently readable. Created at the start of each session or at major knowledge milestones. Like a keyframe in video  -- you can decode it without any other frame.'],
            [accent('P-Frame'), 'Progressive / Delta', 'Stores only the CHANGE from a base I-Frame. References base_frame_id. Dramatically reduces redundancy  -- if the user corrects one fact, only the delta is stored, not the entire context.'],
            [accent('B-Frame'), 'Bridge', 'Cross-references MULTIPLE frames across different sessions and topics. Connects knowledge islands. Stores a JSON payload with description and an array of referenced frame IDs.'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.65)],
        ),
        emptyParagraph(),

        heading3('Frame Schema'),
        createTable(
          ['Field', 'Type', 'Description'],
          [
            ['id', 'INTEGER PK', 'Auto-incrementing primary key'],
            ['frame_type', 'TEXT', 'One of: I, P, B'],
            ['gop_id', 'TEXT FK', 'Group of Pictures ID  -- references a session'],
            ['t', 'INTEGER', 'Temporal index within the GOP (auto-incremented)'],
            ['base_frame_id', 'INTEGER FK', 'For P-Frames: references the base I-Frame. NULL for I-Frames.'],
            ['content', 'TEXT', 'The knowledge content (plain text or structured JSON for B-Frames)'],
            [accent('importance'), 'TEXT', 'One of: critical, important, normal, temporary, deprecated'],
            [accent('source'), 'TEXT', 'One of: user_stated, tool_verified, agent_inferred, import, system'],
            ['access_count', 'INTEGER', 'Number of times this frame has been accessed (drives popularity scoring)'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.18), Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.67)],
        ),

        pageBreakParagraph(),

        // ── Layer 3: Knowledge Graph ──
        heading2('3.4 Layer 3: Knowledge Graph'),
        ...layerSection(
          'Layer 3: Knowledge Graph',
          'Entities + Relations with temporal validity.',
          'The Knowledge Graph layer maintains a structured representation of entities (people, projects, tools, concepts) and the relationships between them. Every entity and relation has temporal validity bounds (valid_from, valid_to), enabling the system to reason about knowledge that changes over time. Relations carry confidence scores and can represent any semantic connection: "leads", "depends_on", "reports_to", "co-occurs_with", and more.',
          null,
          null,
          null,
        ),

        heading3('Entity Schema'),
        createTable(
          ['Field', 'Type', 'Description'],
          [
            ['entity_type', 'TEXT', 'Category of entity (person, project, tool, concept, etc.)'],
            ['name', 'TEXT', 'Canonical name of the entity'],
            ['properties', 'TEXT (JSON)', 'Structured properties as JSON object'],
            ['valid_from', 'TEXT', 'ISO 8601 timestamp  -- when this entity became valid'],
            ['valid_to', 'TEXT', 'ISO 8601 timestamp  -- when this entity ceased to be valid (NULL = current)'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.18), Math.round(CONTENT_WIDTH_DXA * 0.62)],
        ),
        emptyParagraph(),

        heading3('Relation Schema'),
        createTable(
          ['Field', 'Type', 'Description'],
          [
            ['source_id', 'INTEGER FK', 'References the source entity'],
            ['target_id', 'INTEGER FK', 'References the target entity'],
            ['relation_type', 'TEXT', 'Semantic relation type (leads, depends_on, co_occurs_with, etc.)'],
            ['confidence', 'REAL', 'Confidence score from 0.0 to 1.0'],
            ['properties', 'TEXT (JSON)', 'Additional structured metadata'],
            ['valid_from / valid_to', 'TEXT', 'Temporal validity window for the relation'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.22), Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.63)],
        ),

        pageBreakParagraph(),

        // ── Layer 4: Procedures (GEPA) ──
        heading2('3.5 Layer 4: Procedures (GEPA)'),
        ...layerSection(
          'Layer 4: Procedures',
          'Optimized prompt templates per model.',
          'The Procedures layer stores GEPA-optimized (Generate, Evaluate, Promote, Apply) prompt templates that have been tested and scored against specific LLM models. Each procedure tracks its success rate and average cost, enabling the system to select the most cost-effective and reliable template for any given task and model combination. As the agent works, high-performing prompts are automatically promoted while low-performers are phased out.',
          ['Field', 'Type', 'Description'],
          [
            ['name', 'TEXT', 'Procedure identifier (e.g., "summarize-email", "extract-entities")'],
            ['model', 'TEXT', 'Target LLM model (e.g., "claude-sonnet-4-20250514", "gpt-4o")'],
            ['template', 'TEXT', 'The prompt template content'],
            ['version', 'INTEGER', 'Version number (auto-incremented on update)'],
            [accent('success_rate'), 'REAL', 'Measured success rate (0.0 to 1.0)'],
            [accent('avg_cost'), 'REAL', 'Average cost per execution in USD'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.65)],
        ),

        // ── Layer 5: Improvement Signals ──
        heading2('3.6 Layer 5: Improvement Signals'),
        ...layerSection(
          'Layer 5: Improvement Signals',
          'Self-improving behavioral patterns.',
          'The Improvement Signals layer implements Waggle\'s self-improvement capability. It detects recurring patterns across interactions  -- capability gaps the agent encounters repeatedly, corrections the user makes, and workflow patterns that emerge. When a signal\'s count reaches the surfacing threshold (count >= 3), it is elevated to the agent\'s awareness and triggers a behavioral adjustment. This creates a feedback loop where the agent genuinely improves over time without any manual configuration.',
          ['Field', 'Type', 'Description'],
          [
            ['category', 'TEXT', 'One of: capability_gap, correction, workflow_pattern'],
            ['pattern_key', 'TEXT', 'Unique identifier for this pattern (e.g., "always-needs-date-format")'],
            ['detail', 'TEXT', 'Human-readable description of the detected pattern'],
            ['count', 'INTEGER', 'How many times this pattern has been observed'],
            [accent('surfaced'), 'INTEGER', 'Boolean: has this signal been elevated to the agent? (threshold: count >= 3)'],
            ['surfaced_at', 'TEXT', 'ISO 8601 timestamp of when the signal was last surfaced'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.65)],
        ),

        pageBreakParagraph(),

        // ── Layer 6: Install Audit ──
        heading2('3.7 Layer 6: Install Audit'),
        ...layerSection(
          'Layer 6: Install Audit',
          'Security audit trail for all capability installations.',
          'The Install Audit layer provides a complete, tamper-evident record of every capability ever proposed, approved, installed, rejected, or failed on the system. Every skill, plugin, MCP server, and native capability goes through this audit pipeline. This layer is critical for enterprise compliance and for the KVARK integration path, where organizations require full governance and audit trails over their AI agent\'s capabilities.',
          ['Field', 'Type', 'Description'],
          [
            ['capability_name', 'TEXT', 'Name of the capability (e.g., "web-search", "file-write")'],
            ['capability_type', 'TEXT', 'One of: native, skill, plugin, mcp'],
            ['source', 'TEXT', 'Where the capability came from (URL, marketplace ID, etc.)'],
            ['risk_level', 'TEXT', 'One of: low, medium, high'],
            ['trust_source', 'TEXT', 'What entity vouches for this capability'],
            ['approval_class', 'TEXT', 'One of: standard, elevated, critical'],
            ['action', 'TEXT', 'One of: proposed, approved, installed, rejected, failed'],
            ['initiator', 'TEXT', 'One of: agent, user, system'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.22), Math.round(CONTENT_WIDTH_DXA * 0.15), Math.round(CONTENT_WIDTH_DXA * 0.63)],
        ),

        // ── Bonus: Concept Tracker ──
        heading2('3.8 Bonus: Concept Tracker'),
        ...layerSection(
          'Concept Tracker',
          'Spaced repetition learning system.',
          'The Concept Tracker is a supplementary layer that implements spaced repetition learning within the memory system. It tracks concept mastery levels on a 1-5 scale, recording correct and incorrect recall attempts. This enables the agent to prioritize revisiting concepts the user struggles with and to confidently skip well-mastered material  -- mirroring how human experts build and maintain expertise over time.',
          ['Field', 'Type', 'Description'],
          [
            ['concept', 'TEXT UNIQUE', 'The concept being tracked (e.g., "REST API design", "SQL joins")'],
            ['mastery_level', 'INTEGER', 'Current mastery level from 1 (novice) to 5 (expert)'],
            ['last_tested', 'TEXT', 'ISO 8601 timestamp of last assessment'],
            ['times_correct', 'INTEGER', 'Number of correct recall attempts'],
            ['times_wrong', 'INTEGER', 'Number of incorrect recall attempts'],
            ['notes', 'TEXT', 'Free-form notes about the concept\'s learning trajectory'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.2), Math.round(CONTENT_WIDTH_DXA * 0.18), Math.round(CONTENT_WIDTH_DXA * 0.62)],
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 4. VIDEO COMPRESSION ANALOGY
        // ──────────────────────────────────────────────────────────
        heading1('4. Video Compression Analogy'),
        bodyText(
          'The Waggle memory architecture is directly inspired by MPEG video compression. Understanding this analogy makes the entire system intuitive. In video, storing every pixel of every frame would be prohibitively expensive. Instead, MPEG uses keyframes (I-Frames), delta frames (P-Frames), and bidirectional reference frames (B-Frames) to store only what changes. Waggle applies the same principle to knowledge:',
        ),
        emptyParagraph(),
        createTable(
          ['Concept', 'MPEG Video', 'Waggle Memory'],
          [
            [accent('I-Frame'), 'Complete image  -- expensive to store but always fully decodable without any other frame', 'Complete knowledge snapshot  -- self-contained, independently readable, captures full state at a point in time'],
            [accent('P-Frame'), 'Only the pixel differences from the previous frame  -- small and efficient', 'Only the CHANGE from the base I-Frame  -- a correction, update, or addition to existing knowledge'],
            [accent('B-Frame'), 'References two surrounding frames for even better compression', 'Cross-references MULTIPLE frames from different sessions  -- bridges knowledge islands together'],
            [accent('Reconstruction'), 'I + P + P + P = current visible frame', 'I + P + P = current knowledge state (reconstructed on demand)'],
            [accent('Compression'), 'Saves disk space and bandwidth', 'Saves context window tokens, avoids redundancy, enables efficient recall'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.18), Math.round(CONTENT_WIDTH_DXA * 0.41), Math.round(CONTENT_WIDTH_DXA * 0.41)],
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 5. FRAME OVERLAP & TRANSITION
        // ──────────────────────────────────────────────────────────
        heading1('5. Frame Overlap & Transition'),
        bodyText(
          'Understanding how frames flow over time is essential to grasping how Waggle builds and maintains knowledge. The system follows a natural lifecycle:',
        ),
        emptyParagraph(),

        heading2('5.1 Session Lifecycle'),
        ...bulletList([
          'Session starts -> An I-Frame (keyframe) is created, capturing the initial state and context of the interaction.',
          'Changes happen -> P-Frames accumulate as deltas from the base I-Frame. Each correction, new fact, or updated preference is stored as a minimal delta.',
          'Major milestone -> A new I-Frame is created, effectively compressing all previous P-Frames into a fresh, self-contained snapshot.',
          'Cross-topic connection -> A B-Frame is created to bridge frames from different sessions when the system detects semantic overlap.',
        ]),
        emptyParagraph(),

        heading2('5.2 Automatic Linking'),
        bodyText(
          'The MemoryLinker component runs automatically after each cognify cycle. It computes cosine similarity between the newly created frame and all existing frames in the search index. When similarity exceeds the configured threshold, a B-Frame bridge is automatically created, connecting the new knowledge to related historical frames. This means the knowledge graph grows organically  -- connections are discovered, not manually defined.',
        ),
        emptyParagraph(),

        heading2('5.3 CognifyPipeline Trigger'),
        bodyText(
          'The CognifyPipeline executes AFTER every chat interaction, completely automatically. The user never needs to "save" or "index" anything  -- the system handles all memory management transparently in the background.',
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 6. HYBRID SEARCH ENGINE
        // ──────────────────────────────────────────────────────────
        heading1('6. Hybrid Search Engine'),
        bodyText(
          'Waggle employs a 3-stage hybrid search pipeline that combines keyword precision with semantic understanding. This ensures that both exact term matches and conceptually related content are surfaced during memory recall.',
        ),
        emptyParagraph(),

        heading2('6.1 Three-Stage Pipeline'),
        ...bulletList([
          'Stage 1: FTS5 Keyword Search  -- Porter stemming with unicode61 tokenizer. Fast, exact matches on specific terms and phrases.',
          'Stage 2: Vec0 Vector Search  -- 1024-dimensional cosine similarity using locally-computed embeddings. Captures semantic meaning even when exact terms differ.',
          'Stage 3: RRF Fusion  -- Reciprocal Rank Fusion with K=60 merges both result sets into a single ranked list, combining the strengths of both approaches.',
        ]),
        emptyParagraph(),

        heading2('6.2 Scoring Profiles'),
        bodyText(
          'After RRF fusion, results are re-scored using a configurable 4-factor relevance model. Four built-in profiles weight these factors differently:',
        ),
        emptyParagraph(),
        createTable(
          ['Profile', 'Temporal', 'Popularity', 'Contextual', 'Importance'],
          [
            [accent('balanced'), '40%', '20%', '20%', '20%'],
            [accent('recent'), '60%', '10%', '20%', '10%'],
            [accent('important'), '10%', '10%', '20%', '60%'],
            [accent('connected'), '10%', '10%', '60%', '20%'],
          ],
          [
            Math.round(CONTENT_WIDTH_DXA * 0.2),
            Math.round(CONTENT_WIDTH_DXA * 0.2),
            Math.round(CONTENT_WIDTH_DXA * 0.2),
            Math.round(CONTENT_WIDTH_DXA * 0.2),
            Math.round(CONTENT_WIDTH_DXA * 0.2),
          ],
        ),
        emptyParagraph(),

        heading2('6.3 Temporal Decay'),
        bodyText(
          'The temporal scoring component uses exponential decay with a 30-day half-life. Frames accessed within the last 7 days receive a full recency boost (score = 1.0). After 7 days, the score decays exponentially: at 30 days the temporal score is 0.5, at 60 days it is 0.25, and so on. This naturally prioritizes recent knowledge while retaining the ability to surface older content when it scores highly on other factors.',
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 7. EMBEDDING PIPELINE
        // ──────────────────────────────────────────────────────────
        heading1('7. Embedding Pipeline'),
        bodyText(
          'Waggle implements a resilient 4-tier fallback chain for computing text embeddings. The system automatically probes each provider in order and selects the first one that responds successfully. This ensures embeddings always work  -- even fully offline.',
        ),
        emptyParagraph(),
        createTable(
          ['Priority', 'Provider', 'Model', 'Location', 'Latency', 'Notes'],
          [
            [accent('1'), 'InProcess', 'Xenova/all-MiniLM-L6-v2', 'Local (ONNX)', '~20ms', '384 native dims -> 1024 normalized. ~23MB model download on first use. Default for all desktop users.'],
            [accent('2'), 'Ollama', 'nomic-embed-text', 'Local', '~50ms', 'Requires Ollama running locally. Higher quality embeddings.'],
            [accent('3'), 'API', 'Voyage AI / OpenAI', 'Cloud', '~200ms', 'Requires API key in Vault. Voyage voyage-3-lite or OpenAI text-embedding-3-small.'],
            [accent('4'), 'Mock', 'Deterministic hash', 'Local', '<1ms', 'Random vectors based on text hash. Degraded search quality. Last resort fallback.'],
          ],
          [
            Math.round(CONTENT_WIDTH_DXA * 0.08),
            Math.round(CONTENT_WIDTH_DXA * 0.12),
            Math.round(CONTENT_WIDTH_DXA * 0.22),
            Math.round(CONTENT_WIDTH_DXA * 0.1),
            Math.round(CONTENT_WIDTH_DXA * 0.1),
            Math.round(CONTENT_WIDTH_DXA * 0.38),
          ],
        ),
        emptyParagraph(),
        bodyText(
          'All embeddings are normalized to 1024 dimensions regardless of the provider\'s native output. Shorter embeddings are zero-padded, longer ones are truncated. This ensures consistent vec0 table compatibility across provider switches. Tier enforcement gates which providers are available per subscription tier, and monthly quota tracking prevents runaway costs on cloud providers.',
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 8. COGNIFY PIPELINE
        // ──────────────────────────────────────────────────────────
        heading1('8. CognifyPipeline  -- Automatic Memory'),
        bodyText(
          'The CognifyPipeline is the engine that converts raw chat interactions into structured, searchable, interconnected memories. It runs automatically after EVERY chat exchange  -- the user never needs to manually trigger memory storage.',
        ),
        emptyParagraph(),

        heading2('8.1 Seven-Step Pipeline'),
        createTable(
          ['Step', 'Action', 'Detail'],
          [
            [accent('1'), 'Ensure session exists', 'Resolves or creates a GOP (Group of Pictures) session. Each session maps to a project context.'],
            [accent('2'), 'Create I-Frame or P-Frame', 'If no I-Frame exists for this GOP, creates one (keyframe). Otherwise creates a P-Frame (delta from the latest I-Frame).'],
            [accent('3'), 'Extract entities', 'Runs entity extraction on the response content. Identifies people, projects, tools, concepts, and other named entities.'],
            [accent('4'), 'Extract semantic relations', 'Identifies semantic relations between entities: leads, depends_on, reports_to, co_occurs_with, etc.'],
            [accent('5'), 'Upsert entities into Knowledge Graph', 'Merges extracted entities into the knowledge graph, deduplicating by name and type. Creates co-occurrence relations.'],
            [accent('6'), 'Index frame for vector search', 'Computes the embedding vector for the new frame and inserts it into the vec0 virtual table for semantic search.'],
            [accent('7'), 'MemoryLinker finds related frames', 'Computes cosine similarity against existing frames. Creates B-Frame bridges when similarity exceeds the threshold.'],
          ],
          [Math.round(CONTENT_WIDTH_DXA * 0.08), Math.round(CONTENT_WIDTH_DXA * 0.22), Math.round(CONTENT_WIDTH_DXA * 0.7)],
        ),
        emptyParagraph(),

        heading2('8.2 Deduplication'),
        bodyText(
          'Before creating any I-Frame, the FrameStore checks for existing frames with identical content using SHA-256 content hashing. If a duplicate is found, the access count of the existing frame is incremented instead of creating a new one. This prevents the memory from bloating with repeated information.',
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 9. PERSONAL MIND vs WORKSPACE MIND
        // ──────────────────────────────────────────────────────────
        heading1('9. Personal Mind vs Workspace Mind'),
        bodyText(
          'Waggle operates with a dual-mind architecture that separates personal knowledge from workspace-specific knowledge:',
        ),
        emptyParagraph(),

        heading2('9.1 Personal Mind'),
        bodyText([
          boldRun('Location: '),
          normalRun('~/.waggle/default.mind'),
        ]),
        bodyText(
          'The Personal Mind stores user identity, preferences, communication style, and cross-project feedback. It is the agent\'s "self"  -- knowledge that transcends any specific project or workspace. This file travels with the user and represents their accumulated AI partnership.',
        ),
        emptyParagraph(),

        heading2('9.2 Workspace Mind'),
        bodyText([
          boldRun('Location: '),
          normalRun('~/.waggle/workspaces/{name}/workspace.mind'),
        ]),
        bodyText(
          'Each workspace gets its own dedicated .mind file containing project-specific frames, entities, relations, and procedures. This isolation ensures that a legal project\'s knowledge never bleeds into a marketing project, while still allowing cross-workspace insights through the personal mind layer.',
        ),
        emptyParagraph(),

        heading2('9.3 Merge at Recall Time'),
        bodyText(
          'The Orchestrator manages both minds simultaneously through the MultiMind class. When the agent needs to recall information, it queries both the personal and workspace minds and merges the results. Identity always comes from the personal mind, awareness is combined from both, and frame search can target either mind or both depending on the query scope. This dual-layer approach provides both personalization and project isolation in a single coherent system.',
        ),

        pageBreakParagraph(),

        // ──────────────────────────────────────────────────────────
        // 10. COMPETITIVE COMPARISON
        // ──────────────────────────────────────────────────────────
        heading1('10. Competitive Comparison'),
        bodyText(
          'The following table compares Waggle\'s memory system against the leading AI coding and assistant tools on the market as of April 2026:',
        ),
        emptyParagraph(),

        (() => {
          const cols = [
            Math.round(CONTENT_WIDTH_DXA * 0.18),
            Math.round(CONTENT_WIDTH_DXA * 0.22),
            Math.round(CONTENT_WIDTH_DXA * 0.20),
            Math.round(CONTENT_WIDTH_DXA * 0.20),
            Math.round(CONTENT_WIDTH_DXA * 0.20),
          ];
          return createTable(
            ['Feature', 'Waggle', 'Claude Code', 'Cursor', 'ChatGPT'],
            [
              [accent('Storage'), 'SQLite (eternal)', 'Flat .md files', '.cursorrules', 'None'],
              [accent('Cross-session'), 'Yes, automatic', 'Yes, flat files', 'No', 'No'],
              [accent('Portable'), '1 file, copy-paste', 'Folder', 'Per-project', 'No'],
              [accent('Frame logic'), 'I/P/B (video)', 'Flat text', 'Key-value', 'N/A'],
              [accent('Overlap / linking'), 'MemoryLinker + B-Frame', 'None', 'None', 'None'],
              [accent('Semantic search'), 'Vec0 + FTS5 hybrid', 'LLM side-query ($$$)', 'None', 'None'],
              [accent('Knowledge Graph'), 'Entities + relations', 'None', 'None', 'None'],
              [accent('Self-improvement'), 'ImprovementSignals', 'None', 'None', 'None'],
              [accent('Auto-save'), 'CognifyPipeline', 'Background extract', 'None', 'None'],
              [accent('Recall cost'), '$0 (local)', '~$0.003/turn', 'N/A', 'N/A'],
              [accent('Capacity'), 'Unlimited', '200 files, 25KB', '1 file', '0'],
              [accent('Layers'), '7', '1', '0', '0'],
            ],
            cols,
          );
        })(),
        emptyParagraph(),
        emptyParagraph(),

        // ── Closing ──
        new Paragraph({
          children: [
            new TextRun({
              text: '___________________________________________',
              font: 'Arial',
              size: 22,
              color: HONEY,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'End of Document',
              font: 'Arial',
              size: 20,
              color: '999999',
              italics: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Waggle OS  | Egzakta Group  | waggle-os.ai  | www.kvark.ai',
              font: 'Arial',
              size: 18,
              color: '999999',
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ],
    },
  ],
});

// -- Generate and post-process ----------------------------------------
const outputPath = path.resolve('docs', 'Waggle_Memory_System_Technical_Deep_Dive.docx');
const buffer = await Packer.toBuffer(doc);

// Post-process: replace non-ASCII bullet chars in numbering.xml
// The docx library auto-generates default bullet symbols that are non-ASCII.
// We replace them with ASCII-safe dashes to avoid validator encoding issues.
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream, createReadStream, unlinkSync, renameSync } from 'node:fs';

const JSZip = (await import('jszip')).default ?? (await import('jszip'));

async function postProcessDocx(buf) {
  let zip;
  // Handle both ESM default export patterns
  if (typeof JSZip === 'function') {
    zip = await JSZip.loadAsync(buf);
  } else if (typeof JSZip.loadAsync === 'function') {
    zip = await JSZip.loadAsync(buf);
  } else {
    // Fallback: just write as-is
    console.log('[warn] Could not load JSZip, skipping post-processing');
    return buf;
  }

  const numberingFile = zip.file('word/numbering.xml');
  if (numberingFile) {
    let xml = await numberingFile.async('string');
    // Replace Unicode bullet characters with ASCII dashes
    xml = xml.replace(/\u25CF/g, '-');  // ● -> -
    xml = xml.replace(/\u25CB/g, '-');  // ○ -> -
    xml = xml.replace(/\u25A0/g, '-');  // ■ -> -
    xml = xml.replace(/\u25AA/g, '-');  // ▪ -> -
    zip.file('word/numbering.xml', xml);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

let finalBuffer;
try {
  finalBuffer = await postProcessDocx(buffer);
} catch (e) {
  console.log(`[warn] Post-processing failed (${e.message}), using original buffer`);
  finalBuffer = buffer;
}

fs.writeFileSync(outputPath, finalBuffer);
console.log(`Document generated: ${outputPath}`);
console.log(`Size: ${(finalBuffer.length / 1024).toFixed(1)} KB`);

#!/usr/bin/env node
"use strict";

/**
 * Architecture structural analysis for the understand-anything pipeline.
 * Computes deterministic structural patterns (directory grouping, node-type
 * grouping, import adjacency, cross-category deps, inter/intra-group import
 * frequency, pattern matches, deployment topology, data pipeline, doc coverage,
 * dependency direction, fan-in/out) to inform semantic layer assignment.
 */

const fs = require("fs");

function fail(msg) {
  process.stderr.write(String(msg) + "\n");
  process.exit(1);
}

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) fail("usage: node ua-arch-analyze.js <input.json> <output.json>");

let input;
try {
  input = JSON.parse(fs.readFileSync(inPath, "utf8"));
} catch (e) {
  fail("failed to read/parse input: " + e.message);
}

const fileNodes = Array.isArray(input.fileNodes) ? input.fileNodes : [];
const importEdges = Array.isArray(input.importEdges) ? input.importEdges : [];
const allEdges = Array.isArray(input.allEdges) ? input.allEdges : [];

if (fileNodes.length === 0) fail("no fileNodes in input");

// ---- index ----
const nodeById = new Map();
for (const n of fileNodes) nodeById.set(n.id, n);
const fileIdSet = new Set(fileNodes.map((n) => n.id));

// ============================================================
// A. Directory grouping
// ============================================================
// Common prefix across all file paths (segment-wise).
function commonPrefixSegments(paths) {
  if (paths.length === 0) return [];
  const split = paths.map((p) => p.split("/"));
  const first = split[0];
  const prefix = [];
  for (let i = 0; i < first.length - 1; i++) {
    const seg = first[i];
    if (split.every((s) => s.length > i + 1 && s[i] === seg)) prefix.push(seg);
    else break;
  }
  return prefix;
}

const paths = fileNodes.map((n) => n.filePath);
const prefixSegs = commonPrefixSegments(paths);
const prefixLen = prefixSegs.length;

// For a monorepo, the meaningful boundary is packages/<pkg> and apps/<app>.
// Group by: packages/<pkg>, apps/<app>, otherwise the first segment after the
// common prefix (or "root" for top-level files).
function groupKeyFor(filePath) {
  const parts = filePath.split("/");
  if ((parts[0] === "packages" || parts[0] === "apps") && parts.length >= 2) {
    return parts[0] + "/" + parts[1];
  }
  const after = parts.slice(prefixLen);
  if (after.length <= 1) return "root";
  return after[0];
}

const directoryGroups = {};
for (const n of fileNodes) {
  const key = groupKeyFor(n.filePath);
  (directoryGroups[key] = directoryGroups[key] || []).push(n.id);
}

// map nodeId -> group
const groupOf = new Map();
for (const [g, ids] of Object.entries(directoryGroups)) for (const id of ids) groupOf.set(id, g);

// ============================================================
// B. Node type grouping
// ============================================================
const nodeTypeGroups = {};
for (const n of fileNodes) (nodeTypeGroups[n.type] = nodeTypeGroups[n.type] || []).push(n.id);

// ============================================================
// C. Import adjacency: fan-in / fan-out
// ============================================================
const fanOut = {};
const fanIn = {};
for (const id of fileIdSet) { fanOut[id] = 0; fanIn[id] = 0; }
for (const e of importEdges) {
  if (fileIdSet.has(e.source) && fileIdSet.has(e.target)) {
    fanOut[e.source] = (fanOut[e.source] || 0) + 1;
    fanIn[e.target] = (fanIn[e.target] || 0) + 1;
  }
}
// trim zero-entries for compactness, keep top contributors
function topMap(m, limit) {
  return Object.fromEntries(
    Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit)
  );
}

// ============================================================
// D. Cross-category dependency analysis (allEdges by node-type pairs)
// ============================================================
const crossKey = {};
for (const e of allEdges) {
  const s = nodeById.get(e.source);
  const t = nodeById.get(e.target);
  if (!s || !t) continue;
  if (s.type === t.type) continue; // cross-category only
  const k = s.type + ">" + t.type + ">" + e.type;
  crossKey[k] = (crossKey[k] || 0) + 1;
}
const crossCategoryEdges = Object.entries(crossKey)
  .map(([k, count]) => {
    const [fromType, toType, edgeType] = k.split(">");
    return { fromType, toType, edgeType, count };
  })
  .sort((a, b) => b.count - a.count);

// ============================================================
// E. Inter-group import frequency
// ============================================================
const interKey = {};
for (const e of importEdges) {
  const gs = groupOf.get(e.source);
  const gt = groupOf.get(e.target);
  if (!gs || !gt || gs === gt) continue;
  const k = gs + "||" + gt;
  interKey[k] = (interKey[k] || 0) + 1;
}
const interGroupImports = Object.entries(interKey)
  .map(([k, count]) => {
    const [from, to] = k.split("||");
    return { from, to, count };
  })
  .sort((a, b) => b.count - a.count);

// ============================================================
// F. Intra-group import density
// ============================================================
const intraGroupDensity = {};
const groupInternal = {};
const groupTotal = {};
for (const g of Object.keys(directoryGroups)) { groupInternal[g] = 0; groupTotal[g] = 0; }
for (const e of importEdges) {
  const gs = groupOf.get(e.source);
  const gt = groupOf.get(e.target);
  if (gs) groupTotal[gs]++;
  if (gt && gt !== gs) groupTotal[gt]++;
  if (gs && gs === gt) { groupInternal[gs]++; }
}
for (const g of Object.keys(directoryGroups)) {
  const internal = groupInternal[g];
  const total = groupTotal[g];
  intraGroupDensity[g] = {
    internalEdges: internal,
    totalEdges: total,
    density: total > 0 ? +(internal / total).toFixed(3) : 0,
  };
}

// ============================================================
// G. Directory + file pattern matching
// ============================================================
const DIR_PATTERNS = [
  [["routes", "api", "controllers", "endpoints", "handlers", "serializers", "controller", "routers", "blueprints"], "api"],
  [["services", "core", "lib", "domain", "logic", "signals", "internal", "composables", "mailers", "jobs", "channels"], "service"],
  [["models", "db", "data", "persistence", "repository", "entities", "migrations", "entity", "sql", "database"], "data"],
  [["components", "views", "pages", "ui", "layouts", "screens"], "ui"],
  [["middleware", "plugins", "interceptors", "guards"], "middleware"],
  [["utils", "helpers", "common", "shared", "tools", "templatetags", "pkg"], "utility"],
  [["config", "constants", "env", "settings", "management", "commands"], "config"],
  [["__tests__", "test", "tests", "spec", "specs"], "test"],
  [["types", "interfaces", "schemas", "contracts", "dtos", "dto", "request", "response"], "types"],
  [["hooks"], "hooks"],
  [["store", "state", "reducers", "actions", "slices"], "state"],
  [["assets", "static", "public"], "assets"],
  [["cmd", "bin"], "entry"],
  [["docs", "documentation", "wiki"], "documentation"],
  [["deploy", "deployment", "infra", "infrastructure", "k8s", "kubernetes", "helm", "charts", "terraform", "tf", "docker"], "infrastructure"],
  [[".github", ".gitlab", ".circleci"], "ci-cd"],
];
const dirLabel = {};
for (const [names, label] of DIR_PATTERNS) for (const nm of names) dirLabel[nm] = label;

function lastDirSegment(group) {
  // group can be "packages/agent" -> last segment "agent"; or "docs" -> "docs"
  const parts = group.split("/");
  return parts[parts.length - 1];
}

const patternMatches = {};
for (const g of Object.keys(directoryGroups)) {
  const seg = lastDirSegment(g).toLowerCase();
  if (dirLabel[seg]) patternMatches[g] = dirLabel[seg];
}

// File-level pattern detection (counts per group for test/types/etc.)
function fileLevelLabel(filePath, name) {
  const base = name || filePath.split("/").pop();
  if (/\.(test|spec)\.[a-z]+$/i.test(base) || /^test_.*\.py$/i.test(base) || /_test\.go$/i.test(base) || /Test\.java$/.test(base) || /_spec\.rb$/i.test(base) || /Test\.php$/.test(base) || /Tests\.cs$/.test(base)) return "test";
  if (/\.d\.ts$/.test(base)) return "types";
  if (/^(Dockerfile)/.test(base) || /^docker-compose\..*\.(ya?ml)$/.test(base) || /^docker-compose\.(ya?ml)$/.test(base)) return "infrastructure";
  if (/\.(tf|tfvars)$/.test(base)) return "infrastructure";
  if (/\.(sql)$/.test(base)) return "data";
  if (/\.(graphql|gql|proto)$/.test(base)) return "types";
  if (/\.(md|rst)$/.test(base)) return "documentation";
  if (/^Makefile$/.test(base)) return "infrastructure";
  if (base === "Cargo.toml" || base === "go.mod" || base === "Gemfile" || base === "pom.xml" || base === "build.gradle" || base === "composer.json") return "config";
  if (/\.github\/workflows\//.test(filePath) || base === ".gitlab-ci.yml" || base === "Jenkinsfile") return "ci-cd";
  return null;
}

const fileLabelCounts = {}; // group -> { label: count }
for (const n of fileNodes) {
  const lab = fileLevelLabel(n.filePath, n.name);
  if (!lab) continue;
  const g = groupOf.get(n.id);
  (fileLabelCounts[g] = fileLabelCounts[g] || {});
  fileLabelCounts[g][lab] = (fileLabelCounts[g][lab] || 0) + 1;
}

// ============================================================
// H. Deployment topology
// ============================================================
const infraFiles = [];
let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;
for (const n of fileNodes) {
  const p = n.filePath;
  const base = n.name || p.split("/").pop();
  if (/^Dockerfile/.test(base)) { hasDockerfile = true; infraFiles.push(p); }
  else if (/^docker-compose\..*ya?ml$/.test(base) || /^docker-compose\.ya?ml$/.test(base)) { hasCompose = true; infraFiles.push(p); }
  else if (/\.(tf|tfvars)$/.test(base)) { hasTerraform = true; infraFiles.push(p); }
  else if (/(^|\/)(k8s|kubernetes|helm|charts)(\/|$)/.test(p)) { hasK8s = true; infraFiles.push(p); }
  else if (/\.github\/workflows\//.test(p) || base === ".gitlab-ci.yml" || base === "Jenkinsfile") { hasCI = true; infraFiles.push(p); }
  else if (base === ".dockerignore" || base === "render.yaml") { infraFiles.push(p); }
}

// ============================================================
// I. Data pipeline detection
// ============================================================
const schemaFiles = [];
const migrationFiles = [];
const dataModelFiles = [];
const apiHandlerFiles = [];
for (const n of fileNodes) {
  const p = n.filePath;
  const tags = (n.tags || []).map((t) => String(t).toLowerCase());
  if (/\.(graphql|gql|proto|prisma)$/.test(p)) schemaFiles.push(p);
  if (/migrations?\//.test(p) || /\bdrizzle\//.test(p) || /\.sql$/.test(p)) migrationFiles.push(p);
  if (n.type === "file" && (/\/models?\//.test(p) || tags.includes("data-model") || tags.includes("orm") || tags.includes("entity"))) dataModelFiles.push(p);
  if (n.type === "file" && (/\/(routes|controllers|api|endpoints|handlers)\//.test(p) || tags.includes("api-handler") || tags.includes("route"))) apiHandlerFiles.push(p);
}

// ============================================================
// J. Documentation coverage
// ============================================================
const totalGroups = Object.keys(directoryGroups).length;
const groupHasDoc = {};
for (const g of Object.keys(directoryGroups)) groupHasDoc[g] = false;
for (const n of fileNodes) {
  if (n.type === "document" || /\.(md|rst)$/i.test(n.filePath)) {
    const g = groupOf.get(n.id);
    if (g) groupHasDoc[g] = true;
  }
}
const groupsWithDocs = Object.values(groupHasDoc).filter(Boolean).length;
const undocumentedGroups = Object.entries(groupHasDoc).filter(([, v]) => !v).map(([k]) => k);

// ============================================================
// K. Dependency direction
// ============================================================
const pairNet = {};
for (const { from, to, count } of interGroupImports) {
  const key = [from, to].sort().join("||");
  pairNet[key] = pairNet[key] || {};
  pairNet[key][from + ">" + to] = count;
}
const dependencyDirection = [];
const seenPairs = new Set();
for (const { from, to } of interGroupImports) {
  const key = [from, to].sort().join("||");
  if (seenPairs.has(key)) continue;
  seenPairs.add(key);
  const ab = pairNet[key][from + ">" + to] || 0;
  const ba = pairNet[key][to + ">" + from] || 0;
  if (ab >= ba) dependencyDirection.push({ dependent: from, dependsOn: to });
  else dependencyDirection.push({ dependent: to, dependsOn: from });
}

// ============================================================
// fileStats
// ============================================================
const filesPerGroup = {};
for (const [g, ids] of Object.entries(directoryGroups)) filesPerGroup[g] = ids.length;
const nodeTypeCounts = {};
for (const [t, ids] of Object.entries(nodeTypeGroups)) nodeTypeCounts[t] = ids.length;

const result = {
  scriptCompleted: true,
  commonPrefix: prefixSegs.join("/"),
  directoryGroups,
  nodeTypeGroups,
  crossCategoryEdges,
  interGroupImports,
  intraGroupDensity,
  patternMatches,
  fileLabelCounts,
  deploymentTopology: {
    hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI,
    infraFiles: [...new Set(infraFiles)],
  },
  dataPipeline: {
    schemaFiles: [...new Set(schemaFiles)].slice(0, 50),
    migrationFiles: [...new Set(migrationFiles)].slice(0, 50),
    dataModelFiles: [...new Set(dataModelFiles)].slice(0, 50),
    apiHandlerFiles: [...new Set(apiHandlerFiles)].slice(0, 80),
  },
  docCoverage: {
    groupsWithDocs,
    totalGroups,
    coverageRatio: totalGroups ? +(groupsWithDocs / totalGroups).toFixed(2) : 0,
    undocumentedGroups,
  },
  dependencyDirection,
  fileStats: {
    totalFileNodes: fileNodes.length,
    filesPerGroup,
    nodeTypeCounts,
  },
  fileFanIn: topMap(fanIn, 40),
  fileFanOut: topMap(fanOut, 40),
};

try {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
} catch (e) {
  fail("failed to write output: " + e.message);
}
process.stderr.write("OK: " + fileNodes.length + " file nodes, " + Object.keys(directoryGroups).length + " groups\n");
process.exit(0);

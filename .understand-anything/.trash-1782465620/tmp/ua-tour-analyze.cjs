#!/usr/bin/env node
"use strict";

/**
 * Graph topology analyzer for tour building.
 * Usage: node ua-tour-analyze.js <input.json> <output.json>
 */

const fs = require("fs");

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error("Usage: node ua-tour-analyze.js <input.json> <output.json>");
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const data = JSON.parse(raw);
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const layers = Array.isArray(data.layers) ? data.layers : [];

  const nodeById = new Map();
  for (const n of nodes) nodeById.set(n.id, n);

  // ---- Node summary index ----
  const nodeSummaryIndex = {};
  for (const n of nodes) {
    nodeSummaryIndex[n.id] = {
      name: n.name || "",
      type: n.type || "",
      summary: n.summary || "",
    };
  }

  // ---- Fan-in / Fan-out ----
  const fanIn = new Map();
  const fanOut = new Map();
  for (const n of nodes) {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
  }
  for (const e of edges) {
    if (fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source) + 1);
    if (fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target) + 1);
  }

  const fanInRanking = [...fanIn.entries()]
    .map(([id, fi]) => ({ id, fanIn: fi, name: (nodeById.get(id) || {}).name || "" }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 20);

  const fanOutRanking = [...fanOut.entries()]
    .map(([id, fo]) => ({ id, fanOut: fo, name: (nodeById.get(id) || {}).name || "" }))
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 20);

  // Percentile helpers for entry-point scoring
  const fanOutValues = [...fanOut.values()].sort((a, b) => a - b);
  const fanInValues = [...fanIn.values()].sort((a, b) => a - b);
  function quantile(sortedArr, q) {
    if (sortedArr.length === 0) return 0;
    const idx = Math.floor((sortedArr.length - 1) * q);
    return sortedArr[idx];
  }
  const fanOutTop10Threshold = quantile(fanOutValues, 0.9);
  const fanInBottom25Threshold = quantile(fanInValues, 0.25);

  // ---- Entry point candidates ----
  const codeEntryNames = new Set([
    "index.ts", "index.js", "main.ts", "main.js", "app.ts", "app.js",
    "server.ts", "server.js", "mod.rs", "main.go", "main.py", "main.rs",
    "manage.py", "app.py", "wsgi.py", "asgi.py", "run.py", "__main__.py",
    "Application.java", "Main.java", "Program.cs", "config.ru", "index.php",
    "App.swift", "Application.kt", "main.cpp", "main.c",
    // React / TS frontends commonly bootstrap from these
    "main.tsx", "main.jsx", "App.tsx", "App.jsx", "index.tsx",
  ]);

  function depth(filePath) {
    if (!filePath) return 99;
    return filePath.split("/").length - 1; // number of dir separators
  }

  const entryScores = [];
  for (const n of nodes) {
    let score = 0;
    const name = n.name || "";
    const fp = n.filePath || "";
    const type = n.type || "";

    if (type === "document") {
      // README at project root
      if (/^README\.md$/i.test(name) && depth(fp) === 0) score += 5;
      else if (/\.md$/i.test(name) && depth(fp) === 0) score += 2;
    } else if (type === "file") {
      if (codeEntryNames.has(name)) score += 3;
      const d = depth(fp);
      if (d <= 1) score += 1; // project root or one level deep
      if (fanOut.get(n.id) >= fanOutTop10Threshold && fanOutTop10Threshold > 0) score += 1;
      if (fanIn.get(n.id) <= fanInBottom25Threshold) score += 1;
    }

    if (score > 0) {
      entryScores.push({
        id: n.id,
        score,
        name,
        type,
        filePath: fp,
        summary: n.summary || "",
      });
    }
  }
  entryScores.sort((a, b) => b.score - a.score);
  const entryPointCandidates = entryScores.slice(0, 5).map((e) => ({
    id: e.id,
    score: e.score,
    name: e.name,
    summary: e.summary,
  }));

  // ---- BFS from top CODE entry point ----
  // Find the top code (non-document) entry candidate.
  const topCodeEntry = entryScores.find((e) => e.type !== "document");
  const startNode = topCodeEntry ? topCodeEntry.id : (nodes[0] ? nodes[0].id : null);

  // Build forward adjacency for imports + calls only
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if ((e.type === "imports" || e.type === "calls") && adj.has(e.source)) {
      adj.get(e.source).push(e.target);
    }
  }

  const order = [];
  const depthMap = {};
  if (startNode) {
    const visited = new Set([startNode]);
    const queue = [[startNode, 0]];
    while (queue.length) {
      const [cur, d] = queue.shift();
      order.push(cur);
      depthMap[cur] = d;
      const neighbors = adj.get(cur) || [];
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([nb, d + 1]);
        }
      }
    }
  }
  const byDepth = {};
  for (const id of order) {
    const d = depthMap[id];
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(id);
  }

  // ---- Non-code file inventory ----
  const nonCodeFiles = {
    documentation: [],
    infrastructure: [],
    data: [],
    config: [],
  };
  for (const n of nodes) {
    const entry = { id: n.id, name: n.name || "", summary: n.summary || "" };
    switch (n.type) {
      case "document":
        nonCodeFiles.documentation.push(entry);
        break;
      case "service":
      case "pipeline":
      case "resource":
        nonCodeFiles.infrastructure.push({ ...entry, type: n.type });
        break;
      case "table":
      case "schema":
      case "endpoint":
        nonCodeFiles.data.push({ ...entry, type: n.type });
        break;
      case "config":
        nonCodeFiles.config.push(entry);
        break;
      default:
        break;
    }
  }

  // ---- Tightly coupled clusters ----
  // Find bidirectional pairs (A->B and B->A) on imports/calls, then expand.
  const edgeKeySet = new Set();
  for (const e of edges) {
    if (e.type === "imports" || e.type === "calls" || e.type === "depends_on") {
      edgeKeySet.add(e.source + "||" + e.target);
    }
  }
  // adjacency counting all relationship edges between nodes (undirected weight)
  const pairCount = new Map(); // unorderedKey -> count of edges between the two
  function unordered(a, b) {
    return a < b ? a + "||" + b : b + "||" + a;
  }
  const relTypes = new Set(["imports", "calls", "depends_on", "exports", "contains", "related", "implements", "configures", "tested_by"]);
  for (const e of edges) {
    if (!relTypes.has(e.type)) continue;
    if (e.source === e.target) continue;
    const k = unordered(e.source, e.target);
    pairCount.set(k, (pairCount.get(k) || 0) + 1);
  }

  // Seed clusters from bidirectional import/call pairs
  const bidiPairs = [];
  for (const key of edgeKeySet) {
    const [a, b] = key.split("||");
    if (edgeKeySet.has(b + "||" + a) && a < b) {
      bidiPairs.push([a, b]);
    }
  }

  // Build undirected neighbor map (rel edges)
  const undirNbrs = new Map();
  for (const n of nodes) undirNbrs.set(n.id, new Set());
  for (const e of edges) {
    if (!relTypes.has(e.type)) continue;
    if (e.source === e.target) continue;
    if (undirNbrs.has(e.source)) undirNbrs.get(e.source).add(e.target);
    if (undirNbrs.has(e.target)) undirNbrs.get(e.target).add(e.source);
  }

  const clusters = [];
  const usedInCluster = new Set();
  for (const [a, b] of bidiPairs) {
    if (usedInCluster.has(a) || usedInCluster.has(b)) continue;
    const members = new Set([a, b]);
    // Expand: add nodes connected to 2+ members, up to size 5
    let grew = true;
    while (grew && members.size < 5) {
      grew = false;
      const candidateCounts = new Map();
      for (const m of members) {
        for (const nb of undirNbrs.get(m) || []) {
          if (members.has(nb)) continue;
          candidateCounts.set(nb, (candidateCounts.get(nb) || 0) + 1);
        }
      }
      // pick the best candidate connecting to 2+ members
      let best = null, bestCount = 1;
      for (const [cand, cnt] of candidateCounts) {
        if (cnt >= 2 && cnt > bestCount) {
          best = cand; bestCount = cnt;
        }
      }
      if (best) {
        members.add(best);
        grew = true;
      }
    }
    if (members.size >= 2) {
      // edge count within cluster
      let ec = 0;
      const arr = [...members];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          ec += pairCount.get(unordered(arr[i], arr[j])) || 0;
        }
      }
      clusters.push({ nodes: arr, edgeCount: ec });
      for (const m of members) usedInCluster.add(m);
    }
  }
  clusters.sort((a, b) => b.edgeCount - a.edgeCount);
  const topClusters = clusters.slice(0, 10);

  // ---- Layers ----
  const layerOut = {
    count: layers.length,
    list: layers.map((l) => ({ id: l.id, name: l.name, description: l.description })),
  };

  const result = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal: {
      startNode,
      order: order.slice(0, 200),
      depthMap,
      byDepth,
    },
    nonCodeFiles,
    clusters: topClusters,
    layers: layerOut,
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log("Analysis complete. Start node:", startNode, "| BFS reached:", order.length, "nodes");
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error("FATAL:", err && err.stack ? err.stack : String(err));
  process.exit(1);
}

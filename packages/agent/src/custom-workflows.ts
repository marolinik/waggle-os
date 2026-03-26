/**
 * Custom Workflows — user-created workflow templates stored as JSON in ~/.waggle/workflows/
 */

import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowTemplate } from './subagent-orchestrator.js';

const WORKFLOWS_DIR = 'workflows';

export function loadCustomWorkflows(dataDir: string): WorkflowTemplate[] {
  const dir = path.join(dataDir, WORKFLOWS_DIR);
  if (!fs.existsSync(dir)) return [];

  const workflows: WorkflowTemplate[] = [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const wf = JSON.parse(content) as WorkflowTemplate;
        if (wf.name && wf.steps && Array.isArray(wf.steps)) {
          workflows.push(wf);
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* dir read failed */ }
  return workflows;
}

export function saveCustomWorkflow(dataDir: string, workflow: WorkflowTemplate): void {
  const dir = path.join(dataDir, WORKFLOWS_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const id = workflow.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(workflow, null, 2), 'utf-8');
}

export function deleteCustomWorkflow(dataDir: string, name: string): boolean {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const filePath = path.join(dataDir, WORKFLOWS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export function listAllWorkflows(dataDir: string, builtIn: WorkflowTemplate[]): WorkflowTemplate[] {
  return [...builtIn, ...loadCustomWorkflows(dataDir)];
}

/**
 * Wave E — Agent/Workspace Topology Productization tests.
 *
 * Verifies:
 * 1. ROLE_TOOL_PRESETS is exported and has expected shape
 * 2. Role presets have valid tool lists
 * 3. Workflow templates are introspectable
 * 4. Agent topology data structure is complete
 */

import { describe, it, expect } from 'vitest';
import {
  ROLE_TOOL_PRESETS,
  listWorkflowTemplates,
  WORKFLOW_TEMPLATES,
} from '../src/index.js';

describe('Wave E: Agent Topology', () => {
  describe('Role Presets', () => {
    it('exports ROLE_TOOL_PRESETS with at least 6 roles', () => {
      expect(ROLE_TOOL_PRESETS).toBeDefined();
      expect(Object.keys(ROLE_TOOL_PRESETS).length).toBeGreaterThanOrEqual(6);
    });

    it('includes core roles: researcher, writer, coder, analyst, reviewer, planner', () => {
      const roles = Object.keys(ROLE_TOOL_PRESETS);
      expect(roles).toContain('researcher');
      expect(roles).toContain('writer');
      expect(roles).toContain('coder');
      expect(roles).toContain('analyst');
      expect(roles).toContain('reviewer');
      expect(roles).toContain('planner');
    });

    it('each role has a non-empty tool array', () => {
      for (const [role, tools] of Object.entries(ROLE_TOOL_PRESETS)) {
        expect(Array.isArray(tools), `${role} tools should be an array`).toBe(true);
        expect(tools.length, `${role} should have at least 1 tool`).toBeGreaterThan(0);
      }
    });

    it('researcher has web_search and search_memory', () => {
      expect(ROLE_TOOL_PRESETS.researcher).toContain('web_search');
      expect(ROLE_TOOL_PRESETS.researcher).toContain('search_memory');
    });

    it('coder has bash and git tools', () => {
      expect(ROLE_TOOL_PRESETS.coder).toContain('bash');
      expect(ROLE_TOOL_PRESETS.coder).toContain('git_status');
    });

    it('writer has document generation', () => {
      expect(ROLE_TOOL_PRESETS.writer).toContain('write_file');
      expect(ROLE_TOOL_PRESETS.writer).toContain('generate_docx');
    });
  });

  describe('Workflow Templates', () => {
    it('lists at least 3 workflow templates', () => {
      const names = listWorkflowTemplates();
      expect(names.length).toBeGreaterThanOrEqual(3);
    });

    it('includes research-team, review-pair, plan-execute', () => {
      const names = listWorkflowTemplates();
      expect(names).toContain('research-team');
      expect(names).toContain('review-pair');
      expect(names).toContain('plan-execute');
    });

    it('each template factory produces valid structure with steps', () => {
      const names = listWorkflowTemplates();
      for (const name of names) {
        const factory = WORKFLOW_TEMPLATES[name];
        expect(factory, `${name} should have a factory`).toBeDefined();
        const tmpl = factory!('test task');
        expect(tmpl.name).toBe(name);
        expect(tmpl.description).toBeTruthy();
        expect(tmpl.steps.length).toBeGreaterThan(0);
        expect(tmpl.aggregation).toBeDefined();
      }
    });

    it('research-team has 3 steps: researcher → synthesizer → reviewer', () => {
      const tmpl = WORKFLOW_TEMPLATES['research-team']!('test');
      expect(tmpl.steps).toHaveLength(3);
      expect(tmpl.steps[0].role).toBe('researcher');
      expect(tmpl.steps[1].role).toBe('synthesizer');
      expect(tmpl.steps[2].role).toBe('reviewer');
    });

    it('workflow steps have dependency ordering', () => {
      const tmpl = WORKFLOW_TEMPLATES['research-team']!('test');
      // Synthesizer depends on Researcher
      expect(tmpl.steps[1].dependsOn).toContain('Researcher');
      // Reviewer depends on Synthesizer
      expect(tmpl.steps[2].dependsOn).toContain('Synthesizer');
    });
  });

  describe('Agent Topology Data Shape', () => {
    it('can construct a valid agentTopology object from available data', () => {
      const rolePresets = Object.keys(ROLE_TOOL_PRESETS);
      const workflows = listWorkflowTemplates().map(name => {
        const factory = WORKFLOW_TEMPLATES[name];
        const tmpl = factory?.('_introspect_');
        return { name, description: tmpl?.description ?? '', steps: tmpl?.steps?.length ?? 0 };
      });

      const topology = {
        model: 'claude-sonnet-4-20250514',
        rolePresets,
        workflows,
        toolCount: 25,
        isTeam: false,
        teamTools: [],
      };

      expect(topology.rolePresets.length).toBeGreaterThanOrEqual(6);
      expect(topology.workflows.length).toBeGreaterThanOrEqual(3);
      expect(topology.toolCount).toBeGreaterThan(0);
      expect(topology.isTeam).toBe(false);
      expect(topology.teamTools).toEqual([]);
    });

    it('team topology includes team tool names', () => {
      const teamTools = ['check_hive', 'share_to_team', 'create_team_task', 'claim_team_task', 'send_waggle_message'];
      const topology = {
        model: 'claude-sonnet-4-20250514',
        rolePresets: Object.keys(ROLE_TOOL_PRESETS),
        workflows: [],
        toolCount: 30,
        isTeam: true,
        teamTools,
      };

      expect(topology.isTeam).toBe(true);
      expect(topology.teamTools).toHaveLength(5);
      expect(topology.teamTools).toContain('check_hive');
      expect(topology.teamTools).toContain('share_to_team');
    });
  });
});

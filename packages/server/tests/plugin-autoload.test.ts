import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';

/**
 * Plugin auto-load on startup tests.
 *
 * Verifies that the server scans ~/.waggle/plugins/ at boot and loads
 * plugins with valid plugin.json manifests into the PluginRuntimeManager.
 */

function createTmpDataDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-plugin-autoload-'));
  // Create personal.mind so the server can boot
  const personalPath = path.join(tmpDir, 'personal.mind');
  const mind = new MindDB(personalPath);
  const sessions = new SessionStore(mind);
  const frames = new FrameStore(mind);
  const s = sessions.create('boot-test');
  frames.createIFrame(s.gop_id, 'boot test', 'normal');
  mind.close();
  return tmpDir;
}

describe('Plugin auto-load on startup', () => {
  describe('no plugins directory', () => {
    let server: FastifyInstance;
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = createTmpDataDir();
      // Deliberately do NOT create plugins/ dir
      server = await buildLocalServer({ dataDir: tmpDir });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('starts without error when plugins directory does not exist', () => {
      expect(server).toBeDefined();
    });

    it('has zero active plugins', () => {
      const active = server.agentState.pluginRuntimeManager.getActive();
      expect(active).toHaveLength(0);
    });
  });

  describe('empty plugins directory', () => {
    let server: FastifyInstance;
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = createTmpDataDir();
      fs.mkdirSync(path.join(tmpDir, 'plugins'), { recursive: true });
      server = await buildLocalServer({ dataDir: tmpDir });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('starts without error with empty plugins directory', () => {
      expect(server).toBeDefined();
    });

    it('has zero active plugins', () => {
      const active = server.agentState.pluginRuntimeManager.getActive();
      expect(active).toHaveLength(0);
    });
  });

  describe('valid plugin with plugin.json', () => {
    let server: FastifyInstance;
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = createTmpDataDir();
      const pluginDir = path.join(tmpDir, 'plugins', 'test-greeter');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'test-greeter',
        version: '1.0.0',
        description: 'A test greeting plugin',
        skills: ['greet'],
        tools: [
          {
            name: 'greet',
            description: 'Greet a user',
            parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          },
        ],
      }));
      server = await buildLocalServer({ dataDir: tmpDir });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads the plugin and marks it active', () => {
      const active = server.agentState.pluginRuntimeManager.getActive();
      expect(active).toHaveLength(1);
      expect(active[0].getManifest().name).toBe('test-greeter');
    });

    it('registers plugin tools', () => {
      const tools = server.agentState.pluginRuntimeManager.getAllTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('greet');
    });

    it('registers plugin skills', () => {
      const skills = server.agentState.pluginRuntimeManager.getAllSkills();
      expect(skills).toContain('greet');
    });
  });

  describe('directory without plugin.json is skipped', () => {
    let server: FastifyInstance;
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = createTmpDataDir();
      // Create a plugin dir with no manifest
      const noManifest = path.join(tmpDir, 'plugins', 'broken-plugin');
      fs.mkdirSync(noManifest, { recursive: true });
      fs.writeFileSync(path.join(noManifest, 'README.md'), '# not a plugin');
      server = await buildLocalServer({ dataDir: tmpDir });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('starts without error', () => {
      expect(server).toBeDefined();
    });

    it('has zero active plugins', () => {
      const active = server.agentState.pluginRuntimeManager.getActive();
      expect(active).toHaveLength(0);
    });
  });

  describe('invalid manifest is skipped gracefully', () => {
    let server: FastifyInstance;
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = createTmpDataDir();
      const pluginDir = path.join(tmpDir, 'plugins', 'bad-manifest');
      fs.mkdirSync(pluginDir, { recursive: true });
      // Missing required 'version' and 'description' fields
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'bad-manifest',
      }));
      server = await buildLocalServer({ dataDir: tmpDir });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('starts without error', () => {
      expect(server).toBeDefined();
    });

    it('does not load the invalid plugin', () => {
      const active = server.agentState.pluginRuntimeManager.getActive();
      expect(active).toHaveLength(0);
    });
  });

  describe('multiple plugins — valid + invalid mix', () => {
    let server: FastifyInstance;
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = createTmpDataDir();
      const pluginsBase = path.join(tmpDir, 'plugins');

      // Valid plugin
      const good = path.join(pluginsBase, 'good-plugin');
      fs.mkdirSync(good, { recursive: true });
      fs.writeFileSync(path.join(good, 'plugin.json'), JSON.stringify({
        name: 'good-plugin',
        version: '2.0.0',
        description: 'A good plugin',
      }));

      // Invalid plugin (malformed JSON)
      const bad = path.join(pluginsBase, 'malformed');
      fs.mkdirSync(bad, { recursive: true });
      fs.writeFileSync(path.join(bad, 'plugin.json'), '{ not valid json');

      // Another valid plugin
      const good2 = path.join(pluginsBase, 'another-good');
      fs.mkdirSync(good2, { recursive: true });
      fs.writeFileSync(path.join(good2, 'plugin.json'), JSON.stringify({
        name: 'another-good',
        version: '1.0.0',
        description: 'Another good plugin',
        skills: ['analyze'],
      }));

      server = await buildLocalServer({ dataDir: tmpDir });
    });

    afterAll(async () => {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads only the valid plugins', () => {
      const active = server.agentState.pluginRuntimeManager.getActive();
      expect(active).toHaveLength(2);
      const names = active.map(p => p.getManifest().name).sort();
      expect(names).toEqual(['another-good', 'good-plugin']);
    });

    it('aggregates skills from all loaded plugins', () => {
      const skills = server.agentState.pluginRuntimeManager.getAllSkills();
      expect(skills).toContain('analyze');
    });
  });
});

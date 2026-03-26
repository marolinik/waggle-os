/**
 * Plugin manifest types and validation for the Waggle plugin system.
 */

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  skills?: string[];
  mcpServers?: Array<{ name: string; command: string; args?: string[] }>;
  settingsSchema?: Record<string, unknown>;
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a plugin manifest object, ensuring required fields are present
 * and have the correct types.
 */
export function validatePluginManifest(manifest: Record<string, unknown>): ManifestValidation {
  const errors: string[] = [];

  // Required string fields
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    errors.push('name is required and must be a non-empty string');
  }

  if (typeof manifest.version !== 'string' || manifest.version.trim() === '') {
    errors.push('version is required and must be a non-empty string');
  }

  if (typeof manifest.description !== 'string' || manifest.description.trim() === '') {
    errors.push('description is required and must be a non-empty string');
  }

  // Optional fields type checks
  if (manifest.skills !== undefined) {
    if (!Array.isArray(manifest.skills)) {
      errors.push('skills must be an array of strings');
    } else if (!manifest.skills.every((s: unknown) => typeof s === 'string')) {
      errors.push('skills must be an array of strings');
    }
  }

  if (manifest.mcpServers !== undefined) {
    if (!Array.isArray(manifest.mcpServers)) {
      errors.push('mcpServers must be an array');
    } else {
      for (let i = 0; i < manifest.mcpServers.length; i++) {
        const server = manifest.mcpServers[i] as Record<string, unknown>;
        if (typeof server !== 'object' || server === null) {
          errors.push(`mcpServers[${i}] must be an object`);
          continue;
        }
        if (typeof server.name !== 'string' || (server.name as string).trim() === '') {
          errors.push(`mcpServers[${i}].name is required and must be a non-empty string`);
        }
        if (typeof server.command !== 'string' || (server.command as string).trim() === '') {
          errors.push(`mcpServers[${i}].command is required and must be a non-empty string`);
        }
        if (server.args !== undefined) {
          if (!Array.isArray(server.args) || !server.args.every((a: unknown) => typeof a === 'string')) {
            errors.push(`mcpServers[${i}].args must be an array of strings`);
          }
        }
      }
    }
  }

  if (manifest.settingsSchema !== undefined) {
    if (typeof manifest.settingsSchema !== 'object' || manifest.settingsSchema === null || Array.isArray(manifest.settingsSchema)) {
      errors.push('settingsSchema must be an object');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

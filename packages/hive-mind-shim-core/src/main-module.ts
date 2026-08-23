import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Return true when a module is the process entrypoint on the current OS. */
export function isDirectExecution(
  moduleUrl: string,
  argvPath: string | undefined = process.argv[1],
): boolean {
  if (!argvPath) return false;
  try {
    const modulePath = resolve(fileURLToPath(moduleUrl));
    const entryPath = resolve(argvPath);
    return process.platform === 'win32'
      ? modulePath.toLowerCase() === entryPath.toLowerCase()
      : modulePath === entryPath;
  } catch {
    return false;
  }
}

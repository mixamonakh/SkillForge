import { readdir } from 'node:fs/promises';
import path from 'node:path';

const workingDirectory = process.cwd();
export const projectRoot =
  path.basename(path.dirname(workingDirectory)) === 'packages'
    ? path.resolve(workingDirectory, '../..')
    : path.resolve(workingDirectory);
export const packsRoot = path.join(projectRoot, 'content', 'packs');

export function readOption(name: string): string | undefined {
  const args = process.argv.slice(2);
  const optionIndex = args.indexOf(name);
  if (optionIndex < 0) {
    return undefined;
  }
  const value = args[optionIndex + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Для ${name} требуется значение`);
  }
  return value;
}

export function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

export function resolvePackPath(packName: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(packName)) {
    throw new Error(`Некорректное имя content pack: ${packName}`);
  }
  return path.join(packsRoot, packName);
}

export async function listPackPaths(selectedPack?: string): Promise<string[]> {
  if (selectedPack !== undefined) {
    return [resolvePackPath(selectedPack)];
  }
  const entries = await readdir(packsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => resolvePackPath(entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function reportCliError(error: unknown): void {
  if (error !== null && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: unknown }).issues;
    const message = error instanceof Error ? error.message : 'Ошибка валидации контента';
    process.stderr.write(`${JSON.stringify({ error: message, issues }, null, 2)}\n`);
  } else {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exitCode = 1;
}

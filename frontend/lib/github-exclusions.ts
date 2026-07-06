// Mirrors oracle/src/github/exclusions.ts — same "GitHub fetch scope" convention
// from CLAUDE.md: node_modules, .git, build artifacts, lockfiles, binary/image files.
const EXCLUDED_DIR_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'target',
  'out',
  'bin',
  'obj',
  'vendor',
  '.venv',
  '__pycache__',
]);

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Gemfile.lock',
  'poetry.lock',
  'Cargo.lock',
  'composer.lock',
  'Pipfile.lock',
  'go.sum',
  'mix.lock',
  'Podfile.lock',
  'packages.lock.json',
  'flake.lock',
]);

const BINARY_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.svg',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.zip', '.tar', '.gz', '.7z',
  '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mp3', '.mov',
  '.wasm', '.class', '.jar', '.pyc',
]);

export function isExcludedPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment))) return true;

  const fileName = segments[segments.length - 1] ?? '';
  if (LOCKFILE_NAMES.has(fileName)) return true;

  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = fileName.slice(dotIndex).toLowerCase();
    if (BINARY_IMAGE_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

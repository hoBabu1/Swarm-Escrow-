// Exclusion rules from CLAUDE.md's "GitHub fetch scope": node_modules, .git,
// build artifacts, lockfiles, and binary/image files. CLAUDE.md names these
// categories but not exact patterns, so this is a reasonable concrete
// mapping of each category, reusing the same build-output directory names
// already established for this monorepo in the root .gitignore.
const EXCLUDED_DIR_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "target",
  "out",
  "bin",
  "obj",
  "vendor",
  ".venv",
  "__pycache__",
]);

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "composer.lock",
  "Pipfile.lock",
  "go.sum",
  "mix.lock",
  "Podfile.lock",
  "packages.lock.json",
  "flake.lock",
]);

const BINARY_IMAGE_EXTENSIONS = new Set([
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".svg",
  // archives / binaries / fonts / media
  ".exe", ".dll", ".so", ".dylib", ".bin", ".zip", ".tar", ".gz", ".7z",
  ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mp3", ".mov",
  ".wasm", ".class", ".jar", ".pyc",
]);

export function isExcludedPath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment))) return true;

  const fileName = segments[segments.length - 1] ?? "";
  if (LOCKFILE_NAMES.has(fileName)) return true;

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex !== -1) {
    const ext = fileName.slice(dotIndex).toLowerCase();
    if (BINARY_IMAGE_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

import path from 'node:path';
import fs from 'node:fs';
import decompiler from '../src/lib/usecode-decompiler.js';

if (process.argv.length < 4) {
  console.error('Usage: node test-decompile.mjs <input-flx> <out-root>');
  process.exit(2);
}

const input = process.argv[2];
const out = process.argv[3];

if (!fs.existsSync(input)) {
  console.error('Input not found:', input);
  process.exit(3);
}

fs.mkdirSync(out, { recursive: true });
try {
  const cacheId = path.basename(path.resolve(out)).replace(/[^a-zA-Z0-9_-]/g, "_") || "test";
  const fakeGameConfig = {
    id: cacheId,
    gameId: 'remorse',
    catalogId: 'remorse',
    staticDir: path.dirname(input),
    fallbackStaticDirs: [],
    usecodeFileName: path.basename(input)
  };
  const result = decompiler.ensureGameUsecodeCache(fakeGameConfig);
  if (result && result.cacheRoot && out !== result.cacheRoot) {
    fs.cpSync(result.cacheRoot, out, { recursive: true });
  }
  console.log('Decompile result:', JSON.stringify(result, null, 2));
  process.exit(0);
} catch (e) {
  console.error('Decompile failed:', e && e.stack ? e.stack : String(e));
  process.exit(4);
}

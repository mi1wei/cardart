import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

if (process.platform !== 'darwin') throw new Error('Fixture regeneration uses macOS ImageIO and Swift; the app runtime does not.');
const root = fileURLToPath(new URL('../tests/fixtures/photos/', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'folio-fixture-'));
try {
  const png = join(temp, 'source.png');
  await sharp(join(root, 'source.svg')).removeAlpha().png().toFile(png);
  await sharp(png).rotate(180).png().toFile(join(temp, 'secondary.png'));
  execFileSync('/usr/bin/xcrun', ['swift', fileURLToPath(new URL('./heic-fixtures.swift', import.meta.url)), temp, root], { stdio: 'inherit' });
} finally { await rm(temp, { recursive: true, force: true }); }

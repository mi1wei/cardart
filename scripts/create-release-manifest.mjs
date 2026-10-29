import { createWriteStream } from 'node:fs';
import { appendFile, readFile, readdir, lstat, mkdir, mkdtemp, rename, rm, cp, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { fileDigest, releaseTargets, verifyCandidateFiles } from './verify-release.mjs';
import { readBuildIdentity } from './release-identity.cjs';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const run = promisify(execFile);

export function validateReleaseIdentity({ version, tag, sourceCommit }) {
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(version)) throw new Error('Only explicit beta prerelease versions are supported');
  if (tag !== `v${version}`) throw new Error('Release tag must match the application version exactly');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A full source commit is required');
  return { version, tag, sourceCommit };
}

export function readTaggedReleaseIdentity({ root = project, tag, sourceCommit }) {
  const identity = readBuildIdentity({ root, env: { RELEASE_TAG: tag, SOURCE_COMMIT: sourceCommit } });
  return validateReleaseIdentity(identity);
}

export async function createReleaseManifest({ input, output, root = project, version, tag, sourceCommit } = {}) {
  validateReleaseIdentity({ version, tag, sourceCommit });
  if (!input || !output) throw new Error('Explicit candidate input and release output directories are required');
  input = resolve(input);
  output = resolve(output);
  if (output === input || output.startsWith(input + sep)) throw new Error('Release output must not overwrite candidate inputs');
  try { await lstat(output); throw new Error('Refusing to overwrite an existing release whitelist'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const candidates = [];
  const entries = await readdir(input, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Unexpected candidate input outside target directories');
    const folder = join(input, entry.name);
    const reportFile = join(folder, 'candidate-report.json');
    let reportInfo;
    try { reportInfo = await lstat(reportFile); }
    catch (error) { if (error.code === 'ENOENT') throw new Error(`Missing native target report: ${entry.name}`); throw error; }
    if (!reportInfo.isFile() || reportInfo.isSymbolicLink()) throw new Error('Candidate report must not be a symlink');
    const report = JSON.parse(await readFile(reportFile, 'utf8'));
    if (candidates.some((candidate) => candidate.report.target === report.target)) throw new Error('Duplicate candidate target');
    candidates.push({ folder, report });
  }
  if (candidates.length !== releaseTargets.length || releaseTargets.some((target) => !candidates.some((entry) => entry.report.target === target))) throw new Error('Exactly the supported native target candidates are required');
  candidates.sort((a, b) => a.report.target.localeCompare(b.report.target, 'en'));
  for (const candidate of candidates) candidate.legal = await verifyCandidateFiles({ ...candidate, root, version, tag, sourceCommit });
  await mkdir(dirname(output), { recursive: true });
  const stage = await mkdtemp(join(dirname(output), '.release-whitelist-'));
  try {
    const artifacts = [];
    for (const candidate of candidates) {
      for (const file of candidate.report.files.filter((file) => file.role !== 'licenses')) {
        if (artifacts.some((entry) => entry.name === file.name)) throw new Error('Duplicate release artifact filename');
        await cp(join(candidate.folder, file.name), join(stage, file.name), { errorOnExist: true, force: false });
        artifacts.push({ ...file, target: candidate.report.target, signing: candidate.report.signing, notarized: false });
      }
    }
    const licenses = `Folio-${version}-third-party-licenses.zip`;
    const zip = new yazl.ZipFile();
    const finished = pipeline(zip.outputStream, createWriteStream(join(stage, licenses), { flags: 'wx' }));
    for (const candidate of candidates) {
      for (const [name, bytes] of [...candidate.legal.files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
        zip.addBuffer(bytes, `${candidate.report.target}/${name}`, { mtime: new Date('1980-01-01T00:00:00Z'), mode: 0o100644 });
      }
    }
    zip.end();
    await finished;
    artifacts.push({ ...(await fileDigest(join(stage, licenses))), role: 'licenses', targets: releaseTargets });
    artifacts.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const manifest = {
      schemaVersion: 1, product: 'Folio', version, tag, sourceCommit, notarized: false,
      distributionApproved: true,
      targets: candidates.map(({ report }) => ({ target: report.target, signing: report.signing, notarized: false, checks: report.checks, legalInputsDigest: report.legalInputsDigest })),
      artifacts,
      acceptance: {
        cleanDevices: false, windowsUacFirewall: false, windowsTwoVersionUpgrade: false,
        minimumOperatingSystems: false, physicalPhones: false, publicUpdateFeed: false,
      },
    };
    const notes = [
      `# Folio ${version} (unsigned beta)`, '',
      `Source commit: ${sourceCommit}`, '',
      'Windows x64: unsigned per-machine NSIS; UAC and unknown-publisher/SmartScreen prompts may apply.',
      'macOS Apple Silicon (arm64): ad-hoc DMG; not notarized. Intel Macs are not currently supported. Do not disable system protections.',
      'Obtain a signed Folio JSON license privately. No valid license or expiry means read-only; originals are preserved.',
      'Closing the window keeps the tray/service alive; choose Quit to stop phone access.',
      'Windows updates require separate download/install confirmation. Mac updates are manual replacement after Quit.',
      'Back up the library before upgrades. No system service, login auto-start, cloud sync or payments are included.',
      'Native CI checks are not clean-device, minimum-OS, physical-phone, UAC/firewall or two-version-upgrade acceptance.',
      'This draft does not certify a public update feed. Publication requires protected human approval and exact-file acceptance.',
      '',
    ].join('\n');
    await writeFile(join(stage, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(stage, 'release-notes.md'), notes);
    const sums = [];
    for (const name of (await readdir(stage)).sort()) sums.push(`${(await fileDigest(join(stage, name))).sha256}  ${name}`);
    await writeFile(join(stage, 'SHA256SUMS'), sums.join('\n') + '\n');
    await rename(stage, output);
    return manifest;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      input: { type: 'string' }, output: { type: 'string' }, tag: { type: 'string' },
      commit: { type: 'string' }, 'github-output': { type: 'string' },
    } });
    const sourceCommit = values.commit || (await run('git', ['rev-parse', 'HEAD'], { cwd: project })).stdout.trim();
    const identity = readTaggedReleaseIdentity({ tag: values.tag, sourceCommit });
    if (positionals[0] === 'identity' && positionals.length === 1) {
      const tagged = (await run('git', ['rev-parse', `refs/tags/${identity.tag}^{commit}`], { cwd: project })).stdout.trim();
      if (tagged !== sourceCommit) throw new Error('Tag does not point at the checked out source commit');
      if (values['github-output']) await appendFile(values['github-output'], `version=${identity.version}\ntag=${identity.tag}\nsource_commit=${identity.sourceCommit}\n`);
      console.log(JSON.stringify(identity));
    } else {
      if (positionals.length) throw new Error('Unknown release command');
      console.log(JSON.stringify(await createReleaseManifest({ input: values.input, output: values.output, ...identity })));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

export async function writeJson(file, data, suffix = '.tmp') {
  const handle = await open(`${file}${suffix}`, 'w');
  try { await handle.writeFile(JSON.stringify(data, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  await rename(`${file}${suffix}`, file);
}

export async function exists(file) {
  try { await stat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Before commit, every destructive file operation is reversible. After commit,
// only cleanup remains. Recovery uses the same durable decision as live rollback.
export async function transactions(root) {
  const folder = join(root, '.transactions');
  await mkdir(folder, { recursive: true });
  const path = (name) => {
    if (typeof name !== 'string' || isAbsolute(name) || name.split(/[\\/]/).some((part) => !part || part === '..' || part === '.')) {
      throw new Error('Invalid library transaction path');
    }
    return join(root, name);
  };
  const local = (file) => {
    const name = relative(root, file);
    path(name);
    return name;
  };
  let recoveryError;
  const assertHealthy = () => { if (recoveryError) throw recoveryError; };
  async function rollback(journal) {
    for (const operation of [...journal.operations].reverse()) {
      const source = path(operation.from);
      const target = path(operation.to);
      if (operation.type === 'copy') await rm(target, { force: true });
      else if (await exists(target)) {
        if (await exists(source)) throw new Error(`Transaction rollback collision: ${operation.from}`);
        await mkdir(dirname(source), { recursive: true });
        await rename(target, source);
      }
    }
    for (const album of journal.before) {
      const file = path(`albums/${album.id}/album.json`);
      // A separate staging name also works when the failed write's .tmp is blocked.
      await writeJson(file, album, '.rollback');
    }
    for (const id of journal.createdAlbums) await rm(path(`albums/${id}`), { recursive: true, force: true });
    for (const entry of journal.entries) await rm(path(`.trash/${entry.id}`), { recursive: true, force: true });
  }
  async function cleanup(journal) {
    for (const file of journal.cleanup) await rm(path(file), { recursive: true, force: true });
  }
  for (const id of await readdir(folder)) {
    const directory = join(folder, id);
    const file = join(directory, 'journal.json');
    if (!await exists(file)) {
      // No journal means no file operation could have begun.
      await rm(directory, { recursive: true, force: true });
      continue;
    }
    const journal = JSON.parse(await readFile(file, 'utf8'));
    if (journal.version !== 1 || !['prepared', 'committed'].includes(journal.state)) throw new Error(`Invalid transaction journal ${id}`);
    if (journal.state === 'committed') await cleanup(journal);
    else await rollback(journal);
    await rm(directory, { recursive: true, force: true });
  }
  return {
    assertHealthy,
    async run({ before = [], after = [], operations = [], entries = [], cleanup: garbage = [], createdAlbums = [] }, commit) {
      assertHealthy();
      const directory = join(folder, randomUUID());
      await mkdir(directory);
      const file = join(directory, 'journal.json');
      const journal = {
        version: 1, state: 'prepared', before, after, entries, createdAlbums,
        operations: operations.map((operation) => ({ ...operation, from: local(operation.from), to: local(operation.to) })),
        cleanup: garbage.map(local),
      };
      await writeJson(file, journal);
      let committed = false;
      try {
        for (const id of createdAlbums) {
          for (const sub of ['originals', 'cache']) await mkdir(path(`albums/${id}/${sub}`), { recursive: true });
        }
        for (const operation of journal.operations) {
          const target = path(operation.to);
          await mkdir(dirname(target), { recursive: true });
          if (operation.type === 'copy') await copyFile(path(operation.from), target, constants.COPYFILE_EXCL);
          else {
            if (await exists(target)) throw new Error(`Transaction destination exists: ${operation.to}`);
            await rename(path(operation.from), target);
          }
        }
        for (const entry of entries) {
          const file = path(`.trash/${entry.id}/entry.json`);
          await mkdir(dirname(file), { recursive: true });
          await writeJson(file, entry);
        }
        for (const album of after) if (album) await writeJson(path(`albums/${album.id}/album.json`), album);
        await writeJson(file, { ...journal, state: 'committed' });
        committed = true;
        commit();
        await cleanup(journal);
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        if (committed) {
          console.error('Library transaction committed; cleanup will retry on next open', directory, error);
          return;
        }
        try { await rollback(journal); await rm(directory, { recursive: true, force: true }); }
        catch (rollbackError) {
          console.error('Library transaction rollback failed; journal retained for recovery', directory, rollbackError);
          recoveryError = Object.assign(new Error('library-recovery-required'), { code: 'LIBRARY_RECOVERY_REQUIRED', status: 503 });
          throw new AggregateError([error, rollbackError], 'Library transaction failed; recovery required');
        }
        throw error;
      }
    },
  };
}

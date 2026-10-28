function createUpdateController({ platform, packaged = false, updater, requestShutdown, showDialog, openReleasePage, onChange, log = () => {} }) {
  const automatic = platform === 'win32' && packaged;
  let state = { phase: platform === 'darwin' ? 'manual' : automatic ? 'idle' : 'development' };
  let candidate;
  let checking;
  let downloading;
  let installing;
  let downloadingVersion;
  const status = () => ({ ...state });
  function setState(next) { state = next; onChange?.(status()); }
  function fail(error, retry, terminal = false) {
    log(`Update ${retry} failed: ${error?.message || 'unknown error'}`);
    setState({ phase: 'error', retry, terminal, ...(candidate ? { version: candidate.version } : {}) });
  }
  async function manual() {
    if (platform !== 'darwin') { await showDialog({ kind: 'development' }); return status(); }
    if (await showDialog({ kind: 'manual' })) await openReleasePage();
    return status();
  }
  if (automatic) {
    if (!updater) throw new Error('A packaged Windows updater is required');
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = true;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.on('checking-for-update', () => { if (!downloading && !installing) setState({ phase: 'checking' }); });
    updater.on('update-available', (info) => {
      if (state.phase !== 'checking') return;
      if (typeof info?.version !== 'string' || info.version.length > 128) return fail(new Error('Invalid update version'), 'check');
      candidate = { version: info.version };
      setState({ phase: 'available', ...candidate });
    });
    updater.on('update-not-available', () => { if (state.phase === 'checking') { candidate = null; setState({ phase: 'idle' }); } });
    updater.on('download-progress', (progress) => {
      if (state.phase === 'downloading' && Number.isFinite(progress?.percent)) setState({ ...state, percent: Math.min(100, Math.max(0, progress.percent)) });
    });
    updater.on('update-downloaded', (info) => {
      if (state.phase !== 'downloading' || !downloadingVersion) return;
      if (info?.version !== downloadingVersion) return fail(new Error('Downloaded version differs from the checked update'), 'download');
      setState({ phase: 'downloaded', version: downloadingVersion });
    });
    updater.on('error', (error) => fail(error, downloadingVersion ? 'download' : 'check', state.phase === 'installing' || state.terminal === true));
  }
  function check({ interactive = true } = {}) {
    if (!automatic) return manual();
    if (checking) return checking;
    if (downloading || installing || state.terminal) return Promise.resolve(status());
    checking = Promise.resolve().then(async () => {
      candidate = null;
      setState({ phase: 'checking' });
      try {
        await updater.checkForUpdates();
        if (state.phase === 'checking') setState({ phase: 'idle' });
        if (interactive) await showDialog({ kind: state.phase === 'available' ? 'available' : state.phase === 'error' ? 'error' : 'current', version: state.version });
      } catch (error) {
        fail(error, 'check');
        if (interactive) await showDialog({ kind: 'error' });
      }
      return status();
    }).finally(() => { checking = null; });
    return checking;
  }
  function download() {
    if (!automatic) return manual();
    if (downloading) return downloading;
    if (!candidate || !['available', 'error'].includes(state.phase) || state.terminal) return Promise.resolve(status());
    downloading = Promise.resolve().then(async () => {
      if (!(await showDialog({ kind: 'download', version: candidate.version }))) return status();
      downloadingVersion = candidate.version;
      setState({ phase: 'downloading', version: downloadingVersion, percent: 0 });
      try {
        await updater.downloadUpdate();
        if (state.phase !== 'downloaded') throw new Error('The update has not completed verification');
      } catch (error) {
        fail(error, 'download');
        await showDialog({ kind: 'error' });
      } finally { downloadingVersion = null; }
      return status();
    }).finally(() => { downloading = null; });
    return downloading;
  }
  function install() {
    if (!automatic) return manual();
    if (installing) return installing;
    if (state.phase !== 'downloaded') return Promise.resolve(status());
    installing = Promise.resolve().then(async () => {
      if (!(await showDialog({ kind: 'install', version: state.version }))) return status();
      setState({ phase: 'installing', version: state.version });
      try {
        await requestShutdown({ reason: 'update' });
        updater.quitAndInstall(false, true);
        if (state.phase === 'error') await showDialog({ kind: 'error', terminal: true });
      } catch (error) {
        fail(error, 'install', true);
        await showDialog({ kind: 'error', terminal: true });
      }
      return status();
    }).finally(() => { if (state.phase !== 'installing') installing = null; });
    return installing;
  }
  return { status, check, download, install };
}
module.exports = { createUpdateController };

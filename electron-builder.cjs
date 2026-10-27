const { join } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Arch } = require('electron-builder');

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
const internalTest = process.env.FOLIO_DESKTOP_INTERNAL_TEST === '1';
const packed = [];

module.exports = {
  appId: 'io.github.mi1wei.folio',
  productName: 'Folio',
  directories: { output: internalTest ? 'release/internal' : 'release' },
  files: [
    'desktop/**/*', 'server/**/*', 'package.json',
    '!**/*.test.{js,cjs,mjs}', '!**/fixtures/**', '!**/*.private.*',
    '!**/*-private.*', '!**/.env*',
  ],
  extraResources: [
    { from: 'dist', to: 'web' },
    { from: 'release/legal', to: 'legal' },
  ],
  asar: true,
  asarUnpack: [
    '**/node_modules/sharp/**/*',
    '**/node_modules/@img/**/*',
    '**/node_modules/libheif-js/**/*',
  ],
  npmRebuild: false,
  removePackageScripts: true,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: internalTest,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'public/favicon.ico',
    artifactName: 'Folio-${version}-windows-${arch}-setup.${ext}',
    requestedExecutionLevel: 'asInvoker',
    signAndEditExecutable: true,
    signExecutable: false,
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    include: 'build/installer.nsh',
    packElevateHelper: true,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
    runAfterFinish: false,
    installerLanguages: ['en_US', 'zh_CN'],
  },
  mac: {
    target: ['dmg'],
    icon: 'public/icons/folio.icns',
    artifactName: 'Folio-${version}-macos-${arch}.${ext}',
    minimumSystemVersion: '13.0',
    category: 'public.app-category.photography',
    identity: '-',
    hardenedRuntime: false,
    notarize: false,
    publish: null,
    extendInfo: {
      NSLocalNetworkUsageDescription: 'Folio uses the local network to let your phone view and upload photos. 册页需要访问局域网，让手机查看和上传照片。',
    },
  },
  dmg: { sign: false },
  publish: { provider: 'github', owner: 'mi1wei', repo: 'cardart', channel: 'beta', releaseType: 'prerelease' },
  async beforePack(context) {
    const root = context.packager.projectDir;
    const platform = context.electronPlatformName;
    const arch = Arch[context.arch];
    const { validateSourceInputs } = await import('./scripts/verify-package.mjs');
    await validateSourceInputs({ root, platform, arch });
    await promisify(execFile)(process.execPath, [join(root, 'scripts/check-runtime.mjs'), '--platform', platform, '--arch', arch], {
      cwd: root, env: { ...process.env, SHARP_IGNORE_GLOBAL_LIBVIPS: '1' },
    });
    const { generateNotices } = await import('./scripts/third-party-notices.mjs');
    const { inventory } = await generateNotices({ root });
    if (!inventory.readyForDistribution) console.warn('Local candidate only: third-party/source/codec distribution review remains pending.');
  },
  afterPack(context) {
    packed.push({
      root: context.packager.projectDir,
      appDir: context.electronPlatformName === 'darwin' ? join(context.appOutDir, 'Folio.app') : context.appOutDir,
      platform: context.electronPlatformName,
      arch: Arch[context.arch],
      internalTest,
      requireInstallerResources: context.targets.some((target) => target.name === 'nsis'),
    });
  },
  async afterAllArtifactBuild() {
    const { verifyPackage } = await import('./scripts/verify-package.mjs');
    for (const options of packed) await verifyPackage(options);
  },
};

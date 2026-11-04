export const COMMANDS = Object.freeze([
  'new-album', 'add-photos', 'import-folder', 'export-pdf', 'settings', 'license', 'shortcuts',
  'appearance-light', 'appearance-dark', 'appearance-auto', 'density-s', 'density-m', 'density-l',
]);

export function normalizeContext(value) {
  if (!value || !['albums', 'album', 'trash', 'license'].includes(value.page) ||
      typeof value.busy !== 'boolean' || !['light', 'dark', 'auto'].includes(value.appearance) ||
      !['s', 'm', 'l'].includes(value.density)) return null;
  return { page: value.page, busy: value.busy, appearance: value.appearance, density: value.density };
}

export function commandAllowed(name, context, writable) {
  if (!COMMANDS.includes(name) || !context) return false;
  if (name.startsWith('appearance-') || ['settings', 'shortcuts'].includes(name)) return true;
  if (name.startsWith('density-')) return context.page === 'album';
  if (context.busy) return false;
  if (name === 'license') return true;
  if (!writable) return false;
  return !['add-photos', 'export-pdf'].includes(name) || context.page === 'album';
}

// Try the requested capture first. macOS's preflight status can lag behind a
// successful capture grant; an actual named external window is stronger evidence.
async function captureSources(desktopCapturer, systemPreferences, platform, options, ownSourceIds = []) {
  let sources, failure;
  try { sources = await desktopCapturer.getSources(options); } catch (error) { failure = error; }
  if (platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    const external = values => values?.some(source => source.id.startsWith('window:') && !ownSourceIds.includes(source.id) && source.name?.trim() && source.thumbnail && !source.thumbnail.isEmpty());
    let usable = external(sources);
    if (!usable && !failure && options.types?.length === 1 && options.types[0] === 'screen') {
      usable = external(await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 32, height: 32 } }).catch(() => []));
    }
    // A wallpaper-only display or our own window is not proof of permission.
    if (!usable) throw new Error('SCREEN_PERMISSION: macOS has not made other windows available to this running copy.');
  }
  if (failure) throw failure;
  return sources;
}
module.exports = { captureSources };

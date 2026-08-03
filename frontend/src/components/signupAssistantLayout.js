const MIN_PANEL_WIDTH = 180;
const DEFAULT_PANEL_WIDTH = 280;
const MIN_PANEL_HEIGHT = 220;
const DEFAULT_PANEL_HEIGHT = 320;

export function getSizeLimits(viewport = {}) {
  const widthAvailable = Math.max(MIN_PANEL_WIDTH, (Number(viewport.width) || 0) - 16);
  const heightAvailable = Math.max(MIN_PANEL_HEIGHT, (Number(viewport.height) || 0) - 16);

  return {
    widthMin: Math.min(DEFAULT_PANEL_WIDTH, widthAvailable),
    widthMax: widthAvailable,
    heightMin: Math.min(DEFAULT_PANEL_HEIGHT, heightAvailable),
    heightMax: heightAvailable,
  };
}

export function clampSize(size, viewport) {
  const limits = getSizeLimits(viewport);
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

  return {
    width: Math.round(clamp(Number(size?.width) || DEFAULT_PANEL_WIDTH, limits.widthMin, limits.widthMax)),
    height: Math.round(clamp(Number(size?.height) || DEFAULT_PANEL_HEIGHT, limits.heightMin, limits.heightMax)),
  };
}

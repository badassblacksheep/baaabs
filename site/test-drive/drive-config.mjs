// Shared rules for the simulation, AI traffic, renderer and generated UI.
export const DRIVE_CONFIG = Object.freeze({
  speedLimitMph: 5,
  speedWarningMarginMph: 0.4,
  metersPerSecondPerMph: 0.44704,
  partyZoneRadiusMeters: 6,
});
export const speedLimitWords = (() => {
  const names = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
  return names[DRIVE_CONFIG.speedLimitMph] ?? String(DRIVE_CONFIG.speedLimitMph);
})();

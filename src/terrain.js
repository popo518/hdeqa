export function riverCenterX(z) {
  return 1.8 * Math.sin(z * 0.018) + 1.15 * Math.sin(z * 0.052 + 0.7);
}

function baseHeight(x, z) {
  return 0.38 * Math.sin(x * 0.035 + 0.8) + 0.46 * Math.cos(z * 0.027) + 0.22 * Math.sin((x + z) * 0.021);
}

export function riverSurfaceY(z) {
  const x = riverCenterX(z);
  return baseHeight(x, z) - 0.34;
}

export function terrainHeight(x, z) {
  const distance = Math.abs(x - riverCenterX(z));
  const channel = 0.95 * Math.exp(-((distance / 2.75) ** 2));
  const startMeadow = Math.exp(-(((x - 9) ** 2 + (z - 8) ** 2) / 300));
  const gentleStart = startMeadow * 0.12;
  return baseHeight(x, z) - channel + gentleStart;
}

// Pure movement rules; separated from Three.js so water/bridge behavior is unit-testable.
export function isBridgeDeck(x, z, bridges, halfLength = 9.1, halfWidth = 2.55) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Array.isArray(bridges)) return false;
  return bridges.some((bridge) => {
    const dx = x - bridge.x;
    const dz = z - bridge.z;
    const c = Math.cos(bridge.angle);
    const sn = Math.sin(bridge.angle);
    // Inverse of the bridge group's Y rotation: local X spans the river, local Z follows it.
    const across = c * dx - sn * dz;
    const along = sn * dx + c * dz;
    return Math.abs(across) <= halfLength && Math.abs(along) <= halfWidth;
  });
}

export function isWalkablePosition(x, z, options = {}) {
  const worldHalf = options.worldHalf ?? 270;
  const margin = options.margin ?? 9;
  const riverBuffer = options.riverBuffer ?? 7.6;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > worldHalf - margin || Math.abs(z) > worldHalf - margin) return false;
  const distance = typeof options.riverDistance === 'function' ? options.riverDistance(x, z) : Infinity;
  return distance >= riverBuffer || isBridgeDeck(x, z, options.bridges || []);
}

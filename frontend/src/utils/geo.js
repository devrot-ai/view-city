export function getGeoDistance(lat1, lng1, lat2, lng2) {
  const dy = lat1 - lat2;
  const dx = (lng1 - lng2) * Math.cos(28.63 * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceToSegmentGeo(px, py, ax, ay, bx, by) {
  const cosLat = Math.cos(28.63 * Math.PI / 180);
  const pax = (py - ay) * cosLat;
  const pay = px - ax;
  const bax = (by - ay) * cosLat;
  const bay = bx - ax;

  const lenSq = bax * bax + bay * bay;
  if (lenSq === 0) return Math.sqrt(pax * pax + pay * pay);

  let t = (pax * bax + pay * bay) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * (bx - ax);
  const projY = ay + t * (by - ay);

  const dx = (py - projY) * cosLat;
  const dy = px - projX;
  return Math.sqrt(dx * dx + dy * dy);
}

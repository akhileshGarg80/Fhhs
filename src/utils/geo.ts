import type {
  JunctionBranch,
  JunctionDirection,
  LatLngPoint,
  NavigationInstruction,
  RoadHierarchyRole,
  RoadJunction,
  TravelMode,
  TurnDirection,
  VehicleSegmentAccess,
  VillageHouse,
  VillageRoad,
  VillageRouteResult,
} from '../types/map.ts';

const EARTH_RADIUS_M = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function calculateBearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Offsets a coordinate by distanceMeters along bearingDeg (used to place Left/Right houses ~7-8m beside the road).
 */
export function offsetCoord(
  origin: { lat: number; lng: number },
  bearingDeg: number,
  distanceMeters: number
): { lat: number; lng: number } {
  const angularDist = distanceMeters / EARTH_RADIUS_M;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: Number(toDeg(lat2).toFixed(7)),
    lng: Number(toDeg(lng2).toFixed(7)),
  };
}

export function getTurnDirection(prevBearing: number, nextBearing: number): TurnDirection {
  const delta = ((nextBearing - prevBearing + 540) % 360) - 180;
  const abs = Math.abs(delta);
  if (abs < 28) return 'straight';
  if (abs < 58) return delta > 0 ? 'slight_right' : 'slight_left';
  if (abs < 125) return delta > 0 ? 'right' : 'left';
  return delta > 0 ? 'sharp_right' : 'sharp_left';
}

export function formatTurnAction(
  turn: TurnDirection,
  roadName: string,
  sameRoad = false
): string {
  const prep = sameRoad ? 'along' : 'onto';
  switch (turn) {
    case 'depart':
      return `Go straight on ${roadName}`;
    case 'straight':
      return `Continue straight onto ${roadName}`;
    case 'slight_left':
      return `Curve left ${prep} ${roadName}`;
    case 'left':
      return `Turn left ${prep} ${roadName}`;
    case 'sharp_left':
      return `Sharp left ${prep} ${roadName}`;
    case 'slight_right':
      return `Curve right ${prep} ${roadName}`;
    case 'right':
      return `Turn right ${prep} ${roadName}`;
    case 'sharp_right':
      return `Sharp right ${prep} ${roadName}`;
    case 'arrive':
      return `Arrive at ${roadName}`;
  }
}

export function computePathDistance(points: { lat: number; lng: number }[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return Math.round(total);
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function perpendicularDistanceMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const cosLat = Math.cos(toRad((a.lat + b.lat) / 2));
  const ax = a.lng * cosLat * 111320;
  const ay = a.lat * 110540;
  const bx = b.lng * cosLat * 111320;
  const by = b.lat * 110540;
  const px = p.lng * cosLat * 111320;
  const py = p.lat * 110540;

  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function simplifyPath<T extends { lat: number; lng: number }>(
  points: T[],
  toleranceMeters = 1.5
): T[] {
  if (points.length <= 2 || toleranceMeters <= 0) return points;
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistanceMeters(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > toleranceMeters) {
    const left = simplifyPath(points.slice(0, index + 1), toleranceMeters);
    const right = simplifyPath(points.slice(index), toleranceMeters);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

export function getSurfaceLabel(surface: VillageRoad['surface']): string {
  switch (surface) {
    case 'concrete':
      return 'CC Road';
    case 'cobblestone':
      return 'Brick / Kharanja';
    case 'asphalt':
      return 'Tar / Pakka';
    case 'unpaved':
    default:
      return 'Kachha Road';
  }
}

/**
 * Computes the next sequential house number across all saved houses and current draft houses
 * so starting a new road/mohalla continues smoothly (e.g. 30 -> 31).
 */
export function getNextSequentialHouseNumber(
  houses: VillageHouse[],
  draftHouses: VillageHouse[] = []
): string {
  let maxNum = 0;
  for (const h of [...houses, ...draftHouses]) {
    const match = h.houseNumber.trim().match(/^(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  return String(maxNum + 1);
}

// --- Planar Segment Projection & Intersection Helpers ---

function projectPointOnSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): { point: { lat: number; lng: number }; t: number; distMeters: number } {
  const cosLat = Math.cos(toRad((a.lat + b.lat) / 2));
  const kx = cosLat * 111320;
  const ky = 110540;

  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;
  const px = p.lng * kx;
  const py = p.lat * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-6) {
    return { point: { lat: a.lat, lng: a.lng }, t: 0, distMeters: haversineMeters(p, a) };
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projPt = {
    lat: Number((a.lat + t * (b.lat - a.lat)).toFixed(7)),
    lng: Number((a.lng + t * (b.lng - a.lng)).toFixed(7)),
  };
  return { point: projPt, t, distMeters: haversineMeters(p, projPt) };
}

function segmentIntersection(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  c: { lat: number; lng: number },
  d: { lat: number; lng: number }
): { point: { lat: number; lng: number }; t: number; u: number } | null {
  const cosLat = Math.cos(toRad((a.lat + b.lat + c.lat + d.lat) / 4));
  const kx = cosLat * 111320;
  const ky = 110540;

  const rX = (b.lng - a.lng) * kx;
  const rY = (b.lat - a.lat) * ky;
  const sX = (d.lng - c.lng) * kx;
  const sY = (d.lat - c.lat) * ky;

  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-5) return null; // parallel

  const qpX = (c.lng - a.lng) * kx;
  const qpY = (c.lat - a.lat) * ky;

  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;

  if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) {
    return {
      point: {
        lat: Number((a.lat + t * (b.lat - a.lat)).toFixed(7)),
        lng: Number((a.lng + t * (b.lng - a.lng)).toFixed(7)),
      },
      t,
      u,
    };
  }
  return null;
}

interface GraphNode {
  id: number;
  lat: number;
  lng: number;
}

interface GraphEdge {
  edgeId: number;
  to: number;
  weight: number;
  roadName: string;
  roadId: string;
}

function buildRoadNetworkGraph(
  roads: VillageRoad[],
  userStart: { lat: number; lng: number },
  targetHouse: VillageHouse
): {
  nodes: GraphNode[];
  adj: Map<number, GraphEdge[]>;
  startNode: number;
  endNode: number;
  startApproachMeters: number;
} | null {
  const validRoads = roads.filter((r) => r.points.length >= 2);
  if (validRoads.length === 0) return null;

  const JUNCTION_SNAP_METERS = 22;
  const VERTEX_MERGE_METERS = 0.8;

  // 1. Collect split parameters per road segment so T-junctions, crossings, user start & house anchor
  //    attach cleanly onto the exact road geometry (no straight-line shortcuts!).
  const splits = validRoads.map((r) =>
    r.points.slice(0, -1).map(() => [] as { t: number; pt: { lat: number; lng: number } }[])
  );

  const junctionBridges: {
    a: { lat: number; lng: number };
    b: { lat: number; lng: number };
    roadName: string;
    roadId: string;
  }[] = [];

  // 1a. Road-to-road crossings and endpoint-to-segment T-junction snaps
  for (let ri = 0; ri < validRoads.length; ri++) {
    const rA = validRoads[ri];
    for (let rj = ri + 1; rj < validRoads.length; rj++) {
      const rB = validRoads[rj];

      // Crossing segments between rA and rB
      for (let si = 0; si < rA.points.length - 1; si++) {
        for (let sj = 0; sj < rB.points.length - 1; sj++) {
          const hit = segmentIntersection(
            rA.points[si],
            rA.points[si + 1],
            rB.points[sj],
            rB.points[sj + 1]
          );
          if (hit) {
            splits[ri][si].push({ t: hit.t, pt: hit.point });
            splits[rj][sj].push({ t: hit.u, pt: hit.point });
          }
        }
      }

      // Snap endpoints of rA onto segments of rB
      for (const epIdx of [0, rA.points.length - 1]) {
        const ep = rA.points[epIdx];
        let bestDist = Infinity;
        let bestSeg = -1;
        let bestProj: { point: { lat: number; lng: number }; t: number; distMeters: number } | null =
          null;
        for (let sj = 0; sj < rB.points.length - 1; sj++) {
          const proj = projectPointOnSegment(ep, rB.points[sj], rB.points[sj + 1]);
          if (proj.distMeters < bestDist) {
            bestDist = proj.distMeters;
            bestSeg = sj;
            bestProj = proj;
          }
        }
        if (bestProj && bestSeg !== -1 && bestDist <= JUNCTION_SNAP_METERS) {
          if (bestProj.t > 0.0005 && bestProj.t < 0.9995) {
            splits[rj][bestSeg].push({ t: bestProj.t, pt: bestProj.point });
          }
          if (bestDist > 0.5) {
            junctionBridges.push({
              a: ep,
              b: bestProj.point,
              roadName: rB.name,
              roadId: rB.id,
            });
          }
        }
      }

      // Snap endpoints of rB onto segments of rA
      for (const epIdx of [0, rB.points.length - 1]) {
        const ep = rB.points[epIdx];
        let bestDist = Infinity;
        let bestSeg = -1;
        let bestProj: { point: { lat: number; lng: number }; t: number; distMeters: number } | null =
          null;
        for (let si = 0; si < rA.points.length - 1; si++) {
          const proj = projectPointOnSegment(ep, rA.points[si], rA.points[si + 1]);
          if (proj.distMeters < bestDist) {
            bestDist = proj.distMeters;
            bestSeg = si;
            bestProj = proj;
          }
        }
        if (bestProj && bestSeg !== -1 && bestDist <= JUNCTION_SNAP_METERS) {
          if (bestProj.t > 0.0005 && bestProj.t < 0.9995) {
            splits[ri][bestSeg].push({ t: bestProj.t, pt: bestProj.point });
          }
          if (bestDist > 0.5) {
            junctionBridges.push({
              a: ep,
              b: bestProj.point,
              roadName: rA.name,
              roadId: rA.id,
            });
          }
        }
      }
    }
  }

  // 1a-bis. Ensure explicit multi-way RoadJunction nodes split nearby road segments cleanly
  for (let ri = 0; ri < validRoads.length; ri++) {
    const junctions = validRoads[ri].junctions ?? [];
    for (const j of junctions) {
      for (let rj = 0; rj < validRoads.length; rj++) {
        const targetRoad = validRoads[rj];
        let bestDist = Infinity;
        let bestSeg = -1;
        let bestProj: { point: { lat: number; lng: number }; t: number; distMeters: number } | null =
          null;
        for (let sj = 0; sj < targetRoad.points.length - 1; sj++) {
          const proj = projectPointOnSegment(j, targetRoad.points[sj], targetRoad.points[sj + 1]);
          if (proj.distMeters < bestDist) {
            bestDist = proj.distMeters;
            bestSeg = sj;
            bestProj = proj;
          }
        }
        if (bestProj && bestSeg !== -1 && bestDist <= JUNCTION_SNAP_METERS) {
          if (bestProj.t > 0.0005 && bestProj.t < 0.9995) {
            splits[rj][bestSeg].push({ t: bestProj.t, pt: bestProj.point });
          }
          if (bestDist > 0.5) {
            junctionBridges.push({
              a: { lat: j.lat, lng: j.lng },
              b: bestProj.point,
              roadName: targetRoad.name,
              roadId: targetRoad.id,
            });
          }
        }
      }
    }
  }

  // 1b. Snap userStart onto closest road segment across the network
  let startBest = {
    ri: 0,
    si: 0,
    dist: Infinity,
    t: 0,
    pt: validRoads[0].points[0] as { lat: number; lng: number },
  };
  for (let ri = 0; ri < validRoads.length; ri++) {
    const r = validRoads[ri];
    for (let si = 0; si < r.points.length - 1; si++) {
      const proj = projectPointOnSegment(userStart, r.points[si], r.points[si + 1]);
      if (proj.distMeters < startBest.dist) {
        startBest = { ri, si, dist: proj.distMeters, t: proj.t, pt: proj.point };
      }
    }
  }
  if (startBest.t > 0.0005 && startBest.t < 0.9995) {
    splits[startBest.ri][startBest.si].push({ t: startBest.t, pt: startBest.pt });
  } else {
    const segPts = validRoads[startBest.ri].points;
    startBest.pt = startBest.t <= 0.5 ? segPts[startBest.si] : segPts[startBest.si + 1];
  }

  // 1c. Snap targetHouse road anchor onto its own road (or closest road segment)
  const targetAnchor = { lat: targetHouse.roadLat, lng: targetHouse.roadLng };
  let endBest = {
    ri: 0,
    si: 0,
    dist: Infinity,
    t: 0,
    pt: validRoads[0].points[0] as { lat: number; lng: number },
  };
  for (let ri = 0; ri < validRoads.length; ri++) {
    const r = validRoads[ri];
    for (let si = 0; si < r.points.length - 1; si++) {
      const proj = projectPointOnSegment(targetAnchor, r.points[si], r.points[si + 1]);
      // Slight preference if segment belongs to targetHouse.roadId
      const effectiveDist =
        r.id === targetHouse.roadId ? proj.distMeters * 0.5 : proj.distMeters;
      if (effectiveDist < endBest.dist) {
        endBest = { ri, si, dist: effectiveDist, t: proj.t, pt: proj.point };
      }
    }
  }
  if (endBest.t > 0.0005 && endBest.t < 0.9995) {
    splits[endBest.ri][endBest.si].push({ t: endBest.t, pt: endBest.pt });
  } else {
    const segPts = validRoads[endBest.ri].points;
    endBest.pt = endBest.t <= 0.5 ? segPts[endBest.si] : segPts[endBest.si + 1];
  }

  // 2. Build Graph Nodes & Edges preserving every vertex & turn
  const nodes: GraphNode[] = [];
  const adj = new Map<number, GraphEdge[]>();
  let nextEdgeId = 0;

  const getOrCreateNode = (lat: number, lng: number): number => {
    for (const n of nodes) {
      if (haversineMeters(n, { lat, lng }) <= VERTEX_MERGE_METERS) {
        return n.id;
      }
    }
    const id = nodes.length;
    nodes.push({ id, lat, lng });
    adj.set(id, []);
    return id;
  };

  const addUndirectedEdge = (u: number, v: number, roadName: string, roadId: string) => {
    if (u === v) return;
    const w = haversineMeters(nodes[u], nodes[v]);
    if (w < 0.2) return;
    const edgeId = nextEdgeId++;
    adj.get(u)!.push({ edgeId, to: v, weight: w, roadName, roadId });
    adj.get(v)!.push({ edgeId, to: u, weight: w, roadName, roadId });
  };

  for (let ri = 0; ri < validRoads.length; ri++) {
    const road = validRoads[ri];
    const expanded: { lat: number; lng: number }[] = [];

    for (let si = 0; si < road.points.length - 1; si++) {
      expanded.push(road.points[si]);
      const segSplits = splits[ri][si].slice().sort((a, b) => a.t - b.t);
      for (const s of segSplits) {
        expanded.push(s.pt);
      }
    }
    expanded.push(road.points[road.points.length - 1]);

    let prevNode = getOrCreateNode(expanded[0].lat, expanded[0].lng);
    for (let i = 1; i < expanded.length; i++) {
      const currNode = getOrCreateNode(expanded[i].lat, expanded[i].lng);
      addUndirectedEdge(prevNode, currNode, road.name, road.id);
      prevNode = currNode;
    }
  }

  for (const br of junctionBridges) {
    const u = getOrCreateNode(br.a.lat, br.a.lng);
    const v = getOrCreateNode(br.b.lat, br.b.lng);
    addUndirectedEdge(u, v, br.roadName, br.roadId);
  }

  const startNode = getOrCreateNode(startBest.pt.lat, startBest.pt.lng);
  const endNode = getOrCreateNode(endBest.pt.lat, endBest.pt.lng);

  return {
    nodes,
    adj,
    startNode,
    endNode,
    startApproachMeters: startBest.dist,
  };
}

function runDijkstra(
  nodes: GraphNode[],
  adj: Map<number, GraphEdge[]>,
  startNode: number,
  endNode: number,
  penalizedEdgeCounts: Map<number, number>
): { nodeSeq: number[]; edgeSeq: GraphEdge[]; trueDistMeters: number } | null {
  const n = nodes.length;
  const cost = new Array<number>(n).fill(Infinity);
  const trueDist = new Array<number>(n).fill(Infinity);
  const prev = new Array<{ node: number; edge: GraphEdge } | null>(n).fill(null);
  const visited = new Array<boolean>(n).fill(false);

  cost[startNode] = 0;
  trueDist[startNode] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && cost[i] < best) {
        best = cost[i];
        u = i;
      }
    }
    if (u === -1 || u === endNode) break;
    visited[u] = true;

    for (const edge of adj.get(u) ?? []) {
      const penaltyCount = penalizedEdgeCounts.get(edge.edgeId) ?? 0;
      const multiplier = penaltyCount > 0 ? Math.pow(3.5, penaltyCount) : 1;
      const altCost = cost[u] + edge.weight * multiplier;
      if (altCost < cost[edge.to]) {
        cost[edge.to] = altCost;
        trueDist[edge.to] = trueDist[u] + edge.weight;
        prev[edge.to] = { node: u, edge };
      }
    }
  }

  if (!Number.isFinite(trueDist[endNode])) return null;

  const nodeSeq: number[] = [];
  const edgeSeq: GraphEdge[] = [];
  let curr: number | null = endNode;

  while (curr !== null) {
    nodeSeq.push(curr);
    const p: { node: number; edge: GraphEdge } | null = prev[curr];
    if (p) edgeSeq.push(p.edge);
    curr = p ? p.node : null;
  }

  nodeSeq.reverse();
  edgeSeq.reverse();

  return { nodeSeq, edgeSeq, trueDistMeters: trueDist[endNode] };
}

function pointAlongCleanedBack(
  pts: { lat: number; lng: number }[],
  cum: number[],
  idx: number,
  windowMeters: number
): { lat: number; lng: number } {
  const target = Math.max(0, cum[idx] - windowMeters);
  let i = idx;
  while (i > 0 && cum[i - 1] > target) {
    i--;
  }
  if (i === 0) return pts[0];
  const segLen = Math.max(0.01, cum[i] - cum[i - 1]);
  const t = Math.max(0, Math.min(1, (target - cum[i - 1]) / segLen));
  return {
    lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t,
    lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t,
  };
}

function pointAlongCleanedAhead(
  pts: { lat: number; lng: number }[],
  cum: number[],
  idx: number,
  windowMeters: number
): { lat: number; lng: number } {
  const maxCum = cum[cum.length - 1] ?? 0;
  const target = Math.min(maxCum, cum[idx] + windowMeters);
  let i = idx;
  while (i < pts.length - 2 && cum[i + 1] < target) {
    i++;
  }
  if (i >= pts.length - 1) return pts[pts.length - 1];
  const segLen = Math.max(0.01, cum[i + 1] - cum[i]);
  const t = Math.max(0, Math.min(1, (target - cum[i]) / segLen));
  return {
    lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t,
    lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * t,
  };
}

function buildRouteResultFromPath(
  nodes: GraphNode[],
  nodeSeq: number[],
  edgeSeq: GraphEdge[],
  trueDistMeters: number,
  startApproachMeters: number,
  userStart: { lat: number; lng: number },
  targetHouse: VillageHouse,
  routeIndex: number
): VillageRouteResult {
  const polyline = nodeSeq.map((nid) => ({
    lat: nodes[nid].lat,
    lng: nodes[nid].lng,
  }));

  const roadNamesUsed: string[] = [];
  for (const e of edgeSeq) {
    if (roadNamesUsed[roadNamesUsed.length - 1] !== e.roadName) {
      roadNamesUsed.push(e.roadName);
    }
  }

  const fullPolyline = [...polyline];
  if (startApproachMeters > 5) {
    fullPolyline.unshift({ lat: userStart.lat, lng: userStart.lng });
  }

  const fullPolyCum: number[] = [0];
  for (let i = 1; i < fullPolyline.length; i++) {
    fullPolyCum.push(fullPolyCum[i - 1] + haversineMeters(fullPolyline[i - 1], fullPolyline[i]));
  }
  const totalPolyMeters = fullPolyCum[fullPolyCum.length - 1] ?? 0;

  const instructions: NavigationInstruction[] = [];
  if (edgeSeq.length >= 1) {
    // Stage 1: Group consecutive edges by contiguous roadId/roadName and smooth minor ±4.5m wobbles
    // so slightly zigzaggy straight paths are treated as clean straight lines while keeping junctions & real curves.
    const runs: {
      roadId: string;
      roadName: string;
      pts: { lat: number; lng: number }[];
    }[] = [];

    for (let i = 0; i < edgeSeq.length; i++) {
      const e = edgeSeq[i];
      const p1 = polyline[i];
      const p2 = polyline[i + 1];
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.roadId === e.roadId && lastRun.roadName === e.roadName) {
        lastRun.pts.push(p2);
      } else {
        runs.push({
          roadId: e.roadId,
          roadName: e.roadName,
          pts: [p1, p2],
        });
      }
    }

    const cleanedPts: { lat: number; lng: number }[] = [];
    const cleanedSegMeta: { roadId: string; roadName: string }[] = [];

    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const simplified = simplifyPath(run.pts, 4.5);
      for (let k = 0; k < simplified.length; k++) {
        if (k === 0 && cleanedPts.length > 0) continue;
        cleanedPts.push(simplified[k]);
        if (cleanedPts.length > 1) {
          cleanedSegMeta.push({ roadId: run.roadId, roadName: run.roadName });
        }
      }
    }

    const cleanedCum: number[] = [0];
    for (let i = 1; i < cleanedPts.length; i++) {
      cleanedCum.push(cleanedCum[i - 1] + haversineMeters(cleanedPts[i - 1], cleanedPts[i]));
    }

    // Stage 2: Detect only genuine Turns (>=58°), Curves (28°-57°), and Road Junction Changes
    // using a 12m chord window so isolated vertex jitter never triggers false alerts.
    const maneuvers: {
      turnType: TurnDirection;
      roadName: string;
      sameRoad: boolean;
      anchorPoint: { lat: number; lng: number };
      cleanedCumMeters: number;
    }[] = [
      {
        turnType: 'depart',
        roadName: cleanedSegMeta[0]?.roadName ?? edgeSeq[0].roadName,
        sameRoad: true,
        anchorPoint: fullPolyline[0],
        cleanedCumMeters: 0,
      },
    ];

    for (let v = 1; v < cleanedPts.length - 1; v++) {
      const segBefore = cleanedSegMeta[v - 1];
      const segAfter = cleanedSegMeta[v];
      if (!segBefore || !segAfter) continue;

      const roadChanged =
        segBefore.roadId !== segAfter.roadId || segBefore.roadName !== segAfter.roadName;

      const backPt = pointAlongCleanedBack(cleanedPts, cleanedCum, v, 12);
      const aheadPt = pointAlongCleanedAhead(cleanedPts, cleanedCum, v, 12);
      const inBearing = calculateBearing(backPt, cleanedPts[v]);
      const outBearing = calculateBearing(cleanedPts[v], aheadPt);
      const turn = getTurnDirection(inBearing, outBearing);

      if (!roadChanged && turn === 'straight') {
        continue;
      }

      const prevManeuver = maneuvers[maneuvers.length - 1];
      const distSincePrev = cleanedCum[v] - prevManeuver.cleanedCumMeters;

      // Suppress rapid back-to-back chatter (< 10m apart on the same road)
      if (!roadChanged && prevManeuver.turnType !== 'depart' && distSincePrev < 10) {
        continue;
      }

      const emittedTurn: TurnDirection = turn === 'straight' ? 'straight' : turn;
      maneuvers.push({
        turnType: emittedTurn,
        roadName: segAfter.roadName,
        sameRoad: !roadChanged,
        anchorPoint: cleanedPts[v],
        cleanedCumMeters: cleanedCum[v],
      });
    }

    // Stage 3: Map each maneuver monotonically onto fullPolyline to compute exact along-road meters
    let searchStartIdx = 0;
    const maneuverPolyCums: number[] = [];
    for (let m = 0; m < maneuvers.length; m++) {
      if (m === 0) {
        maneuverPolyCums.push(0);
        continue;
      }
      const target = maneuvers[m].anchorPoint;
      let bestIdx = searchStartIdx;
      let bestD = Infinity;
      for (let pi = searchStartIdx; pi < fullPolyline.length; pi++) {
        const d = haversineMeters(target, fullPolyline[pi]);
        if (d < bestD) {
          bestD = d;
          bestIdx = pi;
        }
        if (d < 0.8) break;
      }
      searchStartIdx = bestIdx;
      maneuverPolyCums.push(fullPolyCum[bestIdx] ?? maneuvers[m].cleanedCumMeters);
    }

    for (let m = 0; m < maneuvers.length; m++) {
      const curCum = maneuverPolyCums[m];
      const nextCum = m + 1 < maneuvers.length ? maneuverPolyCums[m + 1] : totalPolyMeters;
      const man = maneuvers[m];
      instructions.push({
        id: `inst-${routeIndex}-${m}`,
        turnType: man.turnType,
        instruction: formatTurnAction(man.turnType, man.roadName, man.sameRoad),
        roadName: man.roadName,
        distanceMeters: Math.max(0, Math.round(nextCum - curCum)),
        cumDistanceMeters: Math.round(curCum),
        anchorPoint: man.anchorPoint,
      });
    }
  } else {
    const shopLabel = targetHouse.shopName ? ` (${targetHouse.shopName})` : '';
    instructions.push({
      id: `inst-${routeIndex}-0`,
      turnType: 'depart',
      instruction: `Walk toward House ${targetHouse.houseNumber}${shopLabel}`,
      roadName: targetHouse.roadName,
      distanceMeters: Math.round(haversineMeters(userStart, targetHouse)),
      cumDistanceMeters: 0,
      anchorPoint: userStart,
    });
  }

  const roadEndPt = polyline[polyline.length - 1] ?? {
    lat: targetHouse.roadLat,
    lng: targetHouse.roadLng,
  };

  const sideText = targetHouse.side === 'left' ? 'Left' : 'Right';
  const shopSuffix = targetHouse.shopName ? ` · ${targetHouse.shopName}` : '';
  instructions.push({
    id: `inst-${routeIndex}-arrive`,
    turnType: 'arrive',
    instruction: `Stop on road · House ${targetHouse.houseNumber}${shopSuffix} is on your ${sideText}`,
    roadName: `House ${targetHouse.houseNumber}${shopSuffix} (${sideText})`,
    distanceMeters: 0,
    cumDistanceMeters: Math.round(totalPolyMeters),
    anchorPoint: roadEndPt,
  });

  const totalDistanceMeters = Math.round(
    trueDistMeters + (startApproachMeters > 5 ? startApproachMeters : 0)
  );

  const viaSummary =
    roadNamesUsed.length > 0 ? roadNamesUsed.join(' → ') : targetHouse.roadName;

  return {
    reachable: true,
    travelMode: 'walk',
    routeLabel: routeIndex === 0 ? 'Shortest (Closest)' : `Route ${routeIndex + 1}`,
    viaSummary,
    totalDistanceMeters,
    walkMinutes: Math.max(1, Math.round(totalDistanceMeters / 75)),
    bikeMinutes: Math.max(1, Math.round(totalDistanceMeters / 230)),
    carMinutes: Math.max(1, Math.round(totalDistanceMeters / 420)),
    polyline: fullPolyline,
    instructions,
  };
}

function extractCarAccessibleRoads(roads: VillageRoad[]): VillageRoad[] {
  const carRoads: VillageRoad[] = [];

  for (const road of roads) {
    if (road.points.length < 2) continue;
    const segCount = road.points.length - 1;
    const access = road.segmentAccess;
    if (!access || access.length !== segCount) continue;

    let i = 0;
    while (i < segCount) {
      if (access[i] !== 'car') {
        i++;
        continue;
      }
      const startIdx = i;
      while (i + 1 < segCount && access[i + 1] === 'car') {
        i++;
      }
      const endIdx = i;
      const slicePts = road.points.slice(startIdx, endIdx + 2);
      if (slicePts.length >= 2) {
        carRoads.push({
          ...road,
          id: `${road.id}__car_${startIdx}`,
          points: slicePts,
          distanceMeters: computePathDistance(slicePts),
        });
      }
      i++;
    }
  }

  return carRoads;
}

/**
 * Finds all distinct road-following routes (up to maxRoutes) between start and targetHouse.
 * For `walk` and `bike` (identical all-road network), routes all the way to the house.
 * For `car`, strictly uses company-saved `car` segments and stops at the furthest car-reachable
 * point if the destination sits inside a narrow no-car lane.
 */
export function findRoutesToHouse(
  roads: VillageRoad[],
  start: { lat: number; lng: number },
  targetHouse: VillageHouse,
  maxRoutes = 8,
  travelMode: TravelMode = 'walk'
): VillageRouteResult[] {
  if (roads.length === 0) {
    return [
      {
        reachable: false,
        travelMode,
        totalDistanceMeters: 0,
        walkMinutes: 0,
        bikeMinutes: 0,
        carMinutes: 0,
        polyline: [],
        instructions: [],
        reason: 'No village roads recorded yet.',
      },
    ];
  }

  if (travelMode === 'car') {
    const carRoads = extractCarAccessibleRoads(roads);
    if (carRoads.length === 0) {
      const anySurveyed = roads.some((r) => (r.segmentAccess?.length ?? 0) > 0);
      return [
        {
          reachable: false,
          travelMode: 'car',
          totalDistanceMeters: 0,
          walkMinutes: 0,
          bikeMinutes: 0,
          carMinutes: 0,
          polyline: [],
          instructions: [],
          reason: anySurveyed
            ? 'No Car-accessible roads reach this area. Switch to Bike or Walk.'
            : 'Car road data is not marked yet (Company → Vehicles). Switch to Bike or Walk.',
        },
      ];
    }

    const carRoutes = findRoutesToHouse(carRoads, start, targetHouse, maxRoutes, 'walk');
    const targetRoadAnchor = { lat: targetHouse.roadLat, lng: targetHouse.roadLng };

    return carRoutes.map((route) => {
      if (!route.reachable || route.polyline.length === 0) {
        return { ...route, travelMode: 'car' };
      }

      const carEnd = route.polyline[route.polyline.length - 1];
      const gapToHouseRoad = haversineMeters(carEnd, targetRoadAnchor);
      const isPartial = gapToHouseRoad > 12;

      if (!isPartial) {
        return {
          ...route,
          travelMode: 'car',
          carPartialStop: false,
        };
      }

      const walkTail = findRoutesToHouse(roads, carEnd, targetHouse, 1, 'walk')[0];
      const lastMileWalkMeters =
        walkTail && walkTail.reachable ? walkTail.totalDistanceMeters : Math.round(gapToHouseRoad);

      const updatedInstructions = route.instructions.map((inst, idx) => {
        if (idx === route.instructions.length - 1 && inst.turnType === 'arrive') {
          const shopSuffix = targetHouse.shopName ? ` · ${targetHouse.shopName}` : '';
          return {
            ...inst,
            instruction: `Car stops here · Walk ${formatDistance(lastMileWalkMeters)} to House ${
              targetHouse.houseNumber
            }${shopSuffix}`,
          };
        }
        return inst;
      });

      return {
        ...route,
        travelMode: 'car',
        carPartialStop: true,
        carStopPoint: carEnd,
        lastMileWalkMeters,
        instructions: updatedInstructions,
      };
    });
  }

  const graph = buildRoadNetworkGraph(roads, start, targetHouse);
  if (!graph || graph.nodes.length < 2) {
    return [
      {
        reachable: false,
        totalDistanceMeters: 0,
        walkMinutes: 0,
        bikeMinutes: 0,
        polyline: [],
        instructions: [],
        reason: 'Road network needs at least 2 connected points.',
      },
    ];
  }

  const foundPaths: { nodeSeq: number[]; edgeSeq: GraphEdge[]; trueDistMeters: number }[] = [];
  const seenSignatures = new Set<string>();

  const tryAcceptPath = (res: {
    nodeSeq: number[];
    edgeSeq: GraphEdge[];
    trueDistMeters: number;
  } | null) => {
    if (!res) return false;
    const sig = res.nodeSeq.join('-');
    if (seenSignatures.has(sig)) return false;

    const bestDist = foundPaths[0]?.trueDistMeters ?? res.trueDistMeters;
    const withinDetourLimit =
      foundPaths.length === 0 || res.trueDistMeters <= Math.max(bestDist * 4.0, bestDist + 650);
    if (!withinDetourLimit) return false;

    const isDistinct =
      foundPaths.length === 0 ||
      foundPaths.every((prev) => {
        const prevEdges = new Set(prev.edgeSeq.map((e) => e.edgeId));
        const shared = res.edgeSeq.filter((e) => prevEdges.has(e.edgeId)).length;
        const maxShared = Math.max(0, Math.min(res.edgeSeq.length - 1, Math.floor(res.edgeSeq.length * 0.92)));
        return shared <= maxShared || res.edgeSeq.length !== prev.edgeSeq.length;
      });

    if (!isDistinct) return false;
    seenSignatures.add(sig);
    foundPaths.push(res);
    return true;
  };

  // Pass 1: Iterative edge-penalized Dijkstra for primary shortest + global detours
  const penalized = new Map<number, number>();
  for (let attempt = 0; attempt < maxRoutes * 3 && foundPaths.length < maxRoutes; attempt++) {
    const res = runDijkstra(graph.nodes, graph.adj, graph.startNode, graph.endNode, penalized);
    if (!res) break;
    tryAcceptPath(res);
    for (const e of res.edgeSeq) {
      penalized.set(e.edgeId, (penalized.get(e.edgeId) ?? 0) + 1);
    }
  }

  // Pass 2: Road/segment bypass probing around the shortest path to uncover every local branch alternative
  if (foundPaths.length > 0 && foundPaths.length < maxRoutes) {
    const primaryEdges = foundPaths[0].edgeSeq;
    const uniqueRoadIds = Array.from(new Set(primaryEdges.map((e) => e.roadId)));

    for (const roadId of uniqueRoadIds) {
      if (foundPaths.length >= maxRoutes) break;
      const roadBypassPenalty = new Map<number, number>();
      for (const e of primaryEdges) {
        if (e.roadId === roadId) roadBypassPenalty.set(e.edgeId, 4);
      }
      const res = runDijkstra(
        graph.nodes,
        graph.adj,
        graph.startNode,
        graph.endNode,
        roadBypassPenalty
      );
      tryAcceptPath(res);
    }

    // Also probe bypassing individual edges of the shortest path (sampled for speed)
    const step = Math.max(1, Math.floor(primaryEdges.length / 8));
    for (let i = 0; i < primaryEdges.length && foundPaths.length < maxRoutes; i += step) {
      const singleEdgePenalty = new Map<number, number>();
      singleEdgePenalty.set(primaryEdges[i].edgeId, 4);
      const res = runDijkstra(
        graph.nodes,
        graph.adj,
        graph.startNode,
        graph.endNode,
        singleEdgePenalty
      );
      tryAcceptPath(res);
    }
  }

  if (foundPaths.length === 0) {
    return [
      {
        reachable: false,
        totalDistanceMeters: 0,
        walkMinutes: 0,
        bikeMinutes: 0,
        polyline: [],
        instructions: [],
        reason: 'This road is not connected to your current road yet. Walk a connecting lane between them.',
      },
    ];
  }

  foundPaths.sort((a, b) => a.trueDistMeters - b.trueDistMeters);

    return foundPaths.slice(0, maxRoutes).map((p, idx) => ({
    ...buildRouteResultFromPath(
      graph.nodes,
      p.nodeSeq,
      p.edgeSeq,
      p.trueDistMeters,
      graph.startApproachMeters,
      start,
      targetHouse,
      idx
    ),
    travelMode,
  }));
}

export function findRouteToHouse(
  roads: VillageRoad[],
  start: { lat: number; lng: number },
  targetHouse: VillageHouse,
  travelMode: TravelMode = 'walk'
): VillageRouteResult {
  return findRoutesToHouse(roads, start, targetHouse, 1, travelMode)[0];
}

export interface LiveRouteProgress {
  snappedPoint: { lat: number; lng: number };
  completedPolyline: { lat: number; lng: number }[];
  remainingPolyline: { lat: number; lng: number }[];
  coveredMeters: number;
  remainingMeters: number;
  remainingWalkMinutes: number;
  remainingBikeMinutes: number;
  offRouteMeters: number;
  activeStepIndex: number;
  nextInstruction: NavigationInstruction | null;
  distanceToNextTurnMeters: number;
  nextBearingDeg: number;
  movementStatus: 'towards' | 'away' | 'steady';
}

export function computeLiveRouteProgress(
  route: VillageRouteResult,
  userPos: { lat: number; lng: number },
  userHeadingDeg: number | null
): LiveRouteProgress | null {
  const poly = route.polyline;
  if (!route.reachable || poly.length < 2) return null;

  // Single-pass cumulative polyline distance for ultra-fast O(N) live step & turn-distance lookup
  const polyCum: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    polyCum.push(polyCum[i - 1] + haversineMeters(poly[i - 1], poly[i]));
  }
  const totalPolyMeters = polyCum[polyCum.length - 1] ?? 0;

  let bestSeg = 0;
  let bestDist = Infinity;
  let bestPt = poly[0];

  for (let i = 0; i < poly.length - 1; i++) {
    const proj = projectPointOnSegment(userPos, poly[i], poly[i + 1]);
    if (proj.distMeters < bestDist) {
      bestDist = proj.distMeters;
      bestSeg = i;
      bestPt = proj.point;
    }
  }

  const completedPolyline = [...poly.slice(0, bestSeg + 1), bestPt];
  const remainingPolyline = [bestPt, ...poly.slice(bestSeg + 1)];

  const coveredMeters = Math.round(polyCum[bestSeg] + haversineMeters(poly[bestSeg], bestPt));
  const remainingMeters = Math.max(0, Math.round(totalPolyMeters - coveredMeters));

  // Exact step advancement based on cumulative along-road meters
  let activeStepIndex = 0;
  if (route.instructions.length > 1) {
    if (remainingMeters <= 12) {
      activeStepIndex = route.instructions.length - 1;
    } else {
      for (let idx = 0; idx < route.instructions.length - 1; idx++) {
        const instCum = route.instructions[idx].cumDistanceMeters;
        if (instCum != null) {
          if (coveredMeters >= instCum - 3) {
            activeStepIndex = idx;
          }
        } else {
          // Fallback if instruction lacks precomputed cumDistanceMeters
          const nextStepStart = route.instructions[idx].distanceMeters;
          if (coveredMeters >= nextStepStart) {
            activeStepIndex = idx;
          }
        }
      }
    }
  }

  const nextInstruction =
    activeStepIndex + 1 < route.instructions.length
      ? route.instructions[activeStepIndex + 1]
      : null;

  const distanceToNextTurnMeters = nextInstruction
    ? nextInstruction.cumDistanceMeters != null
      ? Math.max(0, Math.round(nextInstruction.cumDistanceMeters - coveredMeters))
      : Math.round(haversineMeters(bestPt, nextInstruction.anchorPoint))
    : remainingMeters;

  const aheadTarget =
    remainingPolyline.length >= 2 && haversineMeters(bestPt, remainingPolyline[1]) > 1
      ? remainingPolyline[1]
      : remainingPolyline[remainingPolyline.length - 1];
  const nextBearingDeg = calculateBearing(bestPt, aheadTarget);

  let movementStatus: 'towards' | 'away' | 'steady' = 'steady';
  if (userHeadingDeg != null && Number.isFinite(userHeadingDeg)) {
    const diff = Math.abs(((userHeadingDeg - nextBearingDeg + 540) % 360) - 180);
    if (diff <= 65) {
      movementStatus = 'towards';
    } else if (diff >= 115) {
      movementStatus = 'away';
    }
  }

  return {
    snappedPoint: bestPt,
    completedPolyline,
    remainingPolyline,
    coveredMeters,
    remainingMeters,
    remainingWalkMinutes: Math.max(1, Math.round(remainingMeters / 75)),
    remainingBikeMinutes: Math.max(1, Math.round(remainingMeters / 230)),
    offRouteMeters: Math.round(bestDist),
    activeStepIndex,
    nextInstruction,
    distanceToNextTurnMeters,
    nextBearingDeg,
    movementStatus,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateGpxExport(roads: VillageRoad[], houses: VillageHouse[]): string {
  const trks = roads
    .filter((r) => r.points.length >= 2)
    .map((r) => {
      const pts = r.points
        .map((pt) => `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lng.toFixed(7)}"></trkpt>`)
        .join('\n');
      return `  <trk>\n    <name>${escapeXml(r.name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>`;
    })
    .join('\n');

  const wpts = houses
    .map(
      (h) =>
        `  <wpt lat="${h.lat.toFixed(7)}" lon="${h.lng.toFixed(7)}">\n    <name>${escapeXml(
          h.shopName ? `House ${h.houseNumber} - ${h.shopName}` : `House ${h.houseNumber}`
        )}</name>\n    <desc>${escapeXml(`${h.side} side · ${h.roadName}`)}</desc>\n  </wpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GramPath">\n${wpts}\n${trks}\n</gpx>\n`;
}

export function angularDiffDeg(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export function directionLabel(dir: JunctionDirection): string {
  switch (dir) {
    case 'left':
      return 'Left';
    case 'straight':
      return 'Straight';
    case 'right':
      return 'Right';
    case 'back':
      return 'Back';
  }
}

export function directionOffsetDeg(dir: JunctionDirection): number {
  switch (dir) {
    case 'left':
      return 270;
    case 'straight':
      return 0;
    case 'right':
      return 90;
    case 'back':
      return 180;
  }
}

export function buildJunctionBranches(
  junctionId: string,
  arrivalHeadingDeg: number,
  directions: JunctionDirection[],
  activeDirection: JunctionDirection,
  activeSegmentIndex?: number
): JunctionBranch[] {
  return directions.map((dir, idx) => ({
    id: `${junctionId}-br-${dir}-${idx}`,
    direction: dir,
    label: directionLabel(dir),
    bearingDeg: (arrivalHeadingDeg + directionOffsetDeg(dir) + 360) % 360,
    status: dir === activeDirection ? 'mapping' : 'pending',
    segmentIndex: dir === activeDirection ? activeSegmentIndex : undefined,
  }));
}

export interface PendingJunctionBranchItem {
  junction: RoadJunction;
  branch: JunctionBranch;
  sourceRoadId?: string;
  sourceRoadName?: string;
  isDraft: boolean;
}

export function collectPendingJunctionBranches(
  roads: VillageRoad[],
  draftJunctions: RoadJunction[]
): PendingJunctionBranchItem[] {
  const items: PendingJunctionBranchItem[] = [];

  for (const j of draftJunctions) {
    for (const br of j.branches ?? []) {
      if (br.status === 'pending') {
        items.push({
          junction: j,
          branch: br,
          isDraft: true,
        });
      }
    }
  }

  for (const r of roads) {
    for (const j of r.junctions ?? []) {
      for (const br of j.branches ?? []) {
        if (br.status === 'pending') {
          items.push({
            junction: j,
            branch: br,
            sourceRoadId: r.id,
            sourceRoadName: r.name,
            isDraft: false,
          });
        }
      }
    }
  }

  return items;
}

/**
 * Automatically connects newly saved road branches to existing saved roads & pending junction
 * branches so mapping a 2-way, 3-way, or 4-way chauraha one branch at a time builds one seamless network.
 */
export function autoLinkNewRoadsToNetwork(
  newRoads: VillageRoad[],
  existingRoads: VillageRoad[],
  explicitLinkedBranch?: { junctionId: string; branchId: string } | null
): {
  linkedNewRoads: VillageRoad[];
  updatedExistingRoads: VillageRoad[];
  linkedSummaries: string[];
} {
  const updatedExisting: VillageRoad[] = existingRoads.map((r) => ({
    ...r,
    junctions: r.junctions?.map((j) => ({
      ...j,
      ...(j.branches ? { branches: j.branches.map((b) => ({ ...b })) } : {}),
    })),
  }));
  const linkedNew: VillageRoad[] = newRoads.map((r) => ({
    ...r,
    points: r.points.map((p) => ({ ...p })),
  }));
  const linkedSummaries: string[] = [];

  const SNAP_RADIUS_M = 24;

  for (let ni = 0; ni < linkedNew.length; ni++) {
    const road = linkedNew[ni];
    if (road.points.length < 2) continue;

    let linkedToJunction = false;

    // 1. Check explicit junction-branch link first, or auto-detect proximity + bearing to saved junctions
    const startPt = road.points[0];
    const endPt = road.points[road.points.length - 1];
    const startBearing = calculateBearing(road.points[0], road.points[Math.min(2, road.points.length - 1)]);
    const reverseEndBearing = calculateBearing(
      road.points[road.points.length - 1],
      road.points[Math.max(0, road.points.length - 3)]
    );

    let bestMatch: {
      roadIdx: number;
      juncIdx: number;
      branchIdx: number;
      attachAtEnd: 'start' | 'end';
      dist: number;
      angleDiff: number;
    } | null = null;

    for (let ri = 0; ri < updatedExisting.length; ri++) {
      const exRoad = updatedExisting[ri];
      const junctions = exRoad.junctions ?? [];
      for (let ji = 0; ji < junctions.length; ji++) {
        const j = junctions[ji];
        const branches = j.branches ?? [];
        const dStart = haversineMeters(startPt, j);
        const dEnd = haversineMeters(endPt, j);
        const useStart = dStart <= dEnd;
        const dist = useStart ? dStart : dEnd;

        if (dist > SNAP_RADIUS_M) continue;

        for (let bi = 0; bi < branches.length; bi++) {
          const br = branches[bi];
          if (br.status !== 'pending') continue;

          const isExplicit =
            explicitLinkedBranch &&
            explicitLinkedBranch.junctionId === j.id &&
            explicitLinkedBranch.branchId === br.id;

          const outgoingBrg = useStart ? startBearing : reverseEndBearing;
          const angleDiff = angularDiffDeg(outgoingBrg, br.bearingDeg);

          if (!isExplicit && angleDiff > 60 && dist > 10) continue;

          const score = isExplicit ? -1000 : dist + angleDiff * 0.25;
          const prevScore = bestMatch
            ? bestMatch.dist + bestMatch.angleDiff * 0.25
            : Infinity;

          if (!bestMatch || score < prevScore) {
            bestMatch = {
              roadIdx: ri,
              juncIdx: ji,
              branchIdx: bi,
              attachAtEnd: useStart ? 'start' : 'end',
              dist,
              angleDiff,
            };
          }
        }
      }
    }

    if (bestMatch) {
      const parentRoad = updatedExisting[bestMatch.roadIdx];
      const junc = parentRoad.junctions![bestMatch.juncIdx];
      const br = junc.branches![bestMatch.branchIdx];

      // Snap exact endpoint to the junction coordinate so graph node merges cleanly
      if (bestMatch.attachAtEnd === 'start') {
        if (haversineMeters(road.points[0], junc) > 0.6) {
          road.points.unshift({ lat: junc.lat, lng: junc.lng, accuracy: 1.5 });
        } else {
          road.points[0] = { ...road.points[0], lat: junc.lat, lng: junc.lng };
        }
      } else {
        const last = road.points[road.points.length - 1];
        if (haversineMeters(last, junc) > 0.6) {
          road.points.push({ lat: junc.lat, lng: junc.lng, accuracy: 1.5 });
        } else {
          road.points[road.points.length - 1] = { ...last, lat: junc.lat, lng: junc.lng };
        }
      }

      road.distanceMeters = computePathDistance(road.points);
      br.status = 'mapped';
      br.roadId = road.id;
      linkedToJunction = true;

      const remainingPending = junc.branches!.filter((b) => b.status === 'pending').length;
      linkedSummaries.push(
        `Linked ${br.label} branch at ${junc.label ?? junc.type} (${parentRoad.name})${
          remainingPending > 0 ? ` · ${remainingPending} pending` : ' · All ways mapped!'
        }`
      );
    }

    // 2. Smart Overlap Trimming + Dual-End Mid-Segment Touch Linking + Crossing Splits
    if (updatedExisting.length > 0) {
      const OVERLAP_TRIM_M = 6.5;
      const ENDPOINT_SNAP_M = 20;

      // 2a. Trim redundant overlapping tail points where new road was walked on top of an existing road
      if (!linkedToJunction && road.points.length >= 3) {
        let trimStartCount = 0;
        for (let i = 0; i < road.points.length - 2; i++) {
          const hit = findNearestRoadSnap(road.points[i], updatedExisting, OVERLAP_TRIM_M);
          const nextHit = findNearestRoadSnap(road.points[i + 1], updatedExisting, OVERLAP_TRIM_M);
          if (hit && nextHit) {
            trimStartCount++;
          } else {
            break;
          }
        }
        if (trimStartCount > 0) {
          road.points = road.points.slice(trimStartCount);
        }
      }

      if (road.points.length >= 3) {
        let trimEndCount = 0;
        for (let i = road.points.length - 1; i >= 2; i--) {
          const hit = findNearestRoadSnap(road.points[i], updatedExisting, OVERLAP_TRIM_M);
          const prevHit = findNearestRoadSnap(road.points[i - 1], updatedExisting, OVERLAP_TRIM_M);
          if (hit && prevHit) {
            trimEndCount++;
          } else {
            break;
          }
        }
        if (trimEndCount > 0) {
          road.points = road.points.slice(0, road.points.length - trimEndCount);
        }
      }

      // 2b. Attach Start endpoint to nearest existing road (splitting segment A–B in BOTH roads!)
      if (!linkedToJunction) {
        const startSnap = findNearestRoadSnap(road.points[0], updatedExisting, ENDPOINT_SNAP_M);
        if (startSnap) {
          const exIdx = updatedExisting.findIndex((r) => r.id === startSnap.roadId);
          if (exIdx >= 0) {
            const { road: splitEx, insertedPoint } = insertTouchPointIntoRoad(
              updatedExisting[exIdx],
              startSnap.segIndex,
              startSnap.point
            );
            updatedExisting[exIdx] = splitEx;
            if (haversineMeters(road.points[0], insertedPoint) > 0.6) {
              road.points.unshift({
                lat: insertedPoint.lat,
                lng: insertedPoint.lng,
                accuracy: 1.5,
              });
            } else {
              road.points[0] = {
                ...road.points[0],
                lat: insertedPoint.lat,
                lng: insertedPoint.lng,
              };
            }
            linkedSummaries.push(`Connected to ${splitEx.name}`);
          }
        }
      }

      // 2c. Attach End endpoint to nearest existing road (splitting segment A–B in BOTH roads!)
      const lastPt = road.points[road.points.length - 1];
      const endSnap = findNearestRoadSnap(lastPt, updatedExisting, ENDPOINT_SNAP_M);
      if (endSnap) {
        const distinctFromStart = haversineMeters(endSnap.point, road.points[0]) > 4.5;
        if (distinctFromStart) {
          const exIdx = updatedExisting.findIndex((r) => r.id === endSnap.roadId);
          if (exIdx >= 0) {
            const { road: splitEx, insertedPoint } = insertTouchPointIntoRoad(
              updatedExisting[exIdx],
              endSnap.segIndex,
              endSnap.point
            );
            updatedExisting[exIdx] = splitEx;
            if (haversineMeters(lastPt, insertedPoint) > 0.6) {
              road.points.push({
                lat: insertedPoint.lat,
                lng: insertedPoint.lng,
                accuracy: 1.5,
              });
            } else {
              road.points[road.points.length - 1] = {
                ...lastPt,
                lat: insertedPoint.lat,
                lng: insertedPoint.lng,
              };
            }
            if (linkedSummaries.length === 0) {
              linkedSummaries.push(`Connected to ${splitEx.name}`);
            }
          }
        }
      }

      // 2d. Split both roads wherever any segment of the new road crosses an existing road
      for (let ei = 0; ei < updatedExisting.length; ei++) {
        const ex = updatedExisting[ei];
        if (ex.points.length < 2 || road.points.length < 2) continue;

        const hits: {
          newSegIdx: number;
          t: number;
          exSegIdx: number;
          u: number;
          point: { lat: number; lng: number };
        }[] = [];

        for (let si = 0; si < road.points.length - 1; si++) {
          for (let sj = 0; sj < ex.points.length - 1; sj++) {
            const hit = segmentIntersection(
              road.points[si],
              road.points[si + 1],
              ex.points[sj],
              ex.points[sj + 1]
            );
            if (hit) {
              hits.push({ newSegIdx: si, t: hit.t, exSegIdx: sj, u: hit.u, point: hit.point });
            }
          }
        }

        if (hits.length > 0) {
          // Apply splits sorted backwards so earlier indices stay valid
          const newBySeg = hits.slice().sort((a, b) => b.newSegIdx - a.newSegIdx || b.t - a.t);
          for (const h of newBySeg) {
            const { road: splitNew } = insertTouchPointIntoRoad(road, h.newSegIdx, h.point);
            road.points = splitNew.points;
          }

          let updatedEx = ex;
          const exBySeg = hits.slice().sort((a, b) => b.exSegIdx - a.exSegIdx || b.u - a.u);
          for (const h of exBySeg) {
            updatedEx = insertTouchPointIntoRoad(updatedEx, h.exSegIdx, h.point).road;
          }
          updatedExisting[ei] = updatedEx;
          if (!linkedSummaries.includes(`Crosses ${ex.name}`)) {
            linkedSummaries.push(`Crosses ${ex.name}`);
          }
        }
      }

      road.points = dedupSequentialPoints(road.points, 0.35);
      road.distanceMeters = computePathDistance(road.points);
    }

    // Also include this newly linked road so subsequent branches in the same batch link cleanly
    updatedExisting.push({
      ...road,
      points: road.points.map((p) => ({ ...p })),
      junctions: road.junctions?.map((j) => ({
        ...j,
        ...(j.branches ? { branches: j.branches.map((b) => ({ ...b })) } : {}),
      })),
    });
  }

  // Keep existing roads array ordering (exclude the newly appended items we pushed inside loop)
  const finalExisting = updatedExisting.slice(0, existingRoads.length);

  return {
    linkedNewRoads: linkedNew,
    updatedExistingRoads: finalExisting,
    linkedSummaries,
  };
}

export interface RoadSnapHit {
  roadId: string;
  roadName: string;
  segIndex: number;
  t: number;
  point: { lat: number; lng: number };
  distMeters: number;
}

function dedupSequentialPoints(points: LatLngPoint[], minStepMeters = 0.35): LatLngPoint[] {
  if (points.length <= 2) return points;
  const out: LatLngPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const isLast = i === points.length - 1;
    if (haversineMeters(out[out.length - 1], points[i]) >= minStepMeters || isLast) {
      out.push(points[i]);
    }
  }
  return out;
}

/**
 * Finds the closest point on ANY saved road segment (either an existing vertex or between points A and B).
 */
export function findNearestRoadSnap(
  pt: { lat: number; lng: number },
  roads: VillageRoad[],
  maxDistMeters = 20,
  excludeRoadIds?: Set<string>
): RoadSnapHit | null {
  let best: RoadSnapHit | null = null;
  for (const r of roads) {
    if (excludeRoadIds?.has(r.id) || r.points.length < 2) continue;
    for (let si = 0; si < r.points.length - 1; si++) {
      const a = r.points[si];
      const b = r.points[si + 1];
      const proj = projectPointOnSegment(pt, a, b);
      if (proj.distMeters <= maxDistMeters && (!best || proj.distMeters < best.distMeters)) {
        const dA = haversineMeters(proj.point, a);
        const dB = haversineMeters(proj.point, b);
        const snappedPt =
          dA <= 1.2
            ? { lat: a.lat, lng: a.lng }
            : dB <= 1.2
            ? { lat: b.lat, lng: b.lng }
            : proj.point;
        best = {
          roadId: r.id,
          roadName: r.name,
          segIndex: si,
          t: dA <= 1.2 ? 0 : dB <= 1.2 ? 1 : proj.t,
          point: snappedPt,
          distMeters: proj.distMeters,
        };
      }
    }
  }
  return best;
}

/**
 * Inserts a shared touch vertex right onto segment [segIndex, segIndex+1] between points A and B
 * (unless an endpoint vertex is already within 1.2m), returning updated road + shared vertex coord.
 */
export function insertTouchPointIntoRoad(
  road: VillageRoad,
  segIndex: number,
  pt: { lat: number; lng: number }
): { road: VillageRoad; insertedPoint: { lat: number; lng: number } } {
  if (segIndex < 0 || segIndex >= road.points.length - 1) {
    return { road, insertedPoint: pt };
  }
  const a = road.points[segIndex];
  const b = road.points[segIndex + 1];
  if (haversineMeters(a, pt) <= 1.2) {
    return { road, insertedPoint: { lat: a.lat, lng: a.lng } };
  }
  if (haversineMeters(b, pt) <= 1.2) {
    return { road, insertedPoint: { lat: b.lat, lng: b.lng } };
  }
  const nextPoints = road.points.slice();
  nextPoints.splice(segIndex + 1, 0, {
    lat: pt.lat,
    lng: pt.lng,
    accuracy: 1.5,
    timestamp: Date.now(),
  });
  return {
    road: {
      ...road,
      points: nextPoints,
      distanceMeters: computePathDistance(nextPoints),
    },
    insertedPoint: { lat: pt.lat, lng: pt.lng },
  };
}

/**
 * Erases points (and breaks segments crossing through) within radiusMeters of `center`.
 * Returns 0, 1, or 2+ cleaned VillageRoad chunks cleanly preserving original metadata.
 */
export function eraseRoadPointsNear(
  road: VillageRoad,
  center: { lat: number; lng: number },
  radiusMeters: number
): VillageRoad[] {
  if (road.points.length < 2) return [];

  const runs: LatLngPoint[][] = [];
  let current: LatLngPoint[] = [];

  for (let i = 0; i < road.points.length; i++) {
    const pt = road.points[i];
    const inside = haversineMeters(pt, center) <= radiusMeters;

    if (inside) {
      if (current.length >= 2) {
        runs.push(current);
      }
      current = [];
      continue;
    }

    if (current.length > 0) {
      const prev = current[current.length - 1];
      const segProj = projectPointOnSegment(center, prev, pt);
      if (segProj.distMeters <= radiusMeters && segProj.t > 0.05 && segProj.t < 0.95) {
        if (current.length >= 2) {
          runs.push(current);
        }
        current = [pt];
        continue;
      }
    }

    current.push(pt);
  }

  if (current.length >= 2) {
    runs.push(current);
  }

  if (runs.length === 0) return [];

  const ts = Date.now();
  return runs.map((pts, idx) => {
    const keptJunctions = road.junctions?.filter((j) =>
      pts.some((p) => haversineMeters(p, j) <= 22)
    );
    return {
      ...road,
      id: idx === 0 ? road.id : `${road.id}-part-${ts}-${idx}`,
      name: runs.length === 1 ? road.name : `${road.name} (${idx + 1})`,
      points: pts,
      junctions: keptJunctions && keptJunctions.length > 0 ? keptJunctions : undefined,
      distanceMeters: computePathDistance(pts),
    };
  });
}

/**
 * Applies a hand-drawn line (from Preview Road Editor) onto the working draft road list:
 * - If drawn from an open start/end of `activeRoadId`, extends that road cleanly and splits/touches any road it ends on.
 * - Otherwise adds a connected line snapped at both start & end (including mid-segments A–B) and splits crossed/touched roads.
 */
export function applyHandDrawnSegmentToRoads(
  drawnPoints: LatLngPoint[],
  roads: VillageRoad[],
  options: {
    activeRoadId: string | null;
    snapEnabled?: boolean;
    snapRadiusMeters?: number;
    defaultVillageName: string;
  }
): { nextRoads: VillageRoad[]; selectedRoadId: string | null } {
  const clean = dedupSequentialPoints(drawnPoints, 0.8);
  if (clean.length < 2) {
    return { nextRoads: roads, selectedRoadId: options.activeRoadId };
  }

  const snapOn = options.snapEnabled !== false;
  const snapR = snapOn ? options.snapRadiusMeters ?? 16 : 0;
  let working: VillageRoad[] = roads.map((r) => ({
    ...r,
    points: r.points.map((p) => ({ ...p })),
    junctions: r.junctions?.map((j) => ({
      ...j,
      ...(j.branches ? { branches: j.branches.map((b) => ({ ...b })) } : {}),
    })),
  }));

  // 1. Check if user started right from the start/end tip of activeRoadId to extend it seamlessly
  if (options.activeRoadId) {
    const targetIdx = working.findIndex((r) => r.id === options.activeRoadId);
    if (targetIdx >= 0 && working[targetIdx].points.length >= 2) {
      const activeRoad = working[targetIdx];
      const firstPt = activeRoad.points[0];
      const lastPt = activeRoad.points[activeRoad.points.length - 1];
      const dToEnd = haversineMeters(clean[0], lastPt);
      const dToStart = haversineMeters(clean[0], firstPt);
      const extendRadius = Math.max(12, snapR);

      if (dToEnd <= extendRadius && dToEnd <= dToStart) {
        const tail = clean.slice(1);
        const endSnap =
          snapOn && tail.length > 0
            ? findNearestRoadSnap(tail[tail.length - 1], working, snapR, new Set([activeRoad.id]))
            : null;
        if (endSnap) {
          const exIdx = working.findIndex((r) => r.id === endSnap.roadId);
          if (exIdx >= 0) {
            const { road: splitEx, insertedPoint } = insertTouchPointIntoRoad(
              working[exIdx],
              endSnap.segIndex,
              endSnap.point
            );
            working[exIdx] = splitEx;
            tail[tail.length - 1] = {
              lat: insertedPoint.lat,
              lng: insertedPoint.lng,
              accuracy: 1.5,
              timestamp: Date.now(),
            };
          }
        }
        const mergedPts = dedupSequentialPoints([...activeRoad.points, ...tail], 0.4);
        working[targetIdx] = {
          ...activeRoad,
          points: mergedPts,
          distanceMeters: computePathDistance(mergedPts),
        };
        return { nextRoads: working, selectedRoadId: activeRoad.id };
      }

      if (dToStart <= extendRadius) {
        const rev = clean.slice(1).reverse();
        const startSnap =
          snapOn && rev.length > 0
            ? findNearestRoadSnap(rev[0], working, snapR, new Set([activeRoad.id]))
            : null;
        if (startSnap) {
          const exIdx = working.findIndex((r) => r.id === startSnap.roadId);
          if (exIdx >= 0) {
            const { road: splitEx, insertedPoint } = insertTouchPointIntoRoad(
              working[exIdx],
              startSnap.segIndex,
              startSnap.point
            );
            working[exIdx] = splitEx;
            rev[0] = {
              lat: insertedPoint.lat,
              lng: insertedPoint.lng,
              accuracy: 1.5,
              timestamp: Date.now(),
            };
          }
        }
        const mergedPts = dedupSequentialPoints([...rev, ...activeRoad.points], 0.4);
        working[targetIdx] = {
          ...activeRoad,
          points: mergedPts,
          distanceMeters: computePathDistance(mergedPts),
        };
        return { nextRoads: working, selectedRoadId: activeRoad.id };
      }
    }
  }

  // 2. Otherwise create a new drawn connector/lane and link + split touched roads cleanly
  const newRoad: VillageRoad = {
    id: `road-edit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    name: `Connected Lane (${Math.round(computePathDistance(clean))}m)`,
    villageName: working[0]?.villageName ?? options.defaultVillageName,
    surface: 'concrete',
    points: clean,
    distanceMeters: computePathDistance(clean),
    durationSeconds: 0,
    captureMode: 'manual_trace',
    createdAt: new Date().toISOString(),
  };

  if (snapOn) {
    const { linkedNewRoads, updatedExistingRoads } = autoLinkNewRoadsToNetwork(
      [newRoad],
      working,
      null
    );
    working = [...linkedNewRoads, ...updatedExistingRoads];
    return { nextRoads: working, selectedRoadId: linkedNewRoads[0]?.id ?? null };
  }

  working = [newRoad, ...working];
  return { nextRoads: working, selectedRoadId: newRoad.id };
}

export interface SimWaypoint {
  lat: number;
  lng: number;
  bearingDeg: number;
  cumulativeMeters: number;
}

/**
 * Densifies a recorded polyline into ~stepMeters micro-waypoints with smooth heading
 * so the at-home Simulator moves steadily even across long straight segments.
 */
export function buildSimulatorWaypoints(
  points: LatLngPoint[],
  stepMeters = 2
): SimWaypoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [{ lat: points[0].lat, lng: points[0].lng, bearingDeg: 0, cumulativeMeters: 0 }];
  }

  const result: SimWaypoint[] = [];
  let totalMeters = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = haversineMeters(a, b);
    const bearing = segLen >= 0.3 ? calculateBearing(a, b) : result[result.length - 1]?.bearingDeg ?? 0;

    if (i === 0) {
      result.push({
        lat: a.lat,
        lng: a.lng,
        bearingDeg: bearing,
        cumulativeMeters: 0,
      });
    }

    if (segLen < 0.3) continue;

    const steps = Math.max(1, Math.ceil(segLen / stepMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lng = a.lng + (b.lng - a.lng) * t;
      const prev = result[result.length - 1];
      totalMeters += haversineMeters(prev, { lat, lng });
      result.push({
        lat,
        lng,
        bearingDeg: bearing,
        cumulativeMeters: totalMeters,
      });
    }
  }

  return result;
}

export interface AheadRoadTarget {
  roadId: string;
  roadName: string;
  isEndpoint: boolean;
  endpointEnd?: 'start' | 'end';
  segIndex: number;
  lat: number;
  lng: number;
  distMeters: number;
  bearingDeg: number;
  turnDeltaDeg: number;
}

/**
 * Looks ahead of the moving Editor AutoMap cursor to detect an upcoming road part or cut endpoint
 * before reaching it, so the user sees distance + required steering angle and can connect seamlessly.
 */
export function findAheadRoadTarget(
  cursor: { lat: number; lng: number },
  cursorHeadingDeg: number,
  roads: VillageRoad[],
  options: {
    anchorRoadId?: string | null;
    anchorOrigin?: { lat: number; lng: number } | null;
    walkedMeters?: number;
    maxRangeMeters?: number;
  } = {}
): AheadRoadTarget | null {
  const maxRange = options.maxRangeMeters ?? 95;
  const walked = options.walkedMeters ?? 0;

  let bestEndpoint: (AheadRoadTarget & { score: number }) | null = null;
  let bestSegment: (AheadRoadTarget & { score: number }) | null = null;

  for (const r of roads) {
    if (r.points.length < 2) continue;

    // 1. Check open road endpoints (highest priority when reconnecting cut gaps)
    const endpoints: { end: 'start' | 'end'; pt: LatLngPoint; segIndex: number }[] = [
      { end: 'start', pt: r.points[0], segIndex: 0 },
      { end: 'end', pt: r.points[r.points.length - 1], segIndex: r.points.length - 2 },
    ];

    for (const ep of endpoints) {
      if (
        options.anchorOrigin &&
        walked < 16 &&
        haversineMeters(ep.pt, options.anchorOrigin) < 10
      ) {
        continue;
      }
      if (r.id === options.anchorRoadId && walked < 18) continue;

      const dist = haversineMeters(cursor, ep.pt);
      if (dist > maxRange || dist < 0.2) continue;

      const brg = calculateBearing(cursor, ep.pt);
      const turnDeltaDeg = ((brg - cursorHeadingDeg + 540) % 360) - 180;
      const absAngle = Math.abs(turnDeltaDeg);
      if (dist > 10 && absAngle > 115) continue;

      const score = dist + absAngle * 0.22;
      if (!bestEndpoint || score < bestEndpoint.score) {
        bestEndpoint = {
          roadId: r.id,
          roadName: r.name,
          isEndpoint: true,
          endpointEnd: ep.end,
          segIndex: ep.segIndex,
          lat: ep.pt.lat,
          lng: ep.pt.lng,
          distMeters: dist,
          bearingDeg: brg,
          turnDeltaDeg,
          score,
        };
      }
    }

    // 2. Check mid-segments along all other roads (or far segments of same road)
    if (r.id === options.anchorRoadId && walked < 22) continue;
    for (let si = 0; si < r.points.length - 1; si++) {
      const a = r.points[si];
      const b = r.points[si + 1];
      const proj = projectPointOnSegment(cursor, a, b);
      if (proj.distMeters > maxRange) continue;
      if (
        options.anchorOrigin &&
        walked < 16 &&
        haversineMeters(proj.point, options.anchorOrigin) < 12
      ) {
        continue;
      }

      const brg =
        proj.distMeters >= 0.4 ? calculateBearing(cursor, proj.point) : cursorHeadingDeg;
      const turnDeltaDeg = ((brg - cursorHeadingDeg + 540) % 360) - 180;
      const absAngle = Math.abs(turnDeltaDeg);
      if (proj.distMeters > 10 && absAngle > 105) continue;

      const score = proj.distMeters + absAngle * 0.25;
      if (!bestSegment || score < bestSegment.score) {
        bestSegment = {
          roadId: r.id,
          roadName: r.name,
          isEndpoint: false,
          segIndex: si,
          lat: proj.point.lat,
          lng: proj.point.lng,
          distMeters: proj.distMeters,
          bearingDeg: brg,
          turnDeltaDeg,
          score,
        };
      }
    }
  }

  if (bestEndpoint && (!bestSegment || bestEndpoint.distMeters <= bestSegment.distMeters + 15)) {
    const { score: _s, ...hit } = bestEndpoint;
    return hit;
  }
  if (bestSegment) {
    const { score: _s, ...hit } = bestSegment;
    return hit;
  }
  return null;
}

/**
 * Stitches an Editor AutoMap path starting from an anchored road endpoint onto:
 * - another cut/open road endpoint (merging the two parts seamlessly into one road), or
 * - a mid-segment touch point on any road (inserting a shared A–P–B vertex in BOTH roads), or
 * - extends the anchored road freely and splits any crossed road intersections.
 */
export function commitEditorAutoMapJoin(
  roads: VillageRoad[],
  anchor: { roadId: string; end: 'start' | 'end' },
  pathPoints: LatLngPoint[],
  options: {
    aheadTarget?: AheadRoadTarget | null;
    snapRadiusMeters?: number;
  } = {}
): { nextRoads: VillageRoad[]; selectedRoadId: string | null } {
  const clean = dedupSequentialPoints(pathPoints, 0.4);
  if (clean.length < 2) {
    return { nextRoads: roads, selectedRoadId: anchor.roadId };
  }

  const working: VillageRoad[] = roads.map((r) => ({
    ...r,
    points: r.points.map((p) => ({ ...p })),
    junctions: r.junctions?.map((j) => ({
      ...j,
      ...(j.branches ? { branches: j.branches.map((b) => ({ ...b })) } : {}),
    })),
  }));

  const anchorIdx = working.findIndex((r) => r.id === anchor.roadId);
  if (anchorIdx < 0 || working[anchorIdx].points.length < 2) {
    return { nextRoads: roads, selectedRoadId: anchor.roadId };
  }

  const snapRadius = options.snapRadiusMeters ?? 24;
  const anchorRoad = working[anchorIdx];
  const extTail = clean.slice(1).map((p) => ({
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy ?? 1.5,
    timestamp: p.timestamp ?? Date.now(),
  }));
  if (extTail.length === 0) {
    return { nextRoads: roads, selectedRoadId: anchor.roadId };
  }

  const walkedMeters = computePathDistance(clean);
  const tip = extTail[extTail.length - 1];

  // Determine snap target on another road (or opposite end of anchorRoad if long enough loop)
  const exclude = walkedMeters < 20 ? new Set([anchorRoad.id]) : undefined;
  let targetHit:
    | {
        roadId: string;
        segIndex: number;
        point: { lat: number; lng: number };
        endpointEnd?: 'start' | 'end';
      }
    | null = null;

  if (
    options.aheadTarget &&
    options.aheadTarget.distMeters <= snapRadius &&
    (options.aheadTarget.roadId !== anchorRoad.id || walkedMeters >= 20)
  ) {
    targetHit = {
      roadId: options.aheadTarget.roadId,
      segIndex: options.aheadTarget.segIndex,
      point: { lat: options.aheadTarget.lat, lng: options.aheadTarget.lng },
      endpointEnd: options.aheadTarget.endpointEnd,
    };
  } else {
    const snap = findNearestRoadSnap(tip, working, snapRadius, exclude);
    if (snap) {
      const tr = working.find((r) => r.id === snap.roadId);
      let endpointEnd: 'start' | 'end' | undefined;
      if (tr && tr.points.length >= 2) {
        const dStart = haversineMeters(snap.point, tr.points[0]);
        const dEnd = haversineMeters(snap.point, tr.points[tr.points.length - 1]);
        if (dStart <= 6 && dStart <= dEnd) endpointEnd = 'start';
        else if (dEnd <= 6) endpointEnd = 'end';
      }
      targetHit = {
        roadId: snap.roadId,
        segIndex: snap.segIndex,
        point: snap.point,
        endpointEnd,
      };
    }
  }

  let resultRoadId = anchorRoad.id;

  if (targetHit && targetHit.roadId !== anchorRoad.id && targetHit.endpointEnd) {
    // Merge both open road pieces seamlessly into one continuous road!
    const targetIdx = working.findIndex((r) => r.id === targetHit!.roadId);
    if (targetIdx >= 0) {
      const targetRoad = working[targetIdx];
      const anchorSeq =
        anchor.end === 'end' ? anchorRoad.points : anchorRoad.points.slice().reverse();
      const targetSeq =
        targetHit.endpointEnd === 'start' ? targetRoad.points : targetRoad.points.slice().reverse();

      const mergedPts = dedupSequentialPoints([...anchorSeq, ...extTail, ...targetSeq], 0.4);
      const mergedJunctions = [...(anchorRoad.junctions ?? []), ...(targetRoad.junctions ?? [])];
      const cleanName = anchorRoad.name.replace(/\s*\(\d+\)$/, '');

      working[anchorIdx] = {
        ...anchorRoad,
        name: cleanName || anchorRoad.name,
        points: mergedPts,
        junctions: mergedJunctions.length > 0 ? mergedJunctions : undefined,
        distanceMeters: computePathDistance(mergedPts),
      };
      working.splice(targetIdx, 1);
      resultRoadId = anchorRoad.id;
      return { nextRoads: working, selectedRoadId: resultRoadId };
    }
  }

  // Snap final tip to mid-segment A–P–B on target road if applicable
  if (targetHit) {
    const targetIdx = working.findIndex((r) => r.id === targetHit!.roadId);
    if (targetIdx >= 0) {
      const { road: splitEx, insertedPoint } = insertTouchPointIntoRoad(
        working[targetIdx],
        targetHit.segIndex,
        targetHit.point
      );
      working[targetIdx] = splitEx;
      extTail[extTail.length - 1] = {
        lat: insertedPoint.lat,
        lng: insertedPoint.lng,
        accuracy: 1.5,
        timestamp: Date.now(),
      };
    }
  }

  // Extend anchorRoad cleanly
  const newAnchorPoints =
    anchor.end === 'end'
      ? dedupSequentialPoints([...anchorRoad.points, ...extTail], 0.4)
      : dedupSequentialPoints([...extTail.slice().reverse(), ...anchorRoad.points], 0.4);

  const curAnchorIdx = working.findIndex((r) => r.id === anchorRoad.id);
  working[curAnchorIdx] = {
    ...anchorRoad,
    points: newAnchorPoints,
    distanceMeters: computePathDistance(newAnchorPoints),
  };

  // Split any roads crossed by the newly extended segment sequence
  for (let ei = 0; ei < working.length; ei++) {
    if (ei === curAnchorIdx) continue;
    let ex = working[ei];
    if (ex.points.length < 2) continue;
    const hits: { newSegIdx: number; t: number; exSegIdx: number; u: number; point: { lat: number; lng: number } }[] = [];
    for (let si = 0; si < clean.length - 1; si++) {
      for (let sj = 0; sj < ex.points.length - 1; sj++) {
        const hit = segmentIntersection(clean[si], clean[si + 1], ex.points[sj], ex.points[sj + 1]);
        if (hit) {
          hits.push({ newSegIdx: si, t: hit.t, exSegIdx: sj, u: hit.u, point: hit.point });
        }
      }
    }
    if (hits.length > 0) {
      const exBySeg = hits.slice().sort((a, b) => b.exSegIdx - a.exSegIdx || b.u - a.u);
      for (const h of exBySeg) {
        ex = insertTouchPointIntoRoad(ex, h.exSegIdx, h.point).road;
      }
      working[ei] = ex;
    }
  }

  return { nextRoads: working, selectedRoadId: resultRoadId };
}

export interface VehicleTourWaypoint {
  roadId: string;
  roadName: string;
  roadIndex: number;
  segIndex: number;
  lat: number;
  lng: number;
  bearingDeg: number;
  cumulativeMeters: number;
}

/**
 * Generates an ordered, connected tour across all village roads at ~2m spacing
 * so the Vehicle Simulator can slowly traverse every road segment in the village.
 */
export function buildVehicleTourWaypoints(
  roads: VillageRoad[],
  stepMeters = 2
): VehicleTourWaypoint[] {
  const validRoads = roads.filter((r) => r.points.length >= 2);
  if (validRoads.length === 0) return [];

  // Order roads via greedy nearest-endpoint chaining so the vehicle flows naturally through the village
  const remaining = validRoads.slice();
  const ordered: { road: VillageRoad; reverse: boolean }[] = [];
  const first = remaining.shift()!;
  ordered.push({ road: first, reverse: false });
  let curTip = first.points[first.points.length - 1];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestRev = false;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      const dStart = haversineMeters(curTip, r.points[0]);
      const dEnd = haversineMeters(curTip, r.points[r.points.length - 1]);
      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        bestRev = false;
      }
      if (dEnd < bestDist) {
        bestDist = dEnd;
        bestIdx = i;
        bestRev = true;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    ordered.push({ road: chosen, reverse: bestRev });
    curTip = bestRev ? chosen.points[0] : chosen.points[chosen.points.length - 1];
  }

  const tour: VehicleTourWaypoint[] = [];
  let totalMeters = 0;

  for (let rIdx = 0; rIdx < ordered.length; rIdx++) {
    const { road, reverse } = ordered[rIdx];
    const pts = road.points;
    const segCount = pts.length - 1;
    let prevPos: { lat: number; lng: number } | null = null;

    for (let stepOrder = 0; stepOrder < segCount; stepOrder++) {
      const segIndex = reverse ? segCount - 1 - stepOrder : stepOrder;
      const a = reverse ? pts[segIndex + 1] : pts[segIndex];
      const b = reverse ? pts[segIndex] : pts[segIndex + 1];
      const segLen = haversineMeters(a, b);
      const bearingDeg =
        segLen >= 0.3
          ? calculateBearing(a, b)
          : tour[tour.length - 1]?.bearingDeg ?? 0;

      if (stepOrder === 0) {
        tour.push({
          roadId: road.id,
          roadName: road.name,
          roadIndex: rIdx,
          segIndex,
          lat: a.lat,
          lng: a.lng,
          bearingDeg,
          cumulativeMeters: totalMeters,
        });
        prevPos = a;
      }

      if (segLen < 0.3) continue;
      const subSteps = Math.max(1, Math.ceil(segLen / stepMeters));
      for (let s = 1; s <= subSteps; s++) {
        const t = s / subSteps;
        const lat = a.lat + (b.lat - a.lat) * t;
        const lng = a.lng + (b.lng - a.lng) * t;
        if (prevPos) {
          totalMeters += haversineMeters(prevPos, { lat, lng });
        }
        prevPos = { lat, lng };
        tour.push({
          roadId: road.id,
          roadName: road.name,
          roadIndex: rIdx,
          segIndex,
          lat,
          lng,
          bearingDeg,
          cumulativeMeters: totalMeters,
        });
      }
    }
  }

  return tour;
}

/**
 * Stamps vehicle accessibility (`car` or `no_car`) on a road segment (or entire road)
 * and re-computes village road hierarchy cleanly.
 */
export function stampRoadSegmentAccess(
  roads: VillageRoad[],
  roadId: string,
  segIndex: number | 'all',
  access: VehicleSegmentAccess
): VillageRoad[] {
  const updated = roads.map((r) => {
    if (r.id !== roadId || r.points.length < 2) return r;
    const segCount = r.points.length - 1;
    const cur: VehicleSegmentAccess[] =
      r.segmentAccess && r.segmentAccess.length === segCount
        ? r.segmentAccess.slice()
        : Array<VehicleSegmentAccess>(segCount).fill('unmarked');

    if (segIndex === 'all') {
      for (let i = 0; i < segCount; i++) cur[i] = access;
    } else if (segIndex >= 0 && segIndex < segCount) {
      cur[segIndex] = access;
    }

    return {
      ...r,
      segmentAccess: cur,
    };
  });

  return classifyVillageRoadHierarchy(updated);
}

/**
 * Automatically identifies Village Main Roads vs Car Streets vs Narrow No-Car Galis
 * by combining Car accessibility with graph connectivity (how many side lanes/galis connect
 * into each car-accessible corridor).
 */
export function classifyVillageRoadHierarchy(roads: VillageRoad[]): VillageRoad[] {
  if (roads.length === 0) return roads;

  // Build spatial junction buckets (~8m) to detect which roads connect into each road
  const SNAP_M = 8;
  const buckets: { lat: number; lng: number; roadIds: Set<string> }[] = [];

  for (const r of roads) {
    for (const p of r.points) {
      let matched = false;
      for (const b of buckets) {
        if (haversineMeters(p, b) <= SNAP_M) {
          b.roadIds.add(r.id);
          matched = true;
          break;
        }
      }
      if (!matched) {
        buckets.push({ lat: p.lat, lng: p.lng, roadIds: new Set([r.id]) });
      }
    }
  }

  const connectedRoadsByRoadId = new Map<string, Set<string>>();
  const junctionDegreeByRoadId = new Map<string, number>();

  for (const r of roads) {
    connectedRoadsByRoadId.set(r.id, new Set());
    junctionDegreeByRoadId.set(r.id, 0);
  }

  for (const b of buckets) {
    if (b.roadIds.size < 2) continue;
    const list = Array.from(b.roadIds);
    for (const rId of list) {
      junctionDegreeByRoadId.set(rId, (junctionDegreeByRoadId.get(rId) ?? 0) + 1);
      const set = connectedRoadsByRoadId.get(rId);
      if (set) {
        for (const otherId of list) {
          if (otherId !== rId) set.add(otherId);
        }
      }
    }
  }

  // Score every road that has at least some Car-passable stretch
  const carScores = new Map<string, number>();
  let topCarScore = 0;

  for (const r of roads) {
    const segCount = Math.max(1, r.points.length - 1);
    const access = r.segmentAccess;
    const carCount = access ? access.filter((a) => a === 'car').length : 0;
    const carRatio = carCount / segCount;

    if (carCount > 0 && carRatio >= 0.35) {
      const connectedLanes = connectedRoadsByRoadId.get(r.id)?.size ?? 0;
      const junctionPts = junctionDegreeByRoadId.get(r.id) ?? 0;
      const surfaceBonus =
        r.surface === 'asphalt' ? 35 : r.surface === 'concrete' ? 20 : r.surface === 'cobblestone' ? 8 : 0;
      const carDistBonus = Math.min(1800, r.distanceMeters * carRatio) * 0.08;
      const score = connectedLanes * 50 + junctionPts * 20 + carDistBonus + surfaceBonus;
      carScores.set(r.id, score);
      if (score > topCarScore) topCarScore = score;
    }
  }

  return roads.map((r) => {
    const access = r.segmentAccess;
    if (!access || access.length === 0) {
      return { ...r, roadRole: 'unmarked' as RoadHierarchyRole };
    }
    const carCount = access.filter((a) => a === 'car').length;
    const noCarCount = access.filter((a) => a === 'no_car').length;

    let role: RoadHierarchyRole = 'unmarked';
    if (carCount > 0) {
      const score = carScores.get(r.id) ?? 0;
      const connectedLanes = connectedRoadsByRoadId.get(r.id)?.size ?? 0;
      const isMainBackbone =
        topCarScore > 0 &&
        score >= Math.max(25, topCarScore * 0.58) &&
        (connectedLanes >= 1 || carScores.size === 1);
      role = isMainBackbone ? 'main' : 'car_street';
    } else if (noCarCount > 0) {
      role = 'narrow_lane';
    }

    return {
      ...r,
      roadRole: role,
    };
  });
}

export interface VehicleHierarchySummary {
  mainRoadNames: string[];
  mainRoadMeters: number;
  carStreetMeters: number;
  noCarMeters: number;
  unmarkedMeters: number;
  surveyedPercent: number;
}

export function summarizeVehicleHierarchy(roads: VillageRoad[]): VehicleHierarchySummary {
  const mainRoadNames: string[] = [];
  let mainRoadMeters = 0;
  let carStreetMeters = 0;
  let noCarMeters = 0;
  let unmarkedMeters = 0;

  for (const r of roads) {
    if (r.points.length < 2) continue;
    const segCount = r.points.length - 1;
    const access = r.segmentAccess;
    const isMain = r.roadRole === 'main';
    if (isMain) mainRoadNames.push(r.name);

    for (let i = 0; i < segCount; i++) {
      const segLen = haversineMeters(r.points[i], r.points[i + 1]);
      const st: VehicleSegmentAccess =
        access && access.length === segCount ? access[i] : 'unmarked';
      if (st === 'car') {
        if (isMain) mainRoadMeters += segLen;
        else carStreetMeters += segLen;
      } else if (st === 'no_car') {
        noCarMeters += segLen;
      } else {
        unmarkedMeters += segLen;
      }
    }
  }

  const total = mainRoadMeters + carStreetMeters + noCarMeters + unmarkedMeters;
  const surveyed = mainRoadMeters + carStreetMeters + noCarMeters;
  const surveyedPercent = total > 0 ? Math.round((surveyed / total) * 100) : 0;

  return {
    mainRoadNames,
    mainRoadMeters,
    carStreetMeters,
    noCarMeters,
    unmarkedMeters,
    surveyedPercent,
  };
}

/**
 * Stamps vehicle access (`car`, `no_car`, or `unmarked`) onto all road segments within
 * `radiusMeters` of `center`, then re-computes village road hierarchy automatically.
 */
export function stampVehicleBrushAt(
  roads: VillageRoad[],
  center: { lat: number; lng: number },
  radiusMeters: number,
  access: VehicleSegmentAccess
): { nextRoads: VillageRoad[]; changed: boolean } {
  let changed = false;

  const updated = roads.map((r) => {
    if (r.points.length < 2) return r;
    const segCount = r.points.length - 1;
    let cur: VehicleSegmentAccess[] | null = null;
    let roadChanged = false;

    for (let i = 0; i < segCount; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const hit = projectPointOnSegment(center, a, b);
      if (hit.distMeters <= radiusMeters) {
        const existing: VehicleSegmentAccess =
          r.segmentAccess && r.segmentAccess.length === segCount ? r.segmentAccess[i] : 'unmarked';
        if (existing !== access) {
          if (!cur) {
            cur =
              r.segmentAccess && r.segmentAccess.length === segCount
                ? r.segmentAccess.slice()
                : Array<VehicleSegmentAccess>(segCount).fill('unmarked');
          }
          cur[i] = access;
          roadChanged = true;
        }
      }
    }

    if (!roadChanged || !cur) return r;
    changed = true;
    return {
      ...r,
      segmentAccess: cur,
    };
  });

  if (!changed) {
    return { nextRoads: roads, changed: false };
  }
  return { nextRoads: classifyVillageRoadHierarchy(updated), changed: true };
}

/**
 * Marks any remaining `'unmarked'` road segments as `'no_car'` once Car-accessible corridors
 * have been painted, then re-classifies Main Roads vs Car Streets vs Narrow Lanes.
 */
export function markRemainingUnmarkedAsNoCar(roads: VillageRoad[]): VillageRoad[] {
  const updated = roads.map((r) => {
    if (r.points.length < 2) return r;
    const segCount = r.points.length - 1;
    const cur: VehicleSegmentAccess[] =
      r.segmentAccess && r.segmentAccess.length === segCount
        ? r.segmentAccess.map((s) => (s === 'unmarked' ? 'no_car' : s))
        : Array<VehicleSegmentAccess>(segCount).fill('no_car');
    return {
      ...r,
      segmentAccess: cur,
    };
  });
  return classifyVillageRoadHierarchy(updated);
}




import type {
  JunctionBranch,
  JunctionDirection,
  LatLngPoint,
  NavigationInstruction,
  RoadJunction,
  TurnDirection,
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
  if (Math.abs(delta) < 22) return 'straight';
  if (delta >= 22 && delta < 65) return 'slight_right';
  if (delta >= 65 && delta < 125) return 'right';
  if (delta >= 125) return 'sharp_right';
  if (delta <= -22 && delta > -65) return 'slight_left';
  if (delta <= -65 && delta > -125) return 'left';
  return 'sharp_left';
}

export function formatTurnAction(turn: TurnDirection, roadName: string): string {
  switch (turn) {
    case 'depart':
      return `Head onto ${roadName}`;
    case 'straight':
      return `Continue straight onto ${roadName}`;
    case 'slight_left':
      return `Keep left onto ${roadName}`;
    case 'left':
      return `Turn left onto ${roadName}`;
    case 'sharp_left':
      return `Sharp left onto ${roadName}`;
    case 'slight_right':
      return `Keep right onto ${roadName}`;
    case 'right':
      return `Turn right onto ${roadName}`;
    case 'sharp_right':
      return `Sharp right onto ${roadName}`;
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

  const instructions: NavigationInstruction[] = [];
  if (edgeSeq.length >= 1) {
    let activeRoadName = edgeSeq[0].roadName;
    let segmentDist = 0;
    let segmentStartPt = polyline[0];
    let lastTurnType: TurnDirection = 'depart';

    for (let i = 0; i < edgeSeq.length; i++) {
      const edge = edgeSeq[i];
      const p1 = polyline[i];
      const p2 = polyline[i + 1];
      const stepMeters = haversineMeters(p1, p2);

      if (i === 0) {
        activeRoadName = edge.roadName;
        segmentDist = stepMeters;
        segmentStartPt = p1;
        lastTurnType = 'depart';
      } else {
        const prevBearing = calculateBearing(polyline[i - 1], p1);
        const currBearing = calculateBearing(p1, p2);
        const turn = getTurnDirection(prevBearing, currBearing);
        const roadChanged = edge.roadName !== activeRoadName;
        const significantTurn = turn !== 'straight';

        if (roadChanged || significantTurn) {
          instructions.push({
            id: `inst-${routeIndex}-${instructions.length}`,
            turnType: lastTurnType,
            instruction: formatTurnAction(lastTurnType, activeRoadName),
            roadName: activeRoadName,
            distanceMeters: Math.round(segmentDist),
            anchorPoint: segmentStartPt,
          });
          activeRoadName = edge.roadName;
          segmentDist = stepMeters;
          segmentStartPt = p1;
          lastTurnType = turn === 'straight' ? 'straight' : turn;
        } else {
          segmentDist += stepMeters;
        }
      }
    }

    instructions.push({
      id: `inst-${routeIndex}-${instructions.length}`,
      turnType: lastTurnType,
      instruction: formatTurnAction(lastTurnType, activeRoadName),
      roadName: activeRoadName,
      distanceMeters: Math.round(segmentDist),
      anchorPoint: segmentStartPt,
    });
  } else {
    const shopLabel = targetHouse.shopName ? ` (${targetHouse.shopName})` : '';
    instructions.push({
      id: `inst-${routeIndex}-0`,
      turnType: 'depart',
      instruction: `Walk toward House ${targetHouse.houseNumber}${shopLabel}`,
      roadName: targetHouse.roadName,
      distanceMeters: Math.round(haversineMeters(userStart, targetHouse)),
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
    anchorPoint: roadEndPt,
  });

  const fullPolyline = [...polyline];
  if (startApproachMeters > 5) {
    fullPolyline.unshift({ lat: userStart.lat, lng: userStart.lng });
  }

  const totalDistanceMeters = Math.round(
    trueDistMeters + (startApproachMeters > 5 ? startApproachMeters : 0)
  );

  const viaSummary =
    roadNamesUsed.length > 0 ? roadNamesUsed.join(' → ') : targetHouse.roadName;

  return {
    reachable: true,
    routeLabel: routeIndex === 0 ? 'Shortest Route' : `Alt Route ${routeIndex}`,
    viaSummary,
    totalDistanceMeters,
    walkMinutes: Math.max(1, Math.round(totalDistanceMeters / 75)),
    bikeMinutes: Math.max(1, Math.round(totalDistanceMeters / 230)),
    polyline: fullPolyline,
    instructions,
  };
}

/**
 * Finds up to 3 distinct road-following routes from user's location to the target house,
 * comparing time & distance across alternative saved village paths.
 */
export function findRoutesToHouse(
  roads: VillageRoad[],
  start: { lat: number; lng: number },
  targetHouse: VillageHouse,
  maxRoutes = 3
): VillageRouteResult[] {
  if (roads.length === 0) {
    return [
      {
        reachable: false,
        totalDistanceMeters: 0,
        walkMinutes: 0,
        bikeMinutes: 0,
        polyline: [],
        instructions: [],
        reason: 'No village roads recorded yet. Walk a road first.',
      },
    ];
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

  const penalized = new Map<number, number>();
  const foundPaths: { nodeSeq: number[]; edgeSeq: GraphEdge[]; trueDistMeters: number }[] = [];
  const seenSignatures = new Set<string>();

  for (let attempt = 0; attempt < maxRoutes * 2 && foundPaths.length < maxRoutes; attempt++) {
    const res = runDijkstra(graph.nodes, graph.adj, graph.startNode, graph.endNode, penalized);
    if (!res) break;

    const sig = res.nodeSeq.join('-');
    const bestDist = foundPaths[0]?.trueDistMeters ?? res.trueDistMeters;

    if (!seenSignatures.has(sig)) {
      const isDistinctEnough =
        foundPaths.length === 0 ||
        (res.trueDistMeters <= Math.max(bestDist * 2.4, bestDist + 250) &&
          foundPaths.every((prev) => {
            const prevEdges = new Set(prev.edgeSeq.map((e) => e.edgeId));
            const shared = res.edgeSeq.filter((e) => prevEdges.has(e.edgeId)).length;
            return shared < Math.max(1, Math.floor(res.edgeSeq.length * 0.85));
          }));

      if (isDistinctEnough) {
        seenSignatures.add(sig);
        foundPaths.push(res);
      }
    }

    for (const e of res.edgeSeq) {
      penalized.set(e.edgeId, (penalized.get(e.edgeId) ?? 0) + 1);
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

  return foundPaths.map((p, idx) =>
    buildRouteResultFromPath(
      graph.nodes,
      p.nodeSeq,
      p.edgeSeq,
      p.trueDistMeters,
      graph.startApproachMeters,
      start,
      targetHouse,
      idx
    )
  );
}

export function findRouteToHouse(
  roads: VillageRoad[],
  start: { lat: number; lng: number },
  targetHouse: VillageHouse
): VillageRouteResult {
  return findRoutesToHouse(roads, start, targetHouse, 1)[0];
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

  const coveredMeters = computePathDistance(completedPolyline);
  const remainingMeters = computePathDistance(remainingPolyline);

  // Determine exact active step index based on cumulative road distance along the route
  let activeStepIndex = 0;
  if (route.instructions.length > 1) {
    let minInstDist = Infinity;
    for (let idx = 0; idx < route.instructions.length; idx++) {
      const inst = route.instructions[idx];
      // Find closest instruction anchor along or behind/near current user spot
      const d = haversineMeters(bestPt, inst.anchorPoint);
      if (d < minInstDist) {
        minInstDist = d;
        activeStepIndex = idx;
      }
    }
    // Prefer the step whose segment we are currently walking on using cumulative instruction distances
    let cum = 0;
    for (let idx = 0; idx < route.instructions.length - 1; idx++) {
      const nextCum = cum + Math.max(0, route.instructions[idx].distanceMeters);
      if (coveredMeters >= cum - 4 && coveredMeters <= nextCum + 4) {
        activeStepIndex = idx;
        break;
      }
      cum = nextCum;
    }
    if (remainingMeters <= 15) {
      activeStepIndex = route.instructions.length - 1;
    }
  }

  const nextInst =
    activeStepIndex + 1 < route.instructions.length
      ? route.instructions[activeStepIndex + 1]
      : null;
  const distanceToNextTurnMeters = nextInst
    ? Math.round(haversineMeters(bestPt, nextInst.anchorPoint))
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
  const updatedExisting = existingRoads.map((r) => ({
    ...r,
    junctions: r.junctions?.map((j) => ({
      ...j,
      branches: j.branches?.map((b) => ({ ...b })),
    })),
  }));
  const linkedNew = newRoads.map((r) => ({
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

    // 2. If not linked to an explicit pending branch, auto-snap start/end to any nearby saved road segment
    if (!linkedToJunction && updatedExisting.length > 0) {
      let bestSnap: {
        pt: { lat: number; lng: number };
        dist: number;
        attachEnd: 'start' | 'end';
        parentName: string;
      } | null = null;

      for (const ex of updatedExisting) {
        for (let si = 0; si < ex.points.length - 1; si++) {
          const pStart = projectPointOnSegment(road.points[0], ex.points[si], ex.points[si + 1]);
          if (pStart.distMeters <= 18 && (!bestSnap || pStart.distMeters < bestSnap.dist)) {
            bestSnap = {
              pt: pStart.point,
              dist: pStart.distMeters,
              attachEnd: 'start',
              parentName: ex.name,
            };
          }
          const last = road.points[road.points.length - 1];
          const pEnd = projectPointOnSegment(last, ex.points[si], ex.points[si + 1]);
          if (pEnd.distMeters <= 18 && (!bestSnap || pEnd.distMeters < bestSnap.dist)) {
            bestSnap = {
              pt: pEnd.point,
              dist: pEnd.distMeters,
              attachEnd: 'end',
              parentName: ex.name,
            };
          }
        }
      }

      if (bestSnap && bestSnap.dist > 0.6) {
        if (bestSnap.attachEnd === 'start') {
          road.points.unshift({ lat: bestSnap.pt.lat, lng: bestSnap.pt.lng, accuracy: 1.5 });
        } else {
          road.points.push({ lat: bestSnap.pt.lat, lng: bestSnap.pt.lng, accuracy: 1.5 });
        }
        road.distanceMeters = computePathDistance(road.points);
        linkedSummaries.push(`Connected to ${bestSnap.parentName}`);
      }
    }
  }

  return {
    linkedNewRoads: linkedNew,
    updatedExistingRoads: updatedExisting,
    linkedSummaries,
  };
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


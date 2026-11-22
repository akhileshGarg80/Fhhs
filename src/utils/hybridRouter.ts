import type {
  NavigationInstruction,
  TravelMode,
  VillageHouse,
  VillageRoad,
  VillageRouteResult,
} from '../types/map.ts';
import {
  extractCarAccessibleRoads,
  findRoutesToHouse,
  formatDistance,
  haversineMeters,
  projectPointOnSegment,
} from './geo.ts';
import { fetchOsrmNearest, fetchOsrmRoutes } from './osmClient.ts';

const CLUSTER_LINK_METERS = 25;
const NEAR_CLUSTER_MAX_METERS = 250;

function roadsConnect(a: VillageRoad, b: VillageRoad): boolean {
  if (a.points.length < 2 || b.points.length < 2) return false;

  for (const j of a.junctions ?? []) {
    for (let si = 0; si < b.points.length - 1; si++) {
      if (projectPointOnSegment(j, b.points[si], b.points[si + 1]).distMeters <= CLUSTER_LINK_METERS) {
        return true;
      }
    }
  }
  for (const j of b.junctions ?? []) {
    for (let si = 0; si < a.points.length - 1; si++) {
      if (projectPointOnSegment(j, a.points[si], a.points[si + 1]).distMeters <= CLUSTER_LINK_METERS) {
        return true;
      }
    }
  }

  for (const ptA of a.points) {
    for (let si = 0; si < b.points.length - 1; si++) {
      if (projectPointOnSegment(ptA, b.points[si], b.points[si + 1]).distMeters <= CLUSTER_LINK_METERS) {
        return true;
      }
    }
  }
  for (const ptB of b.points) {
    for (let si = 0; si < a.points.length - 1; si++) {
      if (projectPointOnSegment(ptB, a.points[si], a.points[si + 1]).distMeters <= CLUSTER_LINK_METERS) {
        return true;
      }
    }
  }

  return false;
}

function findLocalClusterNear(
  roads: VillageRoad[],
  anchor: { lat: number; lng: number },
  maxDistMeters = NEAR_CLUSTER_MAX_METERS
): VillageRoad[] {
  const valid = roads.filter((r) => r.points.length >= 2);
  if (valid.length === 0) return [];

  let closestIdx = -1;
  let closestDist = Infinity;
  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    for (let s = 0; s < r.points.length - 1; s++) {
      const d = projectPointOnSegment(anchor, r.points[s], r.points[s + 1]).distMeters;
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }
  }

  if (closestIdx === -1 || closestDist > maxDistMeters) return [];

  const visited = new Set<number>([closestIdx]);
  const queue: number[] = [closestIdx];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (let i = 0; i < valid.length; i++) {
      if (visited.has(i)) continue;
      if (roadsConnect(valid[cur], valid[i])) {
        visited.add(i);
        queue.push(i);
      }
    }
  }

  return Array.from(visited).map((idx) => valid[idx]);
}

function collectClusterEndpointCandidates(
  cluster: VillageRoad[],
  towardsPoint: { lat: number; lng: number }
): { lat: number; lng: number; roadId: string; roadName: string }[] {
  const candidates: {
    lat: number;
    lng: number;
    roadId: string;
    roadName: string;
    score: number;
  }[] = [];

  for (const r of cluster) {
    if (r.points.length < 2) continue;
    const roleBonus =
      r.roadRole === 'main' ? 140 : r.roadRole === 'car_street' ? 70 : 0;

    const endpoints = [r.points[0], r.points[r.points.length - 1]];
    for (const pt of endpoints) {
      const distToTarget = haversineMeters(pt, towardsPoint);
      candidates.push({
        lat: pt.lat,
        lng: pt.lng,
        roadId: r.id,
        roadName: r.name,
        score: distToTarget - roleBonus,
      });
    }

    // Also include mid-point of main roads in case an exit road passes directly beside a highway
    if (r.roadRole === 'main' && r.points.length >= 4) {
      const midPt = r.points[Math.floor(r.points.length / 2)];
      candidates.push({
        lat: midPt.lat,
        lng: midPt.lng,
        roadId: r.id,
        roadName: r.name,
        score: haversineMeters(midPt, towardsPoint) - roleBonus,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  const unique: { lat: number; lng: number; roadId: string; roadName: string }[] = [];
  for (const c of candidates) {
    if (!unique.some((u) => haversineMeters(u, c) < 25)) {
      unique.push({ lat: c.lat, lng: c.lng, roadId: c.roadId, roadName: c.roadName });
    }
    if (unique.length >= 5) break;
  }
  return unique;
}

function createVirtualAnchorHouse(
  pt: { lat: number; lng: number },
  roadId: string,
  roadName: string,
  label: string
): VillageHouse {
  return {
    id: `__virtual_${roadId}_${Math.round(pt.lat * 10000)}`,
    houseNumber: label,
    villageName: 'Exit',
    roadId,
    roadName,
    lat: pt.lat,
    lng: pt.lng,
    roadLat: pt.lat,
    roadLng: pt.lng,
    side: 'right',
    createdAt: '',
  };
}

function appendDedupedPoints(
  target: { lat: number; lng: number }[],
  pts: { lat: number; lng: number }[]
) {
  for (const pt of pts) {
    const last = target[target.length - 1];
    if (!last || haversineMeters(last, pt) >= 1.2) {
      target.push({ lat: pt.lat, lng: pt.lng });
    }
  }
}

export async function computeHybridVillageOsmRoutes(params: {
  roads: VillageRoad[];
  start: { lat: number; lng: number };
  targetHouse: VillageHouse;
  travelMode: TravelMode;
}): Promise<VillageRouteResult[]> {
  const { roads, start, targetHouse, travelMode } = params;
  const isExternalOsmDest = targetHouse.roadId === '__osm_external__';
  const destPoint = isExternalOsmDest
    ? { lat: targetHouse.lat, lng: targetHouse.lng }
    : { lat: targetHouse.roadLat, lng: targetHouse.roadLng };

  // ---------------------------------------------------------------------------
  // LEG 1: Origin Village Road Network -> Village Exit onto OpenStreetMap Road
  // ---------------------------------------------------------------------------
  const originPool = travelMode === 'car' ? extractCarAccessibleRoads(roads) : roads;
  const originCluster = findLocalClusterNear(originPool, start, NEAR_CLUSTER_MAX_METERS);

  let leg1Route: VillageRouteResult | null = null;
  let leg2Start: { lat: number; lng: number } = { lat: start.lat, lng: start.lng };
  let originExitRoadName = '';

  if (originCluster.length > 0) {
    const exitCandidates = collectClusterEndpointCandidates(originCluster, destPoint);
    for (const cand of exitCandidates.slice(0, 2)) {
      const osmSnap = await fetchOsrmNearest(cand, travelMode);
      const exitTargetPt = osmSnap ?? cand;
      const distStartToExit = haversineMeters(start, cand);
      const distStartToDest = haversineMeters(start, destPoint);
      const distExitToDest = haversineMeters(exitTargetPt, destPoint);

      // Only route via village exit if user actually needs to travel on local roads (>18m)
      // and it doesn't backtrack significantly compared to starting directly on OSM.
      if (distStartToExit >= 18 && distExitToDest <= distStartToDest + 450) {
        const virtualExit = createVirtualAnchorHouse(cand, cand.roadId, cand.roadName, 'OSM Exit');
        const leg1Try = findRoutesToHouse(originCluster, start, virtualExit, 1, 'walk')[0];
        if (leg1Try?.reachable && leg1Try.polyline.length >= 2) {
          leg1Route = leg1Try;
          originExitRoadName = cand.roadName;
          leg2Start = osmSnap ? { lat: osmSnap.lat, lng: osmSnap.lng } : { lat: cand.lat, lng: cand.lng };
          break;
        }
      }
      if (osmSnap) {
        leg2Start = { lat: osmSnap.lat, lng: osmSnap.lng };
        break;
      }
    }
  } else {
    const startSnap = await fetchOsrmNearest(start, travelMode);
    if (startSnap && startSnap.distanceMeters <= 1200) {
      leg2Start = { lat: startSnap.lat, lng: startSnap.lng };
    }
  }

  // ---------------------------------------------------------------------------
  // LEG 3: Destination Village Entry -> Target House / Shop (unless external OSM)
  // ---------------------------------------------------------------------------
  let leg3Route: VillageRouteResult | null = null;
  let leg2End: { lat: number; lng: number } = { lat: destPoint.lat, lng: destPoint.lng };
  let destEntryPoint: { lat: number; lng: number } = { lat: destPoint.lat, lng: destPoint.lng };
  let destCarFallbackWalkMeters: number | undefined;
  let destCarFallbackStopPoint: { lat: number; lng: number } | undefined;

  if (!isExternalOsmDest) {
    const allDestCluster = findLocalClusterNear(roads, destPoint, NEAR_CLUSTER_MAX_METERS);
    if (allDestCluster.length > 0) {
      const entryPool =
        travelMode === 'car' ? extractCarAccessibleRoads(allDestCluster) : allDestCluster;
      const usableEntryCluster = entryPool.length > 0 ? entryPool : allDestCluster;
      const entryCandidates = collectClusterEndpointCandidates(usableEntryCluster, leg2Start);

      for (const cand of entryCandidates.slice(0, 2)) {
        const osmSnap = await fetchOsrmNearest(cand, travelMode);
        const leg3Try = findRoutesToHouse(allDestCluster, cand, targetHouse, 1, travelMode)[0];
        if (leg3Try?.reachable && leg3Try.polyline.length >= 2) {
          leg3Route = leg3Try;
          destEntryPoint = { lat: cand.lat, lng: cand.lng };
          leg2End = osmSnap ? { lat: osmSnap.lat, lng: osmSnap.lng } : { lat: cand.lat, lng: cand.lng };
          break;
        }
        if (travelMode === 'car') {
          const walkOnlyTry = findRoutesToHouse(allDestCluster, cand, targetHouse, 1, 'walk')[0];
          if (walkOnlyTry?.reachable) {
            leg2End = osmSnap ? { lat: osmSnap.lat, lng: osmSnap.lng } : { lat: cand.lat, lng: cand.lng };
            destCarFallbackStopPoint = leg2End;
            destCarFallbackWalkMeters = walkOnlyTry.totalDistanceMeters;
            break;
          }
        }
      }
    } else {
      const destSnap = await fetchOsrmNearest(destPoint, travelMode);
      if (destSnap && destSnap.distanceMeters <= 1500) {
        leg2End = { lat: destSnap.lat, lng: destSnap.lng };
      }
    }
  } else {
    const destSnap = await fetchOsrmNearest(destPoint, travelMode);
    if (destSnap && destSnap.distanceMeters <= 1200) {
      leg2End = { lat: destSnap.lat, lng: destSnap.lng };
    }
  }

  // ---------------------------------------------------------------------------
  // LEG 2: OpenStreetMap OSRM Highway / Inter-City / Inter-Village Network
  // ---------------------------------------------------------------------------
  const osrmRoutes = await fetchOsrmRoutes([leg2Start, leg2End], travelMode);
  if (osrmRoutes.length === 0) {
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
        reason:
          'Could not connect via OpenStreetMap routing server right now. Check internet connection or add connecting village road.',
      },
    ];
  }

  const destDisplayName =
    targetHouse.shopName?.trim() ||
    (isExternalOsmDest ? targetHouse.villageName : `House ${targetHouse.houseNumber}`);

  return osrmRoutes.map((osrm, idx): VillageRouteResult => {
    const fullPolyline: { lat: number; lng: number }[] = [];

    if (leg1Route && leg1Route.polyline.length >= 2) {
      appendDedupedPoints(fullPolyline, leg1Route.polyline);
    } else {
      appendDedupedPoints(fullPolyline, [start]);
    }

    appendDedupedPoints(fullPolyline, osrm.polyline);

    if (leg3Route && leg3Route.polyline.length >= 2) {
      appendDedupedPoints(fullPolyline, leg3Route.polyline);
    } else if (isExternalOsmDest) {
      const osmEndPt = osrm.polyline[osrm.polyline.length - 1];
      if (osmEndPt && haversineMeters(osmEndPt, destPoint) > 8 && haversineMeters(osmEndPt, destPoint) <= 600) {
        appendDedupedPoints(fullPolyline, [destPoint]);
      }
    }

    // Build stitched Turn-by-Turn Instructions across Leg 1 + Leg 2 + Leg 3
    const instructions: NavigationInstruction[] = [];
    let runningDist = 0;

    if (leg1Route && leg1Route.instructions.length > 0) {
      const leg1Body = leg1Route.instructions.slice(0, -1);
      for (let i = 0; i < leg1Body.length; i++) {
        const inst = leg1Body[i];
        instructions.push({
          ...inst,
          id: `hyb-${idx}-l1-${i}`,
          cumDistanceMeters: runningDist,
        });
        runningDist += inst.distanceMeters;
      }

      const bridgeGap = Math.round(
        haversineMeters(
          leg1Route.polyline[leg1Route.polyline.length - 1],
          osrm.polyline[0]
        )
      );
      const firstOsmRoad = osrm.steps[0]?.name || 'OpenStreetMap Highway';
      instructions.push({
        id: `hyb-${idx}-bridge-out`,
        turnType: 'straight',
        instruction: `Exit village (${originExitRoadName || 'Local Road'}) onto ${firstOsmRoad} (OSM)`,
        roadName: firstOsmRoad,
        distanceMeters: bridgeGap,
        cumDistanceMeters: runningDist,
        anchorPoint: osrm.polyline[0],
      });
      runningDist += bridgeGap;
    }

    // Leg 2 OSRM steps
    const osrmSteps = osrm.steps;
    const hasLeg3 = Boolean(leg3Route && leg3Route.instructions.length > 0);
    for (let i = 0; i < osrmSteps.length; i++) {
      const s = osrmSteps[i];
      if (s.turnType === 'arrive') {
        if (hasLeg3) {
          const entryBridgeGap = Math.round(
            haversineMeters(osrm.polyline[osrm.polyline.length - 1], destEntryPoint)
          );
          instructions.push({
            id: `hyb-${idx}-bridge-in`,
            turnType: 'straight',
            instruction: `Leave OpenStreetMap road & enter ${
              targetHouse.villageName || 'destination village'
            } roads`,
            roadName: targetHouse.roadName || 'Village Road',
            distanceMeters: entryBridgeGap,
            cumDistanceMeters: runningDist,
            anchorPoint: destEntryPoint,
          });
          runningDist += entryBridgeGap;
          continue;
        }
        if (destCarFallbackStopPoint) {
          instructions.push({
            id: `hyb-${idx}-car-stop`,
            turnType: 'arrive',
            instruction: `Car stops on OpenStreetMap road · Walk ${formatDistance(
              destCarFallbackWalkMeters ?? 0
            )} to ${destDisplayName}`,
            roadName: targetHouse.roadName,
            distanceMeters: 0,
            cumDistanceMeters: runningDist,
            anchorPoint: destCarFallbackStopPoint,
          });
          continue;
        }
        instructions.push({
          id: `hyb-${idx}-osm-arrive`,
          turnType: 'arrive',
          instruction: isExternalOsmDest
            ? `Arrive at ${destDisplayName}`
            : `Arrive near ${destDisplayName} (${targetHouse.side === 'left' ? 'Left' : 'Right'})`,
          roadName: destDisplayName,
          distanceMeters: 0,
          cumDistanceMeters: runningDist,
          anchorPoint: s.anchorPoint,
        });
        continue;
      }

      instructions.push({
        id: `hyb-${idx}-osm-${i}`,
        turnType: s.turnType,
        instruction: s.instruction,
        roadName: s.name,
        distanceMeters: s.distanceMeters,
        cumDistanceMeters: runningDist,
        anchorPoint: s.anchorPoint,
      });
      runningDist += s.distanceMeters;
    }

    // Leg 3 Local Village Destination Instructions
    if (leg3Route && leg3Route.instructions.length > 0) {
      for (let i = 0; i < leg3Route.instructions.length; i++) {
        const inst = leg3Route.instructions[i];
        instructions.push({
          ...inst,
          id: `hyb-${idx}-l3-${i}`,
          cumDistanceMeters: runningDist,
        });
        runningDist += inst.distanceMeters;
      }
    }

    const leg1Dist = leg1Route?.totalDistanceMeters ?? 0;
    const leg2Dist = osrm.distanceMeters;
    const leg3Dist = leg3Route?.totalDistanceMeters ?? 0;
    const totalDistanceMeters = Math.max(
      leg1Dist + leg2Dist + leg3Dist,
      Math.round(runningDist)
    );

    const localVillageDist = leg1Dist + leg3Dist;
    const carMinutes = Math.max(
      1,
      Math.round(osrm.durationSeconds / 60 + localVillageDist / 420)
    );
    const bikeMinutes = Math.max(1, Math.round(totalDistanceMeters / 230));
    const walkMinutes = Math.max(1, Math.round(totalDistanceMeters / 75));

    const stageParts: string[] = [];
    if (leg1Dist >= 15) stageParts.push(`Village Exit ${formatDistance(leg1Dist)}`);
    stageParts.push(`OpenStreetMap ${formatDistance(leg2Dist)}`);
    if (leg3Dist >= 15) stageParts.push(`Village Entry ${formatDistance(leg3Dist)}`);

    const viaParts: string[] = [];
    if (leg1Route?.viaSummary) viaParts.push(leg1Route.viaSummary);
    viaParts.push(`OSM: ${osrm.roadSummary}`);
    if (leg3Route?.viaSummary) viaParts.push(leg3Route.viaSummary);

    return {
      reachable: true,
      travelMode,
      routeLabel:
        idx === 0 ? 'Village + OpenStreetMap (Best)' : `Village + OpenStreetMap Alt ${idx + 1}`,
      viaSummary: viaParts.join(' → '),
      totalDistanceMeters,
      walkMinutes,
      bikeMinutes,
      carMinutes,
      carPartialStop: leg3Route?.carPartialStop ?? Boolean(destCarFallbackStopPoint),
      carStopPoint: leg3Route?.carStopPoint ?? destCarFallbackStopPoint,
      lastMileWalkMeters: leg3Route?.lastMileWalkMeters ?? destCarFallbackWalkMeters,
      isHybridOsmRoute: true,
      hybridStageSummary: stageParts.join(' → '),
      hybridOriginRoadDistMeters: leg1Dist,
      hybridOsmDistMeters: leg2Dist,
      hybridDestRoadDistMeters: leg3Dist,
      polyline: fullPolyline,
      instructions,
    };
  });
}

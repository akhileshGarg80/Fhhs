import type { TravelMode, TurnDirection } from '../types/map.ts';

export interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface OsrmNearestSnap {
  lat: number;
  lng: number;
  name: string;
  distanceMeters: number;
}

export interface OsrmStep {
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  turnType: TurnDirection;
  instruction: string;
  anchorPoint: { lat: number; lng: number };
}

export interface OsrmRouteData {
  distanceMeters: number;
  durationSeconds: number;
  polyline: { lat: number; lng: number }[];
  steps: OsrmStep[];
  roadSummary: string;
}

export async function searchPlaceNominatim(query: string): Promise<NominatimSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(
    q
  )}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimSearchResult[];
  return Array.isArray(data) ? data : [];
}

export async function reverseGeocodeVillage(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return 'My Village';
    const data = (await res.json()) as { address?: Record<string, string> };
    const addr = data.address ?? {};
    return (
      addr.village ||
      addr.hamlet ||
      addr.suburb ||
      addr.town ||
      addr.city_district ||
      addr.county ||
      'My Village'
    );
  } catch {
    return 'My Village';
  }
}

function getOsrmProfile(travelMode: TravelMode): 'driving' | 'bike' | 'foot' {
  if (travelMode === 'bike') return 'bike';
  if (travelMode === 'walk') return 'foot';
  return 'driving';
}

export function mapOsrmManeuverToTurn(type?: string, modifier?: string): TurnDirection {
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  const mod = (modifier ?? '').toLowerCase();
  if (mod === 'sharp left' || mod === 'uturn') return 'sharp_left';
  if (mod === 'left') return 'left';
  if (mod === 'slight left') return 'slight_left';
  if (mod === 'sharp right') return 'sharp_right';
  if (mod === 'right') return 'right';
  if (mod === 'slight right') return 'slight_right';
  return 'straight';
}

function formatOsrmStepInstruction(
  type: string | undefined,
  modifier: string | undefined,
  turnType: TurnDirection,
  roadName: string
): string {
  const cleanRoad = roadName.trim() || 'OpenStreetMap Road';
  if (type === 'depart') {
    return `Take ${cleanRoad} (OpenStreetMap)`;
  }
  if (type === 'roundabout' || type === 'rotary') {
    return `Take roundabout onto ${cleanRoad}`;
  }
  if (type === 'merge') {
    return `Merge onto ${cleanRoad}`;
  }
  if (type === 'fork') {
    if (turnType === 'slight_left' || turnType === 'left') {
      return `Keep left onto ${cleanRoad}`;
    }
    if (turnType === 'slight_right' || turnType === 'right') {
      return `Keep right onto ${cleanRoad}`;
    }
    return `Continue onto ${cleanRoad}`;
  }
  if (modifier === 'uturn') {
    return `Make a U-turn onto ${cleanRoad}`;
  }
  switch (turnType) {
    case 'left':
      return `Turn left onto ${cleanRoad}`;
    case 'slight_left':
      return `Bear left onto ${cleanRoad}`;
    case 'sharp_left':
      return `Sharp left onto ${cleanRoad}`;
    case 'right':
      return `Turn right onto ${cleanRoad}`;
    case 'slight_right':
      return `Bear right onto ${cleanRoad}`;
    case 'sharp_right':
      return `Sharp right onto ${cleanRoad}`;
    case 'arrive':
      return `Arrive at ${cleanRoad}`;
    default:
      return `Continue on ${cleanRoad}`;
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface RawOsrmNearestResponse {
  code?: string;
  waypoints?: {
    location?: [number, number];
    name?: string;
    distance?: number;
  }[];
}

export async function fetchOsrmNearest(
  point: { lat: number; lng: number },
  travelMode: TravelMode
): Promise<OsrmNearestSnap | null> {
  const primaryProfile = getOsrmProfile(travelMode);
  const profiles = primaryProfile === 'driving' ? (['driving'] as const) : ([primaryProfile, 'driving'] as const);

  for (const profile of profiles) {
    const url = `https://router.project-osrm.org/nearest/v1/${profile}/${point.lng.toFixed(
      6
    )},${point.lat.toFixed(6)}?number=1`;
    const data = await fetchJsonWithTimeout<RawOsrmNearestResponse>(url, 4500);
    const wp = data?.code === 'Ok' ? data.waypoints?.[0] : undefined;
    if (wp?.location && wp.location.length >= 2) {
      return {
        lat: wp.location[1],
        lng: wp.location[0],
        name: wp.name?.trim() || 'OpenStreetMap Road',
        distanceMeters: Math.round(wp.distance ?? 0),
      };
    }
  }
  return null;
}

interface RawOsrmStep {
  name?: string;
  ref?: string;
  distance?: number;
  duration?: number;
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: [number, number];
  };
}

interface RawOsrmRouteResponse {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: [number, number][];
    };
    legs?: {
      summary?: string;
      steps?: RawOsrmStep[];
    }[];
  }[];
}

export async function fetchOsrmRoutes(
  waypoints: { lat: number; lng: number }[],
  travelMode: TravelMode
): Promise<OsrmRouteData[]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const primaryProfile = getOsrmProfile(travelMode);
  const profiles =
    primaryProfile === 'driving' ? (['driving'] as const) : ([primaryProfile, 'driving'] as const);

  for (const profile of profiles) {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const data = await fetchJsonWithTimeout<RawOsrmRouteResponse>(url, 9000);
    if (data?.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      continue;
    }

    const parsed: OsrmRouteData[] = [];
    for (const r of data.routes.slice(0, 3)) {
      const rawCoords = r.geometry?.coordinates ?? [];
      if (rawCoords.length < 2) continue;
      const polyline = rawCoords.map(([lng, lat]) => ({ lat, lng }));
      const rawSteps = (r.legs ?? []).flatMap((leg) => leg.steps ?? []);
      const steps: OsrmStep[] = [];
      const roadNames: string[] = [];

      for (const s of rawSteps) {
        const roadName = [s.ref?.trim(), s.name?.trim()].filter(Boolean).join(' · ') || 'Highway / Road';
        if (s.name?.trim() && roadNames[roadNames.length - 1] !== s.name.trim()) {
          roadNames.push(s.name.trim());
        } else if (s.ref?.trim() && roadNames[roadNames.length - 1] !== s.ref.trim()) {
          roadNames.push(s.ref.trim());
        }
        const mType = s.maneuver?.type;
        const mMod = s.maneuver?.modifier;
        const turnType = mapOsrmManeuverToTurn(mType, mMod);
        const loc = s.maneuver?.location;
        const anchorPoint =
          loc && loc.length >= 2 ? { lat: loc[1], lng: loc[0] } : polyline[0];

        steps.push({
          name: roadName,
          distanceMeters: Math.round(s.distance ?? 0),
          durationSeconds: Math.round(s.duration ?? 0),
          turnType,
          instruction: formatOsrmStepInstruction(mType, mMod, turnType, roadName),
          anchorPoint,
        });
      }

      const legSummary =
        (r.legs ?? [])
          .map((l) => l.summary?.trim())
          .filter(Boolean)
          .join(' → ') ||
        roadNames.slice(0, 4).join(' → ') ||
        'OpenStreetMap Road';

      parsed.push({
        distanceMeters: Math.round(r.distance ?? 0),
        durationSeconds: Math.round(r.duration ?? 0),
        polyline,
        steps,
        roadSummary: legSummary,
      });
    }

    if (parsed.length > 0) return parsed;
  }

  return [];
}

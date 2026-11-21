import type { AutoTrip, VillageHouse, VillageRoad } from '../types/map.ts';
import { calculateBearing, offsetCoord } from './geo.ts';

const STORAGE_KEY = 'grampath_house_mapper_v2';
const AUTO_TRIPS_KEY = 'grampath_auto_trips_v1';

export interface LocalHouseStore {
  roads: VillageRoad[];
  houses: VillageHouse[];
}

function createStarterStore(): LocalHouseStore {
  const now = new Date().toISOString();

  // Sample connected village roads with a clear Left/Right turn so House # search works immediately
  const road1Points = [
    { lat: 24.9852, lng: 82.0625 },
    { lat: 24.9858, lng: 82.0625 },
    { lat: 24.9864, lng: 82.0625 },
    { lat: 24.9869, lng: 82.0625 },
  ];
  const road2Points = [
    { lat: 24.9869, lng: 82.0625 },
    { lat: 24.9869, lng: 82.0633 },
    { lat: 24.9869, lng: 82.0641 },
    { lat: 24.9869, lng: 82.0649 },
  ];
  const road3Points = [
    { lat: 24.9852, lng: 82.0625 },
    { lat: 24.9852, lng: 82.0637 },
    { lat: 24.9856, lng: 82.0649 },
    { lat: 24.9863, lng: 82.0649 },
    { lat: 24.9869, lng: 82.0649 },
  ];

  const roads: VillageRoad[] = [
    {
      id: 'road-main-gali',
      name: 'Mandir Main Gali',
      villageName: 'Koraon Gram',
      surface: 'concrete',
      points: road1Points,
      distanceMeters: 189,
      durationSeconds: 145,
      captureMode: 'gps_walk',
      createdAt: now,
    },
    {
      id: 'road-purab-lane',
      name: 'Purab Mohalla Lane',
      villageName: 'Koraon Gram',
      surface: 'cobblestone',
      points: road2Points,
      distanceMeters: 242,
      durationSeconds: 180,
      captureMode: 'gps_walk',
      createdAt: now,
    },
    {
      id: 'road-dakshin-link',
      name: 'Dakshin Link Marg',
      villageName: 'Koraon Gram',
      surface: 'unpaved',
      points: road3Points,
      distanceMeters: 425,
      durationSeconds: 290,
      captureMode: 'gps_walk',
      createdAt: now,
    },
  ];

  const makeHouse = (
    id: string,
    houseNumber: string,
    side: 'left' | 'right',
    ptA: { lat: number; lng: number },
    ptB: { lat: number; lng: number },
    road: VillageRoad
  ): VillageHouse => {
    const heading = calculateBearing(ptA, ptB);
    const sideBearing = side === 'left' ? (heading + 270) % 360 : (heading + 90) % 360;
    const visual = offsetCoord(ptB, sideBearing, 8);
    return {
      id,
      houseNumber,
      side,
      lat: visual.lat,
      lng: visual.lng,
      roadLat: ptB.lat,
      roadLng: ptB.lng,
      roadId: road.id,
      roadName: road.name,
      villageName: road.villageName,
      createdAt: now,
    };
  };

  const houses: VillageHouse[] = [
    makeHouse('h-1', '1', 'left', road1Points[0], road1Points[1], roads[0]),
    makeHouse('h-2', '2', 'right', road1Points[0], road1Points[1], roads[0]),
    makeHouse('h-3', '3', 'left', road1Points[1], road1Points[2], roads[0]),
    makeHouse('h-4', '4', 'right', road2Points[0], road2Points[1], roads[1]),
    makeHouse('h-5', '5', 'left', road2Points[1], road2Points[2], roads[1]),
    makeHouse('h-6', '6', 'right', road2Points[2], road2Points[3], roads[1]),
  ];

  return { roads, houses };
}

export function loadLocalStore(): LocalHouseStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createStarterStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as Partial<LocalHouseStore>;
    return {
      roads: Array.isArray(parsed.roads) ? parsed.roads : [],
      houses: Array.isArray(parsed.houses) ? parsed.houses : [],
    };
  } catch {
    return createStarterStore();
  }
}

export function saveLocalStore(store: LocalHouseStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function clearLocalStore(): LocalHouseStore {
  const empty: LocalHouseStore = { roads: [], houses: [] };
  saveLocalStore(empty);
  return empty;
}

export function loadAutoTrips(): AutoTrip[] {
  try {
    const raw = localStorage.getItem(AUTO_TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AutoTrip[]) : [];
  } catch {
    return [];
  }
}

export function saveAutoTrips(trips: AutoTrip[]): void {
  try {
    localStorage.setItem(AUTO_TRIPS_KEY, JSON.stringify(trips));
  } catch {
    // ignore quota errors
  }
}

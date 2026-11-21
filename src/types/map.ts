export interface LatLngPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export type CaptureMode = 'gps_walk' | 'straight_walk' | 'manual_trace' | 'simulated_walk';

export type HouseSide = 'left' | 'right';

export type JunctionWayCount = 2 | 3 | 4;

export type JunctionDirection = 'left' | 'straight' | 'right' | 'back';

export interface JunctionBranch {
  id: string;
  direction: JunctionDirection;
  label: string;
  bearingDeg: number;
  status: 'mapped' | 'mapping' | 'pending';
  segmentIndex?: number;
  roadId?: string;
}

export interface RoadJunction {
  id: string;
  label?: string;
  type: '2-way' | '3-way' | '4-way';
  waysCount?: JunctionWayCount;
  lat: number;
  lng: number;
  headingDeg: number;
  exitTurn: 'left' | 'straight' | 'right';
  branches?: JunctionBranch[];
}

export interface VillageHouse {
  id: string;
  houseNumber: string;
  side: HouseSide;
  /** Visual marker coordinate offset ~7-8m to left or right of road */
  lat: number;
  lng: number;
  /** Exact coordinate on the road polyline where mapper stood */
  roadLat: number;
  roadLng: number;
  roadId: string;
  roadName: string;
  villageName: string;
  segmentIndex?: number;
  shopName?: string;
  note?: string;
  createdAt: string;
}

export interface VillageRoad {
  id: string;
  name: string;
  villageName: string;
  surface: 'unpaved' | 'concrete' | 'cobblestone' | 'asphalt';
  points: LatLngPoint[];
  junctions?: RoadJunction[];
  distanceMeters: number;
  durationSeconds: number;
  captureMode: CaptureMode;
  createdAt: string;
}

export type TurnDirection =
  | 'depart'
  | 'straight'
  | 'slight_left'
  | 'left'
  | 'sharp_left'
  | 'slight_right'
  | 'right'
  | 'sharp_right'
  | 'arrive';

export interface NavigationInstruction {
  id: string;
  turnType: TurnDirection;
  instruction: string;
  roadName: string;
  distanceMeters: number;
  anchorPoint: { lat: number; lng: number };
}

export interface VillageRouteResult {
  reachable: boolean;
  routeLabel?: string;
  viaSummary?: string;
  totalDistanceMeters: number;
  walkMinutes: number;
  bikeMinutes: number;
  polyline: { lat: number; lng: number }[];
  instructions: NavigationInstruction[];
  reason?: string;
}

export interface AutoTrip {
  id: string;
  name: string;
  villageName: string;
  surface: VillageRoad['surface'];
  points: LatLngPoint[];
  distanceMeters: number;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  linkedRoadId?: string;
  houses: VillageHouse[];
}

export interface AutoMapXNode extends LatLngPoint {
  headingDeg: number;
  cumulativeMeters: number;
  speedMps: number;
  momentLabel?: string;
}

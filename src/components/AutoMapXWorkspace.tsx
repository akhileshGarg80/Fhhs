import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Gauge,
  History,
  Home,
  Link2,
  List,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Route,
  Scissors,
  StickyNote,
  Store,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutoMapXNode,
  HouseSide,
  LatLngPoint,
  PlaceType,
  ShopCategory,
  VillageHouse,
  VillageRoad,
} from '../types/map.ts';
import {
  buildSimulatorWaypoints,
  computePathDistance,
  formatDistance,
  formatDuration,
  getSurfaceLabel,
  haversineMeters,
} from '../utils/geo.ts';
import type { GpsQualityReport } from '../utils/gpsFilter.ts';
import { PLACE_TYPE_OPTIONS, SHOP_CATEGORY_OPTIONS } from '../utils/placeMeta.ts';
import PlaceIcon from './PlaceIcon.tsx';

export type AutoMapXSubMode = 'build' | 'simulate';
type SimSpeed = 0.5 | 1 | 2 | 4;

export type AutoMapXSymbolAction =
  | 'straight_step'
  | 'nudge_left_5'
  | 'nudge_right_5'
  | 'nudge_left_15'
  | 'nudge_right_15'
  | 'gentle_left'
  | 'gentle_right'
  | 'slight_left'
  | 'slight_right'
  | 'curve_left'
  | 'curve_right'
  | 's_curve_left'
  | 's_curve_right'
  | 'turn_left'
  | 'turn_right'
  | 'sharp_left'
  | 'sharp_right'
  | 'u_turn';

interface AutoMapXWorkspaceProps {
  subMode: AutoMapXSubMode;
  onChangeSubMode: (mode: AutoMapXSubMode) => void;
  liveGps: LatLngPoint;
  gpsQuality: GpsQualityReport;
  cursor: { lat: number; lng: number; headingDeg: number };
  points: AutoMapXNode[];
  speedMps: number;
  isRunning: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  isPickingStart: boolean;
  rewindIndex: number | null;
  draftHouses: VillageHouse[];
  detectedVillage: string;
  nextSuggestedHouse: string;
  onTogglePickStart: () => void;
  onUseLiveGpsAsStart: () => void;
  onSetSpeedMps: (speed: number) => void;
  onSetHeadingDeg: (headingDeg: number) => void;
  onStart: () => void;
  onPauseResume: () => void;
  onDiscard: () => void;
  onSymbolAction: (action: AutoMapXSymbolAction) => void;
  onRewindByMeters: (meters: number) => void;
  onUndoLastMoment: () => void;
  onSetRewindIndex: (idx: number | null) => void;
  onCommitRewind: (idx: number) => void;
  onAddHouse: (
    houseNumber: string,
    side: HouseSide,
    shopName?: string,
    placeType?: PlaceType,
    shopCategory?: ShopCategory
  ) => void;
  onRemoveHouse: (houseId: string) => void;
  onSaveRoad: (payload: {
    roadName: string;
    villageName: string;
    surface: VillageRoad['surface'];
  }) => void;
  onLocateLiveGps: () => void;
  savedRoads: VillageRoad[];
  savedHouses: VillageHouse[];
  selectedSimRoadId: string | null;
  onSelectSimRoad: (roadId: string) => void;
  onFitSimRoad: (road: VillageRoad) => void;
  onUpdateSimRoadMeta: (
    roadId: string,
    patch: { name?: string; surface?: VillageRoad['surface'] }
  ) => void;
  onSimPositionChange: (
    pos: { lat: number; lng: number; headingDeg: number } | null,
    panMap: boolean
  ) => void;
  simJumpRequest: { lat: number; lng: number; key: number } | null;
  onAddHouseOnSavedRoad: (
    roadId: string,
    point: { lat: number; lng: number },
    headingDeg: number,
    houseNumber: string,
    side: HouseSide,
    shopName?: string,
    note?: string,
    placeType?: PlaceType,
    shopCategory?: ShopCategory
  ) => void;
  onRemoveSavedHouse: (houseId: string) => void;
  onFocusHouse: (house: VillageHouse) => void;
  nearestRoadSnap?: { roadName: string; distMeters: number } | null;
  onSnapToNearestRoad?: () => void;
  mapSlot: ReactNode;
}

const SPEED_PRESETS: { label: string; mps: number }[] = [
  { label: 'Crawl', mps: 0.3 },
  { label: 'Slow', mps: 0.8 },
  { label: 'Walk', mps: 1.5 },
  { label: 'Jog', mps: 3.0 },
  { label: 'Cycle', mps: 6.0 },
];

function cardinalDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

const SIM_SPEEDS: SimSpeed[] = [0.5, 1, 2, 4];

const SPEED_INTERVAL_MS: Record<SimSpeed, number> = {
  0.5: 1050,
  1: 520,
  2: 260,
  4: 130,
};

const SIM_SURFACES: { id: VillageRoad['surface']; label: string }[] = [
  { id: 'concrete', label: 'Concrete' },
  { id: 'asphalt', label: 'Asphalt' },
  { id: 'cobblestone', label: 'Brick' },
  { id: 'unpaved', label: 'Kachha' },
];

export default function AutoMapXWorkspace({
  subMode,
  onChangeSubMode,
  liveGps,
  gpsQuality,
  cursor,
  points,
  speedMps,
  isRunning,
  isPaused,
  elapsedSeconds,
  isPickingStart,
  rewindIndex,
  draftHouses,
  detectedVillage,
  nextSuggestedHouse,
  onTogglePickStart,
  onUseLiveGpsAsStart,
  onSetSpeedMps,
  onSetHeadingDeg,
  onStart,
  onPauseResume,
  onDiscard,
  onSymbolAction,
  onRewindByMeters,
  onUndoLastMoment,
  onSetRewindIndex,
  onCommitRewind,
  onAddHouse,
  onRemoveHouse,
  onSaveRoad,
  onLocateLiveGps,
  savedRoads,
  savedHouses,
  selectedSimRoadId,
  onSelectSimRoad,
  onFitSimRoad,
  onUpdateSimRoadMeta,
  onSimPositionChange,
  simJumpRequest,
  onAddHouseOnSavedRoad,
  onRemoveSavedHouse,
  onFocusHouse,
  nearestRoadSnap = null,
  onSnapToNearestRoad,
  mapSlot,
}: AutoMapXWorkspaceProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [houseBarOpen, setHouseBarOpen] = useState(false);
  const [houseInput, setHouseInput] = useState(nextSuggestedHouse || '1');
  const [placeType, setPlaceType] = useState<PlaceType>('house');
  const [shopCategory, setShopCategory] = useState<ShopCategory>('kirana');
  const [shopName, setShopName] = useState('');
  const [houseNote, setHouseNote] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [simHousesListOpen, setSimHousesListOpen] = useState(false);
  const [mobileRoadsOpen, setMobileRoadsOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [roadName, setRoadName] = useState('');
  const [villageName, setVillageName] = useState('');
  const [surface, setSurface] = useState<VillageRoad['surface']>('concrete');

  // Post-Save Simulator State
  const selectedSimRoad = useMemo(
    () =>
      (selectedSimRoadId ? savedRoads.find((r) => r.id === selectedSimRoadId) : null) ??
      savedRoads.find((r) => r.captureMode === 'simulated_walk') ??
      savedRoads[0] ??
      null,
    [savedRoads, selectedSimRoadId]
  );

  const selectedRoadHouses = useMemo(
    () => (selectedSimRoad ? savedHouses.filter((h) => h.roadId === selectedSimRoad.id) : []),
    [savedHouses, selectedSimRoad]
  );

  const roadHouseCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of savedHouses) {
      map.set(h.roadId, (map.get(h.roadId) ?? 0) + 1);
    }
    return map;
  }, [savedHouses]);

  const simWaypoints = useMemo(
    () => (selectedSimRoad ? buildSimulatorWaypoints(selectedSimRoad.points, 1) : []),
    [selectedSimRoad]
  );

  const [simIdx, setSimIdx] = useState(0);
  const [isSimPlaying, setIsSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>(0.5);
  const [autoFollowSim, setAutoFollowSim] = useState(true);
  const [simRoadNameDraft, setSimRoadNameDraft] = useState('');

  const onSimPositionChangeRef = useRef(onSimPositionChange);
  onSimPositionChangeRef.current = onSimPositionChange;

  useEffect(() => {
    setIsSimPlaying(false);
    setSimIdx(0);
    if (subMode === 'simulate' && selectedSimRoad) {
      setSimRoadNameDraft(selectedSimRoad.name);
      const wps = buildSimulatorWaypoints(selectedSimRoad.points, 1);
      if (wps.length > 0) {
        onSimPositionChangeRef.current(
          { lat: wps[0].lat, lng: wps[0].lng, headingDeg: wps[0].bearingDeg },
          false
        );
      } else {
        onSimPositionChangeRef.current(null, false);
      }
    } else {
      onSimPositionChangeRef.current(null, false);
    }
  }, [subMode, selectedSimRoad?.id]);

  useEffect(() => {
    return () => {
      onSimPositionChangeRef.current(null, false);
    };
  }, []);

  useEffect(() => {
    if (subMode === 'simulate' && !houseInput.trim()) {
      setHouseInput(nextSuggestedHouse || '1');
    }
  }, [subMode, nextSuggestedHouse, houseInput]);

  // Keep houseInput fresh when entering simulate mode right after saving
  const prevSubModeRef = useRef(subMode);
  useEffect(() => {
    if (prevSubModeRef.current !== 'simulate' && subMode === 'simulate') {
      setHouseInput(nextSuggestedHouse || '1');
    }
    prevSubModeRef.current = subMode;
  }, [subMode, nextSuggestedHouse]);

  const safeSimIdx = simWaypoints.length > 0 ? Math.min(simIdx, simWaypoints.length - 1) : 0;
  const activeSimWaypoint = simWaypoints[safeSimIdx] ?? null;
  const totalSimMeters =
    simWaypoints.length > 0 ? Math.round(simWaypoints[simWaypoints.length - 1].cumulativeMeters) : 0;
  const coveredSimMeters = activeSimWaypoint ? Math.round(activeSimWaypoint.cumulativeMeters) : 0;

  // Jump simulator when user taps on the road on the map
  useEffect(() => {
    if (!simJumpRequest || subMode !== 'simulate' || simWaypoints.length === 0) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < simWaypoints.length; i++) {
      const d = haversineMeters(simWaypoints[i], simJumpRequest);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    setIsSimPlaying(false);
    setSimIdx(bestIdx);
    const wp = simWaypoints[bestIdx];
    if (wp) {
      onSimPositionChangeRef.current(
        { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
        false
      );
    }
  }, [simJumpRequest, subMode, simWaypoints]);

  // Simulator playback loop
  useEffect(() => {
    if (subMode !== 'simulate' || !isSimPlaying || simWaypoints.length < 2) return;

    const timer = setInterval(() => {
      setSimIdx((prev) => {
        const next = prev + 1;
        if (next >= simWaypoints.length) {
          setIsSimPlaying(false);
          return simWaypoints.length - 1;
        }
        const wp = simWaypoints[next];
        if (wp) {
          onSimPositionChangeRef.current(
            { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
            autoFollowSim
          );
        }
        if (next >= simWaypoints.length - 1) {
          setIsSimPlaying(false);
        }
        return next;
      });
    }, SPEED_INTERVAL_MS[simSpeed]);

    return () => clearInterval(timer);
  }, [subMode, isSimPlaying, simWaypoints, simSpeed, autoFollowSim]);

  const jumpToSimIndex = (targetIdx: number, shouldPan = true) => {
    if (simWaypoints.length === 0) return;
    const clamped = Math.max(0, Math.min(targetIdx, simWaypoints.length - 1));
    setSimIdx(clamped);
    const wp = simWaypoints[clamped];
    if (wp) {
      onSimPositionChangeRef.current(
        { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
        shouldPan
      );
    }
  };

  const handleToggleSimPlay = () => {
    if (simWaypoints.length < 2) return;
    if (isSimPlaying) {
      setIsSimPlaying(false);
      return;
    }
    if (safeSimIdx >= simWaypoints.length - 1) {
      jumpToSimIndex(0, autoFollowSim);
    } else if (activeSimWaypoint) {
      onSimPositionChangeRef.current(
        {
          lat: activeSimWaypoint.lat,
          lng: activeSimWaypoint.lng,
          headingDeg: activeSimWaypoint.bearingDeg,
        },
        autoFollowSim
      );
    }
    setIsSimPlaying(true);
  };

  const totalDistance = useMemo(() => {
    if (points.length === 0) return 0;
    const pathPts = [...points, { lat: cursor.lat, lng: cursor.lng }];
    return computePathDistance(pathPts);
  }, [points, cursor.lat, cursor.lng]);

  const momentEntries = useMemo(() => {
    const list: { index: number; label: string; meters: number }[] = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i].momentLabel) {
        list.push({
          index: i,
          label: points[i].momentLabel!,
          meters: Math.round(points[i].cumulativeMeters),
        });
      }
    }
    return list;
  }, [points]);

  const isScrubbing =
    rewindIndex != null && points.length > 0 && rewindIndex >= 0 && rewindIndex < points.length - 1;
  const scrubPoint = isScrubbing ? points[rewindIndex!] : null;

  const canSave = points.length >= 2 || (points.length === 1 && totalDistance >= 2);
  const activeHeading = scrubPoint ? scrubPoint.headingDeg : cursor.headingDeg;
  const activeLat = scrubPoint ? scrubPoint.lat : cursor.lat;
  const activeLng = scrubPoint ? scrubPoint.lng : cursor.lng;

  const adjustHouseNumber = (delta: number) => {
    const parsed = parseInt(houseInput.trim(), 10);
    if (Number.isFinite(parsed)) {
      setHouseInput(String(Math.max(1, parsed + delta)));
    } else {
      setHouseInput('1');
    }
  };

  const handleTagHouse = (side: HouseSide) => {
    const trimmed = houseInput.trim();
    if (!trimmed) return;
    const effectiveType: PlaceType =
      placeType === 'house' && shopName.trim() ? 'shop' : placeType;
    onAddHouse(
      trimmed,
      side,
      shopName.trim() || undefined,
      effectiveType,
      effectiveType === 'shop' ? shopCategory : undefined
    );
    setShopName('');
    if (effectiveType !== 'house') {
      setPlaceType('house');
    }
    const num = parseInt(trimmed, 10);
    if (Number.isFinite(num) && String(num) === trimmed) {
      setHouseInput(String(num + 1));
    }
  };

  const handleTagHouseOnSimRoad = (side: HouseSide) => {
    if (!selectedSimRoad || !activeSimWaypoint) return;
    const trimmed = houseInput.trim();
    if (!trimmed) return;
    const effectiveType: PlaceType =
      placeType === 'house' && shopName.trim() ? 'shop' : placeType;

    onAddHouseOnSavedRoad(
      selectedSimRoad.id,
      { lat: activeSimWaypoint.lat, lng: activeSimWaypoint.lng },
      activeSimWaypoint.bearingDeg,
      trimmed,
      side,
      shopName.trim() || undefined,
      houseNote.trim() || undefined,
      effectiveType,
      effectiveType === 'shop' ? shopCategory : undefined
    );

    const parsed = parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && String(parsed) === trimmed) {
      setHouseInput(String(parsed + 1));
    }
    setShopName('');
    setHouseNote('');
    if (effectiveType !== 'house') {
      setPlaceType('house');
    }
  };

  const commitSimRoadName = () => {
    if (!selectedSimRoad) return;
    const cleaned = simRoadNameDraft.trim();
    if (cleaned && cleaned !== selectedSimRoad.name) {
      onUpdateSimRoadMeta(selectedSimRoad.id, { name: cleaned });
    } else {
      setSimRoadNameDraft(selectedSimRoad.name);
    }
  };

  const handleOpenSave = () => {
    setVillageName((v) => v || detectedVillage || 'My Village');
    setShowSaveModal(true);
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSaveRoad({
      roadName: roadName.trim() || `AutoMapX Road (${formatDistance(totalDistance)})`,
      villageName: villageName.trim() || detectedVillage || 'My Village',
      surface,
    });
    setRoadName('');
    setShowSaveModal(false);
    setTimelineOpen(false);
  };

  const renderSavedRoadList = () => {
    if (savedRoads.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
          <Route className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500" />
          <div className="font-semibold text-slate-700 dark:text-slate-200">
            No saved roads yet
          </div>
          <p className="leading-relaxed">
            Switch to <span className="font-bold text-violet-700 dark:text-violet-400">Build Road</span>, map &amp; save your road — then run the Simulator here to attach houses in seconds!
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {savedRoads.map((road) => {
          const isSelected = selectedSimRoad?.id === road.id;
          const hCount = roadHouseCountMap.get(road.id) ?? 0;
          const isAmx = road.captureMode === 'simulated_walk';
          return (
            <button
              key={road.id}
              type="button"
              onClick={() => {
                onSelectSimRoad(road.id);
                setMobileRoadsOpen(false);
              }}
              className={`w-full text-left p-3 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-violet-50 dark:bg-violet-950/50 border-l-4 border-l-violet-600'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {road.name}
                </span>
                {isAmx && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/70 text-violet-800 dark:text-violet-300 text-[10px] font-bold shrink-0">
                    AutoMapX
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {road.villageName} · {getSurfaceLabel(road.surface)}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>{formatDistance(road.distanceMeters)}</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-sans font-bold text-[10px]">
                  {hCount} {hCount === 1 ? 'House' : 'Houses'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Desktop Left Sidebar when in Simulate & Tag Houses mode */}
      {subMode === 'simulate' && (
        <aside className="hidden lg:flex lg:flex-col w-[310px] shrink-0 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Saved Roads
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pick a road to simulate &amp; add houses
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-200">
              {savedRoads.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">{renderSavedRoadList()}</div>
        </aside>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Top AutoMapX Bar: Sub-Mode Switcher + Build OR Simulator Controls */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-1.5 space-y-1.5 z-20">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            {/* Sub-mode Toggle: Build Road | Simulate & Houses */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsSimPlaying(false);
                  onChangeSubMode('build');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  subMode === 'build'
                    ? 'bg-violet-700 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Build Road
              </button>
              <button
                type="button"
                onClick={() => onChangeSubMode('simulate')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  subMode === 'simulate'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Simulate ({savedRoads.length})
              </button>
            </div>

            {subMode === 'build' ? (
              <>
                {/* Start Location & Live GPS Controls */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={onUseLiveGpsAsStart}
                    disabled={isRunning && !isPaused}
                    title={`Snap start/cursor to Live GPS (${liveGps.lat.toFixed(5)}, ${liveGps.lng.toFixed(5)})`}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Live GPS</span>
                  </button>

                  <button
                    type="button"
                    onClick={onTogglePickStart}
                    disabled={isRunning && !isPaused}
                    title="Tap anywhere on map to pick start point"
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0 transition-colors ${
                      isPickingStart
                        ? 'bg-violet-700 text-white border-violet-800 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{isPickingStart ? 'Tap Map…' : 'Pick Start'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onLocateLiveGps}
                    title="Center map on Live GPS"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                  </button>

                  {nearestRoadSnap && onSnapToNearestRoad && (
                    <button
                      type="button"
                      onClick={onSnapToNearestRoad}
                      title={`Snap & touch ${nearestRoadSnap.roadName} (${Math.round(nearestRoadSnap.distMeters)}m away) between its points`}
                      className="px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span className="max-w-[96px] truncate">Touch {nearestRoadSnap.roadName}</span>
                    </button>
                  )}
                </div>

                {/* Primary Build Lifecycle Controls */}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  {!isRunning ? (
                    <button
                      type="button"
                      onClick={onStart}
                      className="px-3 py-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{points.length > 0 ? 'Resume' : 'Start'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onPauseResume}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap ${
                        isPaused
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!canSave}
                    onClick={handleOpenSave}
                    className="px-2.5 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>

                  {(points.length > 0 || isRunning) && (
                    <button
                      type="button"
                      onClick={onDiscard}
                      title="Reset AutoMapX path"
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Simulate Header Controls */
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileRoadsOpen((v) => !v)}
                  className={`lg:hidden px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                    mobileRoadsOpen
                      ? 'bg-sky-600 text-white border-sky-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Roads ({savedRoads.length})</span>
                  {mobileRoadsOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSimPlaying(false);
                    onChangeSubMode('build');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 border border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Road</span>
                </button>

                <button
                  type="button"
                  onClick={onLocateLiveGps}
                  title="Center map on Live GPS"
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {subMode === 'build' && (
            /* Live Virtual Lat/Lng, Speed, Heading & Distance Telemetry */
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 overflow-x-auto no-scrollbar pt-0.5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span
                  className={`font-sans font-bold px-1.5 py-0.5 rounded text-[10px] ${
                    isScrubbing
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                      : isRunning && !isPaused
                      ? 'bg-violet-100 dark:bg-violet-950/70 text-violet-800 dark:text-violet-300'
                      : isPaused
                      ? 'bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {isScrubbing
                    ? 'REWIND'
                    : isRunning && !isPaused
                    ? 'MOVING'
                    : isPaused
                    ? 'PAUSED'
                    : 'READY'}
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-semibold">
                  {activeLat.toFixed(6)}, {activeLng.toFixed(6)}
                </span>
              </div>

              <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                <span className="text-violet-700 dark:text-violet-300 font-bold">
                  {Math.round(activeHeading)}° {cardinalDirection(activeHeading)}
                </span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  {formatDistance(scrubPoint ? scrubPoint.cumulativeMeters : totalDistance)}
                </span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span>{formatDuration(elapsedSeconds)}</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span>{points.length} pts</span>
              </div>
            </div>
          )}
        </div>

        {/* Selected Road Name & Surface Strip (Simulate Mode) */}
        {subMode === 'simulate' && selectedSimRoad && (
          <div className="shrink-0 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-xs">
              <input
                type="text"
                value={simRoadNameDraft}
                onChange={(e) => setSimRoadNameDraft(e.target.value)}
                onBlur={commitSimRoadName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                placeholder="Road name..."
                className="w-full min-w-[120px] px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {simRoadNameDraft.trim() !== selectedSimRoad.name && (
                <button
                  type="button"
                  onClick={commitSimRoadName}
                  className="p-1 rounded-lg bg-sky-600 text-white cursor-pointer shrink-0"
                  title="Save road name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {SIM_SURFACES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUpdateSimRoadMeta(selectedSimRoad.id, { surface: s.id })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors ${
                    selectedSimRoad.surface === s.id
                      ? 'bg-slate-900 dark:bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onFitSimRoad(selectedSimRoad)}
                title="Show full road Start to End"
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span className="hidden sm:inline">Full Road</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile Collapsible Saved Roads Drawer (Simulate Mode) */}
        {subMode === 'simulate' && mobileRoadsOpen && (
          <div className="lg:hidden shrink-0 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-md z-20">
            {renderSavedRoadList()}
          </div>
        )}

        {/* Spacious Map Viewport */}
        <div className="flex-1 min-h-0 w-full relative">
          {mapSlot}

          {subMode === 'build' && isPickingStart && !isRunning && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[450] pointer-events-none max-w-[calc(100%-1.5rem)]">
              <div className="px-3 py-1.5 rounded-xl bg-violet-900/95 text-white text-[11px] font-semibold shadow-lg border border-violet-700 text-center">
                Tap anywhere on map to set start · Live GPS ({gpsQuality.label}) stays visible
              </div>
            </div>
          )}

          {subMode === 'simulate' && !selectedSimRoad && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[440] w-[calc(100%-1.5rem)] max-w-md pointer-events-none">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-center text-xs text-slate-700 dark:text-slate-200">
                No saved road selected. Tap <span className="font-bold text-violet-700 dark:text-violet-400">Build Road</span> to map &amp; save a road first, then run the simulator to tag houses!
              </div>
            </div>
          )}

          {subMode === 'simulate' && selectedSimRoad && (
            <div className="hidden sm:block absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[430] pointer-events-none">
              <div className="px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-[10px] font-medium shadow">
                Play Sim, drag slider, or tap along road to jump cursor &amp; tag +Left / +Right houses
              </div>
            </div>
          )}
        </div>

        {/* Bottom Cockpit: Build Road Symbols OR Post-Save Simulator & Easy House Tagger */}
        {subMode === 'build' ? (
          <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-20">
        {/* Expandable Rewind / Moment Correction Timeline */}
        {(timelineOpen || isScrubbing) && points.length >= 2 && (
          <div className="px-2.5 sm:px-4 py-2 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/70 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>Moment Rewind — slide back to fix any wrong turn</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSetRewindIndex(null);
                  setTimelineOpen(false);
                }}
                className="p-1 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded cursor-pointer"
                aria-label="Close rewind timeline"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.max(0, points.length - 1)}
                value={rewindIndex ?? points.length - 1}
                onChange={(e) => onSetRewindIndex(Number(e.target.value))}
                className="flex-1 h-2 accent-amber-600 cursor-pointer"
              />
              <span className="text-[11px] font-mono tabular-nums font-bold text-amber-950 dark:text-amber-200 shrink-0">
                {Math.round(
                  points[rewindIndex ?? points.length - 1]?.cumulativeMeters ?? totalDistance
                )}
                m / {totalDistance}m
              </span>
            </div>

            {momentEntries.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {momentEntries.map((m) => (
                  <button
                    key={`${m.index}-${m.meters}`}
                    type="button"
                    onClick={() => onSetRewindIndex(m.index)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                      rewindIndex === m.index
                        ? 'bg-amber-600 text-white border-amber-700'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-amber-200 dark:border-slate-700'
                    }`}
                  >
                    {m.meters}m · {m.label}
                  </button>
                ))}
              </div>
            )}

            {isScrubbing && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[11px] font-mono text-amber-900 dark:text-amber-200 truncate">
                  Cut ahead of {Math.round(scrubPoint?.cumulativeMeters ?? 0)}m &amp; continue cleanly
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSetRewindIndex(null)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (rewindIndex != null) onCommitRewind(rewindIndex);
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Resume From Here</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optional Quick House & Shop Tagging Strip */}
        {houseBarOpen && (
          <div className="px-2.5 sm:px-4 py-1.5 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800/60 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => adjustHouseNumber(-1)}
                  className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  value={houseInput}
                  onChange={(e) => setHouseInput(e.target.value)}
                  className="w-12 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustHouseNumber(1)}
                  className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-[120px] flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 gap-1.5">
                <Store className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="Shop / Dukan (optional)"
                  className="w-full min-w-0 text-xs text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => handleTagHouse('left')}
                  disabled={!houseInput.trim()}
                  className="px-2.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTagHouse('right')}
                  disabled={!houseInput.trim()}
                  className="px-2.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Right</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {PLACE_TYPE_OPTIONS.map((opt) => {
                const active = placeType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPlaceType(opt.id)}
                    style={active ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                      active
                        ? 'text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <PlaceIcon placeType={opt.id} className="w-3 h-3 shrink-0" />
                    <span>{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {placeType === 'shop' && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {SHOP_CATEGORY_OPTIONS.map((cat) => {
                  const active = shopCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setShopCategory(cat.id)}
                      style={active ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
                      className={`px-2 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                        active
                          ? 'text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-slate-700 text-emerald-900 dark:text-slate-300'
                      }`}
                    >
                      <PlaceIcon placeType="shop" shopCategory={cat.id} className="w-3 h-3 shrink-0" />
                      <span>{cat.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {draftHouses.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {draftHouses.map((h) => (
                  <span
                    key={h.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${
                      h.side === 'left'
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                    }`}
                  >
                    <span className="font-mono">{h.houseNumber}</span>
                    {h.shopName && <span>· {h.shopName}</span>}
                    <span>({h.side === 'left' ? 'L' : 'R'})</span>
                    <button
                      type="button"
                      onClick={() => onRemoveHouse(h.id)}
                      className="hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Speed + Quick Rewind Bar */}
        <div className="px-2.5 sm:px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {/* Speed Presets + Fine Slider */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Gauge className="w-3.5 h-3.5 text-violet-700 dark:text-violet-400 shrink-0" />
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg overflow-x-auto no-scrollbar">
              {SPEED_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onSetSpeedMps(p.mps)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    Math.abs(speedMps - p.mps) < 0.15
                      ? 'bg-violet-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0.15}
              max={18}
              step={0.05}
              value={speedMps}
              onChange={(e) => onSetSpeedMps(Number(e.target.value))}
              aria-label="Virtual speed in meters per second"
              className="hidden md:block w-24 lg:w-32 h-1.5 accent-violet-700 cursor-pointer"
            />

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const step = speedMps <= 1.0 ? 0.1 : 0.5;
                  onSetSpeedMps(Math.max(0.15, Number((speedMps - step).toFixed(2))));
                }}
                title="Decrease speed"
                aria-label="Decrease speed"
                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="px-1 text-[11px] font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {speedMps.toFixed(2).replace(/\.00$/, '')}m/s
                <span className="hidden xl:inline text-slate-500 dark:text-slate-400 font-normal">
                  {' '}
                  ({(speedMps * 3.6).toFixed(1)} km/h)
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  const step = speedMps < 1.0 ? 0.1 : 0.5;
                  onSetSpeedMps(Math.min(18, Number((speedMps + step).toFixed(2))));
                }}
                title="Increase speed"
                aria-label="Increase speed"
                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Instant Rewind & House Toggle */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={points.length < 2}
              onClick={() => onRewindByMeters(10)}
              title="Rewind 10 meters back"
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              -10m
            </button>
            <button
              type="button"
              disabled={points.length < 2}
              onClick={onUndoLastMoment}
              title="Undo back to before last turn / moment"
              className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 disabled:opacity-40 text-[11px] font-semibold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3 h-3" />
              <span className="hidden sm:inline">Undo Turn</span>
            </button>
            <button
              type="button"
              disabled={points.length < 2}
              onClick={() => setTimelineOpen((v) => !v)}
              title="Open moment timeline scrubber"
              className={`px-2 py-1 rounded-lg border disabled:opacity-40 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                timelineOpen || isScrubbing
                  ? 'bg-amber-600 text-white border-amber-700'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <History className="w-3 h-3" />
              <span>Scrub</span>
            </button>
            <button
              type="button"
              onClick={() => setHouseBarOpen((v) => !v)}
              title="Tag Left/Right Houses & Shops"
              className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                houseBarOpen || draftHouses.length > 0
                  ? 'bg-emerald-700 text-white border-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Home className="w-3 h-3" />
              <span>{draftHouses.length > 0 ? draftHouses.length : 'House'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Turn, Curve & Direction Symbols Bar */}
        <div className="px-2 sm:px-3 py-1.5 bg-slate-50/90 dark:bg-slate-900/95 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Initial / Quick Cardinal Direction Selector when idle or anytime */}
          <button
            type="button"
            onClick={() => onSetHeadingDeg((activeHeading + 45) % 360)}
            title="Rotate initial/current heading +45°"
            className="px-2 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-[11px] font-mono tabular-nums font-bold text-violet-800 dark:text-violet-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{Math.round(activeHeading)}°</span>
          </button>

          {/* Straight / Forward Step */}
          <button
            type="button"
            onClick={() => onSymbolAction('straight_step')}
            title="Go Straight (+5m step if paused, or lock straight moment)"
            aria-label="Straight forward"
            className="w-10 h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowUp className="w-5 h-5" />
          </button>

          {/* Fine Nudge -5 / +5 / -15 / +15 */}
          <button
            type="button"
            onClick={() => onSymbolAction('nudge_left_15')}
            title="Steer Left -15°"
            aria-label="Steer left 15 degrees"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex flex-col items-center justify-center shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono leading-none mt-0.5">-15°</span>
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('nudge_right_15')}
            title="Steer Right +15°"
            aria-label="Steer right 15 degrees"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex flex-col items-center justify-center shrink-0 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono leading-none mt-0.5">+15°</span>
          </button>

          {/* Gentle Bend Left / Right */}
          <button
            type="button"
            onClick={() => onSymbolAction('gentle_left')}
            title="Gentle Bend Left (-18° arc)"
            aria-label="Gentle bend left"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 21V11.5C14 8.5 13 6 10.5 3.5" />
              <path d="M8.5 6.8L10 3.2L13.5 4.6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('gentle_right')}
            title="Gentle Bend Right (+18° arc)"
            aria-label="Gentle bend right"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 21V11.5C10 8.5 11 6 13.5 3.5" />
              <path d="M15.5 6.8L14 3.2L10.5 4.6" />
            </svg>
          </button>

          {/* Slight Left / Right (-30° / +30°) */}
          <button
            type="button"
            onClick={() => onSymbolAction('slight_left')}
            title="Slight Left (-30°)"
            aria-label="Slight left"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowUpLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('slight_right')}
            title="Slight Right (+30°)"
            aria-label="Slight right"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowUpRight className="w-5 h-5" />
          </button>

          {/* Smooth Curve Left / Right (-45° / +45° arc) */}
          <button
            type="button"
            onClick={() => onSymbolAction('curve_left')}
            title="Smooth Curve Left (-45° arc)"
            aria-label="Smooth curve left"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 20C17 12 13 7 5.5 5" />
              <path d="M9.5 3.2L5 4.8L7 9.1" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('curve_right')}
            title="Smooth Curve Right (+45° arc)"
            aria-label="Smooth curve right"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 20C7 12 11 7 18.5 5" />
              <path d="M14.5 3.2L19 4.8L17 9.1" />
            </svg>
          </button>

          {/* S-Bend Left / Right */}
          <button
            type="button"
            onClick={() => onSymbolAction('s_curve_left')}
            title="S-Bend Left"
            aria-label="S bend left"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21V16C16 12.5 8 11.5 8 8V3.5" />
              <path d="M5 6L8 3L11 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('s_curve_right')}
            title="S-Bend Right"
            aria-label="S bend right"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 21V16C8 12.5 16 11.5 16 8V3.5" />
              <path d="M13 6L16 3L19 6" />
            </svg>
          </button>

          {/* 90° Left / Right Turn */}
          <button
            type="button"
            onClick={() => onSymbolAction('turn_left')}
            title="90° Left Turn"
            aria-label="90 degree left turn"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-violet-700 dark:text-violet-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <CornerUpLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('turn_right')}
            title="90° Right Turn"
            aria-label="90 degree right turn"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-violet-700 dark:text-violet-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <CornerUpRight className="w-5 h-5" />
          </button>

          {/* Sharp Left / Right (-120° / +120°) */}
          <button
            type="button"
            onClick={() => onSymbolAction('sharp_left')}
            title="Sharp Left (-120°)"
            aria-label="Sharp left"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <CornerDownLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('sharp_right')}
            title="Sharp Right (+120°)"
            aria-label="Sharp right"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <CornerDownRight className="w-5 h-5" />
          </button>

          {/* U-Turn (180°) */}
          <button
            type="button"
            onClick={() => onSymbolAction('u_turn')}
            title="U-Turn (180°)"
            aria-label="U turn"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 20V9a5 5 0 0 0-10 0v10" />
              <path d="M4 15.5L7 19.5L10 15.5" />
            </svg>
          </button>

          {/* Fine Nudge -5 / +5 */}
          <button
            type="button"
            onClick={() => onSymbolAction('nudge_left_5')}
            title="Fine Steer -5°"
            className="px-2 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            -5°
          </button>
          <button
            type="button"
            onClick={() => onSymbolAction('nudge_right_5')}
            title="Fine Steer +5°"
            className="px-2 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            +5°
          </button>
        </div>
          </div>
        ) : (
          selectedSimRoad && (
            <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-2 z-20">
              {/* Simulator Controls */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <button
                      type="button"
                      onClick={handleToggleSimPlay}
                      disabled={simWaypoints.length < 2}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 ${
                        isSimPlaying
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-sky-600 hover:bg-sky-700 text-white'
                      }`}
                    >
                      {isSimPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause Sim</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Play Sim</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => jumpToSimIndex(safeSimIdx - 5, autoFollowSim)}
                      title="Step 5m back"
                      className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-mono font-semibold inline-flex items-center cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      5m
                    </button>
                    <button
                      type="button"
                      onClick={() => jumpToSimIndex(safeSimIdx + 5, autoFollowSim)}
                      title="Step 5m forward"
                      className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-mono font-semibold inline-flex items-center cursor-pointer"
                    >
                      5m
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSimPlaying(false);
                        jumpToSimIndex(0, autoFollowSim);
                      }}
                      title="Restart from Start"
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Speed Selector + Follow Toggle */}
                  <div className="flex items-center gap-1">
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                      {SIM_SPEEDS.map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => setSimSpeed(sp)}
                          className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                            simSpeed === sp
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setAutoFollowSim((v) => !v)}
                      title="Auto-follow simulator arrow on map"
                      className={`px-2 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        autoFollowSim
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700'
                          : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Crosshair className="w-3 h-3" />
                      <span className="hidden sm:inline">Follow</span>
                    </button>
                  </div>
                </div>

                {/* Scrubber Slider */}
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, simWaypoints.length - 1)}
                    value={safeSimIdx}
                    onChange={(e) => jumpToSimIndex(Number(e.target.value), autoFollowSim)}
                    className="flex-1 h-2 accent-sky-600 cursor-pointer"
                  />
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                    {coveredSimMeters}m / {totalSimMeters}m
                  </span>
                </div>
              </div>

              {/* Easy House & Shop Tagging Row */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => adjustHouseNumber(-1)}
                      className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      title="Previous number"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="text"
                      value={houseInput}
                      onChange={(e) => setHouseInput(e.target.value)}
                      placeholder="No."
                      className="w-12 sm:w-14 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => adjustHouseNumber(1)}
                      className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      title="Next number"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-[125px] flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 gap-1.5">
                    <Store className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="Shop / Dukan (optional)"
                      className="w-full min-w-0 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNoteField((v) => !v)}
                    title="Add landmark note"
                    className={`p-2 rounded-xl border cursor-pointer shrink-0 ${
                      showNoteField || houseNote
                        ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleTagHouseOnSimRoad('left')}
                      disabled={!activeSimWaypoint || !houseInput.trim()}
                      className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      + Left
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTagHouseOnSimRoad('right')}
                      disabled={!activeSimWaypoint || !houseInput.trim()}
                      className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
                    >
                      + Right
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                  {PLACE_TYPE_OPTIONS.map((opt) => {
                    const active = placeType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPlaceType(opt.id)}
                        style={active ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'text-white shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <PlaceIcon placeType={opt.id} className="w-3 h-3 shrink-0" />
                        <span>{opt.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>

                {placeType === 'shop' && (
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                    {SHOP_CATEGORY_OPTIONS.map((cat) => {
                      const active = shopCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setShopCategory(cat.id)}
                          style={active ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
                          className={`px-2 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                            active
                              ? 'text-white shadow-xs'
                              : 'bg-emerald-50/70 dark:bg-slate-800 border-emerald-200 dark:border-slate-700 text-emerald-900 dark:text-slate-300'
                          }`}
                        >
                          <PlaceIcon placeType="shop" shopCategory={cat.id} className="w-3 h-3 shrink-0" />
                          <span>{cat.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {showNoteField && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={houseNote}
                      onChange={(e) => setHouseNote(e.target.value)}
                      placeholder="Landmark / family note (optional)..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                    {houseNote && (
                      <button
                        type="button"
                        onClick={() => setHouseNote('')}
                        className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {selectedRoadHouses.length > 0 && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setSimHousesListOpen((v) => !v)}
                      className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Added on this road ({selectedRoadHouses.length})</span>
                      {simHousesListOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {simHousesListOpen && (
                      <div className="mt-1.5 max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                        {selectedRoadHouses.map((h) => (
                          <div
                            key={h.id}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                              h.side === 'left'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => onFocusHouse(h)}
                              className="cursor-pointer inline-flex items-center gap-1"
                            >
                              <span className="font-mono font-bold">{h.houseNumber}</span>
                              {h.shopName && <span className="truncate max-w-[90px]">· {h.shopName}</span>}
                              <span className="opacity-75">({h.side === 'left' ? 'L' : 'R'})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveSavedHouse(h.id)}
                              title="Delete house"
                              className="text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Save AutoMapX Road Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSave}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Save AutoMapX Road
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                  {formatDistance(totalDistance)} · {points.length} pts · {draftHouses.length} houses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Road / Gali Name
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. East Temple Road, Ward 3"
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Village Name
                </label>
                <input
                  type="text"
                  required
                  value={villageName}
                  onChange={(e) => setVillageName(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Surface
                </label>
                <select
                  value={surface}
                  onChange={(e) => setSurface(e.target.value as VillageRoad['surface'])}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="concrete">CC Road</option>
                  <option value="cobblestone">Brick / Kharanja</option>
                  <option value="asphalt">Tar / Pakka</option>
                  <option value="unpaved">Kachha Road</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Keep Mapping
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Save &amp; Open Simulator
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

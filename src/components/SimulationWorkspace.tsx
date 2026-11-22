import {
  Ban,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Edit3,
  List,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Route,
  Search,
  StickyNote,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type {
  HouseSide,
  PlaceType,
  ShopCategory,
  VehicleSegmentAccess,
  VillageHouse,
  VillageRoad,
} from '../types/map.ts';
import {
  buildSimulatorWaypoints,
  formatDistance,
  getSurfaceLabel,
} from '../utils/geo.ts';
import { PLACE_TYPE_OPTIONS, SHOP_CATEGORY_OPTIONS } from '../utils/placeMeta.ts';
import PlaceIcon from './PlaceIcon.tsx';

type SimSpeed = 0.5 | 1 | 2 | 4;

interface SimulationWorkspaceProps {
  roads: VillageRoad[];
  houses: VillageHouse[];
  selectedRoadId: string | null;
  autoPlaySignal: number;
  onSelectRoad: (roadId: string) => void;
  onFitRoad: (road: VillageRoad) => void;
  onFitAllRoads: () => void;
  onUpdateRoadMeta: (
    roadId: string,
    patch: { name?: string; surface?: VillageRoad['surface'] }
  ) => void;
  onDeleteRoad: (roadId: string) => void;
  onStampSegmentCar: (
    roadId: string,
    segIndex: number,
    access: VehicleSegmentAccess
  ) => void;
  onStampWholeRoadCar: (roadId: string, access: 'car' | 'no_car') => void;
  onSimPositionChange: (
    pos: { lat: number; lng: number; headingDeg: number } | null,
    panMap: boolean
  ) => void;
  onAddHouseOnRoad: (
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
  onUpdateHouse: (
    houseId: string,
    patch: {
      houseNumber: string;
      side: HouseSide;
      placeType: PlaceType;
      shopCategory?: ShopCategory;
      shopName?: string;
      note?: string;
    }
  ) => void;
  onDeleteHouse: (houseId: string) => void;
  onFocusHouse: (house: VillageHouse) => void;
  onLocateMe: () => void;
  nextSuggestedHouse: string;
  mapSlot: ReactNode;
}

const SURFACES: { id: VillageRoad['surface']; label: string }[] = [
  { id: 'concrete', label: 'Concrete' },
  { id: 'asphalt', label: 'Asphalt' },
  { id: 'cobblestone', label: 'Brick' },
  { id: 'unpaved', label: 'Kachha' },
];

const SIM_SPEEDS: SimSpeed[] = [0.5, 1, 2, 4];

const SPEED_INTERVAL_MS: Record<SimSpeed, number> = {
  0.5: 900,
  1: 480,
  2: 240,
  4: 120,
};

function getRoadCarBadge(road: VillageRoad): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  const segs = road.segmentAccess;
  if (!segs || segs.length === 0) {
    return {
      label: 'Unmarked',
      badgeClass:
        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      dotClass: 'bg-slate-400',
    };
  }
  const hasCar = segs.some((s) => s === 'car');
  const hasNoCar = segs.some((s) => s === 'no_car');
  if (road.roadRole === 'main') {
    return {
      label: hasNoCar ? 'Main · Mixed' : 'Main Road',
      badgeClass:
        'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
      dotClass: 'bg-blue-700',
    };
  }
  if (hasCar && hasNoCar) {
    return {
      label: 'Partial Car',
      badgeClass:
        'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
      dotClass: 'bg-emerald-600',
    };
  }
  if (hasCar) {
    return {
      label: 'Car OK',
      badgeClass:
        'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      dotClass: 'bg-emerald-600',
    };
  }
  if (hasNoCar) {
    return {
      label: 'No Car',
      badgeClass:
        'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      dotClass: 'bg-orange-600',
    };
  }
  return {
    label: 'Unmarked',
    badgeClass:
      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    dotClass: 'bg-slate-400',
  };
}

export default function SimulationWorkspace({
  roads,
  houses,
  selectedRoadId,
  autoPlaySignal,
  onSelectRoad,
  onFitRoad,
  onFitAllRoads,
  onUpdateRoadMeta,
  onDeleteRoad,
  onStampSegmentCar,
  onStampWholeRoadCar,
  onSimPositionChange,
  onAddHouseOnRoad,
  onUpdateHouse,
  onDeleteHouse,
  onFocusHouse,
  onLocateMe,
  nextSuggestedHouse,
  mapSlot,
}: SimulationWorkspaceProps) {
  const validRoads = useMemo(
    () => roads.filter((r) => r.points.length >= 2),
    [roads]
  );

  const selectedRoad = useMemo(
    () => (selectedRoadId ? validRoads.find((r) => r.id === selectedRoadId) ?? null : null),
    [validRoads, selectedRoadId]
  );

  const waypoints = useMemo(
    () => (selectedRoad ? buildSimulatorWaypoints(selectedRoad.points, 1.5) : []),
    [selectedRoad]
  );

  const roadHouses = useMemo(
    () => (selectedRoad ? houses.filter((h) => h.roadId === selectedRoad.id) : []),
    [houses, selectedRoad]
  );

  const houseCountByRoadId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of houses) {
      counts.set(h.roadId, (counts.get(h.roadId) ?? 0) + 1);
    }
    return counts;
  }, [houses]);

  const [roadFilter, setRoadFilter] = useState('');
  const [mobileRoadsOpen, setMobileRoadsOpen] = useState(false);
  const [simIdx, setSimIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>(1);
  const [autoFollow, setAutoFollow] = useState(true);
  const [paintWhilePlaying, setPaintWhilePlaying] = useState(false);
  const [paintAccessMode, setPaintAccessMode] = useState<'car' | 'no_car'>('car');

  const [roadNameDraft, setRoadNameDraft] = useState('');
  const [confirmDeleteRoad, setConfirmDeleteRoad] = useState(false);

  // Add House / Shop at Simulator Position
  const [houseInput, setHouseInput] = useState(nextSuggestedHouse || '1');
  const [placeType, setPlaceType] = useState<PlaceType>('house');
  const [shopCategory, setShopCategory] = useState<ShopCategory>('kirana');
  const [shopName, setShopName] = useState('');
  const [houseNote, setHouseNote] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);

  // Road Houses List & Inline Edit Drawer
  const [housesDrawerOpen, setHousesDrawerOpen] = useState(false);
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);
  const [editHouseNum, setEditHouseNum] = useState('');
  const [editSide, setEditSide] = useState<HouseSide>('left');
  const [editPlaceType, setEditPlaceType] = useState<PlaceType>('house');
  const [editShopCategory, setEditShopCategory] = useState<ShopCategory>('kirana');
  const [editShopName, setEditShopName] = useState('');
  const [editNote, setEditNote] = useState('');

  const onSimPositionChangeRef = useRef(onSimPositionChange);
  onSimPositionChangeRef.current = onSimPositionChange;
  const paintRefs = useRef({ paintWhilePlaying, paintAccessMode, selectedRoadId });
  paintRefs.current = { paintWhilePlaying, paintAccessMode, selectedRoadId };

  // Whenever user clicks a road (on map or list), sync draft name, reset to start & auto-play simulation!
  useEffect(() => {
    setConfirmDeleteRoad(false);
    setEditingHouseId(null);
    if (!selectedRoad) {
      setIsPlaying(false);
      setSimIdx(0);
      onSimPositionChangeRef.current(null, false);
      return;
    }
    setRoadNameDraft(selectedRoad.name);
    const wps = buildSimulatorWaypoints(selectedRoad.points, 1.5);
    setSimIdx(0);
    setIsPlaying(autoPlaySignal > 0 && wps.length >= 2);
    if (wps.length > 0) {
      onSimPositionChangeRef.current(
        { lat: wps[0].lat, lng: wps[0].lng, headingDeg: wps[0].bearingDeg },
        false
      );
    } else {
      onSimPositionChangeRef.current(null, false);
    }
  }, [selectedRoad?.id, autoPlaySignal]);

  useEffect(() => {
    if (!houseInput.trim()) {
      setHouseInput(nextSuggestedHouse || '1');
    }
  }, [nextSuggestedHouse, houseInput]);

  useEffect(() => {
    return () => {
      onSimPositionChangeRef.current(null, false);
    };
  }, []);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || waypoints.length < 2 || !selectedRoad) return;
    const interval = SPEED_INTERVAL_MS[simSpeed];
    const timer = window.setInterval(() => {
      setSimIdx((prev) => {
        const next = prev + 1;
        if (next >= waypoints.length) {
          setIsPlaying(false);
          return prev;
        }
        const wp = waypoints[next];
        if (wp) {
          onSimPositionChangeRef.current(
            { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
            autoFollow
          );
          if (
            paintRefs.current.paintWhilePlaying &&
            paintRefs.current.selectedRoadId &&
            typeof wp.segIndex === 'number'
          ) {
            onStampSegmentCar(
              paintRefs.current.selectedRoadId,
              wp.segIndex,
              paintRefs.current.paintAccessMode
            );
          }
        }
        return next;
      });
    }, interval);
    return () => window.clearInterval(timer);
  }, [isPlaying, simSpeed, waypoints, selectedRoad?.id, autoFollow, onStampSegmentCar]);

  const safeSimIdx = waypoints.length > 0 ? Math.min(simIdx, waypoints.length - 1) : 0;
  const activeWp = waypoints[safeSimIdx] ?? null;
  const activeSegIdx = activeWp?.segIndex ?? 0;

  const activeSegAccess: VehicleSegmentAccess = useMemo(() => {
    if (!selectedRoad?.segmentAccess) return 'unmarked';
    return selectedRoad.segmentAccess[activeSegIdx] ?? 'unmarked';
  }, [selectedRoad, activeSegIdx]);

  const totalDistMeters =
    waypoints.length > 0 ? Math.round(waypoints[waypoints.length - 1].cumulativeMeters) : 0;
  const coveredDistMeters = activeWp ? Math.round(activeWp.cumulativeMeters) : 0;

  const filteredRoads = useMemo(() => {
    const q = roadFilter.trim().toLowerCase();
    if (!q) return validRoads;
    return validRoads.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.villageName.toLowerCase().includes(q)
    );
  }, [validRoads, roadFilter]);

  const jumpToSimIndex = (targetIdx: number, panMap: boolean) => {
    if (waypoints.length === 0) return;
    const clamped = Math.max(0, Math.min(waypoints.length - 1, targetIdx));
    setSimIdx(clamped);
    const wp = waypoints[clamped];
    if (wp) {
      onSimPositionChangeRef.current(
        { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
        panMap
      );
      if (paintWhilePlaying && selectedRoad && typeof wp.segIndex === 'number') {
        onStampSegmentCar(selectedRoad.id, wp.segIndex, paintAccessMode);
      }
    }
  };

  const handleJumpSimToHouse = (house: VillageHouse) => {
    onFocusHouse(house);
    if (waypoints.length === 0) return;
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < waypoints.length; i++) {
      const dLat = waypoints[i].lat - house.roadLat;
      const dLng = waypoints[i].lng - house.roadLng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    jumpToSimIndex(bestIdx, false);
  };

  const commitRoadName = () => {
    if (!selectedRoad) return;
    const trimmed = roadNameDraft.trim();
    if (trimmed && trimmed !== selectedRoad.name) {
      onUpdateRoadMeta(selectedRoad.id, { name: trimmed });
    } else {
      setRoadNameDraft(selectedRoad.name);
    }
  };

  const adjustHouseNumber = (delta: number) => {
    const m = houseInput.trim().match(/^(\d+)(.*)$/);
    if (m) {
      const nextNum = Math.max(1, Number(m[1]) + delta);
      setHouseInput(`${nextNum}${m[2]}`);
    } else if (delta > 0) {
      setHouseInput('1');
    }
  };

  const handleDropHouse = (side: HouseSide) => {
    if (!selectedRoad || !activeWp) return;
    const num = houseInput.trim() || nextSuggestedHouse || '1';
    onAddHouseOnRoad(
      selectedRoad.id,
      { lat: activeWp.lat, lng: activeWp.lng },
      activeWp.bearingDeg,
      num,
      side,
      shopName.trim() || undefined,
      houseNote.trim() || undefined,
      placeType,
      placeType === 'shop' ? shopCategory : undefined
    );
    const m = num.match(/^(\d+)(.*)$/);
    if (m) {
      setHouseInput(`${Number(m[1]) + 1}${m[2]}`);
    }
    setShopName('');
    setHouseNote('');
  };

  const startEditHouse = (h: VillageHouse) => {
    setEditingHouseId(h.id);
    setEditHouseNum(h.houseNumber);
    setEditSide(h.side);
    setEditPlaceType(h.placeType ?? (h.shopCategory || h.shopName ? 'shop' : 'house'));
    setEditShopCategory(h.shopCategory ?? 'kirana');
    setEditShopName(h.shopName ?? '');
    setEditNote(h.note ?? '');
  };

  const saveEditHouse = () => {
    if (!editingHouseId) return;
    const num = editHouseNum.trim();
    if (!num) return;
    onUpdateHouse(editingHouseId, {
      houseNumber: num,
      side: editSide,
      placeType: editPlaceType,
      shopCategory: editPlaceType === 'shop' ? editShopCategory : undefined,
      shopName: editShopName.trim() || undefined,
      note: editNote.trim() || undefined,
    });
    setEditingHouseId(null);
  };

  const renderRoadsList = () => (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-slate-900/60">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={roadFilter}
              onChange={(e) => setRoadFilter(e.target.value)}
              placeholder="Search roads..."
              className="w-full min-w-0 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-transparent focus:outline-none"
            />
            {roadFilter && (
              <button
                type="button"
                onClick={() => setRoadFilter('')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onFitAllRoads}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
          >
            Fit All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {filteredRoads.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {validRoads.length === 0
              ? 'No roads saved yet. Create a road in Add, Auto, or AutoMapX and it will appear here!'
              : 'No roads match your search.'}
          </div>
        ) : (
          filteredRoads.map((r) => {
            const active = selectedRoad?.id === r.id;
            const badge = getRoadCarBadge(r);
            const hCount = houseCountByRoadId.get(r.id) ?? 0;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelectRoad(r.id);
                  setMobileRoadsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  active
                    ? 'bg-sky-50 dark:bg-sky-950/60'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dotClass}`} />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {r.name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                    {formatDistance(r.distanceMeters)} · {getSurfaceLabel(r.surface)} · {hCount} places
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${badge.badgeClass}`}
                  >
                    {badge.label}
                  </span>
                  <Play
                    className={`w-3.5 h-3.5 ${
                      active ? 'text-sky-600 fill-current' : 'text-slate-400'
                    }`}
                  />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col lg:flex-row min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* Desktop Left Sidebar: Live List of All Created Roads */}
      <aside className="hidden lg:flex w-80 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col min-h-0">
        <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Road Simulation Studio
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tap any road on map or list to simulate &amp; edit
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/70 font-mono tabular-nums text-xs font-bold text-sky-800 dark:text-sky-300">
            {validRoads.length}
          </span>
        </div>
        <div className="flex-1 min-h-0">{renderRoadsList()}</div>
      </aside>

      {/* Main Simulation Area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Top Road Controls & Edit Meta Bar */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-1.5 z-20">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
            <button
              type="button"
              onClick={() => setMobileRoadsOpen((v) => !v)}
              className={`lg:hidden px-2.5 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 ${
                mobileRoadsOpen
                  ? 'bg-sky-600 text-white border-sky-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Roads ({validRoads.length})</span>
              {mobileRoadsOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {selectedRoad ? (
              <>
                <div className="flex items-center gap-1 min-w-[130px] max-w-[210px] flex-1">
                  <input
                    type="text"
                    value={roadNameDraft}
                    onChange={(e) => setRoadNameDraft(e.target.value)}
                    onBlur={commitRoadName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    placeholder="Road name..."
                    className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {roadNameDraft.trim() && roadNameDraft.trim() !== selectedRoad.name && (
                    <button
                      type="button"
                      onClick={commitRoadName}
                      className="p-1 rounded-lg bg-sky-600 text-white cursor-pointer shrink-0"
                      title="Save road name"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {SURFACES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onUpdateRoadMeta(selectedRoad.id, { surface: s.id })}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer shrink-0 transition-colors ${
                        selectedRoad.surface === s.id
                          ? 'bg-slate-900 dark:bg-sky-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>All {validRoads.length} Roads Ready · Tap any road</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {selectedRoad && (
              <>
                <button
                  type="button"
                  onClick={() => setHousesDrawerOpen((v) => !v)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    housesDrawerOpen
                      ? 'bg-emerald-700 text-white border-emerald-800'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  }`}
                >
                  <span>Houses ({roadHouses.length})</span>
                  {housesDrawerOpen ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronUp className="w-3 h-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onFitRoad(selectedRoad)}
                  title="Zoom to selected road"
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                {confirmDeleteRoad ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteRoad(selectedRoad.id);
                      setConfirmDeleteRoad(false);
                    }}
                    className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRoad(true)}
                    title="Delete selected road"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/60 text-slate-500 hover:text-red-600 border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onFitAllRoads}
              title="Show all roads on map"
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold cursor-pointer"
            >
              All
            </button>
            <button
              type="button"
              onClick={onLocateMe}
              title="Center on current GPS"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile Collapsible All Roads Drawer */}
        {mobileRoadsOpen && (
          <div className="lg:hidden shrink-0 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-md z-20">
            {renderRoadsList()}
          </div>
        )}

        {/* Map Viewport */}
        <div className="flex-1 min-h-0 w-full relative">
          {mapSlot}

          {!selectedRoad && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[440] w-[calc(100%-1.5rem)] max-w-md pointer-events-none">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-center text-xs text-slate-700 dark:text-slate-200">
                Tap any road directly on the map (or open <span className="font-bold">Roads ({validRoads.length})</span>) to start Simulation, edit houses/shops &amp; mark Car access!
              </div>
            </div>
          )}
        </div>

        {/* Expandable Road Houses & Places Editor Drawer */}
        {selectedRoad && housesDrawerOpen && (
          <div className="shrink-0 max-h-56 overflow-y-auto bg-slate-50 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-1.5 z-20">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                Places on {selectedRoad.name} ({roadHouses.length}) — tap to jump, pencil to edit
              </span>
              <button
                type="button"
                onClick={() => setHousesDrawerOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {roadHouses.length === 0 ? (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 py-2">
                No houses or shops added on this road yet. Use + Left / + Right below while simulating!
              </div>
            ) : (
              <div className="space-y-1.5">
                {roadHouses.map((h) => {
                  const isEditingThis = editingHouseId === h.id;
                  const pt = h.placeType ?? (h.shopCategory || h.shopName ? 'shop' : 'house');
                  if (isEditingThis) {
                    return (
                      <div
                        key={h.id}
                        className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            value={editHouseNum}
                            onChange={(e) => setEditHouseNum(e.target.value)}
                            placeholder="No."
                            className="w-16 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                          />
                          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            {(['left', 'right'] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setEditSide(s)}
                                className={`px-2 py-1 text-[10px] font-bold cursor-pointer ${
                                  editSide === s
                                    ? s === 'left'
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-amber-600 text-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {s === 'left' ? 'Left' : 'Right'}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={editShopName}
                            onChange={(e) => setEditShopName(e.target.value)}
                            placeholder="Shop / Place Name"
                            className="flex-1 min-w-[110px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Note"
                            className="w-28 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                          {PLACE_TYPE_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setEditPlaceType(opt.id)}
                              style={
                                editPlaceType === opt.id
                                  ? { backgroundColor: opt.color, borderColor: opt.color }
                                  : undefined
                              }
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer ${
                                editPlaceType === opt.id
                                  ? 'text-white'
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <PlaceIcon placeType={opt.id} className="w-3 h-3" />
                              <span>{opt.shortLabel}</span>
                            </button>
                          ))}
                        </div>

                        {editPlaceType === 'shop' && (
                          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                            {SHOP_CATEGORY_OPTIONS.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setEditShopCategory(cat.id)}
                                style={
                                  editShopCategory === cat.id
                                    ? { backgroundColor: cat.color, borderColor: cat.color }
                                    : undefined
                                }
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer ${
                                  editShopCategory === cat.id
                                    ? 'text-white'
                                    : 'bg-emerald-50/70 dark:bg-slate-900 border-emerald-200 dark:border-slate-700 text-emerald-900 dark:text-slate-300'
                                }`}
                              >
                                <PlaceIcon placeType="shop" shopCategory={cat.id} className="w-3 h-3" />
                                <span>{cat.shortLabel}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingHouseId(null)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEditHouse}
                            className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={h.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      <button
                        type="button"
                        onClick={() => handleJumpSimToHouse(h)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer"
                      >
                        <PlaceIcon
                          placeType={pt}
                          shopCategory={h.shopCategory}
                          className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200 shrink-0"
                        />
                        <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                          #{h.houseNumber}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            h.side === 'left'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {h.side}
                        </span>
                        {(h.shopName || h.note) && (
                          <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                            {h.shopName || h.note}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditHouse(h)}
                          title="Edit house/shop"
                          className="p-1 rounded text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteHouse(h.id)}
                          title="Delete place"
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom Simulation Player + Car Access + House/Shop Tagger */}
        {selectedRoad && (
          <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-1.5 z-20">
            {/* Row 1: Playback + Speed + Scrubber */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPlaying && safeSimIdx >= waypoints.length - 1) {
                        jumpToSimIndex(0, autoFollow);
                      }
                      setIsPlaying((p) => !p);
                    }}
                    disabled={waypoints.length < 2}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 ${
                      isPlaying
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-sky-600 hover:bg-sky-700 text-white'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Play</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToSimIndex(safeSimIdx - 4, autoFollow)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-mono font-semibold inline-flex items-center cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    5m
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToSimIndex(safeSimIdx + 4, autoFollow)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-mono font-semibold inline-flex items-center cursor-pointer"
                  >
                    5m
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      jumpToSimIndex(0, autoFollow);
                    }}
                    title="Restart road simulation"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                    {SIM_SPEEDS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setSimSpeed(sp)}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold cursor-pointer ${
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
                    onClick={() => setAutoFollow((v) => !v)}
                    title="Follow simulation cursor"
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      autoFollow
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700'
                        : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Crosshair className="w-3 h-3" />
                    <span className="hidden sm:inline">Follow</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, waypoints.length - 1)}
                  value={safeSimIdx}
                  onChange={(e) => jumpToSimIndex(Number(e.target.value), autoFollow)}
                  className="flex-1 h-2 accent-sky-600 cursor-pointer"
                />
                <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                  {coveredDistMeters}m / {totalDistMeters}m
                </span>
              </div>
            </div>

            {/* Row 2: Car Accessibility Toggle (Current Segment + Paint Mode + Full Road) */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const nextAcc: VehicleSegmentAccess =
                      activeSegAccess === 'car' ? 'no_car' : 'car';
                    setPaintAccessMode(nextAcc);
                    onStampSegmentCar(selectedRoad.id, activeSegIdx, nextAcc);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 border cursor-pointer transition-colors ${
                    activeSegAccess === 'car'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                      : activeSegAccess === 'no_car'
                      ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-700'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {activeSegAccess === 'no_car' ? (
                    <Ban className="w-3 h-3" />
                  ) : (
                    <Car className="w-3 h-3" />
                  )}
                  <span>
                    {activeSegAccess === 'car'
                      ? 'Seg: Car ON'
                      : activeSegAccess === 'no_car'
                      ? 'Seg: No Car'
                      : 'Mark Seg Car'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaintWhilePlaying((v) => !v);
                    if (!paintWhilePlaying && typeof activeWp?.segIndex === 'number') {
                      onStampSegmentCar(selectedRoad.id, activeWp.segIndex, paintAccessMode);
                    }
                  }}
                  title="Auto-mark Car ON/OFF while simulator plays"
                  className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                    paintWhilePlaying
                      ? paintAccessMode === 'car'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-400'
                        : 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-400'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {paintWhilePlaying
                    ? `Auto: ${paintAccessMode === 'car' ? 'Car ON' : 'No Car'}`
                    : 'Auto-Mark'}
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onStampWholeRoadCar(selectedRoad.id, 'car')}
                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold cursor-pointer"
                >
                  Full Car
                </button>
                <button
                  type="button"
                  onClick={() => onStampWholeRoadCar(selectedRoad.id, 'no_car')}
                  className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800 text-[10px] font-bold cursor-pointer"
                >
                  Full No-Car
                </button>
              </div>
            </div>

            {/* Row 3: Quick Add House / Shop / Temple at Simulator Position */}
            <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => adjustHouseNumber(-1)}
                    className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    value={houseInput}
                    onChange={(e) => setHouseInput(e.target.value)}
                    placeholder="No."
                    className="w-11 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => adjustHouseNumber(1)}
                    className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-[115px] flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Shop / Place name (optional)"
                    className="w-full min-w-0 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-transparent focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowNoteField((v) => !v)}
                  title="Add note"
                  className={`p-1.5 rounded-xl border cursor-pointer shrink-0 ${
                    showNoteField || houseNote
                      ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 text-sky-700'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <StickyNote className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleDropHouse('left')}
                    disabled={!activeWp || !houseInput.trim()}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    + Left
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDropHouse('right')}
                    disabled={!activeWp || !houseInput.trim()}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
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
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
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
                        className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
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
                    placeholder="Landmark / note (optional)..."
                    className="flex-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

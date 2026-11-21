import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Footprints,
  List,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Route,
  Square,
  StickyNote,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutoTrip,
  HouseSide,
  LatLngPoint,
  VillageHouse,
  VillageRoad,
} from '../types/map.ts';
import {
  buildSimulatorWaypoints,
  computePathDistance,
  formatDistance,
  formatDuration,
  getSurfaceLabel,
} from '../utils/geo.ts';
import type { GpsPrecisionMode, GpsQualityReport } from '../utils/gpsFilter.ts';

type SimSpeed = 0.5 | 1 | 2 | 4;

interface AutoWorkspaceProps {
  trips: AutoTrip[];
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  onDeleteTrip: (tripId: string) => void;
  onUpdateTripMeta: (
    tripId: string,
    patch: { name?: string; surface?: VillageRoad['surface'] }
  ) => void;
  onFitTripRoad: (trip: AutoTrip) => void;
  isAutoRecording: boolean;
  isAutoPaused: boolean;
  autoPoints: LatLngPoint[];
  autoElapsedSeconds: number;
  gpsPrecisionMode: GpsPrecisionMode;
  onTogglePrecisionMode: () => void;
  gpsQuality: GpsQualityReport;
  gpsError: string | null;
  onStartAuto: () => void;
  onPauseResumeAuto: () => void;
  onCloseAndSaveAuto: () => void;
  onDiscardAuto: () => void;
  onTestStepAuto: () => void;
  onLocateMe: () => void;
  onSimPositionChange: (
    pos: { lat: number; lng: number; headingDeg: number } | null,
    panMap: boolean
  ) => void;
  onAddHouseOnTrip: (
    tripId: string,
    point: { lat: number; lng: number },
    headingDeg: number,
    houseNumber: string,
    side: HouseSide,
    shopName?: string,
    note?: string
  ) => void;
  onRemoveHouseOnTrip: (tripId: string, houseId: string) => void;
  onFocusHouse: (house: VillageHouse) => void;
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
  0.5: 1050,
  1: 520,
  2: 260,
  4: 130,
};

function formatTripTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AutoWorkspace({
  trips,
  selectedTripId,
  onSelectTrip,
  onDeleteTrip,
  onUpdateTripMeta,
  onFitTripRoad,
  isAutoRecording,
  isAutoPaused,
  autoPoints,
  autoElapsedSeconds,
  gpsPrecisionMode,
  onTogglePrecisionMode,
  gpsQuality,
  gpsError,
  onStartAuto,
  onPauseResumeAuto,
  onCloseAndSaveAuto,
  onDiscardAuto,
  onTestStepAuto,
  onLocateMe,
  onSimPositionChange,
  onAddHouseOnTrip,
  onRemoveHouseOnTrip,
  onFocusHouse,
  nextSuggestedHouse,
  mapSlot,
}: AutoWorkspaceProps) {
  const selectedTrip = useMemo(
    () => (selectedTripId ? trips.find((t) => t.id === selectedTripId) ?? null : null),
    [trips, selectedTripId]
  );

  const waypoints = useMemo(
    () => (selectedTrip ? buildSimulatorWaypoints(selectedTrip.points, 1) : []),
    [selectedTrip]
  );

  const [simIdx, setSimIdx] = useState(0);
  const [isSimPlaying, setIsSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>(0.5);
  const [autoFollowSim, setAutoFollowSim] = useState(true);
  const [mobileTripsOpen, setMobileTripsOpen] = useState(false);
  const [confirmDeleteTripId, setConfirmDeleteTripId] = useState<string | null>(null);

  const [tripNameDraft, setTripNameDraft] = useState('');
  const [houseInput, setHouseInput] = useState(nextSuggestedHouse || '1');
  const [shopName, setShopName] = useState('');
  const [houseNote, setHouseNote] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [housesListOpen, setHousesListOpen] = useState(false);

  const onSimPositionChangeRef = useRef(onSimPositionChange);
  onSimPositionChangeRef.current = onSimPositionChange;

  const liveAutoDistance = useMemo(() => computePathDistance(autoPoints), [autoPoints]);

  // Reset simulator smoothly whenever user switches to another saved trip or enters recording
  useEffect(() => {
    setIsSimPlaying(false);
    setSimIdx(0);
    setConfirmDeleteTripId(null);
    if (selectedTrip) {
      setTripNameDraft(selectedTrip.name);
      const wps = buildSimulatorWaypoints(selectedTrip.points, 1);
      if (wps.length > 0 && !isAutoRecording) {
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
  }, [selectedTrip?.id, isAutoRecording]);

  useEffect(() => {
    if (!isAutoRecording && !houseInput.trim()) {
      setHouseInput(nextSuggestedHouse || '1');
    }
  }, [nextSuggestedHouse, isAutoRecording, houseInput]);

  // Clear sim overlay on unmount
  useEffect(() => {
    return () => {
      onSimPositionChangeRef.current(null, false);
    };
  }, []);

  // Clamp simIdx if waypoints shrink
  const safeSimIdx = waypoints.length > 0 ? Math.min(simIdx, waypoints.length - 1) : 0;
  const activeWaypoint = waypoints[safeSimIdx] ?? null;
  const totalWaypointsDist =
    waypoints.length > 0 ? Math.round(waypoints[waypoints.length - 1].cumulativeMeters) : 0;
  const coveredWaypointsDist = activeWaypoint ? Math.round(activeWaypoint.cumulativeMeters) : 0;

  // Slow simulator playback loop
  useEffect(() => {
    if (!isSimPlaying || isAutoRecording || waypoints.length < 2) return;

    const timer = setInterval(() => {
      setSimIdx((prev) => {
        const next = prev + 1;
        if (next >= waypoints.length) {
          setIsSimPlaying(false);
          return waypoints.length - 1;
        }
        const wp = waypoints[next];
        if (wp) {
          onSimPositionChangeRef.current(
            { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
            autoFollowSim
          );
        }
        if (next >= waypoints.length - 1) {
          setIsSimPlaying(false);
        }
        return next;
      });
    }, SPEED_INTERVAL_MS[simSpeed]);

    return () => clearInterval(timer);
  }, [isSimPlaying, isAutoRecording, waypoints, simSpeed, autoFollowSim]);

  const jumpToSimIndex = (targetIdx: number, shouldPan = true) => {
    if (waypoints.length === 0) return;
    const clamped = Math.max(0, Math.min(targetIdx, waypoints.length - 1));
    setSimIdx(clamped);
    const wp = waypoints[clamped];
    if (wp) {
      onSimPositionChangeRef.current(
        { lat: wp.lat, lng: wp.lng, headingDeg: wp.bearingDeg },
        shouldPan
      );
    }
  };

  const handleTogglePlay = () => {
    if (waypoints.length < 2) return;
    if (isSimPlaying) {
      setIsSimPlaying(false);
      return;
    }
    if (safeSimIdx >= waypoints.length - 1) {
      jumpToSimIndex(0, autoFollowSim);
    } else if (activeWaypoint) {
      onSimPositionChangeRef.current(
        {
          lat: activeWaypoint.lat,
          lng: activeWaypoint.lng,
          headingDeg: activeWaypoint.bearingDeg,
        },
        autoFollowSim
      );
    }
    setIsSimPlaying(true);
  };

  const adjustHouseNumber = (delta: number) => {
    const parsed = parseInt(houseInput.trim(), 10);
    if (Number.isFinite(parsed)) {
      setHouseInput(String(Math.max(1, parsed + delta)));
    } else {
      setHouseInput('1');
    }
  };

  const handleTagHouse = (side: HouseSide) => {
    if (!selectedTrip || !activeWaypoint) return;
    const trimmed = houseInput.trim();
    if (!trimmed) return;

    onAddHouseOnTrip(
      selectedTrip.id,
      { lat: activeWaypoint.lat, lng: activeWaypoint.lng },
      activeWaypoint.bearingDeg,
      trimmed,
      side,
      shopName.trim() || undefined,
      houseNote.trim() || undefined
    );

    const parsed = parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && String(parsed) === trimmed) {
      setHouseInput(String(parsed + 1));
    }
    setShopName('');
    setHouseNote('');
  };

  const commitTripName = () => {
    if (!selectedTrip) return;
    const cleaned = tripNameDraft.trim();
    if (cleaned && cleaned !== selectedTrip.name) {
      onUpdateTripMeta(selectedTrip.id, { name: cleaned });
    } else {
      setTripNameDraft(selectedTrip.name);
    }
  };

  const renderTripListContent = () => {
    if (trips.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
          <Route className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500" />
          <div className="font-semibold text-slate-700 dark:text-slate-200">
            No Auto trips saved yet
          </div>
          <p className="leading-relaxed">
            Tap <span className="font-bold text-emerald-700 dark:text-emerald-400">Start Auto</span>, walk any road, then tap{' '}
            <span className="font-bold">Close &amp; Save</span>. Every trip saves separately so you can replay it slowly at home!
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {trips.map((trip) => {
          const isSelected = trip.id === selectedTripId && !isAutoRecording;
          const isConfirmingDel = confirmDeleteTripId === trip.id;

          return (
            <div
              key={trip.id}
              onClick={() => {
                onSelectTrip(trip.id);
                setMobileTripsOpen(false);
              }}
              className={`p-3 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-sky-50 dark:bg-sky-950/50 border-l-4 border-l-sky-600'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {trip.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                      {getSurfaceLabel(trip.surface)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {trip.villageName} · {formatTripTimestamp(trip.startedAt)}
                  </div>
                </div>

                {isConfirmingDel ? (
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteTrip(trip.id);
                        setConfirmDeleteTripId(null);
                      }}
                      className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold cursor-pointer"
                    >
                      Del
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTripId(null)}
                      className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteTripId(trip.id);
                    }}
                    title="Delete saved trip"
                    className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>
                  {formatDistance(trip.distanceMeters)} · {formatDuration(trip.durationSeconds)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-sans font-bold text-[10px]">
                  {trip.houses.length} {trip.houses.length === 1 ? 'House' : 'Houses'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* Desktop Left Sidebar: Saved Auto Trips List */}
      <aside className="hidden lg:flex lg:flex-col w-[330px] shrink-0 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Saved Auto Trips
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Start → Close saves each walk separately
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-200">
            {trips.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">{renderTripListContent()}</div>
      </aside>

      {/* Main Column: Auto Recorder Bar + Map + Slow Simulator & House/Shop Tagging */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Top Auto Recorder & Trip Bar */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 z-20">
          {!isAutoRecording ? (
            <>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onStartAuto}
                  className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Footprints className="w-3.5 h-3.5" />
                  Start Auto
                </button>

                <button
                  type="button"
                  onClick={() => setMobileTripsOpen((v) => !v)}
                  className={`lg:hidden px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                    mobileTripsOpen
                      ? 'bg-sky-600 text-white border-sky-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Trips ({trips.length})</span>
                  {mobileTripsOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {selectedTrip && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400 truncate max-w-[200px]">
                    <Route className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{selectedTrip.name}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onTogglePrecisionMode}
                  title="Switch GPS precision filter"
                  className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-semibold cursor-pointer ${
                    gpsPrecisionMode === 'accurate_5m'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {gpsPrecisionMode === 'accurate_5m' ? '≤5m' : '≤15m'}
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
            </>
          ) : (
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold ${
                    isAutoPaused
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200'
                      : 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isAutoPaused ? 'bg-amber-500' : 'bg-red-600 animate-pulse'
                    }`}
                  />
                  {isAutoPaused ? 'PAUSED' : 'AUTO'}
                </span>

                <div className="text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {formatDistance(liveAutoDistance)} · {formatDuration(autoElapsedSeconds)} ·{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    {autoPoints.length} pts
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onTestStepAuto}
                  title="Add a test walking step along road"
                  className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold cursor-pointer"
                >
                  +Step
                </button>

                <button
                  type="button"
                  onClick={onPauseResumeAuto}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border cursor-pointer ${
                    isAutoPaused
                      ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  {isAutoPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{isAutoPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  onClick={onCloseAndSaveAuto}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Close &amp; Save</span>
                </button>

                <button
                  type="button"
                  onClick={onDiscardAuto}
                  title="Discard this recording"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {gpsError && (
                <div className="w-full text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  {gpsError} · GPS {gpsQuality.label}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Trip Road Name & Surface Strip (when viewing a trip) */}
        {!isAutoRecording && selectedTrip && (
          <div className="shrink-0 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-xs">
              <input
                type="text"
                value={tripNameDraft}
                onChange={(e) => setTripNameDraft(e.target.value)}
                onBlur={commitTripName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Road name..."
                className="w-full min-w-[120px] px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {tripNameDraft.trim() !== selectedTrip.name && (
                <button
                  type="button"
                  onClick={commitTripName}
                  className="p-1 rounded-lg bg-sky-600 text-white cursor-pointer shrink-0"
                  title="Save road name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {SURFACES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUpdateTripMeta(selectedTrip.id, { surface: s.id })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors ${
                    selectedTrip.surface === s.id
                      ? 'bg-slate-900 dark:bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onFitTripRoad(selectedTrip)}
                title="Show full road Start to End"
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span className="hidden sm:inline">Full Road</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile Collapsible Saved Trips Drawer */}
        {mobileTripsOpen && !isAutoRecording && (
          <div className="lg:hidden shrink-0 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-md z-20">
            {renderTripListContent()}
          </div>
        )}

        {/* Map Viewport */}
        <div className="flex-1 min-h-0 w-full relative">
          {mapSlot}

          {!isAutoRecording && !selectedTrip && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[440] w-[calc(100%-1.5rem)] max-w-md pointer-events-none">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5 text-center text-xs text-slate-700 dark:text-slate-200">
                {trips.length === 0 ? (
                  <>
                    Tap <span className="font-bold text-emerald-700 dark:text-emerald-400">Start Auto</span> to record a walk. When finished, tap <span className="font-bold text-sky-700 dark:text-sky-400">Close &amp; Save</span> — then play the slow simulator at home to tag houses &amp; shops!
                  </>
                ) : (
                  <>
                    Select a saved trip from <span className="font-bold">Trips ({trips.length})</span> to view the full Start → End road and run the slow simulator.
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Dock: Slow Simulator + At-Home House/Shop Tagger */}
        {!isAutoRecording && selectedTrip && (
          <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-2 z-20">
            {/* Simulator Controls */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    disabled={waypoints.length < 2}
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
                  max={Math.max(0, waypoints.length - 1)}
                  value={safeSimIdx}
                  onChange={(e) => jumpToSimIndex(Number(e.target.value), autoFollowSim)}
                  className="flex-1 h-2 accent-sky-600 cursor-pointer"
                />
                <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                  {coveredWaypointsDist}m / {totalWaypointsDist}m
                </span>
              </div>
            </div>

            {/* At-Home House & Shop Tagging Row */}
            <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* House Number Stepper */}
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

                {/* Optional Shop / Dukan */}
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

                {/* Left / Right Add Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleTagHouse('left')}
                    disabled={!activeWaypoint || !houseInput.trim()}
                    className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    + Left
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTagHouse('right')}
                    disabled={!activeWaypoint || !houseInput.trim()}
                    className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    + Right
                  </button>
                </div>
              </div>

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

              {/* Compact Tagged Houses Strip */}
              {selectedTrip.houses.length > 0 && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setHousesListOpen((v) => !v)}
                    className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>
                      Added on this road ({selectedTrip.houses.length})
                    </span>
                    {housesListOpen ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {housesListOpen && (
                    <div className="mt-1.5 max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                      {selectedTrip.houses.map((h) => (
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
                            <span className="opacity-75">
                              ({h.side === 'left' ? 'L' : 'R'})
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveHouseOnTrip(selectedTrip.id, h.id)}
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
        )}
      </div>
    </div>
  );
}

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  Compass,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Footprints,
  GitBranch,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  StickyNote,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import type {
  CaptureMode,
  HouseSide,
  JunctionDirection,
  JunctionWayCount,
  LatLngPoint,
  RoadJunction,
  VillageHouse,
  VillageRoad,
} from '../types/map.ts';
import {
  type PendingJunctionBranchItem,
  computePathDistance,
  formatDistance,
  formatDuration,
  haversineMeters,
} from '../utils/geo.ts';
import type { GpsPrecisionMode, GpsQualityReport } from '../utils/gpsFilter.ts';

export type StraightSymbolAction =
  | 'turn_left'
  | 'turn_right'
  | 'slight_left'
  | 'slight_right'
  | 'gentle_left'
  | 'gentle_right'
  | 's_curve_left'
  | 's_curve_right'
  | 'curve_left'
  | 'curve_right'
  | 'sharp_left'
  | 'sharp_right'
  | 'u_turn'
  | 'straight_step'
  | 'nudge_left'
  | 'nudge_right';

interface AddWalkWorkspaceProps {
  captureMode: CaptureMode;
  onChangeCaptureMode: (mode: CaptureMode) => void;
  gpsPrecisionMode: GpsPrecisionMode;
  onTogglePrecisionMode: () => void;
  gpsQuality: GpsQualityReport;
  currentGps: LatLngPoint;
  isRecording: boolean;
  isPaused: boolean;
  segments: LatLngPoint[][];
  draftHouses: VillageHouse[];
  draftJunctions: RoadJunction[];
  pendingBranches: PendingJunctionBranchItem[];
  activeBranchLabel: string | null;
  straightHeadingDeg: number | null;
  elapsedSeconds: number;
  gpsError: string | null;
  detectedVillage: string;
  onStartWalk: () => void;
  onPauseResume: () => void;
  onUndoLastPoint: () => void;
  onDiscardWalk: () => void;
  onSimulateStep: (dLat: number, dLng: number) => void;
  onStraightSymbol: (action: StraightSymbolAction) => void;
  onCreateMultiBranchJunction: (
    waysCount: JunctionWayCount,
    selectedDirections: JunctionDirection[],
    firstDirection: JunctionDirection
  ) => void;
  onSelectPendingBranch: (junction: RoadJunction, branchId: string) => void;
  onAddHouseOnWalk: (
    houseNumber: string,
    side: HouseSide,
    shopName?: string,
    note?: string
  ) => void;
  onRemoveDraftHouse: (houseId: string) => void;
  onSaveWalkedRoad: (payload: {
    roadName: string;
    villageName: string;
    surface: VillageRoad['surface'];
  }) => void;
  nextSuggestedHouse: string;
  onLocateMe: () => void;
  mapSlot: ReactNode;
}

const DEFAULT_DIRS: Record<JunctionWayCount, JunctionDirection[]> = {
  2: ['left', 'right'],
  3: ['left', 'straight', 'right'],
  4: ['left', 'straight', 'right', 'back'],
};

const ALL_DIRECTIONS: { dir: JunctionDirection; label: string }[] = [
  { dir: 'left', label: 'Left' },
  { dir: 'straight', label: 'Straight' },
  { dir: 'right', label: 'Right' },
  { dir: 'back', label: 'Back' },
];

function DirectionGlyph({
  dir,
  className = 'w-3.5 h-3.5',
}: {
  dir: JunctionDirection;
  className?: string;
}) {
  switch (dir) {
    case 'left':
      return <CornerUpLeft className={className} />;
    case 'right':
      return <CornerUpRight className={className} />;
    case 'back':
      return <ArrowDown className={className} />;
    case 'straight':
    default:
      return <ArrowUp className={className} />;
  }
}

export default function AddWalkWorkspace({
  captureMode,
  onChangeCaptureMode,
  gpsPrecisionMode,
  onTogglePrecisionMode,
  gpsQuality,
  currentGps,
  isRecording,
  isPaused,
  segments,
  draftHouses,
  draftJunctions,
  pendingBranches,
  activeBranchLabel,
  straightHeadingDeg,
  elapsedSeconds,
  gpsError,
  detectedVillage,
  onStartWalk,
  onPauseResume,
  onUndoLastPoint,
  onDiscardWalk,
  onSimulateStep,
  onStraightSymbol,
  onCreateMultiBranchJunction,
  onSelectPendingBranch,
  onAddHouseOnWalk,
  onRemoveDraftHouse,
  onSaveWalkedRoad,
  nextSuggestedHouse,
  onLocateMe,
  mapSlot,
}: AddWalkWorkspaceProps) {
  const [houseInput, setHouseInput] = useState(nextSuggestedHouse || '1');
  const [shopName, setShopName] = useState('');
  const [houseNote, setHouseNote] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);

  const [junctionOpen, setJunctionOpen] = useState(false);
  const [waysCount, setWaysCount] = useState<JunctionWayCount>(3);
  const [selectedDirs, setSelectedDirs] = useState<JunctionDirection[]>(DEFAULT_DIRS[3]);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [roadName, setRoadName] = useState('');
  const [villageName, setVillageName] = useState('');
  const [surface, setSurface] = useState<VillageRoad['surface']>('concrete');

  useEffect(() => {
    if (draftHouses.length === 0 && !isRecording) {
      setHouseInput(nextSuggestedHouse || '1');
    }
  }, [nextSuggestedHouse, draftHouses.length, isRecording]);

  const liveDistance = segments.reduce((sum, seg) => sum + computePathDistance(seg), 0);
  const totalPoints = segments.reduce((sum, seg) => sum + seg.length, 0);
  const hasSavableSegment = segments.some((seg) => seg.length >= 2);
  const leftHouses = draftHouses.filter((h) => h.side === 'left');
  const rightHouses = draftHouses.filter((h) => h.side === 'right');

  const handleSelectWayCount = (count: JunctionWayCount) => {
    setWaysCount(count);
    setSelectedDirs(DEFAULT_DIRS[count]);
  };

  const openJunctionFor = (count: JunctionWayCount) => {
    if (junctionOpen && waysCount === count) {
      setJunctionOpen(false);
      return;
    }
    setWaysCount(count);
    setSelectedDirs(DEFAULT_DIRS[count]);
    setJunctionOpen(true);
  };

  const toggleDirection = (dir: JunctionDirection) => {
    setSelectedDirs((prev) => {
      if (prev.includes(dir)) {
        if (prev.length <= 2) return prev;
        return prev.filter((d) => d !== dir);
      }
      const next = [...prev, dir];
      if (next.length > waysCount) {
        return [...next.slice(next.length - waysCount)];
      }
      return next;
    });
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
    const trimmed = houseInput.trim();
    if (!trimmed) return;
    onAddHouseOnWalk(
      trimmed,
      side,
      shopName.trim() || undefined,
      houseNote.trim() || undefined
    );
    setShopName('');
    setHouseNote('');
    const numeric = Number(trimmed);
    if (Number.isInteger(numeric) && numeric >= 0) {
      setHouseInput(String(numeric + 1));
    }
  };

  const handleOpenSave = () => {
    setVillageName((v) => v || detectedVillage || 'My Village');
    setShowSaveModal(true);
  };

  const handleFinishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSavableSegment) return;
    onSaveWalkedRoad({
      roadName: roadName.trim() || `Village Lane (${draftHouses.length} houses)`,
      villageName: villageName.trim() || detectedVillage || 'My Village',
      surface,
    });
    setRoadName('');
    setShowSaveModal(false);
    setHouseInput(nextSuggestedHouse || '1');
  };

  const canUseRoadSteps = isRecording && !isPaused;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
      {/* Responsive Walk Toolbar */}
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 sm:px-4 py-1.5 flex items-center justify-between gap-2 z-20 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              disabled={isRecording}
              onClick={() => onChangeCaptureMode('straight_walk')}
              title="Straight Road + All Turn/Curve/Junction Steps"
              className={`px-2 py-1 text-[11px] font-medium rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                captureMode === 'straight_walk'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Ruler className="w-3 h-3" />
              Straight
            </button>
            <button
              type="button"
              disabled={isRecording}
              onClick={() => onChangeCaptureMode('gps_walk')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                captureMode === 'gps_walk'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Footprints className="w-3 h-3" />
              GPS
            </button>
            <button
              type="button"
              disabled={isRecording}
              onClick={() => onChangeCaptureMode('manual_trace')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                captureMode === 'manual_trace'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Pencil className="w-3 h-3" />
              Tap
            </button>
            <button
              type="button"
              disabled={isRecording}
              onClick={() => onChangeCaptureMode('simulated_walk')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                captureMode === 'simulated_walk'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Compass className="w-3 h-3" />
              Test
            </button>
          </div>

          <button
            type="button"
            onClick={onTogglePrecisionMode}
            title="Toggle ≤5m accurate GPS lock vs ≤15m indoor tolerance"
            className={`px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
              gpsPrecisionMode === 'accurate_5m'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {gpsPrecisionMode === 'accurate_5m' ? '≤5m' : '≤15m'}
          </button>

          <button
            type="button"
            onClick={onLocateMe}
            aria-label="Center on GPS"
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Live Telemetry & Recording Controls */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <div className="hidden md:flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 px-2">
            <span>{formatDistance(liveDistance)}</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span>{totalPoints} pts</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span>{formatDuration(elapsedSeconds)}</span>
          </div>

          {!isRecording && totalPoints === 0 ? (
            <button
              type="button"
              onClick={onStartWalk}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Start Walk
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={isRecording ? onPauseResume : onStartWalk}
                className="px-2.5 py-1.5 bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {!isRecording || isPaused ? (
                  <>
                    <Play className="w-3 h-3" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3" />
                    Pause
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={totalPoints === 0}
                onClick={onUndoLastPoint}
                title="Undo last point"
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={!hasSavableSegment}
                onClick={handleOpenSave}
                className="px-2.5 py-1.5 bg-sky-700 hover:bg-sky-800 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Save
              </button>

              <button
                type="button"
                onClick={onDiscardWalk}
                title="Discard walk"
                className="p-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending Multi-Branch Junction Queue */}
      {pendingBranches.length > 0 && (
        <div className="shrink-0 bg-amber-50/90 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-2.5 sm:px-3 py-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar z-10">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200 whitespace-nowrap shrink-0">
            <GitBranch className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>Pending ({pendingBranches.length}):</span>
          </div>
          <div className="flex items-center gap-1.5">
            {pendingBranches.map((item) => {
              const distM = Math.round(haversineMeters(currentGps, item.junction));
              return (
                <button
                  key={`${item.junction.id}-${item.branch.id}`}
                  type="button"
                  onClick={() => onSelectPendingBranch(item.junction, item.branch.id)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-amber-950 dark:text-amber-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs cursor-pointer transition-colors"
                >
                  <DirectionGlyph dir={item.branch.direction} className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                  <span>
                    Map {item.branch.label}
                    {item.sourceRoadName ? ` (${item.sourceRoadName})` : ''}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-amber-700 dark:text-amber-400">
                    {distM <= 2000 ? `${distM}m` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Paused or Active Branch Status Strip */}
      {((isRecording && isPaused) || activeBranchLabel) && (
        <div className="shrink-0 bg-sky-50 dark:bg-sky-950/60 border-b border-sky-200 dark:border-sky-800 px-3 py-1 flex items-center justify-between gap-2 text-[11px] text-sky-900 dark:text-sky-200">
          <span className="truncate font-medium">
            {isPaused
              ? 'Paused · Live GPS active — move to next spot and press Resume'
              : `Mapping ${activeBranchLabel}`}
          </span>
          {isPaused && (
            <button
              type="button"
              onClick={onPauseResume}
              className="font-bold underline text-sky-950 dark:text-sky-100 shrink-0 cursor-pointer"
            >
              Resume
            </button>
          )}
        </div>
      )}

      {/* Optional GPS Alert Strip */}
      {gpsError && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-3 py-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
          <span>
            {gpsError}
            {gpsQuality.accuracyMeters != null ? ` (±${gpsQuality.accuracyMeters}m)` : ''}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {gpsPrecisionMode === 'accurate_5m' && (
              <button
                type="button"
                onClick={onTogglePrecisionMode}
                className="font-semibold underline text-amber-950 cursor-pointer"
              >
                Allow ≤15m
              </button>
            )}
            {(captureMode === 'gps_walk' || captureMode === 'straight_walk') && (
              <button
                type="button"
                onClick={() => onChangeCaptureMode('simulated_walk')}
                className="font-semibold underline text-amber-950 cursor-pointer"
              >
                Test Walk
              </button>
            )}
          </div>
        </div>
      )}

      {/* SPACIOUS 3-COLUMN WORKSPACE: [SLIM LEFT] | [FULL UNOBSTRUCTED CENTER MAP] | [SLIM RIGHT] */}
      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden">
        {/* LEFT HOUSE RAIL */}
        <aside className="w-[54px] sm:w-24 md:w-28 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between p-1 sm:p-2 z-10">
          <div className="space-y-1">
            <div className="text-[10px] sm:text-xs font-bold text-emerald-800 dark:text-emerald-400 text-center">
              Left
            </div>
            <button
              type="button"
              disabled={!houseInput.trim()}
              onClick={() => handleTagHouse('left')}
              className="w-full min-h-[56px] sm:min-h-[72px] px-1 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-sm transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-bold font-mono tabular-nums leading-tight">
                {houseInput.trim() || '?'}
              </span>
              <span className="text-[9px] sm:text-[10px] opacity-90 leading-none">Add Left</span>
            </button>
          </div>

          <div className="flex-1 min-h-0 my-1.5 overflow-y-auto space-y-1">
            <div className="text-[10px] font-mono tabular-nums text-slate-400 text-center">
              {leftHouses.length}
            </div>
            {leftHouses
              .slice()
              .reverse()
              .map((h) => (
                <div
                  key={h.id}
                  title={h.shopName ? `${h.houseNumber} · ${h.shopName}` : h.houseNumber}
                  className="px-1 sm:px-1.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-md flex items-center justify-between gap-0.5 text-[11px]"
                >
                  <span className="font-mono font-bold text-emerald-900 dark:text-emerald-300 truncate flex items-center gap-0.5 min-w-0">
                    {h.shopName && <Store className="w-2.5 h-2.5 text-emerald-700 dark:text-emerald-400 shrink-0" />}
                    <span className="truncate">{h.houseNumber}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveDraftHouse(h.id)}
                    className="text-emerald-700/70 dark:text-emerald-400/70 hover:text-red-600 shrink-0 cursor-pointer"
                    aria-label={`Remove left house ${h.houseNumber}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>

          <div className="text-[10px] font-mono tabular-nums text-center text-slate-500 dark:text-slate-400 md:hidden">
            {formatDistance(liveDistance)}
          </div>
        </aside>

        {/* CENTER UNOBSTRUCTED MAP */}
        <section className="flex-1 min-w-0 h-full relative">{mapSlot}</section>

        {/* RIGHT HOUSE RAIL */}
        <aside className="w-[54px] sm:w-24 md:w-28 shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between p-1 sm:p-2 z-10">
          <div className="space-y-1">
            <div className="text-[10px] sm:text-xs font-bold text-amber-700 dark:text-amber-400 text-center">
              Right
            </div>
            <button
              type="button"
              disabled={!houseInput.trim()}
              onClick={() => handleTagHouse('right')}
              className="w-full min-h-[56px] sm:min-h-[72px] px-1 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-sm transition cursor-pointer"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-bold font-mono tabular-nums leading-tight">
                {houseInput.trim() || '?'}
              </span>
              <span className="text-[9px] sm:text-[10px] opacity-90 leading-none">Add Right</span>
            </button>
          </div>

          <div className="flex-1 min-h-0 my-1.5 overflow-y-auto space-y-1">
            <div className="text-[10px] font-mono tabular-nums text-slate-400 text-center">
              {rightHouses.length}
            </div>
            {rightHouses
              .slice()
              .reverse()
              .map((h) => (
                <div
                  key={h.id}
                  title={h.shopName ? `${h.houseNumber} · ${h.shopName}` : h.houseNumber}
                  className="px-1 sm:px-1.5 py-1 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-md flex items-center justify-between gap-0.5 text-[11px]"
                >
                  <span className="font-mono font-bold text-amber-900 dark:text-amber-300 truncate flex items-center gap-0.5 min-w-0">
                    {h.shopName && <Store className="w-2.5 h-2.5 text-amber-700 dark:text-amber-400 shrink-0" />}
                    <span className="truncate">{h.houseNumber}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveDraftHouse(h.id)}
                    className="text-amber-700/70 dark:text-amber-400/70 hover:text-red-600 shrink-0 cursor-pointer"
                    aria-label={`Remove right house ${h.houseNumber}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>

          <div className="text-[10px] font-mono tabular-nums text-center text-slate-500 dark:text-slate-400 md:hidden">
            {totalPoints} pts
          </div>
        </aside>
      </div>

      {/* BOTTOM DOCK: HORIZONTAL SCROLLABLE ROAD STEPS + HOUSE NUMBER & SHOP BAR */}
      <div className="shrink-0 relative bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-30">
        {/* 2/3/4-Way Multi-Branch Junction Popover (anchored cleanly above bottom dock when toggled) */}
        {junctionOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[calc(100%-1rem)] max-w-md z-[480] bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-700 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-300">
                Mark Junction (Map 1 branch at a time)
              </span>
              <button
                type="button"
                onClick={() => setJunctionOpen(false)}
                aria-label="Close junction setup"
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {([2, 3, 4] as JunctionWayCount[]).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleSelectWayCount(cnt)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    waysCount === cnt
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {cnt}-Way Split
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-slate-300">
                Branches at this spot ({selectedDirs.length}/{waysCount} selected):
              </div>
              <div className="grid grid-cols-4 gap-1">
                {ALL_DIRECTIONS.map(({ dir, label }) => {
                  const active = selectedDirs.includes(dir);
                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => toggleDirection(dir)}
                      className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 border transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <DirectionGlyph dir={dir} className="w-3 h-3" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1 pt-0.5">
              <div className="text-[10px] text-emerald-300 font-medium">
                Which branch are you walking first? (Rest auto-queue as Pending)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedDirs.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      onCreateMultiBranchJunction(waysCount, selectedDirs, dir);
                      setJunctionOpen(false);
                    }}
                    className="flex-1 min-w-[76px] py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <DirectionGlyph dir={dir} className="w-3.5 h-3.5" />
                    <span>Go {ALL_DIRECTIONS.find((d) => d.dir === dir)?.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Horizontally Scrollable Icon-Only Road Geometry & Turn Steps Bar (Left <-> Right swipe) */}
        {captureMode === 'straight_walk' && (
          <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 px-2 sm:px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {!canUseRoadSteps ? (
              <button
                type="button"
                onClick={isRecording ? onPauseResume : onStartWalk}
                aria-label={isRecording && isPaused ? 'Resume Walk' : 'Start Walk'}
                title={isRecording && isPaused ? 'Resume Walk' : 'Start Walk'}
                className="px-3 h-10 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>{isRecording && isPaused ? 'Resume' : 'Start Walk'}</span>
              </button>
            ) : (
              <>
                <span
                  title="Current straight road heading"
                  className="px-2 h-10 inline-flex items-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono tabular-nums font-bold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0"
                >
                  {straightHeadingDeg != null ? `${Math.round(straightHeadingDeg)}°` : 'Auto'}
                </span>

                {/* Straight Forward */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('straight_step')}
                  title="Straight (+5m)"
                  aria-label="Straight forward"
                  className="w-10 h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>

                {/* Long Gentle Bend Left */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('gentle_left')}
                  title="Long Gentle Left Bend"
                  aria-label="Long gentle left bend"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 21V11.5C14 8.5 13 6 10.5 3.5" />
                    <path d="M8.5 6.8L10 3.2L13.5 4.6" />
                  </svg>
                </button>

                {/* Long Gentle Bend Right */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('gentle_right')}
                  title="Long Gentle Right Bend"
                  aria-label="Long gentle right bend"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 21V11.5C10 8.5 11 6 13.5 3.5" />
                    <path d="M15.5 6.8L14 3.2L10.5 4.6" />
                  </svg>
                </button>

                {/* Side Shift / S-Bend Right (│ + ╰╮) */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('s_curve_right')}
                  title="Side Shift Right (S-Bend)"
                  aria-label="Side shift right"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 21V16C8 12.5 16 11.5 16 8V3.5" />
                    <path d="M13 6L16 3L19 6" />
                  </svg>
                </button>

                {/* Side Shift / S-Bend Left */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('s_curve_left')}
                  title="Side Shift Left (S-Bend)"
                  aria-label="Side shift left"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 21V16C16 12.5 8 11.5 8 8V3.5" />
                    <path d="M5 6L8 3L11 6" />
                  </svg>
                </button>

                {/* Slight Left */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('slight_left')}
                  title="Slight Left"
                  aria-label="Slight left turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ArrowUpLeft className="w-5 h-5" />
                </button>

                {/* Slight Right */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('slight_right')}
                  title="Slight Right"
                  aria-label="Slight right turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ArrowUpRight className="w-5 h-5" />
                </button>

                {/* Smooth Curve Left */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('curve_left')}
                  title="Smooth Curve Left"
                  aria-label="Smooth curve left"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 20C17 12 13 7 5.5 5" />
                    <path d="M9.5 3.2L5 4.8L7 9.1" />
                  </svg>
                </button>

                {/* Smooth Curve Right */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('curve_right')}
                  title="Smooth Curve Right"
                  aria-label="Smooth curve right"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 20C7 12 11 7 18.5 5" />
                    <path d="M14.5 3.2L19 4.8L17 9.1" />
                  </svg>
                </button>

                {/* 90° Left Turn */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('turn_left')}
                  title="Left Turn"
                  aria-label="Left turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <CornerUpLeft className="w-5 h-5" />
                </button>

                {/* 90° Right Turn */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('turn_right')}
                  title="Right Turn"
                  aria-label="Right turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <CornerUpRight className="w-5 h-5" />
                </button>

                {/* Sharp Left */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('sharp_left')}
                  title="Sharp Left"
                  aria-label="Sharp left turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <CornerDownLeft className="w-5 h-5" />
                </button>

                {/* Sharp Right */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('sharp_right')}
                  title="Sharp Right"
                  aria-label="Sharp right turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <CornerDownRight className="w-5 h-5" />
                </button>

                {/* U-Turn */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('u_turn')}
                  title="U-Turn"
                  aria-label="U-turn"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 20V9a5 5 0 0 0-10 0v10" />
                    <path d="M4 15.5L7 19.5L10 15.5" />
                  </svg>
                </button>

                {/* Rotate Angle Left */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('nudge_left')}
                  title="Adjust angle left"
                  aria-label="Adjust angle left"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Rotate Angle Right */}
                <button
                  type="button"
                  onClick={() => onStraightSymbol('nudge_right')}
                  title="Adjust angle right"
                  aria-label="Adjust angle right"
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                {/* 2-Way Junction Icon */}
                <button
                  type="button"
                  onClick={() => openJunctionFor(2)}
                  title="2-Way Junction"
                  aria-label="2-way junction"
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
                    junctionOpen && waysCount === 2
                      ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-500'
                      : 'bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300'
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 21v-8" />
                    <path d="M12 13L5.5 6.5" />
                    <path d="M12 13l6.5-6.5" />
                    <path d="M5.5 10.5V6.5h4" />
                    <path d="M14.5 6.5h4v4" />
                  </svg>
                </button>

                {/* 3-Way Junction Icon */}
                <button
                  type="button"
                  onClick={() => openJunctionFor(3)}
                  title="3-Way Junction"
                  aria-label="3-way junction"
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
                    junctionOpen && waysCount === 3
                      ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-500'
                      : 'bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300'
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 21V4" />
                    <path d="M12 13H4" />
                    <path d="M12 13h8" />
                    <path d="M9.5 6.5L12 4l2.5 2.5" />
                    <path d="M6.5 10.5L4 13l2.5 2.5" />
                    <path d="M17.5 10.5L20 13l-2.5 2.5" />
                  </svg>
                </button>

                {/* 4-Way Crossroad Icon */}
                <button
                  type="button"
                  onClick={() => openJunctionFor(4)}
                  title="4-Way Crossroad"
                  aria-label="4-way junction"
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
                    junctionOpen && waysCount === 4
                      ? 'bg-slate-900 dark:bg-amber-600 text-white border-slate-900 dark:border-amber-500'
                      : 'bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300'
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3v18" />
                    <path d="M3 12h18" />
                    <path d="M9.5 5.5L12 3l2.5 2.5" />
                    <path d="M9.5 18.5L12 21l2.5-2.5" />
                    <path d="M5.5 9.5L3 12l2.5 2.5" />
                    <path d="M18.5 9.5L21 12l-2.5 2.5" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}

        {/* Test Walk Horizontal Bottom Controls */}
        {captureMode === 'simulated_walk' && canUseRoadSteps && (
          <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 px-2.5 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 mr-1">
              Test Steps:
            </span>
            <button
              type="button"
              onClick={() => onSimulateStep(0.00012, 0)}
              className="h-9 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              North
            </button>
            <button
              type="button"
              onClick={() => onSimulateStep(-0.00012, 0)}
              className="h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              South
            </button>
            <button
              type="button"
              onClick={() => onSimulateStep(0, -0.00012)}
              className="h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              West
            </button>
            <button
              type="button"
              onClick={() => onSimulateStep(0, 0.00012)}
              className="h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              East
            </button>
          </div>
        )}

        {/* Bottom House No. & Shop / Dukan Bar */}
        <div className="px-2 sm:px-4 py-2 space-y-1.5">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
            {/* House Number Stepper */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                House
              </span>
              <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => adjustHouseNumber(-1)}
                  aria-label="Decrease house number"
                  className="w-9 sm:w-10 h-10 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={houseInput}
                  onChange={(e) => setHouseInput(e.target.value)}
                  aria-label="House number to tag"
                  className="w-12 sm:w-16 h-10 text-center bg-white dark:bg-slate-900 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 border-x border-slate-200 dark:border-slate-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustHouseNumber(1)}
                  aria-label="Increase house number"
                  className="w-9 sm:w-10 h-10 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Optional Shop / Dukan Name Input */}
            <div className="flex-1 min-w-[140px] flex items-center h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 gap-1.5 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:bg-white dark:focus-within:bg-slate-900">
              <Store className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Shop / Dukan name (optional)..."
                aria-label="Shop or dukan name"
                className="w-full min-w-0 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
              />
              {shopName && (
                <button
                  type="button"
                  onClick={() => setShopName('')}
                  aria-label="Clear shop name"
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Optional Note Toggle */}
            <button
              type="button"
              onClick={() => setShowNoteField((v) => !v)}
              title="Add optional landmark note"
              aria-label="Toggle optional note"
              className={`h-10 px-2.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                showNoteField || houseNote.trim()
                  ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <StickyNote className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Note</span>
            </button>

            {houseInput !== nextSuggestedHouse && (
              <button
                type="button"
                onClick={() => setHouseInput(nextSuggestedHouse)}
                title={`Continue from ${nextSuggestedHouse}`}
                className="px-2.5 h-10 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-mono font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                {nextSuggestedHouse}
              </button>
            )}
          </div>

          {showNoteField && (
            <input
              type="text"
              value={houseNote}
              onChange={(e) => setHouseNote(e.target.value)}
              placeholder="Landmark note (mandir, well, gate)..."
              className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          )}
        </div>
      </div>

      {/* Save Walked Road & Tagged Houses Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleFinishSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Save Walked Road
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                  {formatDistance(liveDistance)} · {totalPoints} pts · {draftHouses.length} houses
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
                placeholder="e.g. Mandir Gali, Ward 4 Road"
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
                Keep Walking
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Save &amp; Auto-Connect
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

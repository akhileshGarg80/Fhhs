import {
  Ban,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Footprints,
  List,
  Map as MapIcon,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import type { VillageRoad } from '../types/map.ts';
import {
  formatDistance,
  getSurfaceLabel,
  type VehicleHierarchySummary,
  type VehicleTourWaypoint,
} from '../utils/geo.ts';

export type VehicleSimSpeed = 0.25 | 0.5 | 1 | 2 | 4;

interface VehiclesWorkspaceProps {
  roads: VillageRoad[];
  waypoints: VehicleTourWaypoint[];
  currentIdx: number;
  isPlaying: boolean;
  simSpeed: VehicleSimSpeed;
  carOn: boolean;
  autoFollow: boolean;
  summary: VehicleHierarchySummary;
  onTogglePlay: () => void;
  onSetCarOn: (on: boolean) => void;
  onSetSimSpeed: (speed: VehicleSimSpeed) => void;
  onToggleAutoFollow: () => void;
  onJumpIndex: (idx: number) => void;
  onJumpToRoad: (roadId: string) => void;
  onPrevRoad: () => void;
  onNextRoad: () => void;
  onStampWholeRoad: (roadId: string, access: 'car' | 'no_car') => void;
  onResetAllMarks: () => void;
  onFitAllRoads: () => void;
  onOpenCleanMap: () => void;
  mapSlot: ReactNode;
}

const SPEED_OPTIONS: { speed: VehicleSimSpeed; label: string }[] = [
  { speed: 0.25, label: '0.25x' },
  { speed: 0.5, label: '0.5x' },
  { speed: 1, label: '1x' },
  { speed: 2, label: '2x' },
  { speed: 4, label: '4x' },
];

function getRoleBadge(role?: VillageRoad['roadRole']): {
  label: string;
  dotClass: string;
  badgeClass: string;
} {
  switch (role) {
    case 'main':
      return {
        label: 'Main Road',
        dotClass: 'bg-blue-700',
        badgeClass:
          'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-800',
      };
    case 'car_street':
      return {
        label: 'Car Road',
        dotClass: 'bg-emerald-600',
        badgeClass:
          'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
      };
    case 'narrow_lane':
      return {
        label: 'No Car',
        dotClass: 'bg-orange-600',
        badgeClass:
          'bg-orange-100 dark:bg-orange-950/70 text-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-800',
      };
    default:
      return {
        label: 'Unmarked',
        dotClass: 'bg-slate-400',
        badgeClass:
          'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      };
  }
}

export default function VehiclesWorkspace({
  roads,
  waypoints,
  currentIdx,
  isPlaying,
  simSpeed,
  carOn,
  autoFollow,
  summary,
  onTogglePlay,
  onSetCarOn,
  onSetSimSpeed,
  onToggleAutoFollow,
  onJumpIndex,
  onJumpToRoad,
  onPrevRoad,
  onNextRoad,
  onStampWholeRoad,
  onResetAllMarks,
  onFitAllRoads,
  onOpenCleanMap,
  mapSlot,
}: VehiclesWorkspaceProps) {
  const [mobileRoadsOpen, setMobileRoadsOpen] = useState(false);

  const safeIdx = waypoints.length > 0 ? Math.min(currentIdx, waypoints.length - 1) : 0;
  const activeWp = waypoints[safeIdx] ?? null;
  const activeRoad = useMemo(
    () => (activeWp ? roads.find((r) => r.id === activeWp.roadId) ?? null : roads[0] ?? null),
    [activeWp, roads]
  );

  const totalTourMeters =
    waypoints.length > 0 ? Math.round(waypoints[waypoints.length - 1].cumulativeMeters) : 0;
  const coveredMeters = activeWp ? Math.round(activeWp.cumulativeMeters) : 0;

  const currentSegmentStatus = useMemo(() => {
    if (!activeRoad || !activeWp) return 'unmarked';
    return activeRoad.segmentAccess?.[activeWp.segIndex] ?? 'unmarked';
  }, [activeRoad, activeWp]);

  const validRoads = useMemo(() => roads.filter((r) => r.points.length >= 2), [roads]);

  const renderRoadsAndHierarchyPanel = () => (
    <div className="flex flex-col h-full">
      {/* Main Road Detection Summary */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/70 dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Village Car Access &amp; Hierarchy
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">
            {summary.surveyedPercent}% checked
          </span>
        </div>

        {/* Auto-detected Main Roads Box */}
        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
            Auto-Detected Main Road
          </div>
          {summary.mainRoadNames.length > 0 ? (
            <div className="mt-1 text-xs font-bold text-blue-950 dark:text-blue-100 leading-snug">
              {summary.mainRoadNames.join(', ')}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-blue-800/80 dark:text-blue-300/80">
              Drive along the village with CAR ON / CAR OFF — connected Car corridors become Main Roads automatically.
            </div>
          )}
        </div>

        {/* 4 Color Totals */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-700 shrink-0" />
              Main
            </span>
            <span className="font-mono font-bold text-blue-800 dark:text-blue-300">
              {formatDistance(summary.mainRoadMeters)}
            </span>
          </div>
          <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
              Car OK
            </span>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
              {formatDistance(summary.carStreetMeters)}
            </span>
          </div>
          <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-600 shrink-0" />
              No Car
            </span>
            <span className="font-mono font-bold text-orange-700 dark:text-orange-300">
              {formatDistance(summary.noCarMeters)}
            </span>
          </div>
          <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
              Left
            </span>
            <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
              {formatDistance(summary.unmarkedMeters)}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Roads List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {validRoads.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
            No saved roads yet. Map your village roads in Add or AutoMapX first.
          </div>
        ) : (
          validRoads.map((road) => {
            const isCurrent = activeRoad?.id === road.id;
            const badge = getRoleBadge(road.roadRole);
            return (
              <button
                key={road.id}
                type="button"
                onClick={() => {
                  onJumpToRoad(road.id);
                  setMobileRoadsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-sky-50 dark:bg-sky-950/50 border-l-4 border-l-sky-600'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${badge.dotClass}`} />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {road.name}
                    </span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-bold shrink-0 ${badge.badgeClass}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="truncate">{getSurfaceLabel(road.surface)}</span>
                  <span className="font-mono tabular-nums">{formatDistance(road.distanceMeters)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[305px] shrink-0 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        {renderRoadsAndHierarchyPanel()}
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Slim Top Context & Map Action Strip */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileRoadsOpen((v) => !v)}
              className="lg:hidden px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <List className="w-3.5 h-3.5" />
              <span>Roads ({validRoads.length})</span>
              {mobileRoadsOpen ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {activeRoad ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {activeRoad.name}
                </span>
                <span
                  className={`hidden sm:inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 ${
                    getRoleBadge(activeRoad.roadRole).badgeClass
                  }`}
                >
                  {getRoleBadge(activeRoad.roadRole).label}
                </span>
                {currentSegmentStatus !== 'unmarked' && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      currentSegmentStatus === 'car'
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200'
                        : 'bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-200'
                    }`}
                  >
                    {currentSegmentStatus === 'car' ? 'Car OK' : 'No Car'}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                No mapped roads
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onFitAllRoads}
              title="Fit all village roads"
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span className="hidden sm:inline">Fit All</span>
            </button>
            <button
              type="button"
              onClick={onOpenCleanMap}
              className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Clean Map</span>
            </button>
          </div>
        </div>

        {/* Mobile Expandable Roads & Summary Drawer */}
        {mobileRoadsOpen && (
          <div className="lg:hidden shrink-0 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-md z-20">
            {renderRoadsAndHierarchyPanel()}
          </div>
        )}

        {/* Interactive Map Area */}
        <div className="flex-1 min-h-0 relative w-full">
          {mapSlot}

          {/* Floating Compact Legend on Map */}
          <div className="hidden sm:flex absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[420] pointer-events-none">
            <div className="px-2.5 py-1 rounded-lg bg-slate-900/85 text-white text-[10px] font-medium shadow flex items-center gap-3 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-full bg-blue-500" />
                Main Road
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-full bg-emerald-500" />
                Car Road
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-full bg-orange-500" />
                No Car
              </span>
              <span className="text-slate-300">Tap any road on map to jump</span>
            </div>
          </div>
        </div>

        {/* Bottom Vehicle Simulator & CAR ON/OFF Cockpit */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-2 z-20 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
          {/* Top Row: Big CAR ON/OFF Switch + Play/Pause + Speed */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Primary CAR ON / CAR OFF Access Switch */}
            <button
              type="button"
              disabled={waypoints.length === 0}
              onClick={() => onSetCarOn(!carOn)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-45 transition-colors ${
                carOn
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 dark:ring-emerald-800'
                  : 'bg-orange-600 hover:bg-orange-700 text-white ring-2 ring-orange-300 dark:ring-orange-800'
              }`}
            >
              {carOn ? (
                <>
                  <Car className="w-4 h-4" />
                  <span>CAR ON · Can Go</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  <span>CAR OFF · No Car</span>
                </>
              )}
            </button>

            {/* Play / Pause & Slow Playback Speed */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={waypoints.length < 2}
                onClick={onTogglePlay}
                className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-45 ${
                  isPlaying
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Drive Village</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                {SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.speed}
                    type="button"
                    onClick={() => onSetSimSpeed(opt.speed)}
                    className={`px-1.5 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer ${
                      simSpeed === opt.speed
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress Scrubber Across All Village Roads */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={validRoads.length <= 1}
              onClick={onPrevRoad}
              title="Previous road"
              aria-label="Previous road"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(0, waypoints.length - 1)}
              value={safeIdx}
              disabled={waypoints.length < 2}
              onChange={(e) => onJumpIndex(Number(e.target.value))}
              aria-label="Village road tour position"
              className="flex-1 h-2 accent-sky-600 cursor-pointer"
            />

            <button
              type="button"
              disabled={validRoads.length <= 1}
              onClick={onNextRoad}
              title="Next road"
              aria-label="Next road"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <span className="text-[11px] font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200 shrink-0">
              {formatDistance(coveredMeters)} / {formatDistance(totalTourMeters)}
            </span>
          </div>

          {/* Quick Road-Level Actions + Auto-Follow + Reset */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeRoad && (
                <>
                  <button
                    type="button"
                    onClick={() => onStampWholeRoad(activeRoad.id, 'car')}
                    className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Car className="w-3 h-3" />
                    <span>Whole Road: Car</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStampWholeRoad(activeRoad.id, 'no_car')}
                    className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/50 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Footprints className="w-3 h-3" />
                    <span>Whole Road: No Car</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={onToggleAutoFollow}
                className={`px-2 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 cursor-pointer ${
                  autoFollow
                    ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                <span>{autoFollow ? 'Follow ON' : 'Follow OFF'}</span>
              </button>

              {summary.surveyedPercent > 0 && (
                <button
                  type="button"
                  onClick={onResetAllMarks}
                  title="Clear all car / no-car marks"
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

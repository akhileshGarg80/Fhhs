import {
  Ban,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  Eraser,
  Footprints,
  Hand,
  List,
  Map as MapIcon,
  Maximize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import type { VehicleSegmentAccess, VillageRoad } from '../types/map.ts';
import {
  formatDistance,
  getSurfaceLabel,
  type VehicleHierarchySummary,
  type VehicleTourWaypoint,
} from '../utils/geo.ts';
import type { VehiclePaintTool } from './VillageMap.tsx';

export type VehicleSimSpeed = 0.25 | 0.5 | 1 | 2 | 4;

interface VehiclesWorkspaceProps {
  roads: VillageRoad[];
  tool: VehiclePaintTool;
  brushAccess: VehicleSegmentAccess;
  brushRadiusMeters: number;
  canUndo: boolean;
  onSetTool: (tool: VehiclePaintTool) => void;
  onSetBrushAccess: (access: VehicleSegmentAccess) => void;
  onSetBrushRadius: (radiusMeters: number) => void;
  onUndo: () => void;
  onMarkRestNoCar: () => void;
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

const BRUSH_RADII = [
  { label: 'Fine 8m', r: 8 },
  { label: 'Med 16m', r: 16 },
  { label: 'Wide 26m', r: 26 },
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
  tool,
  brushAccess,
  brushRadiusMeters,
  canUndo,
  onSetTool,
  onSetBrushAccess,
  onSetBrushRadius,
  onUndo,
  onMarkRestNoCar,
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
  const [simDrawerOpen, setSimDrawerOpen] = useState(false);

  const safeIdx = waypoints.length > 0 ? Math.min(currentIdx, waypoints.length - 1) : 0;
  const activeWp = waypoints[safeIdx] ?? null;
  const activeRoad = useMemo(
    () => (activeWp ? roads.find((r) => r.id === activeWp.roadId) ?? null : roads[0] ?? null),
    [activeWp, roads]
  );

  const totalTourMeters =
    waypoints.length > 0 ? Math.round(waypoints[waypoints.length - 1].cumulativeMeters) : 0;
  const coveredMeters = activeWp ? Math.round(activeWp.cumulativeMeters) : 0;

  const validRoads = useMemo(() => roads.filter((r) => r.points.length >= 2), [roads]);

  const renderRoadsAndHierarchyPanel = () => (
    <div className="flex flex-col h-full">
      {/* Main Road Detection Summary */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/70 dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Car Access &amp; Main Roads
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">
            {summary.surveyedPercent}% marked
          </span>
        </div>

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
              Tap <strong>Pencil</strong> and trace over car-passable roads — connected Car roads auto-detect as Main Road.
            </div>
          )}
        </div>

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
              Unmarked
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
              <div
                key={road.id}
                className={`px-3 py-2 transition-colors ${
                  isCurrent
                    ? 'bg-sky-50 dark:bg-sky-950/50 border-l-4 border-l-sky-600'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToRoad(road.id);
                      setMobileRoadsOpen(false);
                    }}
                    className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${badge.dotClass}`} />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {road.name}
                    </span>
                  </button>
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-bold shrink-0 ${badge.badgeClass}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>
                    {getSurfaceLabel(road.surface)} ·{' '}
                    <span className="font-mono tabular-nums">
                      {formatDistance(road.distanceMeters)}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onStampWholeRoad(road.id, 'car')}
                      className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold cursor-pointer"
                    >
                      Car
                    </button>
                    <button
                      type="button"
                      onClick={() => onStampWholeRoad(road.id, 'no_car')}
                      className="px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 font-bold cursor-pointer"
                    >
                      No Car
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[300px] shrink-0 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        {renderRoadsAndHierarchyPanel()}
      </aside>

      {/* Main Map + Toolbar */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Top Primary Bar: Move Map | Car Pencil | Undo | Fit | Clean Map */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 sm:px-4 py-1.5 space-y-1.5 z-20">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            {/* Move Map & Pencil Tool Switcher */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => onSetTool('pan')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    tool === 'pan'
                      ? 'bg-slate-900 dark:bg-sky-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Move</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSetTool('pencil')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    tool === 'pencil'
                      ? brushAccess === 'car'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : brushAccess === 'no_car'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-slate-700 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-emerald-700'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Pencil</span>
                </button>
              </div>

              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title="Undo last brush stroke"
                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-35 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
            </div>

            {/* Right Actions: Mobile Roads, Auto-Sim toggle, Fit All, Clean Map */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobileRoadsOpen((v) => !v)}
                className="lg:hidden px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1 cursor-pointer"
              >
                <List className="w-3.5 h-3.5" />
                <span>{validRoads.length}</span>
                {mobileRoadsOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSimDrawerOpen((v) => !v)}
                title="Show/Hide Slow Vehicle Tour Simulator"
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                  simDrawerOpen || isPlaying
                    ? 'bg-sky-600 border-sky-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sim</span>
              </button>

              <button
                type="button"
                onClick={onFitAllRoads}
                title="Fit all village roads"
                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onOpenCleanMap}
                className="px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clean Map</span>
              </button>
            </div>
          </div>

          {/* Pencil Sub-Bar: Paint Type (Car OK / No Car / Clear), Brush Size, Rest = No Car */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    onSetBrushAccess('car');
                    onSetTool('pencil');
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    brushAccess === 'car'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Car className="w-3 h-3" />
                  <span>Car Goes</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSetBrushAccess('no_car');
                    onSetTool('pencil');
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    brushAccess === 'no_car'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Ban className="w-3 h-3" />
                  <span>No Car</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSetBrushAccess('unmarked');
                    onSetTool('pencil');
                  }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    brushAccess === 'unmarked'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Eraser className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>

              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {BRUSH_RADII.map((b) => (
                  <button
                    key={b.r}
                    type="button"
                    onClick={() => onSetBrushRadius(b.r)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                      brushRadiusMeters === b.r
                        ? 'bg-slate-900 dark:bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {summary.unmarkedMeters > 0 &&
                summary.mainRoadMeters + summary.carStreetMeters > 0 && (
                  <button
                    type="button"
                    onClick={onMarkRestNoCar}
                    title="Mark all remaining unmarked narrow lanes as No Car"
                    className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Footprints className="w-3 h-3" />
                    <span>Rest = No Car</span>
                  </button>
                )}

              {summary.surveyedPercent > 0 && (
                <button
                  type="button"
                  onClick={onResetAllMarks}
                  title="Reset all marks"
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-700 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Expandable Roads & Summary Drawer */}
        {mobileRoadsOpen && (
          <div className="lg:hidden shrink-0 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-md z-20">
            {renderRoadsAndHierarchyPanel()}
          </div>
        )}

        {/* Roads-Only Map Viewport (No House Numbers!) */}
        <div className="flex-1 min-h-0 relative w-full">
          {mapSlot}

          {/* Helpful floating hint / live Main Road readout */}
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[420] pointer-events-none max-w-[calc(100%-1.5rem)]">
            <div className="px-2.5 py-1 rounded-lg bg-slate-900/85 text-white text-[10px] font-medium shadow flex items-center gap-2.5 whitespace-nowrap overflow-x-auto">
              {tool === 'pencil' ? (
                <span className="font-bold text-emerald-300">
                  Drag finger along roads where car goes
                </span>
              ) : (
                <span className="font-bold text-sky-300">Move map · Switch to Pencil to mark</span>
              )}
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-full bg-blue-500" />
                Main{summary.mainRoadNames.length > 0 ? `: ${summary.mainRoadNames[0]}` : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-full bg-emerald-500" />
                Car
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-full bg-orange-500" />
                No Car
              </span>
            </div>
          </div>
        </div>

        {/* Optional Collapsible Tour Simulator Dock */}
        {(simDrawerOpen || isPlaying) && (
          <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-1.5 z-20 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={waypoints.length === 0}
                onClick={() => onSetCarOn(!carOn)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs cursor-pointer ${
                  carOn
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                {carOn ? <Car className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                <span>{carOn ? 'CAR ON' : 'CAR OFF'}</span>
              </button>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={waypoints.length < 2}
                  onClick={onTogglePlay}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer ${
                    isPlaying
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-slate-900 dark:bg-sky-600 text-white'
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
                      <span>Play Tour</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.speed}
                      type="button"
                      onClick={() => onSetSimSpeed(opt.speed)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                        simSpeed === opt.speed
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onToggleAutoFollow}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    autoFollow
                      ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span>Follow</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={validRoads.length <= 1}
                onClick={onPrevRoad}
                aria-label="Previous road"
                className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
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
                className="flex-1 h-1.5 accent-sky-600 cursor-pointer"
              />
              <button
                type="button"
                disabled={validRoads.length <= 1}
                onClick={onNextRoad}
                aria-label="Next road"
                className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                {formatDistance(coveredMeters)} / {formatDistance(totalTourMeters)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

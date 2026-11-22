import {
  ArrowLeftRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Download,
  Eraser,
  Eye,
  Footprints,
  Gauge,
  GitBranch,
  Hand,
  Link2,
  Magnet,
  Maximize2,
  Minus,
  Navigation,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Route,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LatLngPoint,
  RoadJunction,
  VillageHouse,
  VillageRoad,
  VillageRouteResult,
} from '../types/map.ts';
import { formatDistance, generateGpxExport, getSurfaceLabel } from '../utils/geo.ts';
import type { AutoMapXSymbolAction } from './AutoMapXWorkspace.tsx';
import { TurnIcon } from './NavigationPanel.tsx';
import type { RoadEditorTool } from './VillageMap.tsx';

export interface PreviewRoadEditorAutoMapUi {
  active: boolean;
  isRunning: boolean;
  isPaused: boolean;
  useLiveGps: boolean;
  speedMps: number;
  distanceMeters: number;
  pointsCount: number;
  aheadTarget: {
    roadName: string;
    distMeters: number;
    isEndpoint: boolean;
    turnDeltaDeg: number;
  } | null;
  onPauseResume: () => void;
  onToggleLiveGps: () => void;
  onSetSpeedMps: (mps: number) => void;
  onSymbolAction: (action: AutoMapXSymbolAction) => void;
  onAlignToAheadTarget: () => void;
  onRewindStep: () => void;
  onJoinAndFinish: () => void;
  onCancelAutoMap: () => void;
}

export interface PreviewRoadEditorUi {
  enabled: boolean;
  tool: RoadEditorTool;
  activeRoadId: string | null;
  editAllScope: boolean;
  eraserRadiusMeters: number;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  hasUnsavedChanges: boolean;
  drawingPoints: LatLngPoint[];
  snapRoadName: string | null;
  draftRoads: VillageRoad[];
  autoMap: PreviewRoadEditorAutoMapUi;
  onStartEdit: (roadId?: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onSetTool: (tool: RoadEditorTool) => void;
  onSetActiveRoadId: (roadId: string | null) => void;
  onToggleEditAllScope: () => void;
  onSetEraserRadius: (radiusMeters: number) => void;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFinishDrawTapChain: () => void;
  onDiscardDrawTapChain: () => void;
}

interface SavedDataViewProps {
  roads: VillageRoad[];
  houses: VillageHouse[];
  mapSlot: ReactNode;
  fromHouseId: string | null;
  toHouseId: string | null;
  onSelectFromHouse: (houseId: string | null) => void;
  onSelectToHouse: (houseId: string | null) => void;
  routeOptions: VillageRouteResult[];
  selectedRouteIndex: number;
  onSelectRouteIndex: (index: number) => void;
  onStartRouteNavigation?: (
    fromHouse: VillageHouse,
    toHouse: VillageHouse,
    routeIndex: number
  ) => void;
  onNavigateHouse: (house: VillageHouse) => void;
  onFocusRoad: (road: VillageRoad) => void;
  onFocusHouse: (house: VillageHouse) => void;
  onMapPendingBranch?: (junction: RoadJunction, branchId: string) => void;
  onFitAll: () => void;
  onDeleteHouse: (houseId: string) => void;
  onDeleteRoad: (roadId: string) => void;
  onImportBackup: (data: { roads: VillageRoad[]; houses: VillageHouse[] }) => void;
  onClearAll: () => void;
  roadEditor?: PreviewRoadEditorUi;
}

function formatHouseLabel(h: VillageHouse): string {
  return `House ${h.houseNumber}${h.shopName ? ` · ${h.shopName}` : ''} (${h.roadName})`;
}

interface HousePointInputProps {
  badge: 'A' | 'B';
  placeholder: string;
  houses: VillageHouse[];
  selectedHouseId: string | null;
  otherHouseId: string | null;
  onSelect: (houseId: string | null) => void;
}

function HousePointInput({
  badge,
  placeholder,
  houses,
  selectedHouseId,
  otherHouseId,
  onSelect,
}: HousePointInputProps) {
  const selectedHouse = useMemo(
    () => (selectedHouseId ? houses.find((h) => h.id === selectedHouseId) ?? null : null),
    [houses, selectedHouseId]
  );
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (selectedHouse ? formatHouseLabel(selectedHouse) : ''));

  useEffect(() => {
    if (!focused) {
      setText(selectedHouse ? formatHouseLabel(selectedHouse) : '');
    }
  }, [selectedHouse, focused]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = !q
      ? houses
      : houses.filter((h) => {
          const num = h.houseNumber.toLowerCase();
          const shop = (h.shopName ?? '').toLowerCase();
          const road = h.roadName.toLowerCase();
          return num.includes(q) || shop.includes(q) || road.includes(q) || `house ${num}`.includes(q);
        });
    return [...list].sort((a, b) => {
      const aq = q.replace(/^house\s+/i, '');
      const aNum = a.houseNumber.toLowerCase();
      const bNum = b.houseNumber.toLowerCase();
      const aScore = aNum === aq ? 0 : aNum.startsWith(aq) ? 1 : (a.shopName ?? '').toLowerCase().startsWith(aq) ? 2 : 3;
      const bScore = bNum === aq ? 0 : bNum.startsWith(aq) ? 1 : (b.shopName ?? '').toLowerCase().startsWith(aq) ? 2 : 3;
      return aScore - bScore;
    });
  }, [houses, text]);

  const badgeBg = badge === 'A' ? 'bg-sky-600' : 'bg-red-600';
  const focusRing = badge === 'A' ? 'focus-within:ring-sky-500' : 'focus-within:ring-red-500';

  const commitTopMatch = () => {
    const q = text.trim().toLowerCase().replace(/^house\s+/i, '');
    if (!q) {
      onSelect(null);
      return;
    }
    const exact = matches.find((h) => h.houseNumber.toLowerCase() === q);
    const chosen = exact ?? matches[0] ?? null;
    if (chosen) {
      onSelect(chosen.id);
      setText(formatHouseLabel(chosen));
      setFocused(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2 min-w-0">
      <span
        className={`w-6 h-6 rounded-md ${badgeBg} text-white text-xs font-bold flex items-center justify-center shrink-0`}
      >
        {badge}
      </span>
      <div
        className={`flex-1 min-w-0 flex items-center h-9 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden focus-within:ring-2 ${focusRing}`}
      >
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onFocus={() => {
            setFocused(true);
            if (selectedHouse) {
              setText(selectedHouse.houseNumber);
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              const q = text.trim().toLowerCase().replace(/^house\s+/i, '');
              if (q) {
                const exact = houses.find((h) => h.houseNumber.toLowerCase() === q);
                if (exact && exact.id !== selectedHouseId) {
                  onSelect(exact.id);
                }
              }
              setFocused(false);
            }, 160);
          }}
          onChange={(e) => {
            const val = e.target.value;
            setText(val);
            setFocused(true);
            const q = val.trim().toLowerCase().replace(/^house\s+/i, '');
            if (!q) {
              onSelect(null);
              return;
            }
            const exactMatches = houses.filter((h) => h.houseNumber.toLowerCase() === q);
            const prefixMatches = houses.filter(
              (h) => h.houseNumber.toLowerCase().startsWith(q) && h.houseNumber.toLowerCase() !== q
            );
            if (exactMatches.length === 1 && prefixMatches.length === 0) {
              onSelect(exactMatches[0].id);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTopMatch();
            } else if (e.key === 'Escape') {
              setFocused(false);
            }
          }}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
        />
        {(text || selectedHouseId) && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setText('');
              onSelect(null);
              setFocused(true);
            }}
            aria-label={`Clear point ${badge}`}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setFocused((v) => !v);
          }}
          aria-label={`Browse houses for point ${badge}`}
          className="px-2 h-full border-l border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {focused && (
        <div className="absolute left-8 right-0 top-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto z-50">
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              No house or shop matches &ldquo;{text}&rdquo;.
            </div>
          ) : (
            matches.slice(0, 30).map((h) => {
              const isSelected = h.id === selectedHouseId;
              const isOther = h.id === otherHouseId;
              return (
                <button
                  key={h.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(h.id);
                    setText(formatHouseLabel(h));
                    setFocused(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-950/60 font-semibold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="min-w-0 truncate">
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                      #{h.houseNumber}
                    </span>
                    {h.shopName && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {' '}
                        · {h.shopName}
                      </span>
                    )}
                    <span className="text-slate-500 dark:text-slate-400"> · {h.roadName}</span>
                  </div>
                  {isOther && (
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                      Other pt
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SavedDataView({
  roads,
  houses,
  mapSlot,
  fromHouseId,
  toHouseId,
  onSelectFromHouse,
  onSelectToHouse,
  routeOptions,
  selectedRouteIndex,
  onSelectRouteIndex,
  onStartRouteNavigation,
  onNavigateHouse,
  onFocusRoad,
  onFocusHouse,
  onMapPendingBranch,
  onFitAll,
  onDeleteHouse,
  onDeleteRoad,
  onImportBackup,
  onClearAll,
  roadEditor,
}: SavedDataViewProps) {
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollToMap = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredHouses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return houses;
    return houses.filter(
      (h) =>
        h.houseNumber.toLowerCase().includes(q) ||
        (h.shopName ?? '').toLowerCase().includes(q) ||
        h.roadName.toLowerCase().includes(q) ||
        (h.note ?? '').toLowerCase().includes(q)
    );
  }, [houses, query]);

  const activeRoute = routeOptions[selectedRouteIndex] ?? routeOptions[0] ?? null;
  const bothSelected = Boolean(fromHouseId && toHouseId);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        roads?: VillageRoad[];
        houses?: VillageHouse[];
      };
      if (Array.isArray(parsed.roads) || Array.isArray(parsed.houses)) {
        onImportBackup({
          roads: Array.isArray(parsed.roads) ? parsed.roads : [],
          houses: Array.isArray(parsed.houses) ? parsed.houses : [],
        });
      }
    } catch {
      // ignore invalid file
    } finally {
      e.target.value = '';
    }
  };

  const handleSwap = () => {
    const prevA = fromHouseId;
    const prevB = toHouseId;
    onSelectFromHouse(prevB);
    onSelectToHouse(prevA);
  };

  if (roadEditor?.enabled) {
    const amx = roadEditor.autoMap;
    const ahead = amx.aheadTarget;
    const canJoinNow = amx.pointsCount >= 2;
    const isCloseTarget = Boolean(ahead && ahead.distMeters <= 12);

    return (
      <div className="h-full w-full flex flex-col overflow-hidden bg-white dark:bg-slate-950">
        {/* Compact Top Toolbar for Big Full-Screen Edit Studio */}
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 px-2.5 sm:px-4 py-2 space-y-1.5 z-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Primary Hand / Navigation / AutoMap Tools */}
            <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                disabled={amx.active}
                onClick={() => roadEditor.onSetTool('pan')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors ${
                  roadEditor.tool === 'pan' && !amx.active
                    ? 'bg-slate-900 dark:bg-sky-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Move Map</span>
              </button>

              <button
                type="button"
                disabled={amx.active}
                onClick={() => roadEditor.onSetTool('erase')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors ${
                  roadEditor.tool === 'erase' && !amx.active
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/50'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>

              <button
                type="button"
                onClick={() => roadEditor.onSetTool('automap')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  roadEditor.tool === 'automap' || amx.active
                    ? 'bg-violet-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-950/50'
                }`}
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>AutoMap</span>
              </button>

              <button
                type="button"
                disabled={amx.active}
                onClick={() => roadEditor.onSetTool('draw')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors ${
                  roadEditor.tool === 'draw' && !amx.active
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Draw</span>
              </button>
            </div>

            {/* Undo / Redo + Cancel / Save Fix */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                disabled={!roadEditor.canUndo || amx.active}
                onClick={roadEditor.onUndo}
                title="Undo last erase or join (restores deleted parts)"
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo{roadEditor.undoCount > 0 ? ` (${roadEditor.undoCount})` : ''}</span>
              </button>

              <button
                type="button"
                disabled={!roadEditor.canRedo || amx.active}
                onClick={roadEditor.onRedo}
                title="Redo"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={roadEditor.onCancelEdit}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={amx.active}
                onClick={roadEditor.onSaveEdit}
                className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Fix</span>
              </button>
            </div>
          </div>

          {/* Contextual Sub-Bar (Hidden when AutoMap steering dock is open to maximize map size) */}
          {!amx.active && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={roadEditor.activeRoadId ?? ''}
                  onChange={(e) => roadEditor.onSetActiveRoadId(e.target.value || null)}
                  aria-label="Active road to edit"
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[175px]"
                >
                  {roadEditor.draftRoads.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.points.length} pts)
                    </option>
                  ))}
                </select>

                {roadEditor.tool === 'pan' && (
                  <span className="px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-300 font-semibold">
                    Move map freely · Tap any glowing point dot (Bindu) to start AutoMap
                  </span>
                )}

                {roadEditor.tool === 'automap' && (
                  <span className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/70 border border-violet-300 dark:border-violet-700 text-violet-900 dark:text-violet-200 font-bold">
                    Tap any green/purple endpoint dot on the map to launch AutoMap from there
                  </span>
                )}

                {roadEditor.tool === 'erase' && (
                  <>
                    <button
                      type="button"
                      onClick={roadEditor.onToggleEditAllScope}
                      className={`px-2 py-1 rounded-lg border font-semibold cursor-pointer ${
                        roadEditor.editAllScope
                          ? 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {roadEditor.editAllScope ? 'Scope: All Roads' : 'Scope: Selected Only'}
                    </button>

                    <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() =>
                          roadEditor.onSetEraserRadius(
                            Math.max(1, roadEditor.eraserRadiusMeters - 1)
                          )
                        }
                        title="Smaller eraser (-1m)"
                        aria-label="Smaller eraser"
                        className="w-6 h-6 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      {[
                        { label: 'Pin 2m', r: 2 },
                        { label: 'Mini 4m', r: 4 },
                        { label: 'Small 8m', r: 8 },
                        { label: 'Med 16m', r: 16 },
                        { label: 'Wide 28m', r: 28 },
                      ].map((b) => (
                        <button
                          key={b.r}
                          type="button"
                          onClick={() => roadEditor.onSetEraserRadius(b.r)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                            roadEditor.eraserRadiusMeters === b.r
                              ? 'bg-red-600 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          roadEditor.onSetEraserRadius(
                            Math.min(40, roadEditor.eraserRadiusMeters + 1)
                          )
                        }
                        title="Larger eraser (+1m)"
                        aria-label="Larger eraser"
                        className="w-6 h-6 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => roadEditor.onSetTool('automap')}
                      className="px-2 py-1 rounded-lg bg-violet-700 hover:bg-violet-800 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Gauge className="w-3 h-3" />
                      <span>Tap Point → AutoMap</span>
                    </button>
                  </>
                )}

                {roadEditor.tool === 'draw' && (
                  <button
                    type="button"
                    onClick={roadEditor.onToggleSnap}
                    className={`px-2 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      roadEditor.snapEnabled
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Magnet className="w-3 h-3" />
                    <span>{roadEditor.snapEnabled ? 'Touch Snap ON' : 'Snap OFF'}</span>
                  </button>
                )}
              </div>

              {roadEditor.tool === 'draw' && roadEditor.drawingPoints.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                    {roadEditor.drawingPoints.length} pt
                    {roadEditor.snapRoadName ? ` · Touch: ${roadEditor.snapRoadName}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={roadEditor.onDiscardDrawTapChain}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Clear
                  </button>
                  {roadEditor.drawingPoints.length >= 2 && (
                    <button
                      type="button"
                      onClick={roadEditor.onFinishDrawTapChain}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Join Line</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Big Expanded Map Area */}
        <div className="flex-1 min-h-0 relative w-full">{mapSlot}</div>

        {/* Bottom AutoMap Steering + Ahead-Target Reconnection Dock */}
        {amx.active && (
          <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-1.5 z-20 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
            {/* Ahead Target Guidance Bar */}
            {ahead && (
              <div
                className={`px-2.5 py-1.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
                  isCloseTarget
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                    : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 font-semibold">
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {isCloseTarget ? 'Target Reached' : 'Ahead'}:{' '}
                    <span className="font-mono font-bold">{Math.round(ahead.distMeters)}m</span> ·{' '}
                    {ahead.isEndpoint ? `End of ${ahead.roadName}` : ahead.roadName} ·{' '}
                    {Math.abs(ahead.turnDeltaDeg) <= 10
                      ? 'Straight'
                      : ahead.turnDeltaDeg > 0
                      ? `Steer +${Math.round(ahead.turnDeltaDeg)}° R`
                      : `Steer ${Math.round(ahead.turnDeltaDeg)}° L`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={amx.onAlignToAheadTarget}
                    className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-current/25 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Aim Target</span>
                  </button>
                  {ahead.distMeters <= 24 && canJoinNow && (
                    <button
                      type="button"
                      onClick={amx.onJoinAndFinish}
                      className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Join Here</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Top Controls Row: Pause/Resume, Speed, Live GPS Toggle, Distance, Cancel & Join */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {!amx.useLiveGps && (
                  <button
                    type="button"
                    onClick={amx.onPauseResume}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                      amx.isPaused || !amx.isRunning
                        ? 'bg-violet-700 hover:bg-violet-800 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {amx.isPaused || !amx.isRunning ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={amx.onToggleLiveGps}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    amx.useLiveGps
                      ? 'bg-sky-600 border-sky-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Navigation className="w-3 h-3" />
                  <span>{amx.useLiveGps ? 'Live GPS ON' : 'Live GPS'}</span>
                </button>

                {!amx.useLiveGps && (
                  <div className="flex flex-wrap items-center gap-1">
                    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      {[
                        { label: 'Crawl', mps: 0.35 },
                        { label: 'Slow', mps: 0.8 },
                        { label: 'Walk', mps: 1.5 },
                        { label: 'Jog', mps: 3.0 },
                        { label: 'Fast', mps: 5.5 },
                      ].map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => amx.onSetSpeedMps(s.mps)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                            Math.abs(amx.speedMps - s.mps) < 0.15
                              ? 'bg-violet-700 text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          const step = amx.speedMps <= 1.0 ? 0.1 : 0.4;
                          amx.onSetSpeedMps(
                            Math.max(0.15, Number((amx.speedMps - step).toFixed(2)))
                          );
                        }}
                        title="Decrease speed"
                        aria-label="Decrease speed"
                        className="w-6 h-6 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-1.5 text-[10px] font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {amx.speedMps.toFixed(2).replace(/\.00$/, '')}m/s
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const step = amx.speedMps < 1.0 ? 0.1 : 0.4;
                          amx.onSetSpeedMps(
                            Math.min(8.0, Number((amx.speedMps + step).toFixed(2)))
                          );
                        }}
                        title="Increase speed"
                        aria-label="Increase speed"
                        className="w-6 h-6 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                  {formatDistance(amx.distanceMeters)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={amx.onCancelAutoMap}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/60 text-slate-700 dark:text-slate-200 hover:text-red-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>

                <button
                  type="button"
                  disabled={!canJoinNow}
                  onClick={amx.onJoinAndFinish}
                  className={`px-3 py-1 rounded-lg text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-45 ${
                    isCloseTarget
                      ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Join &amp; Connect</span>
                </button>
              </div>
            </div>

            {/* Steering Buttons Row */}
            {!amx.useLiveGps && (
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('turn_left')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  <CornerUpLeft className="w-3.5 h-3.5" />
                  <span>90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('nudge_left_15')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-mono font-bold shrink-0 cursor-pointer"
                >
                  -15°
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('nudge_left_5')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-mono font-bold shrink-0 cursor-pointer"
                >
                  -5°
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('curve_left')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Curve L</span>
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('straight_step')}
                  className="px-2.5 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/70 border border-violet-200 dark:border-violet-800 text-violet-900 dark:text-violet-200 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>+Step</span>
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('curve_right')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  <span>Curve R</span>
                  <RotateCw className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('nudge_right_5')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-mono font-bold shrink-0 cursor-pointer"
                >
                  +5°
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('nudge_right_15')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-mono font-bold shrink-0 cursor-pointer"
                >
                  +15°
                </button>
                <button
                  type="button"
                  onClick={() => amx.onSymbolAction('turn_right')}
                  className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  <span>90°</span>
                  <CornerUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={amx.onRewindStep}
                  className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer ml-auto"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Back -10m</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-5 pb-8 space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Preview Saved Roads &amp; House Numbers
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Saved locally in browser ·{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {roads.length} roads · {houses.length} houses
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onFitAll}
              className="px-3 py-1.5 bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 dark:hover:bg-emerald-600 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Fit All on Map
            </button>

            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `grampath-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  JSON.stringify({ roads, houses }, null, 2),
                  'application/json'
                )
              }
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Backup JSON
            </button>

            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `grampath-osm-tracks.gpx`,
                  generateGpxExport(roads, houses),
                  'application/gpx+xml'
                )
              }
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export .GPX
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Restore
            </button>

            {confirmClear ? (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-red-800 dark:text-red-300 font-medium">Delete all?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                  }}
                  className="font-bold text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* 2-Point House-to-House Route Checker */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              <Route className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>Compare Any 2 Points (House A → House B)</span>
            </div>
            {(fromHouseId || toHouseId) && (
              <button
                type="button"
                onClick={() => {
                  onSelectFromHouse(null);
                  onSelectToHouse(null);
                  setShowSteps(false);
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
            <HousePointInput
              badge="A"
              placeholder="Type House # or Shop (Start A)..."
              houses={houses}
              selectedHouseId={fromHouseId}
              otherHouseId={toHouseId}
              onSelect={onSelectFromHouse}
            />

            <button
              type="button"
              onClick={handleSwap}
              disabled={!fromHouseId && !toHouseId}
              title="Swap A and B"
              aria-label="Swap start and destination"
              className="self-center justify-self-center p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>

            <HousePointInput
              badge="B"
              placeholder="Type House # or Shop (Dest B)..."
              houses={houses}
              selectedHouseId={toHouseId}
              otherHouseId={fromHouseId}
              onSelect={onSelectToHouse}
            />
          </div>

          {bothSelected && fromHouseId === toHouseId && (
            <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Point A and Point B are the same house. Pick two different points to compare the route.
            </div>
          )}

          {bothSelected && fromHouseId !== toHouseId && activeRoute && (
            <div className="space-y-2.5 pt-1">
              {!activeRoute.reachable ? (
                <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  {activeRoute.reason ?? 'No connected road path found between these 2 points yet.'}
                </div>
              ) : (
                <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-bold">
                        {routeOptions.length} {routeOptions.length === 1 ? 'Route' : 'Routes'} Found
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-sm">
                        {formatDistance(activeRoute.totalDistanceMeters)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                        <Footprints className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        {activeRoute.walkMinutes}m walk
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                        {activeRoute.bikeMinutes}m bike
                      </span>
                      {activeRoute.viaSummary && (
                        <span className="text-slate-600 dark:text-slate-300 truncate max-w-xs sm:max-w-md">
                          Via: {activeRoute.viaSummary}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowSteps((v) => !v)}
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>{activeRoute.instructions.length} Steps</span>
                        {showSteps ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {onStartRouteNavigation && (
                        <button
                          type="button"
                          onClick={() => {
                            const fromH = houses.find((h) => h.id === fromHouseId);
                            const toH = houses.find((h) => h.id === toHouseId);
                            if (fromH && toH) {
                              onStartRouteNavigation(fromH, toH, selectedRouteIndex);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Go This Route</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* All Available Routes (Shortest highlighted first, plus every alternative clearly selectable) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {routeOptions.map((opt, idx) => {
                      const isSelected = idx === selectedRouteIndex;
                      const shortestDist = routeOptions[0]?.totalDistanceMeters ?? opt.totalDistanceMeters;
                      const extraM = Math.max(0, opt.totalDistanceMeters - shortestDist);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onSelectRouteIndex(idx)}
                          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-sky-700 text-white border-sky-700 shadow-sm'
                              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold inline-flex items-center gap-1.5">
                              <span>{idx === 0 ? 'Shortest (Closest)' : opt.routeLabel ?? `Route ${idx + 1}`}</span>
                              {idx === 0 && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isSelected
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                                  }`}
                                >
                                  Nearest
                                </span>
                              )}
                            </span>
                            <span className="font-mono tabular-nums text-xs font-bold">
                              {formatDistance(opt.totalDistanceMeters)}
                            </span>
                          </div>
                          <div
                            className={`text-[11px] mt-1 flex items-center justify-between gap-2 ${
                              isSelected ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <span className="truncate">{opt.viaSummary ?? 'Saved road'}</span>
                            <span className="font-mono tabular-nums shrink-0">
                              {extraM > 0 ? `+${formatDistance(extraM)}` : `${opt.walkMinutes}m walk`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {showSteps && activeRoute.instructions.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 max-h-48 overflow-y-auto">
                      {activeRoute.instructions.map((inst) => (
                        <div
                          key={inst.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <TurnIcon
                              turn={inst.turnType}
                              className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0"
                            />
                            <span className="text-slate-800 dark:text-slate-200 truncate">
                              {inst.instruction}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                            {inst.distanceMeters > 0 ? formatDistance(inst.distanceMeters) : 'End'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Interactive Saved Map Preview + Hand Road Editor (Erase / Draw / Undo / Save) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/90">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {roadEditor?.enabled
                ? roadEditor.tool === 'erase'
                  ? 'Road Fix: Drag or tap on road to erase bad points'
                  : roadEditor.tool === 'draw'
                  ? 'Road Fix: Drag or tap points to draw & touch any road'
                  : 'Road Fix: Pan map or tap any road line to select it'
                : bothSelected && fromHouseId !== toHouseId && activeRoute?.reachable
                ? `Showing ${routeOptions.length} ${
                    routeOptions.length === 1 ? 'Route' : 'Routes'
                  } Between Point A & Point B`
                : 'Saved Map Preview (All Roads, Turns, Junctions & Houses)'}
            </span>

            <div className="flex items-center gap-2 ml-auto">
              {roadEditor && !roadEditor.enabled && roads.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    roadEditor.onStartEdit(roads[0]?.id);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit / Fix Roads</span>
                </button>
              )}
              {roadEditor?.enabled && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={roadEditor.onCancelEdit}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={roadEditor.onSaveEdit}
                    className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Fix</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {roadEditor?.enabled && (
            <div className="px-2.5 sm:px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-amber-50/60 dark:bg-slate-900 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Hand Tools */}
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => roadEditor.onSetTool('pan')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                      roadEditor.tool === 'pan'
                        ? 'bg-slate-900 dark:bg-sky-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    <span>Move Map</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => roadEditor.onSetTool('erase')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                      roadEditor.tool === 'erase'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/50'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Erase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => roadEditor.onSetTool('draw')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                      roadEditor.tool === 'draw'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Draw Line</span>
                  </button>
                </div>

                {/* Undo / Redo (instant recovery if erased by mistake!) */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!roadEditor.canUndo}
                    onClick={roadEditor.onUndo}
                    title="Undo last erase or draw (bring back deleted road parts)"
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-100 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo{roadEditor.undoCount > 0 ? ` (${roadEditor.undoCount})` : ''}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!roadEditor.canRedo}
                    onClick={roadEditor.onRedo}
                    title="Redo"
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Contextual Tool Options: Road Selector + Brush Size OR Draw Snap & Finish */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={roadEditor.activeRoadId ?? ''}
                    onChange={(e) => roadEditor.onSetActiveRoadId(e.target.value || null)}
                    aria-label="Active road to edit"
                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[180px]"
                  >
                    {roadEditor.draftRoads.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.points.length} pts)
                      </option>
                    ))}
                  </select>

                  {roadEditor.tool === 'erase' && (
                    <>
                      <button
                        type="button"
                        onClick={roadEditor.onToggleEditAllScope}
                        className={`px-2 py-1 rounded-lg border font-semibold cursor-pointer ${
                          roadEditor.editAllScope
                            ? 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {roadEditor.editAllScope ? 'Scope: All Roads' : 'Scope: Selected Only'}
                      </button>

                      <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        {[
                          { label: 'Fine 8m', r: 8 },
                          { label: 'Med 16m', r: 16 },
                          { label: 'Wide 28m', r: 28 },
                        ].map((b) => (
                          <button
                            key={b.r}
                            type="button"
                            onClick={() => roadEditor.onSetEraserRadius(b.r)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                              roadEditor.eraserRadiusMeters === b.r
                                ? 'bg-red-600 text-white'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {roadEditor.tool === 'draw' && (
                    <button
                      type="button"
                      onClick={roadEditor.onToggleSnap}
                      className={`px-2 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        roadEditor.snapEnabled
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Magnet className="w-3 h-3" />
                      <span>{roadEditor.snapEnabled ? 'Touch Snap ON' : 'Snap OFF'}</span>
                    </button>
                  )}
                </div>

                {roadEditor.tool === 'draw' && roadEditor.drawingPoints.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                      {roadEditor.drawingPoints.length} pt
                      {roadEditor.snapRoadName ? ` · Touch: ${roadEditor.snapRoadName}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={roadEditor.onDiscardDrawTapChain}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Clear
                    </button>
                    {roadEditor.drawingPoints.length >= 2 && (
                      <button
                        type="button"
                        onClick={roadEditor.onFinishDrawTapChain}
                        className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Join Line</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="h-[320px] sm:h-[420px] lg:h-[500px] w-full relative">{mapSlot}</div>
        </div>

        {/* Houses & Roads Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Houses Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                House Numbers ({filteredHouses.length})
              </h2>
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter house no., shop or road..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {filteredHouses.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No saved houses or shops match your filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
                {filteredHouses.map((h) => {
                  const isA = fromHouseId === h.id;
                  const isB = toHouseId === h.id;
                  return (
                    <div key={h.id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          House {h.houseNumber}{' '}
                          <span
                            className={`text-xs font-medium ${
                              h.side === 'left'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            · {h.side === 'left' ? 'Left' : 'Right'}
                          </span>
                          {h.shopName && (
                            <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                              {' '}
                              · {h.shopName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                          {h.roadName}
                          {h.note ? ` · ${h.note}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectFromHouse(isA ? null : h.id);
                            scrollToMap();
                          }}
                          title="Set as Point A (Start)"
                          className={`w-7 h-7 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            isA
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-sky-900/50'
                          }`}
                        >
                          A
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectToHouse(isB ? null : h.id);
                            scrollToMap();
                          }}
                          title="Set as Point B (Destination)"
                          className={`w-7 h-7 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            isB
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50'
                          }`}
                        >
                          B
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onFocusHouse(h);
                            scrollToMap();
                          }}
                          title="Show on Preview Map"
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigateHouse(h)}
                          className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Track</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteHouse(h.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg cursor-pointer"
                          aria-label={`Delete house ${h.houseNumber}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Roads Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Walked Village Roads ({roads.length})
              </h2>
            </div>

            {roads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No roads saved yet. Start walking in Add mode to record a road.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
                {roads.map((r) => {
                  const firstPending = r.junctions
                    ?.flatMap((j) =>
                      (j.branches ?? [])
                        .filter((b) => b.status === 'pending')
                        .map((b) => ({ junction: j, branch: b }))
                    )[0];
                  const pendingCount =
                    r.junctions?.reduce(
                      (sum, j) =>
                        sum + (j.branches?.filter((b) => b.status === 'pending').length ?? 0),
                      0
                    ) ?? 0;

                  return (
                    <div key={r.id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {r.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {r.villageName} · {getSurfaceLabel(r.surface)} ·{' '}
                          <span className="font-mono tabular-nums">
                            {formatDistance(r.distanceMeters)} · {r.points.length} pts
                            {r.junctions && r.junctions.length > 0
                              ? ` · ${r.junctions.length} jnc`
                              : ''}
                            {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {firstPending && onMapPendingBranch && (
                          <button
                            type="button"
                            onClick={() =>
                              onMapPendingBranch(firstPending.junction, firstPending.branch.id)
                            }
                            className="px-2.5 py-1.5 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-200 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                            Map {firstPending.branch.label}
                          </button>
                        )}
                        {roadEditor && (
                          <button
                            type="button"
                            onClick={() => {
                              roadEditor.onStartEdit(r.id);
                              onFocusRoad(r);
                              scrollToMap();
                            }}
                            title="Erase points or draw connecting line on this road"
                            className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onFocusRoad(r);
                            scrollToMap();
                          }}
                          title="Show Road on Preview Map"
                          className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRoad(r.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg cursor-pointer"
                          aria-label={`Delete road ${r.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

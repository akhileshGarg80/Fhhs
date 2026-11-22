import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  Footprints,
  GitBranch,
  Maximize2,
  Navigation,
  Route,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { RoadJunction, VillageHouse, VillageRoad, VillageRouteResult } from '../types/map.ts';
import { formatDistance, generateGpxExport, getSurfaceLabel } from '../utils/geo.ts';
import { TurnIcon } from './NavigationPanel.tsx';

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

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
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

        {/* Interactive Saved Map Preview */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/90">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {bothSelected && fromHouseId !== toHouseId && activeRoute?.reachable
                ? `Showing ${routeOptions.length} ${
                    routeOptions.length === 1 ? 'Route' : 'Routes'
                  } Between Point A & Point B`
                : 'Saved Map Preview (All Roads, Turns, Junctions & Houses)'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              {bothSelected && fromHouseId !== toHouseId && activeRoute?.reachable
                ? 'Tap any route line on the map or a card above to pick your path'
                : 'Type numbers above or tap A / B below to compare routes'}
            </span>
          </div>
          <div className="h-[340px] sm:h-[420px] lg:h-[500px] w-full relative">{mapSlot}</div>
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

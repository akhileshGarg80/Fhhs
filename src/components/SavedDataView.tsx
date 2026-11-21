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
import { type ReactNode, useMemo, useRef, useState } from 'react';
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
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-md bg-sky-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                A
              </span>
              <select
                value={fromHouseId ?? ''}
                onChange={(e) => onSelectFromHouse(e.target.value || null)}
                aria-label="Select start point A"
                className="flex-1 min-w-0 h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select Start Point (A)...</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    House {h.houseNumber}
                    {h.shopName ? ` · ${h.shopName}` : ''} ({h.roadName})
                  </option>
                ))}
              </select>
            </div>

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

            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-md bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                B
              </span>
              <select
                value={toHouseId ?? ''}
                onChange={(e) => onSelectToHouse(e.target.value || null)}
                aria-label="Select destination point B"
                className="flex-1 min-w-0 h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Select Destination Point (B)...</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    House {h.houseNumber}
                    {h.shopName ? ` · ${h.shopName}` : ''} ({h.roadName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {bothSelected && fromHouseId === toHouseId && (
            <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Point A and Point B are the same house. Pick two different points to compare the route.
            </div>
          )}

          {bothSelected && fromHouseId !== toHouseId && activeRoute && (
            <div className="space-y-2 pt-1">
              {!activeRoute.reachable ? (
                <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  {activeRoute.reason ?? 'No connected road path found between these 2 points yet.'}
                </div>
              ) : (
                <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
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

                    <button
                      type="button"
                      onClick={() => setShowSteps((v) => !v)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>{activeRoute.instructions.length} Steps</span>
                      {showSteps ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {routeOptions.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {routeOptions.map((opt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onSelectRouteIndex(idx)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                            idx === selectedRouteIndex
                              ? 'bg-sky-700 text-white border-sky-700'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {opt.routeLabel ?? `Route ${idx + 1}`} ·{' '}
                          <span className="font-mono tabular-nums">
                            {formatDistance(opt.totalDistanceMeters)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

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
                ? 'Showing Route Between Point A & Point B'
                : 'Saved Map Preview (All Roads, Turns, Junctions & Houses)'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              Tap A / B below to test routes between any 2 houses
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

import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Flag,
  LocateFixed,
  Navigation,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useMemo } from 'react';
import type {
  NavigationInstruction,
  TurnDirection,
  VillageHouse,
  VillageRouteResult,
} from '../types/map.ts';
import { type LiveRouteProgress, formatDistance, haversineMeters } from '../utils/geo.ts';

export function TurnIcon({
  turn,
  className = 'w-5 h-5',
}: {
  turn: TurnDirection;
  className?: string;
}) {
  switch (turn) {
    case 'left':
    case 'slight_left':
    case 'sharp_left':
      return <CornerUpLeft className={className} />;
    case 'right':
    case 'slight_right':
    case 'sharp_right':
      return <CornerUpRight className={className} />;
    case 'arrive':
      return <Flag className={className} />;
    case 'depart':
    case 'straight':
    default:
      return <ArrowUp className={className} />;
  }
}

interface NavigationPanelProps {
  houses: VillageHouse[];
  userLocation: { lat: number; lng: number; accuracy?: number };
  isLiveGps: boolean;
  isPickingSpot: boolean;
  onToggleLiveGps: () => void;
  onTogglePickSpot: () => void;
  targetHouse: VillageHouse | null;
  routeResult: VillageRouteResult | null;
  routeOptions: VillageRouteResult[];
  selectedRouteIndex: number;
  onSelectRouteIndex: (idx: number) => void;
  liveProgress?: LiveRouteProgress | null;
  currentStepIndex: number;
  distanceToNextTurnMeters: number | null;
  voiceEnabled: boolean;
  isSimulatingNav: boolean;
  onToggleVoice: () => void;
  onSelectHouseToNavigate: (house: VillageHouse) => void;
  onExitNavigation: () => void;
  onStepNavSim: () => void;
  onToggleAutoSim: () => void;
  onFocusPoint: (lat: number, lng: number, zoom?: number) => void;
}

export default function NavigationPanel({
  houses,
  userLocation,
  isLiveGps,
  isPickingSpot,
  onToggleLiveGps,
  onTogglePickSpot,
  targetHouse,
  routeResult,
  routeOptions,
  selectedRouteIndex,
  onSelectRouteIndex,
  liveProgress = null,
  currentStepIndex,
  distanceToNextTurnMeters,
  voiceEnabled,
  isSimulatingNav,
  onToggleVoice,
  onSelectHouseToNavigate,
  onExitNavigation,
  onStepNavSim,
  onToggleAutoSim,
  onFocusPoint,
}: NavigationPanelProps) {
  const sortedHouses = useMemo(() => {
    return [...houses]
      .map((h) => ({
        house: h,
        dist: Math.round(haversineMeters(userLocation, { lat: h.roadLat, lng: h.roadLng })),
      }))
      .sort((a, b) => a.dist - b.dist);
  }, [houses, userLocation]);

  const activeInstruction: NavigationInstruction | null =
    targetHouse && routeResult?.reachable && routeResult.instructions.length > 0
      ? routeResult.instructions[Math.min(currentStepIndex, routeResult.instructions.length - 1)]
      : null;

  const isArrived =
    activeInstruction?.turnType === 'arrive' &&
    targetHouse != null &&
    haversineMeters(userLocation, { lat: targetHouse.roadLat, lng: targetHouse.roadLng }) <= 22;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto transition-colors">
      {/* User Location Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {targetHouse
              ? `Navigating to House ${targetHouse.houseNumber}${
                  targetHouse.shopName ? ` · ${targetHouse.shopName}` : ''
                }`
              : 'Find House or Shop'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
            My Spot: {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleLiveGps}
            className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              isLiveGps
                ? 'bg-sky-700 border-sky-700 text-white'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5 shrink-0" />
            {isLiveGps ? 'Live GPS On' : 'Use Live GPS'}
          </button>

          <button
            type="button"
            onClick={onTogglePickSpot}
            className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              isPickingSpot
                ? 'bg-emerald-700 border-emerald-700 text-white'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            {isPickingSpot ? 'Tap Map Spot...' : 'Set Spot on Map'}
          </button>
        </div>
      </div>

      {/* Active Navigation State */}
      {targetHouse ? (
        <div className="p-4 space-y-4 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                House {targetHouse.houseNumber} ·{' '}
                {targetHouse.side === 'left' ? 'Left Side' : 'Right Side'}
              </div>
              {targetHouse.shopName && (
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 truncate">
                  Shop: {targetHouse.shopName}
                </div>
              )}
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {targetHouse.roadName} · {targetHouse.villageName}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                Isolated view: tracking only this house
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onToggleVoice}
                aria-label="Toggle voice guidance"
                className={`p-2 rounded-lg border text-xs cursor-pointer ${
                  voiceEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onExitNavigation}
                className="px-3 py-2 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Show All
              </button>
            </div>
          </div>

          {!routeResult || !routeResult.reachable ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
              {routeResult?.reason || 'No connected village road reaches this house yet.'}
            </div>
          ) : (
            <>
              {activeInstruction && (
                <div
                  className={`p-4 rounded-xl text-white space-y-2 ${
                    isArrived ? 'bg-emerald-700' : 'bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                      <TurnIcon turn={activeInstruction.turnType} className="w-6 h-6 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono tabular-nums text-emerald-300">
                        {isArrived
                          ? 'Destination Reached'
                          : distanceToNextTurnMeters != null
                          ? `In ${formatDistance(distanceToNextTurnMeters)}`
                          : formatDistance(activeInstruction.distanceMeters)}
                      </div>
                      <div className="text-base font-bold leading-snug">
                        {activeInstruction.instruction}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/15 text-xs font-mono tabular-nums text-slate-200">
                    <span>
                      {liveProgress
                        ? `Left: ${formatDistance(liveProgress.remainingMeters)}`
                        : `Total: ${formatDistance(routeResult.totalDistanceMeters)}`}
                    </span>
                    <span>
                      {liveProgress
                        ? `${liveProgress.remainingWalkMinutes}m walk · ${liveProgress.remainingBikeMinutes}m bike`
                        : `${routeResult.walkMinutes}m walk · ${routeResult.bikeMinutes}m bike`}
                    </span>
                  </div>

                  {liveProgress && (
                    <div className="flex items-center justify-between text-[11px] pt-1 text-slate-300">
                      <span
                        className={
                          liveProgress.movementStatus === 'away'
                            ? 'text-amber-300 font-semibold'
                            : liveProgress.movementStatus === 'towards'
                            ? 'text-emerald-300 font-semibold'
                            : ''
                        }
                      >
                        {liveProgress.movementStatus === 'away'
                          ? 'Moving away — Turn around'
                          : liveProgress.movementStatus === 'towards'
                          ? `Moving toward House ${targetHouse.houseNumber}`
                          : 'Following saved road'}
                      </span>
                      <span className="font-mono tabular-nums">
                        Walked {formatDistance(liveProgress.coveredMeters)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Available Routes Comparison when multiple village road paths exist */}
              {routeOptions.length > 1 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Available Routes ({routeOptions.length} paths found)
                  </div>
                  <div className="space-y-1.5">
                    {routeOptions.map((opt, idx) => {
                      const active = idx === selectedRouteIndex;
                      return (
                        <button
                          key={`${opt.routeLabel}-${idx}`}
                          type="button"
                          onClick={() => onSelectRouteIndex(idx)}
                          className={`w-full p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                            <span>{opt.routeLabel ?? `Route ${idx + 1}`}</span>
                            <span className="font-mono tabular-nums text-sky-800 dark:text-sky-400">
                              {formatDistance(opt.totalDistanceMeters)} · {opt.walkMinutes}m walk /{' '}
                              {opt.bikeMinutes}m bike
                            </span>
                          </div>
                          {opt.viaSummary && (
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                              Via {opt.viaSummary}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Demo Walk Controls */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Follow Route (Live GPS or Desktop Test)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onToggleAutoSim}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSimulatingNav
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    }`}
                  >
                    {isSimulatingNav ? (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        Pause Demo
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Auto-Follow
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onStepNavSim}
                    className="py-2 px-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Step Forward
                  </button>
                </div>
              </div>

              {/* Turn-by-Turn Instructions */}
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Turn-by-Turn Route ({routeResult.instructions.length} steps)
                </h3>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                  {routeResult.instructions.map((inst, idx) => {
                    const isCurrent = idx === currentStepIndex;
                    const isDone = idx < currentStepIndex;
                    return (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() =>
                          onFocusPoint(inst.anchorPoint.lat, inst.anchorPoint.lng, 18)
                        }
                        className={`w-full p-3 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-emerald-50 dark:bg-emerald-950/60'
                            : isDone
                            ? 'bg-slate-50 dark:bg-slate-800/40 opacity-60'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                              isCurrent
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <TurnIcon turn={inst.turnType} className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {inst.instruction}
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                          {inst.distanceMeters > 0 ? formatDistance(inst.distanceMeters) : 'Goal'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* House Quick List when not navigating */
        <div className="p-4 flex-1 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Saved Houses (Closest first)</span>
            <span className="font-mono tabular-nums">{houses.length} houses</span>
          </div>

          {sortedHouses.length === 0 ? (
            <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs text-slate-600 dark:text-slate-300">
              No houses mapped yet. Click <strong>Start Walk</strong> to walk a road and add Left /
              Right houses.
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {sortedHouses.map(({ house, dist }) => (
                <div key={house.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      House {house.houseNumber}{' '}
                      <span
                        className={`text-xs font-medium ${
                          house.side === 'left'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        · {house.side === 'left' ? 'Left' : 'Right'}
                      </span>
                      {house.shopName && (
                        <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                          {' '}
                          · {house.shopName}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {house.roadName} ·{' '}
                      <span className="font-mono tabular-nums">{formatDistance(dist)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectHouseToNavigate(house)}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Go
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

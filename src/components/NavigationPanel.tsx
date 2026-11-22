import {
  ArrowUp,
  Bike,
  Car,
  CornerUpLeft,
  CornerUpRight,
  Crosshair,
  Flag,
  Footprints,
  LocateFixed,
  Navigation,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  NavigationInstruction,
  TravelMode,
  TurnDirection,
  VillageHouse,
  VillageRouteResult,
} from '../types/map.ts';
import { type LiveRouteProgress, formatDistance, haversineMeters } from '../utils/geo.ts';
import {
  getEffectivePlaceType,
  getPlaceBadgeLabel,
  getPlaceColor,
  isPublicPoi,
} from '../utils/placeMeta.ts';
import PlaceIcon from './PlaceIcon.tsx';

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
  travelMode: TravelMode;
  onChangeTravelMode: (mode: TravelMode) => void;
  readOnlyPublic?: boolean;
  targetHouse: VillageHouse | null;
  routeResult: VillageRouteResult | null;
  routeOptions: VillageRouteResult[];
  isComputingRoute?: boolean;
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
  travelMode,
  onChangeTravelMode,
  readOnlyPublic = false,
  targetHouse,
  routeResult,
  routeOptions,
  isComputingRoute = false,
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
  const [publicListTab, setPublicListTab] = useState<'places' | 'all'>('places');

  const sortedHouses = useMemo(() => {
    return [...houses]
      .map((h) => ({
        house: h,
        dist: Math.round(haversineMeters(userLocation, { lat: h.roadLat, lng: h.roadLng })),
      }))
      .sort((a, b) => a.dist - b.dist);
  }, [houses, userLocation]);

  const poiCount = useMemo(
    () => sortedHouses.filter(({ house }) => isPublicPoi(house)).length,
    [sortedHouses]
  );

  const visibleListHouses = useMemo(() => {
    if (readOnlyPublic && publicListTab === 'places') {
      return sortedHouses.filter(({ house }) => isPublicPoi(house));
    }
    return sortedHouses;
  }, [sortedHouses, readOnlyPublic, publicListTab]);

  const activeInstruction: NavigationInstruction | null =
    targetHouse && routeResult?.reachable && routeResult.instructions.length > 0
      ? routeResult.instructions[Math.min(currentStepIndex, routeResult.instructions.length - 1)]
      : null;

  const arriveTargetPt =
    routeResult?.carPartialStop && routeResult.carStopPoint
      ? routeResult.carStopPoint
      : targetHouse
      ? { lat: targetHouse.roadLat, lng: targetHouse.roadLng }
      : null;

  const isArrived =
    activeInstruction?.turnType === 'arrive' &&
    arriveTargetPt != null &&
    haversineMeters(userLocation, arriveTargetPt) <= 22;

  const remainingCarMinutes = liveProgress
    ? Math.max(1, Math.round(liveProgress.remainingMeters / 330))
    : routeResult?.carMinutes ??
      Math.max(1, Math.round((routeResult?.totalDistanceMeters ?? 0) / 330));

  const formatModeEta = (
    distMeters: number,
    walkMin: number,
    bikeMin: number,
    carMin?: number
  ): string => {
    if (travelMode === 'car') {
      return `${carMin ?? Math.max(1, Math.round(distMeters / 330))}m car`;
    }
    if (travelMode === 'bike') {
      return `${bikeMin}m bike`;
    }
    return `${walkMin}m walk`;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto transition-colors">
      {/* User Location + Travel Mode Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {targetHouse
              ? `${
                  targetHouse.shopName?.trim()
                    ? targetHouse.shopName.trim()
                    : `House ${targetHouse.houseNumber}`
                }`
              : readOnlyPublic
              ? 'Find Shop, Temple or House'
              : 'Find House or Shop'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
            My Spot: {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
          </p>
        </div>

        {/* Travel Mode Switcher: Car | Bike | Walk */}
        <div
          role="group"
          aria-label="Travel Mode"
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        >
          {(
            [
              { id: 'car', label: 'Car', Icon: Car },
              { id: 'bike', label: 'Bike', Icon: Bike },
              { id: 'walk', label: 'Walk', Icon: Footprints },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = travelMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeTravelMode(id)}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? id === 'car'
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
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
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  style={{
                    backgroundColor: getPlaceColor(
                      getEffectivePlaceType(targetHouse),
                      targetHouse.shopCategory,
                      targetHouse.side
                    ),
                  }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                >
                  <PlaceIcon
                    placeType={getEffectivePlaceType(targetHouse)}
                    shopCategory={targetHouse.shopCategory}
                    shopName={targetHouse.shopName}
                    className="w-3 h-3"
                  />
                  <span>{getPlaceBadgeLabel(targetHouse)}</span>
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {targetHouse.shopName?.trim() || `House ${targetHouse.houseNumber}`} ·{' '}
                  {targetHouse.side === 'left' ? 'Left' : 'Right'}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {targetHouse.roadId === '__osm_external__'
                  ? `${targetHouse.villageName} · OpenStreetMap Destination`
                  : `#${targetHouse.houseNumber} · ${targetHouse.roadName} · ${targetHouse.villageName}`}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                {routeResult?.isHybridOsmRoute
                  ? `Hybrid Route: ${routeResult.hybridStageSummary || 'Village + OpenStreetMap'}`
                  : travelMode === 'car'
                  ? 'Car mode: following saved car roads'
                  : `${travelMode === 'bike' ? 'Bike' : 'Walk'} mode: all village lanes open`}
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

          {isComputingRoute && (!routeResult || !routeResult.reachable) ? (
            <div className="p-4 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-xl space-y-1.5 text-xs text-sky-900 dark:text-sky-200">
              <div className="font-semibold">
                Connecting Village Exit + OpenStreetMap Road...
              </div>
              <div className="text-[11px] text-sky-700 dark:text-sky-300">
                Finding local village road exit and highway route to destination.
              </div>
            </div>
          ) : !routeResult || !routeResult.reachable ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="font-semibold">
                {routeResult?.reason || 'No connected village road reaches this house yet.'}
              </div>
              {travelMode === 'car' && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onChangeTravelMode('bike')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Bike className="w-3.5 h-3.5" />
                    Try Bike
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTravelMode('walk')}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Footprints className="w-3.5 h-3.5" />
                    Try Walk
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {activeInstruction && (() => {
                const upcoming =
                  activeInstruction.turnType !== 'arrive' && liveProgress?.nextInstruction
                    ? liveProgress.nextInstruction
                    : null;
                return (
                <div
                  className={`p-4 rounded-xl text-white space-y-2 ${
                    isArrived
                      ? routeResult.carPartialStop
                        ? 'bg-orange-700'
                        : 'bg-emerald-700'
                      : 'bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                      <TurnIcon
                        turn={upcoming ? upcoming.turnType : activeInstruction.turnType}
                        className="w-6 h-6 text-white"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono tabular-nums text-emerald-300">
                        {isArrived
                          ? routeResult.carPartialStop
                            ? 'Car Drop-Off Reached'
                            : 'Destination Reached'
                          : distanceToNextTurnMeters != null
                          ? `In ${formatDistance(distanceToNextTurnMeters)}`
                          : formatDistance(activeInstruction.distanceMeters)}
                      </div>
                      <div className="text-base font-bold leading-snug">
                        {upcoming ? upcoming.instruction : activeInstruction.instruction}
                      </div>
                      {upcoming && (
                        <div className="text-[11px] text-slate-300 mt-0.5 truncate">
                          Now: {activeInstruction.instruction}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/15 text-xs font-mono tabular-nums text-slate-200">
                    <span>
                      {liveProgress
                        ? `Left: ${formatDistance(liveProgress.remainingMeters)}`
                        : `Total: ${formatDistance(routeResult.totalDistanceMeters)}`}
                    </span>
                    <span>
                      {travelMode === 'car'
                        ? `${remainingCarMinutes}m by car`
                        : liveProgress
                        ? travelMode === 'bike'
                          ? `${liveProgress.remainingBikeMinutes}m by bike`
                          : `${liveProgress.remainingWalkMinutes}m walk`
                        : travelMode === 'bike'
                        ? `${routeResult.bikeMinutes}m by bike`
                        : `${routeResult.walkMinutes}m walk`}
                    </span>
                  </div>

                  {routeResult.isHybridOsmRoute && (
                    <div className="flex items-center justify-between gap-2 text-[11px] pt-1 text-sky-300">
                      <span className="font-semibold truncate">
                        Village + OpenStreetMap: {routeResult.hybridStageSummary}
                      </span>
                    </div>
                  )}

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
                          ? targetHouse.roadId === '__osm_external__'
                            ? `Moving toward ${targetHouse.shopName || targetHouse.villageName}`
                            : `Moving toward House ${targetHouse.houseNumber}`
                          : 'Following saved road'}
                      </span>
                      <span className="font-mono tabular-nums">
                        Covered {formatDistance(liveProgress.coveredMeters)}
                      </span>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* Car Narrow-Lane Advisory when House sits inside a non-car lane */}
              {travelMode === 'car' && routeResult.carPartialStop && (
                <div className="p-3 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-orange-900 dark:text-orange-200">
                    Car stops {formatDistance(routeResult.lastMileWalkMeters ?? 0)} before House{' '}
                    {targetHouse.houseNumber}
                  </div>
                  <p className="text-[11px] text-orange-800 dark:text-orange-300 leading-relaxed">
                    The remaining stretch is a narrow lane where cars cannot enter. Park here and
                    walk {formatDistance(routeResult.lastMileWalkMeters ?? 0)}, or switch to Bike /
                    Walk for door-to-door lane navigation.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeTravelMode('bike')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Bike className="w-3 h-3" />
                      Switch to Bike
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTravelMode('walk')}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Footprints className="w-3 h-3" />
                      Switch to Walk
                    </button>
                  </div>
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
                              {formatDistance(opt.totalDistanceMeters)} ·{' '}
                              {formatModeEta(
                                opt.totalDistanceMeters,
                                opt.walkMinutes,
                                opt.bikeMinutes,
                                opt.carMinutes
                              )}
                            </span>
                          </div>
                          {opt.isHybridOsmRoute && opt.hybridStageSummary && (
                            <div className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 truncate mt-0.5">
                              {opt.hybridStageSummary}
                            </div>
                          )}
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

              {/* Live GPS or Simulator Controls */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Route Simulator (Preview Trip)
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
                        Pause Sim
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Simulate Trip
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
        /* Quick List when not navigating */
        <div className="p-4 flex-1 space-y-3">
          {readOnlyPublic ? (
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPublicListTab('places')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    publicListTab === 'places'
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Shops &amp; Places ({poiCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPublicListTab('all')}
                  className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                    publicListTab === 'all'
                      ? 'bg-slate-900 dark:bg-sky-700 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  All ({sortedHouses.length})
                </button>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Closest</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Saved Places &amp; Houses (Closest first)</span>
              <span className="font-mono tabular-nums">{houses.length} saved</span>
            </div>
          )}

          {visibleListHouses.length === 0 ? (
            <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs text-slate-600 dark:text-slate-300">
              {readOnlyPublic ? (
                publicListTab === 'places' ? (
                  <>
                    No shops, temples, or schools tagged in this area yet. Use the top{' '}
                    <strong>House / Shop</strong> search bar to find any house number directly.
                  </>
                ) : (
                  <>
                    No houses mapped in this area yet. Pick a saved area from the header or switch to{' '}
                    <strong>Company</strong> mode to map roads &amp; places.
                  </>
                )
              ) : (
                <>
                  No houses mapped yet. Use <strong>Add</strong> or <strong>AutoMapX</strong> to map
                  a road and save Left / Right houses &amp; shops.
                </>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {visibleListHouses.map(({ house, dist }) => {
                const pt = getEffectivePlaceType(house);
                const badgeLabel = getPlaceBadgeLabel(house);
                const badgeColor = getPlaceColor(pt, house.shopCategory, house.side);
                return (
                  <div key={house.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        style={{ backgroundColor: badgeColor }}
                        className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 shadow-xs"
                      >
                        <PlaceIcon
                          placeType={pt}
                          shopCategory={house.shopCategory}
                          shopName={house.shopName}
                          className="w-3.5 h-3.5"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          <span className="truncate">
                            {house.shopName?.trim() ||
                              (pt !== 'house'
                                ? `${badgeLabel} #${house.houseNumber}`
                                : `House ${house.houseNumber}`)}
                          </span>
                          <span
                            style={{ backgroundColor: badgeColor }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white shrink-0 leading-none"
                          >
                            {badgeLabel}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          #{house.houseNumber} ({house.side === 'left' ? 'L' : 'R'}) ·{' '}
                          {house.roadName} ·{' '}
                          <span className="font-mono tabular-nums">{formatDistance(dist)}</span>
                        </div>
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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

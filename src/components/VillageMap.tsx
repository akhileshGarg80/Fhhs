import L from '../utils/leafletInit.ts';
import 'leaflet-rotate';
import { Compass, Crosshair, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AutoMapXNode,
  LatLngPoint,
  NavigationInstruction,
  RoadJunction,
  VillageHouse,
  VillageRoad,
  VillageRouteResult,
} from '../types/map.ts';
import {
  type LiveRouteProgress,
  calculateBearing,
  formatDistance,
  getSurfaceLabel,
  haversineMeters,
  offsetCoord,
} from '../utils/geo.ts';
import type { GpsQualityReport } from '../utils/gpsFilter.ts';
import { TurnIcon } from './NavigationPanel.tsx';

export type BaseLayerId = 'osm_standard' | 'osm_clean' | 'satellite';

export type MapInteractionMode =
  | 'browse'
  | 'manual_trace'
  | 'pick_user_location'
  | 'pick_automapx_start';

export interface AutoTripOverlay {
  points: LatLngPoint[];
  simPoint?: { lat: number; lng: number; headingDeg: number } | null;
  houses: VillageHouse[];
}

export interface AutoMapXOverlay {
  subMode?: 'build' | 'simulate';
  cursor: { lat: number; lng: number; headingDeg: number };
  points: AutoMapXNode[];
  rewindIndex?: number | null;
  isRunning: boolean;
  isPaused: boolean;
  houses: VillageHouse[];
  simRoadPoints?: LatLngPoint[];
  simPoint?: { lat: number; lng: number; headingDeg: number } | null;
}

interface VillageMapProps {
  roads: VillageRoad[];
  houses: VillageHouse[];
  draftHouses: VillageHouse[];
  activeWalkSegments: LatLngPoint[][];
  draftJunctions?: RoadJunction[];
  currentGps: LatLngPoint;
  userHeadingDeg?: number | null;
  gpsQuality: GpsQualityReport;
  routeResult: VillageRouteResult | null;
  alternativeRoutes?: VillageRouteResult[];
  liveProgress?: LiveRouteProgress | null;
  startHouse?: VillageHouse | null;
  targetHouse: VillageHouse | null;
  darkMode?: boolean;
  isolateNavigation: boolean;
  activeInstruction: NavigationInstruction | null;
  distanceToNextTurnMeters: number | null;
  interactionMode: MapInteractionMode;
  onMapClick: (lat: number, lng: number) => void;
  onNavigateHouse: (house: VillageHouse) => void;
  onSelectRouteIndex?: (index: number) => void;
  onSelectPendingBranch?: (junction: RoadJunction, branchId: string) => void;
  onExitNavigation?: () => void;
  onCenterGps?: () => void;
  isFollowingGps?: boolean;
  topControlsOffset?: boolean;
  initialView: { lat: number; lng: number; zoom: number; bearing?: number };
  onViewChange: (view: { lat: number; lng: number; zoom: number; bearing?: number }) => void;
  onUserDrag?: () => void;
  focusTarget: {
    lat: number;
    lng: number;
    zoom?: number;
    boundsPoints?: { lat: number; lng: number }[];
    key: number;
  } | null;
  autoTripOverlay?: AutoTripOverlay | null;
  autoMapXOverlay?: AutoMapXOverlay | null;
}

const TILE_LAYERS: Record<
  BaseLayerId,
  {
    label: string;
    url: string;
    fallbackUrl?: string;
    fallbackMaxNativeZoom?: number;
    fallbackSubdomains?: string;
    attribution: string;
    maxZoom: number;
    maxNativeZoom: number;
    subdomains?: string;
  }
> = {
  osm_standard: {
    label: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    fallbackUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    fallbackMaxNativeZoom: 19,
    fallbackSubdomains: 'abcd',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 20,
    maxNativeZoom: 19,
  },
  osm_clean: {
    label: 'Street',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    fallbackUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    fallbackMaxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20,
    maxNativeZoom: 19,
    subdomains: 'abcd',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    fallbackUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    fallbackMaxNativeZoom: 18,
    attribution: 'Imagery &copy; Google / Esri',
    maxZoom: 20,
    maxNativeZoom: 20,
    subdomains: '0123',
  },
};

const BASE_LAYER_STORAGE_KEY = 'grampath_base_layer';

export default function VillageMap({
  roads,
  houses,
  draftHouses,
  activeWalkSegments,
  draftJunctions = [],
  currentGps,
  userHeadingDeg = null,
  gpsQuality,
  routeResult,
  alternativeRoutes = [],
  liveProgress = null,
  startHouse = null,
  targetHouse,
  darkMode = false,
  isolateNavigation,
  activeInstruction,
  distanceToNextTurnMeters,
  interactionMode,
  onMapClick,
  onNavigateHouse,
  onSelectRouteIndex,
  onSelectPendingBranch,
  onExitNavigation,
  onCenterGps,
  isFollowingGps = true,
  topControlsOffset = false,
  initialView,
  onViewChange,
  onUserDrag,
  focusTarget,
  autoTripOverlay = null,
  autoMapXOverlay = null,
}: VillageMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const roadsLayerRef = useRef<L.LayerGroup | null>(null);
  const housesLayerRef = useRef<L.LayerGroup | null>(null);
  const walkLayerRef = useRef<L.LayerGroup | null>(null);
  const autoTripLayerRef = useRef<L.LayerGroup | null>(null);
  const autoMapXLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerRef = useRef<L.LayerGroup | null>(null);

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onNavigateHouseRef = useRef(onNavigateHouse);
  onNavigateHouseRef.current = onNavigateHouse;
  const onSelectRouteIndexRef = useRef(onSelectRouteIndex);
  onSelectRouteIndexRef.current = onSelectRouteIndex;
  const onSelectPendingBranchRef = useRef(onSelectPendingBranch);
  onSelectPendingBranchRef.current = onSelectPendingBranch;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const onUserDragRef = useRef(onUserDrag);
  onUserDragRef.current = onUserDrag;
  const initialViewRef = useRef(initialView);
  const isProgrammaticMoveRef = useRef(false);
  const isProgrammaticRotateRef = useRef(false);

  const [baseLayer, setBaseLayer] = useState<BaseLayerId>(() => {
    try {
      const saved = localStorage.getItem(BASE_LAYER_STORAGE_KEY);
      if (saved === 'osm_standard' || saved === 'osm_clean' || saved === 'satellite') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'osm_standard';
  });
  const [mapBearing, setMapBearing] = useState<number>(initialView.bearing ?? 0);
  const [autoRotateHeading, setAutoRotateHeading] = useState(false);

  const handleSelectBaseLayer = (nextLayer: BaseLayerId) => {
    setBaseLayer(nextLayer);
    try {
      localStorage.setItem(BASE_LAYER_STORAGE_KEY, nextLayer);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialViewRef.current.lat, initialViewRef.current.lng],
      zoom: initialViewRef.current.zoom,
      maxZoom: 20,
      zoomControl: false,
      rotate: true,
      bearing: initialViewRef.current.bearing ?? 0,
      touchRotate: true,
      shiftKeyRotate: true,
      rotateControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    roadsLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    walkLayerRef.current = L.layerGroup().addTo(map);
    autoTripLayerRef.current = L.layerGroup().addTo(map);
    autoMapXLayerRef.current = L.layerGroup().addTo(map);
    housesLayerRef.current = L.layerGroup().addTo(map);
    gpsLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    map.on('dragstart', () => {
      if (!isProgrammaticMoveRef.current) {
        onUserDragRef.current?.();
      }
    });

    map.on('zoomstart', () => {
      if (!isProgrammaticMoveRef.current) {
        onUserDragRef.current?.();
      }
    });

    map.on('rotate', () => {
      const b = Math.round(((map.getBearing() % 360) + 360) % 360);
      setMapBearing(b);
      if (!isProgrammaticRotateRef.current) {
        setAutoRotateHeading(false);
      }
      const c = map.getCenter();
      onViewChangeRef.current({ lat: c.lat, lng: c.lng, zoom: map.getZoom(), bearing: b });
    });

    const syncView = () => {
      isProgrammaticMoveRef.current = false;
      const c = map.getCenter();
      const b = Math.round(((map.getBearing() % 360) + 360) % 360);
      onViewChangeRef.current({ lat: c.lat, lng: c.lng, zoom: map.getZoom(), bearing: b });
    };
    map.on('moveend', syncView);
    map.on('zoomend', syncView);

    // ResizeObserver + initial frame ensure center map stays crisp when mobile/vertical panels resize
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);
    const rafId = requestAnimationFrame(() => map.invalidateSize());
    const settleTimer = setTimeout(() => map.invalidateSize(), 150);

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    const attachLayer = (useFallback: boolean) => {
      if (cancelled) return;
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
        tileLayerRef.current = null;
      }
      const cfg = TILE_LAYERS[baseLayer];
      const url = useFallback && cfg.fallbackUrl ? cfg.fallbackUrl : cfg.url;
      const maxNativeZoom =
        useFallback && cfg.fallbackMaxNativeZoom ? cfg.fallbackMaxNativeZoom : cfg.maxNativeZoom;
      const subdomains =
        useFallback && cfg.fallbackUrl ? cfg.fallbackSubdomains : cfg.subdomains;

      let errorCount = 0;
      let loadedAny = false;
      let switchedToFallback = useFallback;

      const layer = L.tileLayer(url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
        maxNativeZoom,
        keepBuffer: 4,
        updateWhenZooming: false,
        updateWhenIdle: false,
        detectRetina: false,
        ...(subdomains ? { subdomains } : {}),
      });
      layer.on('tileload', () => {
        loadedAny = true;
      });
      layer.on('tileerror', () => {
        errorCount += 1;
        if (!cancelled && !loadedAny && !switchedToFallback && cfg.fallbackUrl && errorCount >= 3) {
          switchedToFallback = true;
          attachLayer(true);
        }
      });
      layer.addTo(map);
      layer.bringToBack();
      tileLayerRef.current = layer;
    };

    attachLayer(false);

    return () => {
      cancelled = true;
    };
  }, [baseLayer]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor = interactionMode === 'browse' ? '' : 'crosshair';
    }
  }, [interactionMode]);

  useEffect(() => {
    if (!focusTarget || !mapRef.current) return;
    isProgrammaticMoveRef.current = true;
    if (focusTarget.boundsPoints && focusTarget.boundsPoints.length >= 2) {
      const bounds = L.latLngBounds(
        focusTarget.boundsPoints.map((p) => [p.lat, p.lng] as [number, number])
      );
      mapRef.current.fitBounds(bounds, {
        padding: [56, 56],
        maxZoom: 19,
        animate: true,
      });
    } else if (focusTarget.zoom != null) {
      mapRef.current.setView([focusTarget.lat, focusTarget.lng], focusTarget.zoom, {
        animate: true,
        duration: 0.25,
      });
    } else {
      // Preserve whatever zoom level and rotation the user currently chose!
      mapRef.current.panTo([focusTarget.lat, focusTarget.lng], {
        animate: true,
        duration: 0.25,
      });
    }
  }, [focusTarget]);

  // Smoothly align map with walking direction only when Heading-Up mode is explicitly enabled
  useEffect(() => {
    if (!autoRotateHeading || !targetHouse || !mapRef.current) return;
    if (userHeadingDeg == null || !Number.isFinite(userHeadingDeg)) return;
    isProgrammaticRotateRef.current = true;
    mapRef.current.setBearing((360 - userHeadingDeg) % 360);
    isProgrammaticRotateRef.current = false;
  }, [autoRotateHeading, targetHouse, userHeadingDeg]);

  // Reset Heading-Up mode when exiting house tracking (keep manual rotation if user set one)
  useEffect(() => {
    if (!targetHouse) {
      setAutoRotateHeading(false);
    }
  }, [targetHouse]);

  const setBearingManually = (nextDeg: number) => {
    if (!mapRef.current) return;
    setAutoRotateHeading(false);
    isProgrammaticRotateRef.current = true;
    mapRef.current.setBearing(((nextDeg % 360) + 360) % 360);
    isProgrammaticRotateRef.current = false;
  };

  // Render Saved Roads & Junctions (kept visible during tracking so mapped turns, curves, and 3W/4W crossings match Add mode)
  useEffect(() => {
    const group = roadsLayerRef.current;
    if (!group) return;
    group.clearLayers();

    for (const r of roads) {
      if (r.points.length < 2) continue;
      const latlngs = r.points.map((pt) => [pt.lat, pt.lng] as [number, number]);
      const isKachha = r.surface === 'unpaved';
      const isTrackedRoad = Boolean(isolateNavigation && targetHouse && r.id === targetHouse.roadId);
      const isMutedDuringTrack = Boolean(isolateNavigation && targetHouse && !isTrackedRoad);

      const line = L.polyline(latlngs, {
        color: isMutedDuringTrack ? '#64748b' : isKachha ? '#d97706' : '#0f766e',
        weight: isMutedDuringTrack ? 3.5 : 5,
        opacity: isMutedDuringTrack ? 0.5 : 0.92,
        dashArray: isKachha ? '7 6' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      });
      line.bindTooltip(
        `${r.name} · ${getSurfaceLabel(r.surface)} · ${formatDistance(r.distanceMeters)}`,
        { sticky: true }
      );
      line.addTo(group);

      for (const j of r.junctions ?? []) {
        const branches = j.branches ?? [];
        const hasPending = branches.some((b) => b.status === 'pending');

        if (branches.length > 0 && !isolateNavigation) {
          for (const br of branches) {
            if (br.status === 'pending') {
              const tip = offsetCoord(j, br.bearingDeg, 15);
              const ray = L.polyline(
                [
                  [j.lat, j.lng],
                  [tip.lat, tip.lng],
                ],
                {
                  color: '#d97706',
                  weight: 3.5,
                  opacity: 0.9,
                  dashArray: '5 5',
                  lineCap: 'round',
                }
              ).addTo(group);

              const brIcon = L.divIcon({
                className: 'grampath-pending-branch',
                iconSize: [58, 20],
                iconAnchor: [29, 10],
                html: `<div style="height:20px;padding:0 6px;border-radius:6px;background:#fef3c7;color:#92400e;border:1.5px solid #d97706;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 1px 4px rgba(15,23,42,0.2);cursor:pointer;">+ ${br.label}</div>`,
              });
              const brMarker = L.marker([tip.lat, tip.lng], { icon: brIcon }).addTo(group);
              const trigger = () => onSelectPendingBranchRef.current?.(j, br.id);
              ray.on('click', trigger);
              brMarker.on('click', trigger);
            }
          }
        } else {
          const leftArm = offsetCoord(j, (j.headingDeg + 270) % 360, 7);
          const rightArm = offsetCoord(j, (j.headingDeg + 90) % 360, 7);
          const aheadArm = offsetCoord(j, j.headingDeg, 7);
          const arms: [number, number][][] = [];
          if (j.type === '4-way') {
            arms.push(
              [
                [leftArm.lat, leftArm.lng],
                [rightArm.lat, rightArm.lng],
              ],
              [
                [j.lat, j.lng],
                [aheadArm.lat, aheadArm.lng],
              ]
            );
          } else {
            if (j.exitTurn !== 'left') {
              arms.push([
                [j.lat, j.lng],
                [leftArm.lat, leftArm.lng],
              ]);
            }
            if (j.exitTurn !== 'right') {
              arms.push([
                [j.lat, j.lng],
                [rightArm.lat, rightArm.lng],
              ]);
            }
          }
          for (const pts of arms) {
            L.polyline(pts, {
              color: '#475569',
              weight: 3,
              opacity: 0.75,
              dashArray: '3 3',
              lineCap: 'round',
            }).addTo(group);
          }
        }

        const badgeLabel = j.type === '4-way' ? '4W' : j.type === '2-way' ? '2W' : '3W';
        const badgeIcon = L.divIcon({
          className: 'grampath-junction-badge',
          iconSize: [24, 18],
          iconAnchor: [12, 9],
          html: `<div style="width:24px;height:18px;border-radius:4px;background:${
            hasPending ? '#b45309' : '#0f172a'
          };color:#fff;border:1.5px solid #fff;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(15,23,42,0.35);">${badgeLabel}</div>`,
        });
        const pendingCount = branches.filter((b) => b.status === 'pending').length;
        L.marker([j.lat, j.lng], { icon: badgeIcon })
          .bindTooltip(
            `${j.label ?? (j.type === '4-way' ? '4-Way Chauraha' : j.type === '2-way' ? '2-Way Fork' : '3-Way Junction')}${
              pendingCount > 0 ? ` · ${pendingCount} pending` : ' · Complete'
            }`
          )
          .addTo(group);
      }
    }
  }, [roads, isolateNavigation, targetHouse]);

  // Render Houses: in isolated navigation mode, ONLY render targetHouse!
  useEffect(() => {
    const group = housesLayerRef.current;
    if (!group) return;
    group.clearLayers();

    let visibleHouses: VillageHouse[];
    if (isolateNavigation && targetHouse) {
      visibleHouses = [targetHouse];
    } else {
      const merged = new Map<string, VillageHouse>();
      for (const h of houses) merged.set(h.id, h);
      for (const h of draftHouses) merged.set(h.id, h);
      for (const h of autoTripOverlay?.houses ?? []) merged.set(h.id, h);
      for (const h of autoMapXOverlay?.houses ?? []) merged.set(h.id, h);
      visibleHouses = Array.from(merged.values());
    }

    for (const h of visibleHouses) {
      const isTarget = targetHouse?.id === h.id;
      const isStart = startHouse?.id === h.id;
      const bg = isTarget
        ? '#dc2626'
        : isStart
        ? '#0284c7'
        : h.side === 'left'
        ? '#15803d'
        : '#d97706';

      const hasRouteConnector =
        (isTarget || isStart) && Boolean(routeResult?.reachable && routeResult.polyline.length >= 2);
      if (!hasRouteConnector) {
        L.polyline(
          [
            [h.roadLat, h.roadLng],
            [h.lat, h.lng],
          ],
          {
            color: bg,
            weight: 1.5,
            opacity: 0.65,
            dashArray: '2 3',
          }
        ).addTo(group);
      }

      const hasShop = Boolean(h.shopName?.trim());
      const rolePrefix = isStart ? 'A·' : isTarget && startHouse ? 'B·' : '';
      const shopTag = hasShop
        ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="margin-left:3px;flex-shrink:0;"><path d="M3 9l1-5h16l1 5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/></svg>`
        : '';
      const labelW = (hasShop ? 44 : 30) + (rolePrefix ? 14 : 0);
      const icon = L.divIcon({
        className: 'grampath-marker-icon',
        iconSize: [labelW, 24],
        iconAnchor: [Math.round(labelW / 2), 12],
        html: `<div style="min-width:${labelW - 2}px;height:22px;padding:0 6px;border-radius:6px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,0.35);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;font-family:'JetBrains Mono',monospace;">${rolePrefix}${h.houseNumber}${shopTag}</div>`,
      });

      const marker = L.marker([h.lat, h.lng], { icon });
      const popupEl = document.createElement('div');
      popupEl.style.fontSize = '12px';
      popupEl.style.minWidth = '155px';
      const titleColor = darkMode ? '#f1f5f9' : '#0f172a';
      const shopColor = darkMode ? '#34d399' : '#047857';
      const roadColor = darkMode ? '#94a3b8' : '#475569';
      const noteColor = darkMode ? '#cbd5e1' : '#334155';
      popupEl.innerHTML = `
        <div style="font-weight:700;color:${titleColor};font-size:13px;">House ${h.houseNumber} (${
        h.side === 'left' ? 'Left' : 'Right'
      })</div>
        ${
          hasShop
            ? `<div style="font-weight:600;color:${shopColor};margin-top:2px;">Shop: ${h.shopName}</div>`
            : ''
        }
        <div style="color:${roadColor};margin-top:2px;">${h.roadName}</div>
        ${h.note ? `<div style="color:${noteColor};margin-top:4px;">${h.note}</div>` : ''}
      `;

      if (!isTarget) {
        const navBtn = document.createElement('button');
        navBtn.type = 'button';
        navBtn.textContent = hasShop ? `Track ${h.houseNumber} · ${h.shopName}` : `Track House ${h.houseNumber}`;
        navBtn.style.marginTop = '8px';
        navBtn.style.width = '100%';
        navBtn.style.padding = '6px 10px';
        navBtn.style.backgroundColor = '#15803d';
        navBtn.style.color = '#ffffff';
        navBtn.style.border = 'none';
        navBtn.style.borderRadius = '6px';
        navBtn.style.fontWeight = '600';
        navBtn.style.fontSize = '12px';
        navBtn.style.cursor = 'pointer';
        navBtn.onclick = () => {
          marker.closePopup();
          onNavigateHouseRef.current(h);
        };
        popupEl.appendChild(navBtn);
      }

      marker.bindPopup(popupEl);
      marker.addTo(group);
    }
  }, [houses, draftHouses, autoTripOverlay, autoMapXOverlay, startHouse, targetHouse, isolateNavigation, routeResult, darkMode]);

  // Render Active Walk Segments (each segment draws independently so Pause->Resume jumps never bridge with a straight line)
  useEffect(() => {
    const group = walkLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (isolateNavigation && targetHouse) return;

    for (let sIdx = 0; sIdx < activeWalkSegments.length; sIdx++) {
      const seg = activeWalkSegments[sIdx];
      if (seg.length === 0) continue;

      const latlngs = seg.map((pt) => [pt.lat, pt.lng] as [number, number]);
      if (latlngs.length >= 2) {
        L.polyline(latlngs, {
          color: '#059669',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group);
      }

      const isLastSegment = sIdx === activeWalkSegments.length - 1;
      for (let i = 0; i < seg.length; i++) {
        const pt = seg[i];
        L.circleMarker([pt.lat, pt.lng], {
          radius: isLastSegment && i === seg.length - 1 ? 5.5 : 3,
          color: '#ffffff',
          weight: 1.5,
          fillColor: '#047857',
          fillOpacity: 1,
        }).addTo(group);
      }
    }

    for (const j of draftJunctions) {
      const branches = j.branches ?? [];
      if (branches.length > 0) {
        for (const br of branches) {
          if (br.status === 'pending') {
            const tip = offsetCoord(j, br.bearingDeg, 16);
            const ray = L.polyline(
              [
                [j.lat, j.lng],
                [tip.lat, tip.lng],
              ],
              {
                color: '#d97706',
                weight: 4,
                opacity: 0.95,
                dashArray: '5 5',
                lineCap: 'round',
              }
            ).addTo(group);

            const brIcon = L.divIcon({
              className: 'grampath-pending-branch',
              iconSize: [64, 22],
              iconAnchor: [32, 11],
              html: `<div style="height:22px;padding:0 7px;border-radius:6px;background:#fef3c7;color:#92400e;border:1.5px solid #d97706;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 2px 5px rgba(15,23,42,0.22);cursor:pointer;">Map ${br.label}</div>`,
            });
            const brMarker = L.marker([tip.lat, tip.lng], { icon: brIcon }).addTo(group);
            const trigger = () => onSelectPendingBranchRef.current?.(j, br.id);
            ray.on('click', trigger);
            brMarker.on('click', trigger);
          }
        }
      } else {
        const leftArm = offsetCoord(j, (j.headingDeg + 270) % 360, 7);
        const rightArm = offsetCoord(j, (j.headingDeg + 90) % 360, 7);
        const aheadArm = offsetCoord(j, j.headingDeg, 7);
        const arms: [number, number][][] = [];
        if (j.type === '4-way') {
          arms.push(
            [
              [leftArm.lat, leftArm.lng],
              [rightArm.lat, rightArm.lng],
            ],
            [
              [j.lat, j.lng],
              [aheadArm.lat, aheadArm.lng],
            ]
          );
        } else {
          if (j.exitTurn !== 'left') {
            arms.push([
              [j.lat, j.lng],
              [leftArm.lat, leftArm.lng],
            ]);
          }
          if (j.exitTurn !== 'right') {
            arms.push([
              [j.lat, j.lng],
              [rightArm.lat, rightArm.lng],
            ]);
          }
        }
        for (const pts of arms) {
          L.polyline(pts, {
            color: '#0f172a',
            weight: 3,
            opacity: 0.8,
            dashArray: '3 3',
            lineCap: 'round',
          }).addTo(group);
        }
      }
      const badgeLabel = j.type === '4-way' ? '4W' : j.type === '2-way' ? '2W' : '3W';
      const badgeIcon = L.divIcon({
        className: 'grampath-junction-badge',
        iconSize: [24, 18],
        iconAnchor: [12, 9],
        html: `<div style="width:24px;height:18px;border-radius:4px;background:#0f172a;color:#34d399;border:1.5px solid #fff;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(15,23,42,0.35);">${badgeLabel}</div>`,
      });
      L.marker([j.lat, j.lng], { icon: badgeIcon }).addTo(group);
    }
  }, [activeWalkSegments, draftJunctions, isolateNavigation, targetHouse]);

  // Render Selected or Live Auto-Recorded Trip Road + Start/End Badges + Slow Simulator Arrow
  useEffect(() => {
    const group = autoTripLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!autoTripOverlay || autoTripOverlay.points.length === 0) return;

    const pts = autoTripOverlay.points;
    const latlngs = pts.map((p) => [p.lat, p.lng] as [number, number]);

    if (latlngs.length >= 2) {
      L.polyline(latlngs, {
        color: '#0c4a6e',
        weight: 10,
        opacity: 0.28,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(group);

      L.polyline(latlngs, {
        color: '#0284c7',
        weight: 6,
        opacity: 0.96,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(group);

      let accum = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        accum += haversineMeters(a, b);
        if (accum >= 24) {
          accum = 0;
          const brg = calculateBearing(a, b);
          const arrowIcon = L.divIcon({
            className: 'grampath-auto-arrow',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.5 10L6 7.8L1.5 10L6 1Z" fill="#ffffff" stroke="#0369a1" stroke-width="1"/></svg></div>`,
          });
          L.marker([b.lat, b.lng], {
            icon: arrowIcon,
            interactive: false,
            rotateWithView: true,
            rotation: (brg * Math.PI) / 180,
          }).addTo(group);
        }
      }
    }

    const startPt = pts[0];
    const startIcon = L.divIcon({
      className: 'grampath-auto-start',
      iconSize: [44, 20],
      iconAnchor: [22, 10],
      html: `<div style="height:20px;padding:0 7px;border-radius:6px;background:#059669;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,23,42,0.35);">Start</div>`,
    });
    L.marker([startPt.lat, startPt.lng], { icon: startIcon, zIndexOffset: 500 }).addTo(group);

    if (pts.length >= 2) {
      const endPt = pts[pts.length - 1];
      const endIcon = L.divIcon({
        className: 'grampath-auto-end',
        iconSize: [38, 20],
        iconAnchor: [19, 10],
        html: `<div style="height:20px;padding:0 7px;border-radius:6px;background:#dc2626;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,23,42,0.35);">End</div>`,
      });
      L.marker([endPt.lat, endPt.lng], { icon: endIcon, zIndexOffset: 500 }).addTo(group);
    }

    if (autoTripOverlay.simPoint) {
      const sp = autoTripOverlay.simPoint;
      const simIcon = L.divIcon({
        className: 'grampath-sim-walker',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `<div style="width:34px;height:34px;border-radius:999px;background:rgba(245,158,11,0.28);display:flex;align-items:center;justify-content:center;"><div style="width:24px;height:24px;border-radius:999px;background:#d97706;border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.2 9.5L6 7.5L1.8 9.5L6 1Z" fill="#ffffff"/></svg></div></div>`,
      });
      L.marker([sp.lat, sp.lng], {
        icon: simIcon,
        zIndexOffset: 900,
        rotateWithView: true,
        rotation: (sp.headingDeg * Math.PI) / 180,
      })
        .bindTooltip('Simulator Position')
        .addTo(group);
    }
  }, [autoTripOverlay]);

  // Render AutoMapX Virtual GPS Path OR Post-Save Road Simulator + Left/Right House Guides
  useEffect(() => {
    const group = autoMapXLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!autoMapXOverlay) return;

    if (autoMapXOverlay.subMode === 'simulate') {
      const simPts = autoMapXOverlay.simRoadPoints ?? [];
      if (simPts.length >= 2) {
        const latlngs = simPts.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(latlngs, {
          color: '#312e81',
          weight: 10,
          opacity: 0.28,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group);

        L.polyline(latlngs, {
          color: '#0284c7',
          weight: 6,
          opacity: 0.96,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group);

        let accum = 0;
        for (let i = 1; i < simPts.length; i++) {
          const a = simPts[i - 1];
          const b = simPts[i];
          accum += haversineMeters(a, b);
          if (accum >= 24) {
            accum = 0;
            const brg = calculateBearing(a, b);
            const arrowIcon = L.divIcon({
              className: 'grampath-amx-sim-arrow',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.5 10L6 7.8L1.5 10L6 1Z" fill="#ffffff" stroke="#0369a1" stroke-width="1"/></svg></div>`,
            });
            L.marker([b.lat, b.lng], {
              icon: arrowIcon,
              interactive: false,
              rotateWithView: true,
              rotation: (brg * Math.PI) / 180,
            }).addTo(group);
          }
        }

        const startPt = simPts[0];
        const startIcon = L.divIcon({
          className: 'grampath-amx-start',
          iconSize: [44, 20],
          iconAnchor: [22, 10],
          html: `<div style="height:20px;padding:0 7px;border-radius:6px;background:#059669;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,23,42,0.35);">Start</div>`,
        });
        L.marker([startPt.lat, startPt.lng], { icon: startIcon, zIndexOffset: 500 }).addTo(group);

        const endPt = simPts[simPts.length - 1];
        const endIcon = L.divIcon({
          className: 'grampath-amx-end',
          iconSize: [38, 20],
          iconAnchor: [19, 10],
          html: `<div style="height:20px;padding:0 7px;border-radius:6px;background:#dc2626;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,23,42,0.35);">End</div>`,
        });
        L.marker([endPt.lat, endPt.lng], { icon: endIcon, zIndexOffset: 500 }).addTo(group);
      }

      if (autoMapXOverlay.simPoint) {
        const sp = autoMapXOverlay.simPoint;
        const leftPt = offsetCoord(sp, (sp.headingDeg + 270) % 360, 7);
        const rightPt = offsetCoord(sp, (sp.headingDeg + 90) % 360, 7);

        L.polyline(
          [
            [sp.lat, sp.lng],
            [leftPt.lat, leftPt.lng],
          ],
          { color: '#15803d', weight: 2.5, opacity: 0.85, dashArray: '3 4' }
        ).addTo(group);
        L.polyline(
          [
            [sp.lat, sp.lng],
            [rightPt.lat, rightPt.lng],
          ],
          { color: '#d97706', weight: 2.5, opacity: 0.85, dashArray: '3 4' }
        ).addTo(group);

        const leftGuide = L.divIcon({
          className: 'grampath-amx-side-l',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;border-radius:5px;background:#15803d;color:#fff;border:1.5px solid #fff;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(15,23,42,0.35);">L</div>`,
        });
        const rightGuide = L.divIcon({
          className: 'grampath-amx-side-r',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;border-radius:5px;background:#d97706;color:#fff;border:1.5px solid #fff;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(15,23,42,0.35);">R</div>`,
        });
        L.marker([leftPt.lat, leftPt.lng], { icon: leftGuide, interactive: false, zIndexOffset: 800 }).addTo(group);
        L.marker([rightPt.lat, rightPt.lng], { icon: rightGuide, interactive: false, zIndexOffset: 800 }).addTo(group);

        const simIcon = L.divIcon({
          className: 'grampath-sim-walker',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          html: `<div style="width:34px;height:34px;border-radius:999px;background:rgba(245,158,11,0.28);display:flex;align-items:center;justify-content:center;"><div style="width:24px;height:24px;border-radius:999px;background:#d97706;border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.2 9.5L6 7.5L1.8 9.5L6 1Z" fill="#ffffff"/></svg></div></div>`,
        });
        L.marker([sp.lat, sp.lng], {
          icon: simIcon,
          zIndexOffset: 950,
          rotateWithView: true,
          rotation: (sp.headingDeg * Math.PI) / 180,
        })
          .bindTooltip('Simulator Position (+Left / +Right)')
          .addTo(group);
      }
      return;
    }

    const { points, cursor, rewindIndex, isRunning, isPaused } = autoMapXOverlay;
    const isRewinding =
      rewindIndex != null && points.length > 0 && rewindIndex >= 0 && rewindIndex < points.length - 1;
    const activeCutoff = isRewinding ? rewindIndex! : points.length - 1;

    if (points.length >= 2) {
      const keptPts = points.slice(0, activeCutoff + 1);
      if (keptPts.length >= 2) {
        const keptLatLngs = keptPts.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(keptLatLngs, {
          color: '#312e81',
          weight: 10,
          opacity: 0.22,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group);

        L.polyline(keptLatLngs, {
          color: '#06b6d4',
          weight: 6,
          opacity: 0.96,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group);

        let accum = 0;
        for (let i = 1; i < keptPts.length; i++) {
          const a = keptPts[i - 1];
          const b = keptPts[i];
          accum += haversineMeters(a, b);
          if (accum >= 22) {
            accum = 0;
            const brg = calculateBearing(a, b);
            const arrowIcon = L.divIcon({
              className: 'grampath-amx-arrow',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
              html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.5 10L6 7.8L1.5 10L6 1Z" fill="#ffffff" stroke="#0891b2" stroke-width="1"/></svg></div>`,
            });
            L.marker([b.lat, b.lng], {
              icon: arrowIcon,
              interactive: false,
              rotateWithView: true,
              rotation: (brg * Math.PI) / 180,
            }).addTo(group);
          }
        }
      }

      if (isRewinding) {
        const tailPts = points.slice(activeCutoff);
        if (tailPts.length >= 2) {
          L.polyline(
            tailPts.map((p) => [p.lat, p.lng] as [number, number]),
            {
              color: '#ef4444',
              weight: 4.5,
              opacity: 0.72,
              dashArray: '6 6',
              lineCap: 'round',
              lineJoin: 'round',
            }
          )
            .bindTooltip('Will be trimmed on Resume From Here')
            .addTo(group);
        }
      }
    }

    // Connect last committed vertex smoothly to live floating cursor when not rewinding
    if (!isRewinding && points.length >= 1) {
      const lastCommitted = points[points.length - 1];
      if (haversineMeters(lastCommitted, cursor) >= 0.3) {
        L.polyline(
          [
            [lastCommitted.lat, lastCommitted.lng],
            [cursor.lat, cursor.lng],
          ],
          {
            color: '#06b6d4',
            weight: 6,
            opacity: 0.96,
            lineCap: 'round',
          }
        ).addTo(group);
      }
    }

    // Start Pin Badge
    const startOrigin = points[0] ?? cursor;
    const startBadge = L.divIcon({
      className: 'grampath-amx-start',
      iconSize: [44, 20],
      iconAnchor: [22, 10],
      html: `<div style="height:20px;padding:0 7px;border-radius:6px;background:#059669;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:700;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(15,23,42,0.35);">Start</div>`,
    });
    L.marker([startOrigin.lat, startOrigin.lng], { icon: startBadge, zIndexOffset: 520 })
      .bindTooltip(`Start: ${startOrigin.lat.toFixed(6)}, ${startOrigin.lng.toFixed(6)}`)
      .addTo(group);

    // Turn / Curve Moment Markers
    for (let i = 0; i <= activeCutoff && i < points.length; i++) {
      const pt = points[i];
      if (!pt.momentLabel || i === 0) continue;
      L.circleMarker([pt.lat, pt.lng], {
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: '#7c3aed',
        fillOpacity: 1,
      })
        .bindTooltip(`${pt.momentLabel} · ${Math.round(pt.cumulativeMeters)}m`)
        .addTo(group);
    }

    // Active Cursor (or Rewind Scrub Position) + 25m Ahead Heading Guide Ray
    const activeCursor =
      isRewinding && points[activeCutoff]
        ? {
            lat: points[activeCutoff].lat,
            lng: points[activeCutoff].lng,
            headingDeg: points[activeCutoff].headingDeg,
          }
        : cursor;

    const rayTip = offsetCoord(activeCursor, activeCursor.headingDeg, 26);
    L.polyline(
      [
        [activeCursor.lat, activeCursor.lng],
        [rayTip.lat, rayTip.lng],
      ],
      {
        color: isRewinding ? '#d97706' : '#7c3aed',
        weight: 3,
        opacity: 0.85,
        dashArray: '5 5',
        lineCap: 'round',
      }
    ).addTo(group);

    const cursorBg = isRewinding
      ? '#d97706'
      : isRunning && !isPaused
      ? '#7c3aed'
      : isPaused
      ? '#0284c7'
      : '#0f766e';
    const cursorHalo = isRewinding
      ? 'rgba(217,119,6,0.28)'
      : isRunning && !isPaused
      ? 'rgba(124,58,237,0.28)'
      : 'rgba(15,118,110,0.24)';

    const cursorIcon = L.divIcon({
      className: 'grampath-amx-cursor',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      html: `<div style="width:36px;height:36px;border-radius:999px;background:${cursorHalo};display:flex;align-items:center;justify-content:center;"><div style="width:24px;height:24px;border-radius:999px;background:${cursorBg};border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.2 9.5L6 7.5L1.8 9.5L6 1Z" fill="#ffffff"/></svg></div></div>`,
    });

    L.marker([activeCursor.lat, activeCursor.lng], {
      icon: cursorIcon,
      zIndexOffset: 950,
      rotateWithView: true,
      rotation: (activeCursor.headingDeg * Math.PI) / 180,
    })
      .bindTooltip(
        isRewinding
          ? `Rewind Moment (${Math.round(points[activeCutoff]?.cumulativeMeters ?? 0)}m)`
          : `AutoMapX · ${Math.round(activeCursor.headingDeg)}°`
      )
      .addTo(group);
  }, [autoMapXOverlay]);

  // Render Alternative Routes & Live Split Navigation Route (Walked Behind vs Remaining Ahead)
  useEffect(() => {
    const group = routeLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!targetHouse || !routeResult?.reachable || routeResult.polyline.length < 2) return;

    const shortestDist =
      alternativeRoutes.length > 0 && alternativeRoutes[0]?.reachable
        ? alternativeRoutes[0].totalDistanceMeters
        : routeResult.totalDistanceMeters;

    const altPalette = ['#475569', '#7c3aed', '#0891b2', '#b45309', '#be185d'];

    for (let idx = 0; idx < alternativeRoutes.length; idx++) {
      const alt = alternativeRoutes[idx];
      if (!alt.reachable || alt.polyline.length < 2 || alt === routeResult) continue;
      const altLatLngs = alt.polyline.map((p) => [p.lat, p.lng] as [number, number]);
      const altColor = idx === 0 ? '#059669' : altPalette[(idx - 1) % altPalette.length];
      const extraM = Math.max(0, alt.totalDistanceMeters - shortestDist);
      const shortTag =
        idx === 0
          ? `Shortest · ${formatDistance(alt.totalDistanceMeters)}`
          : `R${idx + 1} · ${formatDistance(alt.totalDistanceMeters)}${
              extraM > 0 ? ` (+${formatDistance(extraM)})` : ''
            }`;

      const altPoly = L.polyline(altLatLngs, {
        color: altColor,
        weight: 4.5,
        opacity: 0.72,
        dashArray: '7 6',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
      })
        .bindTooltip(`${shortTag} · Tap to select`, { sticky: true })
        .addTo(group);

      altPoly.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        onSelectRouteIndexRef.current?.(idx);
      });

      // Place a clickable midpoint label pill so users immediately see every alternative path
      const midIdx = Math.floor(alt.polyline.length / 2);
      const midPt = alt.polyline[midIdx];
      if (midPt) {
        const badgeIcon = L.divIcon({
          className: 'grampath-alt-route-badge',
          iconSize: [94, 22],
          iconAnchor: [47, 11],
          html: `<div style="height:22px;padding:0 7px;border-radius:6px;background:${
            idx === 0 ? '#ecfdf5' : '#ffffff'
          };color:${altColor};border:1.5px solid ${altColor};font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 2px 5px rgba(15,23,42,0.22);cursor:pointer;">${shortTag}</div>`,
        });
        const badgeMarker = L.marker([midPt.lat, midPt.lng], {
          icon: badgeIcon,
          zIndexOffset: 380,
        }).addTo(group);
        badgeMarker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          onSelectRouteIndexRef.current?.(idx);
        });
      }
    }

    // Already covered behind user
    if (liveProgress && liveProgress.completedPolyline.length >= 2) {
      const doneLatLngs = liveProgress.completedPolyline.map(
        (p) => [p.lat, p.lng] as [number, number]
      );
      L.polyline(doneLatLngs, {
        color: '#94a3b8',
        weight: 5,
        opacity: 0.7,
        dashArray: '4 6',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(group);
    }

    // Remaining road ahead of user
    const aheadPts =
      liveProgress && liveProgress.remainingPolyline.length >= 2
        ? liveProgress.remainingPolyline
        : routeResult.polyline;
    const aheadLatLngs = aheadPts.map((p) => [p.lat, p.lng] as [number, number]);

    L.polyline(aheadLatLngs, {
      color: '#1e1b4b',
      weight: 10,
      opacity: 0.22,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(group);

    L.polyline(aheadLatLngs, {
      color: '#2563eb',
      weight: 6,
      opacity: 0.96,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(group);

    if ((startHouse || alternativeRoutes.length > 1) && routeResult.polyline.length >= 2) {
      const selMidPt = routeResult.polyline[Math.floor(routeResult.polyline.length / 2)];
      if (selMidPt) {
        const activeLabel = `${routeResult.routeLabel ?? 'Selected'} · ${formatDistance(
          routeResult.totalDistanceMeters
        )}`;
        const selIcon = L.divIcon({
          className: 'grampath-active-route-badge',
          iconSize: [132, 24],
          iconAnchor: [66, 12],
          html: `<div style="height:24px;padding:0 8px;border-radius:6px;background:#1d4ed8;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,0.35);">${activeLabel}</div>`,
        });
        L.marker([selMidPt.lat, selMidPt.lng], {
          icon: selIcon,
          interactive: false,
          zIndexOffset: 420,
        }).addTo(group);
      }
    }

    // Subtle directional chevrons every ~26m along remaining route so road direction is unmistakable
    let accum = 0;
    for (let i = 1; i < aheadPts.length; i++) {
      const a = aheadPts[i - 1];
      const b = aheadPts[i];
      const segLen = haversineMeters(a, b);
      accum += segLen;
      if (accum >= 26) {
        accum = 0;
        const brg = calculateBearing(a, b);
        const arrowIcon = L.divIcon({
          className: 'grampath-route-arrow',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1L10.5 10L6 7.8L1.5 10L6 1Z" fill="#ffffff" stroke="#1d4ed8" stroke-width="1"/></svg></div>`,
        });
        L.marker([b.lat, b.lng], {
          icon: arrowIcon,
          interactive: false,
          rotateWithView: true,
          rotation: (brg * Math.PI) / 180,
        }).addTo(group);
      }
    }

    // Show clean visual pins at actual turns and curves along the selected route
    for (const inst of routeResult.instructions) {
      if (inst.turnType === 'depart' || inst.turnType === 'arrive' || inst.turnType === 'straight') {
        continue;
      }
      const isCurve = inst.turnType === 'slight_left' || inst.turnType === 'slight_right';
      const isNextAnchor =
        liveProgress?.nextInstruction?.id === inst.id || activeInstruction?.id === inst.id;
      L.circleMarker([inst.anchorPoint.lat, inst.anchorPoint.lng], {
        radius: isNextAnchor ? 7 : 5,
        color: '#ffffff',
        weight: 2,
        fillColor: isCurve ? '#0ea5e9' : '#f59e0b',
        fillOpacity: 1,
      })
        .bindTooltip(inst.instruction)
        .addTo(group);
    }

    // Start house (Point A) dotted connector + dot when checking route between 2 houses in Preview
    if (startHouse && routeResult.polyline.length >= 1) {
      const startRoadPt = routeResult.polyline[0];
      L.polyline(
        [
          [startHouse.lat, startHouse.lng],
          [startRoadPt.lat, startRoadPt.lng],
        ],
        {
          color: '#0284c7',
          weight: 2.5,
          opacity: 0.9,
          dashArray: '3 5',
          lineCap: 'round',
        }
      ).addTo(group);

      L.circleMarker([startRoadPt.lat, startRoadPt.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#059669',
        fillOpacity: 1,
      })
        .bindTooltip(
          `Start: House ${startHouse.houseNumber}${
            startHouse.shopName ? ` (${startHouse.shopName})` : ''
          }`
        )
        .addTo(group);
    }

    // End route strictly on the road with a clear stop dot + dotted pointer beside it to the house
    const routeEndPt = aheadPts[aheadPts.length - 1];
    if (routeEndPt) {
      L.polyline(
        [
          [routeEndPt.lat, routeEndPt.lng],
          [targetHouse.lat, targetHouse.lng],
        ],
        {
          color: '#dc2626',
          weight: 2.5,
          opacity: 0.9,
          dashArray: '3 5',
          lineCap: 'round',
        }
      ).addTo(group);

      L.circleMarker([routeEndPt.lat, routeEndPt.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#2563eb',
        fillOpacity: 1,
      })
        .bindTooltip(
          `Stop here on road · House ${targetHouse.houseNumber}${
            targetHouse.shopName ? ` (${targetHouse.shopName})` : ''
          } (${targetHouse.side === 'left' ? 'Left' : 'Right'})`
        )
        .addTo(group);
    }
  }, [routeResult, alternativeRoutes, liveProgress, startHouse, targetHouse, activeInstruction]);

  // Render Live GPS User Position + Heading Arrow (rotates accurately with map view)
  useEffect(() => {
    const group = gpsLayerRef.current;
    if (!group) return;
    group.clearLayers();

    if (currentGps.accuracy && currentGps.accuracy > 0 && currentGps.accuracy < 150) {
      L.circle([currentGps.lat, currentGps.lng], {
        radius: currentGps.accuracy,
        color: '#0284c7',
        weight: 1,
        fillColor: '#38bdf8',
        fillOpacity: 0.16,
      }).addTo(group);
    }

    if (userHeadingDeg != null && Number.isFinite(userHeadingDeg)) {
      const arrowIcon = L.divIcon({
        className: 'grampath-user-heading',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:999px;background:rgba(2,132,199,0.22);display:flex;align-items:center;justify-content:center;"><div style="width:20px;height:20px;border-radius:999px;background:#0284c7;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5L9.8 9.5L6 7.5L2.2 9.5L6 1.5Z" fill="#ffffff"/></svg></div></div>`,
      });
      L.marker([currentGps.lat, currentGps.lng], {
        icon: arrowIcon,
        rotateWithView: true,
        rotation: (userHeadingDeg * Math.PI) / 180,
      })
        .bindTooltip('You (Moving)')
        .addTo(group);
    } else {
      L.circleMarker([currentGps.lat, currentGps.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#0284c7',
        fillOpacity: 1,
      })
        .bindTooltip('You')
        .addTo(group);
    }
  }, [currentGps, userHeadingDeg]);

  return (
    <div
      className={`relative w-full h-full ${baseLayer !== 'satellite' ? 'grampath-dark-osm' : ''}`}
    >
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Live GPS Precision Readout & Quick Controls (Top Left) */}
      <div
        className={`absolute ${
          topControlsOffset ? 'top-14' : 'top-2.5'
        } left-2.5 z-[450] pointer-events-none flex flex-col gap-1 items-start transition-all`}
      >
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div
            className={`px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-mono tabular-nums font-semibold shadow-sm border whitespace-nowrap ${
              gpsQuality.quality === 'ultra'
                ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700'
                : gpsQuality.quality === 'good'
                ? 'bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                : 'bg-amber-50/95 dark:bg-amber-950/90 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
            }`}
          >
            GPS {gpsQuality.label}
            {gpsQuality.quality === 'ultra' ? ' · ≤5m' : ''}
          </div>

          {onCenterGps && (
            <button
              type="button"
              onClick={onCenterGps}
              title={
                isFollowingGps
                  ? 'Following live GPS (drag map for free mode)'
                  : 'Free map mode — tap to re-center on GPS'
              }
              className={`px-2.5 py-1 rounded-lg border shadow-sm cursor-pointer inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold transition-colors ${
                isFollowingGps
                  ? 'bg-sky-600 text-white border-sky-700 hover:bg-sky-700'
                  : 'bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isFollowingGps ? 'Follow' : 'Center'}</span>
            </button>
          )}
        </div>

        {isolateNavigation && targetHouse && onExitNavigation && (
          <button
            type="button"
            onClick={onExitNavigation}
            className="pointer-events-auto px-2.5 py-1 rounded-lg bg-white/95 dark:bg-slate-900/95 hover:bg-red-50 dark:hover:bg-red-950/70 text-red-700 dark:text-red-400 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold shadow-sm cursor-pointer whitespace-nowrap"
          >
            Exit {targetHouse.houseNumber} · Show All
          </button>
        )}
      </div>

      {/* Layer Switcher & Map Rotation / Compass Controls (Top Right) */}
      <div
        className={`absolute ${
          topControlsOffset ? 'top-14' : 'top-2.5'
        } right-2.5 z-[400] flex flex-col items-end gap-1.5 transition-all`}
      >
        <div className="flex items-center gap-0.5 p-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
          {(Object.keys(TILE_LAYERS) as BaseLayerId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => handleSelectBaseLayer(id)}
              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                baseLayer === id
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {TILE_LAYERS[id].label}
            </button>
          ))}
        </div>

        {/* Map Rotation Bar: Free Twist/Rotate or North-Up / Heading-Up */}
        <div className="flex items-center gap-0.5 p-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
          <button
            type="button"
            onClick={() => setBearingManually(mapBearing - 45)}
            title="Rotate map left 45° (or two-finger twist)"
            className="p-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (targetHouse && !autoRotateHeading && mapBearing === 0) {
                setAutoRotateHeading(true);
              } else {
                setBearingManually(0);
              }
            }}
            title={
              autoRotateHeading
                ? 'Heading-Up active · Tap for North-Up'
                : mapBearing !== 0
                ? 'Rotated · Tap to reset North-Up'
                : targetHouse
                ? 'North-Up (Default) · Tap for Heading-Up auto-rotate'
                : 'North-Up'
            }
            className={`px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 text-[10px] font-semibold cursor-pointer transition-colors ${
              autoRotateHeading
                ? 'bg-emerald-700 text-white'
                : mapBearing !== 0
                ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Compass
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: `rotate(${mapBearing}deg)` }}
            />
            <span className="font-mono tabular-nums">
              {autoRotateHeading ? 'Dir' : mapBearing !== 0 ? `${mapBearing}°` : 'N'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBearingManually(mapBearing + 45)}
            title="Rotate map right 45° (or two-finger twist)"
            className="p-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Real-Time Turn + Remaining Distance + Movement Status HUD */}
      {targetHouse && activeInstruction && (() => {
        const isArrivedStep = activeInstruction.turnType === 'arrive';
        const upcomingInst =
          !isArrivedStep && liveProgress?.nextInstruction ? liveProgress.nextInstruction : null;
        const hudTurnType = upcomingInst ? upcomingInst.turnType : activeInstruction.turnType;
        const hudMainText = upcomingInst ? upcomingInst.instruction : activeInstruction.instruction;
        return (
          <div
            className={`absolute ${
              topControlsOffset ? 'top-[96px] md:top-[60px]' : 'top-14'
            } left-1/2 -translate-x-1/2 z-[460] w-[calc(100%-1rem)] max-w-md pointer-events-none`}
          >
            <div className="px-3.5 py-2.5 rounded-xl shadow-lg bg-slate-900/95 backdrop-blur-sm text-white space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <TurnIcon turn={hudTurnType} className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                    <span className="text-emerald-300 font-semibold">
                      {isArrivedStep
                        ? `Target: House ${targetHouse.houseNumber}${
                            targetHouse.shopName ? ` · ${targetHouse.shopName}` : ''
                          }`
                        : distanceToNextTurnMeters != null
                        ? `In ${formatDistance(distanceToNextTurnMeters)}`
                        : formatDistance(activeInstruction.distanceMeters)}
                    </span>
                    {liveProgress && (
                      <span className="text-sky-300 font-semibold">
                        {formatDistance(liveProgress.remainingMeters)} left ·{' '}
                        {liveProgress.remainingWalkMinutes}m
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-bold leading-snug truncate">
                    {hudMainText}
                  </div>
                  {upcomingInst && (
                    <div className="text-[10px] text-slate-300 truncate">
                      Now: {activeInstruction.instruction}
                    </div>
                  )}
                </div>
              </div>

            {liveProgress && (
              <div className="flex items-center justify-between text-[11px] border-t border-white/15 pt-1">
                <span
                  className={`font-semibold ${
                    liveProgress.movementStatus === 'away'
                      ? 'text-amber-300'
                      : liveProgress.movementStatus === 'towards'
                      ? 'text-emerald-300'
                      : 'text-slate-300'
                  }`}
                >
                  {liveProgress.movementStatus === 'away'
                    ? 'Moving away · Turn back toward route'
                    : liveProgress.movementStatus === 'towards'
                    ? `Moving toward House ${targetHouse.houseNumber}`
                    : liveProgress.offRouteMeters > 12
                    ? `Off road by ${liveProgress.offRouteMeters} m`
                    : `On road · ${formatDistance(liveProgress.coveredMeters)} walked`}
                </span>
                <span className="font-mono tabular-nums text-slate-300">
                  {targetHouse.side === 'left' ? 'Left Side' : 'Right Side'}
                </span>
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

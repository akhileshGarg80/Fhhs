import {
  ChevronDown,
  ChevronUp,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  Moon,
  Navigation,
  PlusCircle,
  Route,
  Search,
  Store,
  Sun,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddWalkWorkspace, { type StraightSymbolAction } from './components/AddWalkWorkspace.tsx';
import AutoMapXWorkspace, {
  type AutoMapXSubMode,
  type AutoMapXSymbolAction,
} from './components/AutoMapXWorkspace.tsx';
import AutoWorkspace from './components/AutoWorkspace.tsx';
import NavigationPanel from './components/NavigationPanel.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import SavedDataView from './components/SavedDataView.tsx';
import VillageMap, {
  type AutoMapXOverlay,
  type AutoTripOverlay,
  type MapInteractionMode,
} from './components/VillageMap.tsx';
import type {
  AutoMapXNode,
  AutoTrip,
  CaptureMode,
  HouseSide,
  JunctionDirection,
  JunctionWayCount,
  LatLngPoint,
  RoadJunction,
  VillageHouse,
  VillageRoad,
} from './types/map.ts';
import {
  autoLinkNewRoadsToNetwork,
  buildJunctionBranches,
  buildSimulatorWaypoints,
  calculateBearing,
  collectPendingJunctionBranches,
  computeLiveRouteProgress,
  computePathDistance,
  directionLabel,
  directionOffsetDeg,
  findRoutesToHouse,
  formatDistance,
  getNextSequentialHouseNumber,
  haversineMeters,
  offsetCoord,
} from './utils/geo.ts';
import {
  type GpsPrecisionMode,
  PrecisionGpsSmoother,
  evaluateGpsFix,
} from './utils/gpsFilter.ts';
import {
  type NominatimSearchResult,
  reverseGeocodeVillage,
  searchPlaceNominatim,
} from './utils/osmClient.ts';
import {
  clearLocalStore,
  loadAutoTrips,
  loadLocalStore,
  saveAutoTrips,
  saveLocalStore,
} from './utils/storage.ts';

type WorkspaceMode = 'navigate' | 'add' | 'automapx' | 'auto' | 'preview';

const DRAFT_WALK_KEY = 'grampath_walk_draft_v2';

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>('navigate');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('grampath_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('grampath_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // LocalStorage data (roads + left/right houses + independent auto trips)
  const initialStore = useMemo(() => loadLocalStore(), []);
  const initialAutoTrips = useMemo(() => loadAutoTrips(), []);
  const [roads, setRoads] = useState<VillageRoad[]>(initialStore.roads);
  const [houses, setHouses] = useState<VillageHouse[]>(initialStore.houses);
  const [autoTrips, setAutoTrips] = useState<AutoTrip[]>(initialAutoTrips);
  const [selectedAutoTripId, setSelectedAutoTripId] = useState<string | null>(
    () => initialAutoTrips[0]?.id ?? null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    saveLocalStore({ roads, houses });
  }, [roads, houses]);

  useEffect(() => {
    saveAutoTrips(autoTrips);
  }, [autoTrips]);

  // Search 1 (Navigate only): Village / Location Search
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<NominatimSearchResult[]>([]);
  const [isSearchingArea, setIsSearchingArea] = useState(false);

  // Search 2 (Navigate only): House Number Search
  const [houseQuery, setHouseQuery] = useState('');
  const [houseDropdownOpen, setHouseDropdownOpen] = useState(false);

  // Accurate GPS State (Max 5m filter by default with Kalman smoothing)
  const [gpsPrecisionMode, setGpsPrecisionMode] = useState<GpsPrecisionMode>('accurate_5m');
  const [userLocation, setUserLocation] = useState<LatLngPoint>({
    lat: 24.9852,
    lng: 82.0625,
    accuracy: 3.0,
  });
  const [isLiveGps, setIsLiveGps] = useState(false);
  const [isPickingSpot, setIsPickingSpot] = useState(false);
  const [userHeadingDeg, setUserHeadingDeg] = useState<number | null>(null);
  const [navOrigin, setNavOrigin] = useState<{ lat: number; lng: number }>({
    lat: 24.9852,
    lng: 82.0625,
  });
  const navWatchIdRef = useRef<number | null>(null);
  const lastNavGpsRef = useRef<LatLngPoint | null>(null);
  const lastAddGpsRef = useRef<LatLngPoint | null>(null);
  const lastCompassUpdateRef = useRef<number>(0);
  const gpsSmootherRef = useRef(new PrecisionGpsSmoother());

  const gpsQuality = useMemo(
    () => evaluateGpsFix(userLocation.accuracy, gpsPrecisionMode),
    [userLocation.accuracy, gpsPrecisionMode]
  );

  const mapViewRef = useRef<{ lat: number; lng: number; zoom: number; bearing?: number }>({
    lat: 24.986,
    lng: 82.0633,
    zoom: 18,
    bearing: 0,
  });
  const autoFollowGpsRef = useRef(true);
  const [isFollowingGps, setIsFollowingGps] = useState(true);

  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    boundsPoints?: { lat: number; lng: number }[];
    key: number;
  } | null>(null);

  // Live Turn-by-Turn Navigation State
  const [targetHouse, setTargetHouse] = useState<VillageHouse | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [currentNavStepIdx, setCurrentNavStepIdx] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSimulatingNav, setIsSimulatingNav] = useState(false);
  const simIdxRef = useRef<number>(0);
  const lastSpokenRef = useRef<number>(-1);
  const arrivedHouseIdRef = useRef<string | null>(null);

  // Preview 2-Point Comparison State (House A -> House B)
  const [previewFromHouseId, setPreviewFromHouseId] = useState<string | null>(null);
  const [previewToHouseId, setPreviewToHouseId] = useState<string | null>(null);
  const [previewSelectedRouteIndex, setPreviewSelectedRouteIndex] = useState(0);

  // Add / Walk & Multi-Branch Junction State
  const [captureMode, setCaptureMode] = useState<CaptureMode>('straight_walk');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [walkSegments, setWalkSegments] = useState<LatLngPoint[][]>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_WALK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          segments?: LatLngPoint[][];
          points?: LatLngPoint[];
        };
        if (Array.isArray(parsed.segments)) return parsed.segments;
        if (Array.isArray(parsed.points) && parsed.points.length > 0) return [parsed.points];
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [draftHouses, setDraftHouses] = useState<VillageHouse[]>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_WALK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { draftHouses?: VillageHouse[] };
        return Array.isArray(parsed.draftHouses) ? parsed.draftHouses : [];
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [draftJunctions, setDraftJunctions] = useState<RoadJunction[]>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_WALK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { draftJunctions?: RoadJunction[] };
        return Array.isArray(parsed.draftJunctions) ? parsed.draftJunctions : [];
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [activeLinkedBranch, setActiveLinkedBranch] = useState<{
    junctionId: string;
    branchId: string;
    label: string;
  } | null>(null);
  const [segmentBranchLabels, setSegmentBranchLabels] = useState<Record<number, string>>({});
  const [straightHeadingDeg, setStraightHeadingDeg] = useState<number | null>(null);
  const straightHeadingRef = useRef<number | null>(null);
  const straightAnchorCountRef = useRef<number>(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [detectedVillage, setDetectedVillage] = useState('Koraon Gram');
  const walkWatchIdRef = useRef<number | null>(null);
  const lastAcceptedWalkTsRef = useRef<number>(0);
  const lastReverseRef = useRef<{ lat: number; lng: number } | null>(null);
  const recordingStateRef = useRef({
    isRecording,
    isPaused,
    gpsPrecisionMode,
    captureMode,
  });
  recordingStateRef.current = { isRecording, isPaused, gpsPrecisionMode, captureMode };

  // Auto Trip Recording & Slow At-Home Simulator State
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoPoints, setAutoPoints] = useState<LatLngPoint[]>([]);
  const [autoElapsedSeconds, setAutoElapsedSeconds] = useState(0);
  const [autoStartedAt, setAutoStartedAt] = useState<string | null>(null);
  const [autoGpsError, setAutoGpsError] = useState<string | null>(null);
  const [autoSimPoint, setAutoSimPoint] = useState<{
    lat: number;
    lng: number;
    headingDeg: number;
  } | null>(null);
  const autoWatchIdRef = useRef<number | null>(null);
  const lastAutoGpsRef = useRef<LatLngPoint | null>(null);
  const lastAcceptedAutoTsRef = useRef<number>(0);
  const autoStateRef = useRef({ isAutoRecording, isAutoPaused, gpsPrecisionMode });
  autoStateRef.current = { isAutoRecording, isAutoPaused, gpsPrecisionMode };

  // AutoMapX Virtual GPS Path Mapper State (start anywhere on map or live GPS, control speed, turns & rewind)
  const [amxCursor, setAmxCursor] = useState<{ lat: number; lng: number; headingDeg: number }>({
    lat: 24.9852,
    lng: 82.0625,
    headingDeg: 0,
  });
  const [amxPoints, setAmxPoints] = useState<AutoMapXNode[]>([]);
  const [amxSpeedMps, setAmxSpeedMps] = useState<number>(3.0);
  const [amxIsRunning, setAmxIsRunning] = useState(false);
  const [amxIsPaused, setAmxIsPaused] = useState(false);
  const [amxElapsedSeconds, setAmxElapsedSeconds] = useState(0);
  const [amxPickingStart, setAmxPickingStart] = useState(true);
  const [amxRewindIdx, setAmxRewindIdx] = useState<number | null>(null);
  const [amxDraftHouses, setAmxDraftHouses] = useState<VillageHouse[]>([]);
  const [amxSubMode, setAmxSubMode] = useState<AutoMapXSubMode>('build');
  const [amxSimRoadId, setAmxSimRoadId] = useState<string | null>(null);
  const [amxSimPoint, setAmxSimPoint] = useState<{
    lat: number;
    lng: number;
    headingDeg: number;
  } | null>(null);
  const [amxSimJumpRequest, setAmxSimJumpRequest] = useState<{
    lat: number;
    lng: number;
    key: number;
  } | null>(null);

  const amxCursorRef = useRef(amxCursor);
  amxCursorRef.current = amxCursor;
  const amxPointsRef = useRef(amxPoints);
  amxPointsRef.current = amxPoints;
  const amxSpeedRef = useRef(amxSpeedMps);
  amxSpeedRef.current = amxSpeedMps;
  const amxLastTickRef = useRef<number>(Date.now());
  const amxTotalMetersRef = useRef<number>(0);
  const amxWatchIdRef = useRef<number | null>(null);
  const lastAmxGpsRef = useRef<LatLngPoint | null>(null);
  const amxModeRef = useRef(mode);
  amxModeRef.current = mode;

  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    try {
      const hasPoints = walkSegments.some((seg) => seg.length > 0);
      if (hasPoints || draftHouses.length > 0 || draftJunctions.length > 0) {
        localStorage.setItem(
          DRAFT_WALK_KEY,
          JSON.stringify({ segments: walkSegments, draftHouses, draftJunctions })
        );
      } else {
        localStorage.removeItem(DRAFT_WALK_KEY);
      }
    } catch {
      // ignore
    }
  }, [walkSegments, draftHouses, draftJunctions]);

  // PWA Screen Wake Lock: keeps mobile screen & GPS radio active at 1Hz while walking, auto-recording, or live navigating
  useEffect(() => {
    const keepAwake =
      (mode === 'add' && isRecording && !isPaused) ||
      (isAutoRecording && !isAutoPaused) ||
      (amxIsRunning && !amxIsPaused) ||
      (mode === 'navigate' && isLiveGps);
    if (!keepAwake || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const requestLock = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // ignore if battery saver or iframe blocks wake lock
      }
    };
    requestLock();

    const onVisChange = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisChange);
      if (sentinel) {
        sentinel.release().catch(() => {});
      }
    };
  }, [mode, isRecording, isPaused, isAutoRecording, isAutoPaused, amxIsRunning, amxIsPaused, isLiveGps]);

  // Device Compass Fallback when GPS speed is zero
  useEffect(() => {
    const active = mode === 'add' || mode === 'auto' || isAutoRecording || isLiveGps;
    if (!active || typeof window === 'undefined') return;

    const handleOrientation = (ev: DeviceOrientationEvent) => {
      const now = Date.now();
      if (now - lastCompassUpdateRef.current < 350) return;
      const webkitHeading = (ev as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let heading: number | null = null;
      if (typeof webkitHeading === 'number' && Number.isFinite(webkitHeading)) {
        heading = webkitHeading;
      } else if (ev.absolute && typeof ev.alpha === 'number' && Number.isFinite(ev.alpha)) {
        heading = (360 - ev.alpha) % 360;
      }
      if (heading != null) {
        lastCompassUpdateRef.current = now;
        setUserHeadingDeg((prev) => prev ?? Math.round(heading!));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [mode, isLiveGps]);

  const maybeDetectVillage = useCallback(async (lat: number, lng: number) => {
    const prev = lastReverseRef.current;
    if (prev && haversineMeters(prev, { lat, lng }) < 800) return;
    lastReverseRef.current = { lat, lng };
    const name = await reverseGeocodeVillage(lat, lng);
    if (name) setDetectedVillage(name);
  }, []);

  // Live GPS Watcher in Navigate mode (Kalman smoothed + heading + spike rejection)
  useEffect(() => {
    if (!isLiveGps) {
      if (navWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(navWatchIdRef.current);
        navWatchIdRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) {
      showToast('GPS unavailable in this browser. Tap Set Spot on Map instead.');
      setIsLiveGps(false);
      return;
    }
    gpsSmootherRef.current.reset();
    navWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const nowTs = pos.timestamp || Date.now();
        const rawPt: LatLngPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: nowTs,
        };
        const prevPt = lastNavGpsRef.current;
        const ageMs = prevPt?.timestamp ? nowTs - prevPt.timestamp : Infinity;
        if (
          rawPt.accuracy != null &&
          rawPt.accuracy > 35 &&
          prevPt &&
          (prevPt.accuracy ?? 99) < 20 &&
          ageMs < 12000
        ) {
          return;
        }

        const smoothed = gpsSmootherRef.current.update(rawPt, prevPt?.timestamp);
        if (
          pos.coords.heading != null &&
          Number.isFinite(pos.coords.heading) &&
          pos.coords.speed != null &&
          pos.coords.speed >= 0.5
        ) {
          setUserHeadingDeg(pos.coords.heading);
        } else if (prevPt && haversineMeters(prevPt, smoothed) >= 1.5) {
          setUserHeadingDeg(calculateBearing(prevPt, smoothed));
        }

        lastNavGpsRef.current = smoothed;
        setUserLocation(smoothed);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: smoothed.lat, lng: smoothed.lng, key: Date.now() });
        }
        maybeDetectVillage(smoothed.lat, smoothed.lng);
      },
      () => {
        showToast('Could not read GPS. Tap Set Spot on Map to place your marker.');
        setIsLiveGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
    return () => {
      if (navWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(navWatchIdRef.current);
        navWatchIdRef.current = null;
      }
    };
  }, [isLiveGps, maybeDetectVillage, showToast]);

  // Walk Timer
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const t = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording, isPaused]);

  // Auto Trip Timer
  useEffect(() => {
    if (!isAutoRecording || isAutoPaused) return;
    const t = setInterval(() => setAutoElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isAutoRecording, isAutoPaused]);

  // AutoMapX Live GPS Watcher (keeps real-time GPS visible on map while using AutoMapX)
  useEffect(() => {
    if (mode !== 'automapx') {
      if (amxWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(amxWatchIdRef.current);
        amxWatchIdRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) return;
    gpsSmootherRef.current.reset();
    amxWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const rawPt: LatLngPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        };
        const prevPt = lastAmxGpsRef.current;
        const smoothed = gpsSmootherRef.current.update(rawPt, prevPt?.timestamp);
        if (
          pos.coords.heading != null &&
          Number.isFinite(pos.coords.heading) &&
          pos.coords.speed != null &&
          pos.coords.speed >= 0.5
        ) {
          setUserHeadingDeg(pos.coords.heading);
        } else if (prevPt && haversineMeters(prevPt, smoothed) >= 1.5) {
          setUserHeadingDeg(calculateBearing(prevPt, smoothed));
        }
        lastAmxGpsRef.current = smoothed;
        setUserLocation(smoothed);
        if (amxPointsRef.current.length === 0 && !amxIsRunning) {
          const nextCur = {
            lat: smoothed.lat,
            lng: smoothed.lng,
            headingDeg: amxCursorRef.current.headingDeg,
          };
          amxCursorRef.current = nextCur;
          setAmxCursor(nextCur);
        }
        maybeDetectVillage(smoothed.lat, smoothed.lng);
      },
      () => {
        // Silent fallback: user can still pick any start spot on map
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
    return () => {
      if (amxWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(amxWatchIdRef.current);
        amxWatchIdRef.current = null;
      }
    };
  }, [mode, maybeDetectVillage]);

  // AutoMapX Elapsed Timer
  useEffect(() => {
    if (!amxIsRunning || amxIsPaused || amxRewindIdx != null) return;
    const t = setInterval(() => setAmxElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [amxIsRunning, amxIsPaused, amxRewindIdx]);

  // AutoMapX Real-Time Virtual GPS Movement Engine (generates & appends lat/lng at chosen speed)
  useEffect(() => {
    if (!amxIsRunning || amxIsPaused || amxRewindIdx != null) return;

    amxLastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.6, Math.max(0.05, (now - amxLastTickRef.current) / 1000));
      amxLastTickRef.current = now;

      const cur = amxCursorRef.current;
      const spd = amxSpeedRef.current;
      const stepM = spd * dt;
      if (stepM <= 0.01) return;

      const moved = offsetCoord(cur, cur.headingDeg, stepM);
      const nextCursor = {
        lat: moved.lat,
        lng: moved.lng,
        headingDeg: cur.headingDeg,
      };
      amxCursorRef.current = nextCursor;
      setAmxCursor(nextCursor);

      const prevPts = amxPointsRef.current;
      const lastNode = prevPts[prevPts.length - 1];
      const deltaFromLast = lastNode ? haversineMeters(lastNode, nextCursor) : 0;

      if (!lastNode || deltaFromLast >= 1.5) {
        const nextTotal = (lastNode?.cumulativeMeters ?? 0) + deltaFromLast;
        amxTotalMetersRef.current = nextTotal;
        const newNode: AutoMapXNode = {
          lat: nextCursor.lat,
          lng: nextCursor.lng,
          accuracy: 1.5,
          timestamp: now,
          headingDeg: nextCursor.headingDeg,
          cumulativeMeters: nextTotal,
          speedMps: spd,
          momentLabel: !lastNode ? 'Start' : undefined,
        };
        const updatedPts = [...prevPts, newNode];
        amxPointsRef.current = updatedPts;
        setAmxPoints(updatedPts);
      }

      if (autoFollowGpsRef.current && amxModeRef.current === 'automapx') {
        setFocusTarget({ lat: nextCursor.lat, lng: nextCursor.lng, key: now });
      }
    }, 200);

    return () => clearInterval(timer);
  }, [amxIsRunning, amxIsPaused, amxRewindIdx]);

  // Live GPS Watcher for Auto Trips Mode (records points continuously until Close & Save)
  useEffect(() => {
    if (mode !== 'auto' && !isAutoRecording) {
      if (autoWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(autoWatchIdRef.current);
        autoWatchIdRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) {
      setAutoGpsError('Geolocation unavailable in this browser.');
      return;
    }
    setAutoGpsError(null);
    gpsSmootherRef.current.reset();

    autoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const {
          isAutoRecording: activeAuto,
          isAutoPaused: pausedAuto,
          gpsPrecisionMode: pMode,
        } = autoStateRef.current;

        const rawPt: LatLngPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        };
        const prevPt = lastAutoGpsRef.current;
        const quality = evaluateGpsFix(rawPt.accuracy, pMode);
        const smoothed = gpsSmootherRef.current.update(rawPt, prevPt?.timestamp);

        if (
          pos.coords.heading != null &&
          Number.isFinite(pos.coords.heading) &&
          pos.coords.speed != null &&
          pos.coords.speed >= 0.5
        ) {
          setUserHeadingDeg(pos.coords.heading);
        } else if (prevPt && haversineMeters(prevPt, smoothed) >= 1.5) {
          setUserHeadingDeg(calculateBearing(prevPt, smoothed));
        }

        lastAutoGpsRef.current = smoothed;
        setUserLocation(smoothed);
        if (activeAuto && !pausedAuto && autoFollowGpsRef.current) {
          setFocusTarget({ lat: smoothed.lat, lng: smoothed.lng, key: Date.now() });
        }
        maybeDetectVillage(smoothed.lat, smoothed.lng);

        if (!activeAuto || pausedAuto) return;

        const nowTs = rawPt.timestamp || Date.now();
        const fallbackSmoothOk =
          rawPt.accuracy != null &&
          rawPt.accuracy <= 12.0 &&
          nowTs - lastAcceptedAutoTsRef.current >= 2500;

        if (!quality.accepted && !fallbackSmoothOk) {
          setAutoGpsError(
            pMode === 'accurate_5m'
              ? 'Waiting for ≤5m GPS lock outdoors'
              : 'Weak GPS (>15m). Move to open sky'
          );
          return;
        }
        setAutoGpsError(null);
        lastAcceptedAutoTsRef.current = nowTs;

        const minStepMeters = pMode === 'accurate_5m' ? 1.5 : 2.5;
        setAutoPoints((prev) => {
          if (prev.length === 0) return [smoothed];
          const lastPt = prev[prev.length - 1];
          if (haversineMeters(lastPt, smoothed) < minStepMeters) return prev;
          return [...prev, smoothed];
        });
      },
      (err) => {
        setAutoGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'GPS permission denied. Use +Step to test.'
            : `Waiting for GPS: ${err.message}`
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    return () => {
      if (autoWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(autoWatchIdRef.current);
        autoWatchIdRef.current = null;
      }
    };
  }, [mode, isAutoRecording, maybeDetectVillage]);

  // Live GPS Watcher in Add Mode
  useEffect(() => {
    if (mode !== 'add' || (captureMode !== 'gps_walk' && captureMode !== 'straight_walk')) {
      if (walkWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(walkWatchIdRef.current);
        walkWatchIdRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation unavailable. Use Tap or Test Walk.');
      return;
    }
    setGpsError(null);
    gpsSmootherRef.current.reset();

    walkWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const {
          isRecording: activeRec,
          isPaused: pausedRec,
          gpsPrecisionMode: pMode,
          captureMode: cMode,
        } = recordingStateRef.current;

        const rawPt: LatLngPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        };
        const prevPt = lastAddGpsRef.current;
        const quality = evaluateGpsFix(rawPt.accuracy, pMode);
        const smoothed = gpsSmootherRef.current.update(rawPt, prevPt?.timestamp);

        if (
          pos.coords.heading != null &&
          Number.isFinite(pos.coords.heading) &&
          pos.coords.speed != null &&
          pos.coords.speed >= 0.5
        ) {
          setUserHeadingDeg(pos.coords.heading);
        } else if (prevPt && haversineMeters(prevPt, smoothed) >= 1.5) {
          setUserHeadingDeg(calculateBearing(prevPt, smoothed));
        }

        lastAddGpsRef.current = smoothed;
        setUserLocation(smoothed);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: smoothed.lat, lng: smoothed.lng, key: Date.now() });
        }
        maybeDetectVillage(smoothed.lat, smoothed.lng);

        const nowTs = rawPt.timestamp || Date.now();
        const fallbackSmoothOk =
          rawPt.accuracy != null &&
          rawPt.accuracy <= 12.0 &&
          nowTs - lastAcceptedWalkTsRef.current >= 2500;

        if (!quality.accepted && !fallbackSmoothOk) {
          if (activeRec && !pausedRec) {
            setGpsError(
              pMode === 'accurate_5m'
                ? 'Waiting for ≤5m GPS lock outdoors'
                : 'Weak GPS (>15m). Move to open sky'
            );
          }
          return;
        }
        if (quality.accepted) {
          setGpsError(null);
        } else if (activeRec && !pausedRec) {
          setGpsError(
            `GPS ±${Math.round(rawPt.accuracy ?? 0)}m · smoothing straight line (best ≤5m)`
          );
        }

        if (!activeRec || pausedRec) return;

        lastAcceptedWalkTsRef.current = nowTs;

        if (cMode === 'straight_walk') {
          let nextStraightHeading: number | null = null;
          setWalkSegments((prev) => {
            if (prev.length === 0) {
              straightAnchorCountRef.current = 1;
              return [[smoothed]];
            }
            const next = [...prev];
            const lastIdx = next.length - 1;
            const activeSeg = next[lastIdx];
            if (activeSeg.length === 0) {
              straightAnchorCountRef.current = 1;
              next[lastIdx] = [smoothed];
              return next;
            }

            const anchorCount = Math.max(
              1,
              Math.min(straightAnchorCountRef.current, activeSeg.length)
            );
            const anchor = activeSeg[anchorCount - 1];
            const distFromAnchor = haversineMeters(anchor, smoothed);

            if (distFromAnchor < 1.2) return prev;

            const currentTip = activeSeg[activeSeg.length - 1];
            const movedSinceTip = haversineMeters(currentTip, smoothed);
            if (activeSeg.length > anchorCount && movedSinceTip < 0.8) {
              return prev;
            }

            nextStraightHeading = calculateBearing(anchor, smoothed);
            straightHeadingRef.current = nextStraightHeading;
            next[lastIdx] = [...activeSeg.slice(0, anchorCount), smoothed];
            return next;
          });
          if (nextStraightHeading != null) {
            setStraightHeadingDeg(nextStraightHeading);
          }
          return;
        }

        const minStepMeters = pMode === 'accurate_5m' ? 1.5 : 2.5;
        setWalkSegments((prev) => {
          if (prev.length === 0) return [[smoothed]];
          const next = [...prev];
          const lastIdx = next.length - 1;
          const activeSeg = next[lastIdx];
          if (activeSeg.length === 0) {
            next[lastIdx] = [smoothed];
            return next;
          }
          if (haversineMeters(activeSeg[activeSeg.length - 1], smoothed) < minStepMeters) {
            return prev;
          }
          next[lastIdx] = [...activeSeg, smoothed];
          return next;
        });
      },
      (err) => {
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'GPS permission denied. Switch to Tap or Test Walk.'
            : `Waiting for GPS: ${err.message}`
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => {
      if (walkWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(walkWatchIdRef.current);
        walkWatchIdRef.current = null;
      }
    };
  }, [mode, captureMode, maybeDetectVillage]);

  // All pending branches across BOTH draft junctions and saved roads
  const pendingBranches = useMemo(
    () => collectPendingJunctionBranches(roads, draftJunctions),
    [roads, draftJunctions]
  );

  // House Number OR Shop / Dukan matching for Navigate Search
  const matchingHouses = useMemo(() => {
    const q = houseQuery.trim().toLowerCase();
    if (!q) return houses.slice(0, 8);
    return houses
      .filter((h) => {
        const num = h.houseNumber.toLowerCase();
        const shop = (h.shopName ?? '').toLowerCase();
        const note = (h.note ?? '').toLowerCase();
        return num.includes(q) || shop.includes(q) || note.includes(q);
      })
      .sort((a, b) => {
        const aNum = a.houseNumber.toLowerCase();
        const bNum = b.houseNumber.toLowerCase();
        const aShop = (a.shopName ?? '').toLowerCase();
        const bShop = (b.shopName ?? '').toLowerCase();
        const aScore = aNum === q ? 0 : aShop.startsWith(q) ? 1 : aNum.startsWith(q) ? 2 : 3;
        const bScore = bNum === q ? 0 : bShop.startsWith(q) ? 1 : bNum.startsWith(q) ? 2 : 3;
        return aScore - bScore;
      });
  }, [houses, houseQuery]);

  // Compute up to 3 saved-road routes from navOrigin to target House
  const navRouteOptions = useMemo(() => {
    if (!targetHouse) return [];
    return findRoutesToHouse(roads, navOrigin, targetHouse, 3);
  }, [targetHouse, roads, navOrigin]);

  const safeSelectedRouteIndex =
    navRouteOptions.length > 0 ? Math.min(selectedRouteIndex, navRouteOptions.length - 1) : 0;
  const navRouteResult = navRouteOptions[safeSelectedRouteIndex] ?? null;

  // Preview 2-Point (House A -> House B) Route Calculation
  const previewFromHouse = useMemo(
    () => (previewFromHouseId ? houses.find((h) => h.id === previewFromHouseId) ?? null : null),
    [houses, previewFromHouseId]
  );
  const previewToHouse = useMemo(
    () => (previewToHouseId ? houses.find((h) => h.id === previewToHouseId) ?? null : null),
    [houses, previewToHouseId]
  );

  useEffect(() => {
    if (previewFromHouseId && !previewFromHouse) setPreviewFromHouseId(null);
    if (previewToHouseId && !previewToHouse) setPreviewToHouseId(null);
  }, [previewFromHouseId, previewFromHouse, previewToHouseId, previewToHouse]);

  const previewRouteOptions = useMemo(() => {
    if (!previewFromHouse || !previewToHouse || previewFromHouse.id === previewToHouse.id) {
      return [];
    }
    return findRoutesToHouse(
      roads,
      { lat: previewFromHouse.roadLat, lng: previewFromHouse.roadLng },
      previewToHouse,
      3
    );
  }, [roads, previewFromHouse, previewToHouse]);

  const previewSafeRouteIdx =
    previewRouteOptions.length > 0
      ? Math.min(previewSelectedRouteIndex, previewRouteOptions.length - 1)
      : 0;
  const previewRouteResult = previewRouteOptions[previewSafeRouteIdx] ?? null;

  useEffect(() => {
    if (mode !== 'preview') return;
    if (previewFromHouse && previewToHouse) {
      const pts: { lat: number; lng: number }[] = [
        { lat: previewFromHouse.lat, lng: previewFromHouse.lng },
        { lat: previewToHouse.lat, lng: previewToHouse.lng },
        ...(previewRouteResult?.reachable
          ? previewRouteResult.polyline.map((p) => ({ lat: p.lat, lng: p.lng }))
          : []),
      ];
      setFocusTarget({
        lat: previewFromHouse.lat,
        lng: previewFromHouse.lng,
        boundsPoints: pts,
        key: Date.now(),
      });
    } else if (previewFromHouse) {
      setFocusTarget({
        lat: previewFromHouse.lat,
        lng: previewFromHouse.lng,
        zoom: 19,
        key: Date.now(),
      });
    } else if (previewToHouse) {
      setFocusTarget({
        lat: previewToHouse.lat,
        lng: previewToHouse.lng,
        zoom: 19,
        key: Date.now(),
      });
    }
  }, [mode, previewFromHouse, previewToHouse, previewRouteResult]);

  const liveProgress = useMemo(() => {
    if (!targetHouse || !navRouteResult) return null;
    return computeLiveRouteProgress(navRouteResult, userLocation, userHeadingDeg);
  }, [targetHouse, navRouteResult, userLocation, userHeadingDeg]);

  // Auto-reroute if user deviates > 25m off path
  useEffect(() => {
    if (!targetHouse || !liveProgress || liveProgress.offRouteMeters <= 25) return;
    setNavOrigin({ lat: userLocation.lat, lng: userLocation.lng });
  }, [targetHouse, liveProgress, userLocation.lat, userLocation.lng]);

  // Arrival toast
  useEffect(() => {
    if (!targetHouse || !liveProgress || isSimulatingNav) return;
    if (liveProgress.remainingMeters <= 6 && arrivedHouseIdRef.current !== targetHouse.id) {
      arrivedHouseIdRef.current = targetHouse.id;
      showToast(
        `Arrived: House ${targetHouse.houseNumber}${
          targetHouse.shopName ? ` (${targetHouse.shopName})` : ''
        } is on your ${targetHouse.side === 'left' ? 'Left' : 'Right'}!`
      );
    }
  }, [targetHouse, liveProgress, isSimulatingNav, showToast]);

  const nextSuggestedHouse = useMemo(
    () => getNextSequentialHouseNumber(houses, draftHouses),
    [houses, draftHouses]
  );

  const activeNavStepIdx = useMemo(() => {
    if (!targetHouse || !navRouteResult?.reachable || navRouteResult.instructions.length === 0) {
      return 0;
    }
    if (liveProgress) {
      return Math.min(liveProgress.activeStepIndex, navRouteResult.instructions.length - 1);
    }
    return Math.min(currentNavStepIdx, navRouteResult.instructions.length - 1);
  }, [targetHouse, navRouteResult, liveProgress, currentNavStepIdx]);

  const activeNavInstruction =
    targetHouse && navRouteResult?.reachable && navRouteResult.instructions.length > 0
      ? navRouteResult.instructions[activeNavStepIdx]
      : null;

  const distanceToNextTurnMeters = useMemo(() => {
    if (!targetHouse || !navRouteResult?.reachable || !activeNavInstruction) return null;
    if (liveProgress) return liveProgress.distanceToNextTurnMeters;
    const nextInst = navRouteResult.instructions[activeNavStepIdx + 1];
    const targetPt = nextInst ? nextInst.anchorPoint : activeNavInstruction.anchorPoint;
    return Math.round(haversineMeters(userLocation, targetPt));
  }, [targetHouse, navRouteResult, activeNavInstruction, liveProgress, activeNavStepIdx, userLocation]);

  // Voice guidance
  useEffect(() => {
    if (!voiceEnabled || !targetHouse || !activeNavInstruction) return;
    if (lastSpokenRef.current === activeNavStepIdx) return;
    lastSpokenRef.current = activeNavStepIdx;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(activeNavInstruction.instruction);
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    }
  }, [voiceEnabled, targetHouse, activeNavInstruction, activeNavStepIdx]);

  const stepNavSimulation = useCallback(() => {
    if (!navRouteResult?.reachable || navRouteResult.polyline.length < 2) return;
    const poly = navRouteResult.polyline;
    const prevIdx = Math.min(simIdxRef.current, poly.length - 1);
    const nextIdx = Math.min(prevIdx + 1, poly.length - 1);
    simIdxRef.current = nextIdx;
    const prevPt = poly[prevIdx];
    const pt = poly[nextIdx];
    if (prevIdx !== nextIdx && haversineMeters(prevPt, pt) >= 0.5) {
      setUserHeadingDeg(calculateBearing(prevPt, pt));
    }
    setUserLocation({ lat: pt.lat, lng: pt.lng, accuracy: 1.5, timestamp: Date.now() });
    if (autoFollowGpsRef.current) {
      setFocusTarget({ lat: pt.lat, lng: pt.lng, key: Date.now() });
    }
    if (nextIdx >= poly.length - 1) {
      setIsSimulatingNav(false);
      setCurrentNavStepIdx(navRouteResult.instructions.length - 1);
      showToast(
        `Arrived: House ${targetHouse?.houseNumber}${
          targetHouse?.shopName ? ` (${targetHouse.shopName})` : ''
        } is on your ${targetHouse?.side === 'left' ? 'Left' : 'Right'}!`
      );
    }
  }, [navRouteResult, targetHouse, showToast]);

  useEffect(() => {
    if (!isSimulatingNav || !targetHouse) return;
    const t = setInterval(stepNavSimulation, 1400);
    return () => clearInterval(t);
  }, [isSimulatingNav, targetHouse, stepNavSimulation]);

  const handleLocateMe = useCallback(
    (panToGps: boolean | unknown = true) => {
      const shouldPan = panToGps !== false;
      if (shouldPan) {
        autoFollowGpsRef.current = true;
        setIsFollowingGps(true);
      }
      if (!('geolocation' in navigator)) {
        showToast('GPS unavailable. Tap Set Spot on Map or use Test Walk.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt: LatLngPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          };
          if (pos.coords.heading != null && Number.isFinite(pos.coords.heading)) {
            setUserHeadingDeg(pos.coords.heading);
          }
          lastNavGpsRef.current = pt;
          setUserLocation(pt);
          setNavOrigin((prev) =>
            haversineMeters(prev, pt) > 25 ? { lat: pt.lat, lng: pt.lng } : prev
          );
          if (shouldPan && autoFollowGpsRef.current) {
            setFocusTarget({ lat: pt.lat, lng: pt.lng, key: Date.now() });
          }
          maybeDetectVillage(pt.lat, pt.lng);
        },
        () => {
          if (shouldPan) {
            showToast('Could not access GPS. Use Set Spot on Map or Test Walk.');
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    },
    [maybeDetectVillage, showToast]
  );

  const handleFitAllSaved = useCallback(
    (roadList: VillageRoad[] = roads, houseList: VillageHouse[] = houses) => {
      const pts: { lat: number; lng: number }[] = [
        ...roadList.flatMap((r) => r.points.map((p) => ({ lat: p.lat, lng: p.lng }))),
        ...houseList.map((h) => ({ lat: h.lat, lng: h.lng })),
      ];
      if (pts.length >= 2) {
        setFocusTarget({
          lat: pts[0].lat,
          lng: pts[0].lng,
          boundsPoints: pts,
          key: Date.now(),
        });
      } else if (pts.length === 1) {
        setFocusTarget({
          lat: pts[0].lat,
          lng: pts[0].lng,
          zoom: 18,
          key: Date.now(),
        });
      }
    },
    [roads, houses]
  );

  const startNavigateToHouse = useCallback(
    (house: VillageHouse) => {
      setMode('navigate');
      setTargetHouse(house);
      setNavOrigin({ lat: userLocation.lat, lng: userLocation.lng });
      setSelectedRouteIndex(0);
      setCurrentNavStepIdx(0);
      simIdxRef.current = 0;
      lastSpokenRef.current = -1;
      arrivedHouseIdRef.current = null;
      setIsSimulatingNav(false);
      setIsPickingSpot(false);
      setHouseDropdownOpen(false);
      autoFollowGpsRef.current = true;
      setIsFollowingGps(true);
      if ('geolocation' in navigator) {
        setIsLiveGps(true);
        handleLocateMe(false);
      }

      const initialRoutes = findRoutesToHouse(roads, userLocation, house, 3);
      const bestRoute = initialRoutes[0];
      const targetRoad = roads.find((r) => r.id === house.roadId);
      const distToHouse = haversineMeters(userLocation, house);

      if (bestRoute?.reachable && bestRoute.polyline.length >= 2 && distToHouse <= 5000) {
        const framePts = [
          { lat: userLocation.lat, lng: userLocation.lng },
          ...bestRoute.polyline.map((p) => ({ lat: p.lat, lng: p.lng })),
          { lat: house.lat, lng: house.lng },
        ];
        setFocusTarget({
          lat: house.lat,
          lng: house.lng,
          boundsPoints: framePts,
          key: Date.now(),
        });
      } else if (targetRoad && targetRoad.points.length >= 2) {
        const framePts = [
          ...targetRoad.points.map((p) => ({ lat: p.lat, lng: p.lng })),
          { lat: house.lat, lng: house.lng },
        ];
        setFocusTarget({
          lat: house.lat,
          lng: house.lng,
          boundsPoints: framePts,
          key: Date.now(),
        });
      } else {
        setFocusTarget({
          lat: house.lat,
          lng: house.lng,
          zoom: mapViewRef.current.zoom < 17 ? 18 : undefined,
          key: Date.now(),
        });
      }
    },
    [roads, userLocation, handleLocateMe]
  );

  const handleExitNavigation = useCallback(() => {
    setTargetHouse(null);
    setIsSimulatingNav(false);
    arrivedHouseIdRef.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const handleHouseSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!houseQuery.trim()) return;
    if (matchingHouses.length > 0) {
      startNavigateToHouse(matchingHouses[0]);
    } else {
      showToast(`"${houseQuery.trim()}" is not saved yet.`);
    }
  };

  const handleAreaSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (areaQuery.trim().length < 2) return;
    setIsSearchingArea(true);
    try {
      const results = await searchPlaceNominatim(areaQuery);
      setAreaResults(results);
    } finally {
      setIsSearchingArea(false);
    }
  };

  // Add / Walk Actions
  const handleStartWalk = () => {
    setMode('add');
    setTargetHouse(null);
    setIsRecording(true);
    setIsPaused(false);
    setGpsError(null);
    const hasAnyPoints = walkSegments.some((s) => s.length > 0);
    if (!hasAnyPoints) {
      if (captureMode === 'simulated_walk') {
        const startPt: LatLngPoint = {
          lat: userLocation.lat,
          lng: userLocation.lng,
          accuracy: 2.5,
          timestamp: Date.now(),
        };
        setWalkSegments([[startPt]]);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: startPt.lat, lng: startPt.lng, key: Date.now() });
        }
      } else if (captureMode === 'straight_walk') {
        const startPt: LatLngPoint = {
          lat: userLocation.lat,
          lng: userLocation.lng,
          accuracy: userLocation.accuracy ?? 2.5,
          timestamp: Date.now(),
        };
        setWalkSegments([[startPt]]);
        straightAnchorCountRef.current = 1;
        straightHeadingRef.current = userHeadingDeg ?? null;
        setStraightHeadingDeg(userHeadingDeg ?? null);
        lastAcceptedWalkTsRef.current = 0;
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: startPt.lat, lng: startPt.lng, key: Date.now() });
        }
      } else if (captureMode === 'gps_walk') {
        if (gpsQuality.accepted) {
          setWalkSegments([[userLocation]]);
        } else {
          setWalkSegments([[]]);
        }
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: userLocation.lat, lng: userLocation.lng, key: Date.now() });
        }
      }
    }
  };

  const handlePauseResumeWalk = () => {
    if (!isPaused) {
      setIsPaused(true);
      return;
    }
    setWalkSegments((prev) => {
      const lastNonEmpty = [...prev].reverse().find((s) => s.length > 0);
      const lastPt = lastNonEmpty ? lastNonEmpty[lastNonEmpty.length - 1] : null;
      if (lastPt && haversineMeters(lastPt, userLocation) > 6) {
        if (captureMode === 'straight_walk') {
          straightAnchorCountRef.current = 1;
          straightHeadingRef.current = null;
          setStraightHeadingDeg(null);
          return [...prev, [{ ...userLocation, timestamp: Date.now() }]];
        }
        const startOfNewSeg =
          captureMode === 'gps_walk' && gpsQuality.accepted ? [userLocation] : [];
        return [...prev, startOfNewSeg];
      }
      return prev.length === 0 ? [[]] : prev;
    });
    setIsPaused(false);
  };

  const handleUndoLastPoint = () => {
    setWalkSegments((prev) => {
      const next = [...prev];
      while (next.length > 0 && next[next.length - 1].length === 0) {
        next.pop();
      }
      if (next.length === 0) return [];
      const lastIdx = next.length - 1;
      const removedPt = next[lastIdx][next[lastIdx].length - 1];
      next[lastIdx] = next[lastIdx].slice(0, -1);
      if (next[lastIdx].length === 0 && next.length > 1) {
        next.pop();
      }
      const updatedSeg = next[next.length - 1] ?? [];
      straightAnchorCountRef.current = Math.max(1, updatedSeg.length);
      if (updatedSeg.length >= 2) {
        const b = calculateBearing(
          updatedSeg[updatedSeg.length - 2],
          updatedSeg[updatedSeg.length - 1]
        );
        straightHeadingRef.current = b;
        setStraightHeadingDeg(b);
      } else {
        straightHeadingRef.current = null;
        setStraightHeadingDeg(null);
      }
      if (removedPt) {
        setDraftJunctions((jPrev) =>
          jPrev.filter((j) => haversineMeters(j, removedPt) > 1.5)
        );
      }
      return next;
    });
  };

  const handleStraightSymbol = (action: StraightSymbolAction) => {
    const activeSeg = walkSegments[walkSegments.length - 1] ?? [];
    const currentTip = activeSeg[activeSeg.length - 1] ?? userLocation;
    const prevVertex = activeSeg.length >= 2 ? activeSeg[activeSeg.length - 2] : null;
    const hasLiveTail = activeSeg.length > straightAnchorCountRef.current;
    const inferredBearing =
      hasLiveTail && prevVertex
        ? calculateBearing(prevVertex, currentTip)
        : straightHeadingRef.current ??
          (prevVertex ? calculateBearing(prevVertex, currentTip) : userHeadingDeg ?? 0);

    if (action === 'nudge_left' || action === 'nudge_right') {
      const delta = action === 'nudge_left' ? -15 : 15;
      const nextH = (inferredBearing + delta + 360) % 360;
      straightHeadingRef.current = nextH;
      setStraightHeadingDeg(nextH);
      const anchorCount = Math.max(1, Math.min(straightAnchorCountRef.current, activeSeg.length));
      if (activeSeg.length > anchorCount) {
        const anchor = activeSeg[anchorCount - 1];
        const len = Math.max(3, haversineMeters(anchor, currentTip));
        const swung = offsetCoord(anchor, nextH, len);
        const swungPt: LatLngPoint = {
          lat: swung.lat,
          lng: swung.lng,
          accuracy: 2.0,
          timestamp: Date.now(),
        };
        setWalkSegments((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          next[idx] = [...next[idx].slice(0, anchorCount), swungPt];
          return next;
        });
      }
      return;
    }

    if (action === 'straight_step') {
      const h = straightHeadingRef.current ?? inferredBearing;
      straightHeadingRef.current = h;
      setStraightHeadingDeg(h);
      setUserHeadingDeg(h);
      const extended = offsetCoord(currentTip, h, 5);
      const pt: LatLngPoint = {
        lat: extended.lat,
        lng: extended.lng,
        accuracy: 2.0,
        timestamp: Date.now(),
      };
      setUserLocation(pt);
      if (autoFollowGpsRef.current) {
        setFocusTarget({ lat: pt.lat, lng: pt.lng, key: Date.now() });
      }
      setWalkSegments((prev) => {
        const next = prev.length > 0 ? [...prev] : [[{ ...userLocation, timestamp: Date.now() }]];
        const idx = next.length - 1;
        const seg = next[idx];
        const anchorCount = Math.max(1, Math.min(straightAnchorCountRef.current, seg.length));
        next[idx] = [...seg.slice(0, anchorCount), pt];
        return next;
      });
      return;
    }

    if (
      action === 'turn_left' ||
      action === 'turn_right' ||
      action === 'slight_left' ||
      action === 'slight_right' ||
      action === 'sharp_left' ||
      action === 'sharp_right' ||
      action === 'u_turn'
    ) {
      const turnDeltaMap: Record<string, number> = {
        turn_left: 270,
        turn_right: 90,
        slight_left: 330,
        slight_right: 30,
        sharp_left: 240,
        sharp_right: 120,
        u_turn: 180,
      };
      const nextH = (inferredBearing + turnDeltaMap[action]) % 360;
      straightHeadingRef.current = nextH;
      setStraightHeadingDeg(nextH);
      setUserHeadingDeg(nextH);
      const cornerPt: LatLngPoint = {
        lat: userLocation.lat,
        lng: userLocation.lng,
        accuracy: userLocation.accuracy ?? 2.5,
        timestamp: Date.now(),
      };
      setWalkSegments((prev) => {
        const next = prev.length > 0 ? [...prev] : [[cornerPt]];
        const idx = next.length - 1;
        const seg = next[idx];
        const anchorCount = Math.max(1, Math.min(straightAnchorCountRef.current, seg.length));
        const lockedSeg =
          seg.length === 0
            ? [cornerPt]
            : haversineMeters(seg[seg.length - 1], cornerPt) >= 0.8
            ? [...seg.slice(0, anchorCount), cornerPt]
            : seg;
        straightAnchorCountRef.current = lockedSeg.length;
        next[idx] = lockedSeg;
        return next;
      });
      return;
    }

    if (
      action === 'curve_left' ||
      action === 'curve_right' ||
      action === 'gentle_left' ||
      action === 'gentle_right'
    ) {
      const isGentle = action === 'gentle_left' || action === 'gentle_right';
      const isLeft = action === 'curve_left' || action === 'gentle_left';
      const delta = isGentle ? (isLeft ? -16 : 16) : isLeft ? -45 : 45;
      const steps = isGentle ? 6 : 5;
      const stepMeters = isGentle ? 2.0 : 1.2;

      const nextH = (inferredBearing + delta + 360) % 360;
      straightHeadingRef.current = nextH;
      setStraightHeadingDeg(nextH);
      setUserHeadingDeg(nextH);

      let cursor: { lat: number; lng: number } =
        activeSeg.length > 0 ? currentTip : { lat: userLocation.lat, lng: userLocation.lng };
      const arcPts: LatLngPoint[] = [];
      for (let k = 1; k <= steps; k++) {
        const stepH = (inferredBearing + (delta * k) / steps + 360) % 360;
        const p = offsetCoord(cursor, stepH, stepMeters);
        const pt: LatLngPoint = {
          lat: p.lat,
          lng: p.lng,
          accuracy: 2.0,
          timestamp: Date.now(),
        };
        arcPts.push(pt);
        cursor = pt;
      }

      const endPt = arcPts[arcPts.length - 1];
      if (endPt) {
        setUserLocation(endPt);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: endPt.lat, lng: endPt.lng, key: Date.now() });
        }
      }

      setWalkSegments((prev) => {
        const next = prev.length > 0 ? [...prev] : [[{ ...userLocation, timestamp: Date.now() }]];
        const idx = next.length - 1;
        const seg = next[idx].length > 0 ? next[idx] : [{ ...userLocation, timestamp: Date.now() }];
        const merged = [...seg, ...arcPts];
        straightAnchorCountRef.current = merged.length;
        next[idx] = merged;
        return next;
      });
      return;
    }

    if (action === 's_curve_left' || action === 's_curve_right') {
      const sideSign = action === 's_curve_right' ? 1 : -1;
      const lateralBearing = (inferredBearing + 90 * sideSign + 360) % 360;
      const totalForward = 10;
      const totalShift = 3.5;
      const steps = 6;

      // Preserve the original straight heading after the side jog
      straightHeadingRef.current = inferredBearing;
      setStraightHeadingDeg(inferredBearing);
      setUserHeadingDeg(inferredBearing);

      const originPt: { lat: number; lng: number } =
        activeSeg.length > 0 ? currentTip : { lat: userLocation.lat, lng: userLocation.lng };
      const sPts: LatLngPoint[] = [];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const fwdMeters = totalForward * t;
        const latMeters = totalShift * 0.5 * (1 - Math.cos(Math.PI * t));
        const forwardStep = offsetCoord(originPt, inferredBearing, fwdMeters);
        const shifted =
          latMeters > 0.05 ? offsetCoord(forwardStep, lateralBearing, latMeters) : forwardStep;
        sPts.push({
          lat: shifted.lat,
          lng: shifted.lng,
          accuracy: 2.0,
          timestamp: Date.now(),
        });
      }

      const endPt = sPts[sPts.length - 1];
      if (endPt) {
        setUserLocation(endPt);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: endPt.lat, lng: endPt.lng, key: Date.now() });
        }
      }

      setWalkSegments((prev) => {
        const next = prev.length > 0 ? [...prev] : [[{ ...userLocation, timestamp: Date.now() }]];
        const idx = next.length - 1;
        const seg = next[idx].length > 0 ? next[idx] : [{ ...userLocation, timestamp: Date.now() }];
        const merged = [...seg, ...sPts];
        straightAnchorCountRef.current = merged.length;
        next[idx] = merged;
        return next;
      });
    }
  };

  /**
   * Marks a 2-way, 3-way, or 4-way junction at the current point, records ALL remaining branches
   * as Pending, and begins mapping the chosen first branch cleanly from the exact junction node.
   */
  const handleCreateMultiBranchJunction = (
    waysCount: JunctionWayCount,
    selectedDirections: JunctionDirection[],
    firstDirection: JunctionDirection
  ) => {
    const activeSegIdx = Math.max(0, walkSegments.length - 1);
    const activeSeg = walkSegments[activeSegIdx] ?? [];
    const currentTip = activeSeg[activeSeg.length - 1] ?? userLocation;
    const prevVertex = activeSeg.length >= 2 ? activeSeg[activeSeg.length - 2] : null;
    const currentH = prevVertex
      ? calculateBearing(prevVertex, currentTip)
      : straightHeadingRef.current ?? userHeadingDeg ?? 0;

    const firstOffset = directionOffsetDeg(firstDirection);
    const nextH = (currentH + firstOffset) % 360;
    straightHeadingRef.current = nextH;
    setStraightHeadingDeg(nextH);
    setUserHeadingDeg(nextH);

    // Anchor junction at the live tip/user location
    const junctionPt: LatLngPoint = {
      lat: currentTip.lat,
      lng: currentTip.lng,
      accuracy: currentTip.accuracy ?? userLocation.accuracy ?? 2.5,
      timestamp: Date.now(),
    };

    const jId = `jnc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const jNumber = draftJunctions.length + 1;
    const jType: RoadJunction['type'] =
      waysCount === 2 ? '2-way' : waysCount === 4 ? '4-way' : '3-way';

    // New segment index for the first outgoing branch if current segment already has >=2 pts
    const hasIncomingRoad = activeSeg.length >= 2;
    const nextSegIdx = hasIncomingRoad ? walkSegments.length : activeSegIdx;
    const branches = buildJunctionBranches(
      jId,
      currentH,
      selectedDirections,
      firstDirection,
      nextSegIdx
    );

    const newJunction: RoadJunction = {
      id: jId,
      label: `${waysCount}-Way ${jNumber}`,
      type: jType,
      waysCount,
      lat: junctionPt.lat,
      lng: junctionPt.lng,
      headingDeg: currentH,
      exitTurn:
        firstDirection === 'left' || firstDirection === 'right' ? firstDirection : 'straight',
      branches,
    };

    setDraftJunctions((prev) => [...prev, newJunction]);

    setWalkSegments((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].length < 2) {
        straightAnchorCountRef.current = 1;
        return [[junctionPt]];
      }
      // Lock incoming segment at junctionPt, then start a clean new branch segment from exact junctionPt
      const next = [...prev];
      const idx = next.length - 1;
      const seg = next[idx];
      if (haversineMeters(seg[seg.length - 1], junctionPt) >= 0.8) {
        next[idx] = [...seg, junctionPt];
      }
      straightAnchorCountRef.current = 1;
      return [...next, [junctionPt]];
    });

    const firstLabel = directionLabel(firstDirection);
    setSegmentBranchLabels((prev) => ({
      ...prev,
      [nextSegIdx]: `${firstLabel} Branch`,
    }));

    const pendingCount = branches.filter((b) => b.status === 'pending').length;
    showToast(
      `${waysCount}-Way Junction marked · Mapping ${firstLabel} first (${pendingCount} queued)`
    );
  };

  /**
   * Switches or starts mapping ANY pending branch (from current draft OR from a saved road junction!)
   * anchored at the EXACT junction coordinate so branches never disconnect or bridge diagonally.
   */
  const handleSelectPendingBranch = useCallback(
    (junction: RoadJunction, branchId: string) => {
      const targetBranch = junction.branches?.find((b) => b.id === branchId);
      if (!targetBranch) return;

      setMode('add');
      setTargetHouse(null);
      setIsRecording(true);
      setIsPaused(false);
      setGpsError(null);

      const junctionPt: LatLngPoint = {
        lat: junction.lat,
        lng: junction.lng,
        accuracy: 1.5,
        timestamp: Date.now(),
      };

      const isDraftJunction = draftJunctions.some((dj) => dj.id === junction.id);
      const nextSegIdx = walkSegments.some((s) => s.length > 0) ? walkSegments.length : 0;

      if (isDraftJunction) {
        setDraftJunctions((prev) =>
          prev.map((dj) => {
            if (dj.id !== junction.id) {
              return {
                ...dj,
                branches: dj.branches?.map((b) =>
                  b.status === 'mapping' ? { ...b, status: 'mapped' } : b
                ),
              };
            }
            return {
              ...dj,
              branches: dj.branches?.map((b) => {
                if (b.id === branchId) {
                  return { ...b, status: 'mapping', segmentIndex: nextSegIdx };
                }
                if (b.status === 'mapping') {
                  return { ...b, status: 'mapped' };
                }
                return b;
              }),
            };
          })
        );
      } else {
        // Saved junction from an earlier walk: link this new walk directly to it
        setActiveLinkedBranch({
          junctionId: junction.id,
          branchId: targetBranch.id,
          label: `${targetBranch.label} branch (${junction.label ?? junction.type})`,
        });
      }

      straightHeadingRef.current = targetBranch.bearingDeg;
      setStraightHeadingDeg(targetBranch.bearingDeg);
      setUserHeadingDeg(targetBranch.bearingDeg);
      straightAnchorCountRef.current = 1;
      lastAcceptedWalkTsRef.current = 0;

      setWalkSegments((prev) => {
        const cleaned = prev.filter((s) => s.length >= 2);
        return [...cleaned, [junctionPt]];
      });

      setSegmentBranchLabels((prev) => ({
        ...prev,
        [nextSegIdx]: `${targetBranch.label} Branch`,
      }));

      setUserLocation(junctionPt);
      setFocusTarget({ lat: junction.lat, lng: junction.lng, zoom: 19, key: Date.now() });
      showToast(
        `Anchored at ${junction.label ?? junction.type} · Walking ${targetBranch.label} branch`
      );
    },
    [draftJunctions, walkSegments, showToast]
  );

  const handleSimulateStep = (dLat: number, dLng: number) => {
    setWalkSegments((prev) => {
      const next = prev.length > 0 ? [...prev] : [[]];
      const lastIdx = next.length - 1;
      const activeSeg = next[lastIdx];
      const last =
        activeSeg[activeSeg.length - 1] ?? { lat: userLocation.lat, lng: userLocation.lng };
      const nextPt: LatLngPoint = {
        lat: Number((last.lat + dLat).toFixed(7)),
        lng: Number((last.lng + dLng).toFixed(7)),
        accuracy: 2.0,
        timestamp: Date.now(),
      };
      setUserLocation(nextPt);
      if (autoFollowGpsRef.current) {
        setFocusTarget({ lat: nextPt.lat, lng: nextPt.lng, key: Date.now() });
      }
      next[lastIdx] = [...activeSeg, nextPt];
      return next;
    });
  };

  const handleAddHouseOnWalk = (
    houseNumber: string,
    side: HouseSide,
    shopName?: string,
    note?: string
  ) => {
    const activeSegIdx = Math.max(0, walkSegments.length - 1);
    const activeSeg = walkSegments[activeSegIdx] ?? [];
    const anchor = activeSeg[activeSeg.length - 1] ?? userLocation;
    const prevPt = activeSeg.length >= 2 ? activeSeg[activeSeg.length - 2] : null;
    const heading =
      captureMode === 'straight_walk' && straightHeadingRef.current != null
        ? straightHeadingRef.current
        : prevPt
        ? calculateBearing(prevPt, anchor)
        : 0;
    const sideBearing = side === 'left' ? (heading + 270) % 360 : (heading + 90) % 360;
    const visual = offsetCoord(anchor, sideBearing, 7);

    if (activeSeg.length === 0) {
      setWalkSegments((prev) => {
        const next = prev.length > 0 ? [...prev] : [[]];
        next[next.length - 1] = [{ lat: anchor.lat, lng: anchor.lng, timestamp: Date.now() }];
        return next;
      });
    }

    const newHouse: VillageHouse = {
      id: `house-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      houseNumber,
      shopName,
      side,
      lat: visual.lat,
      lng: visual.lng,
      roadLat: anchor.lat,
      roadLng: anchor.lng,
      roadId: 'draft',
      roadName: 'Current Walk Road',
      villageName: detectedVillage,
      segmentIndex: activeSegIdx,
      note,
      createdAt: new Date().toISOString(),
    };

    setDraftHouses((prev) => [...prev, newHouse]);
    showToast(
      `Added ${houseNumber}${shopName ? ` (${shopName})` : ''} (${
        side === 'left' ? 'Left' : 'Right'
      })`
    );
  };

  const handleSaveWalkedRoad = (payload: {
    roadName: string;
    villageName: string;
    surface: VillageRoad['surface'];
  }) => {
    const validEntries = walkSegments
      .map((seg, origIdx) => {
        const clean: LatLngPoint[] = [];
        for (const pt of seg) {
          if (clean.length === 0 || haversineMeters(clean[clean.length - 1], pt) >= 0.4) {
            clean.push(pt);
          }
        }
        return { origIdx, points: clean };
      })
      .filter((entry) => entry.points.length >= 2);

    if (validEntries.length === 0) return;

    const now = new Date().toISOString();
    const baseTs = Date.now();

    const newRoadsRaw: VillageRoad[] = validEntries.map((entry, idx) => {
      const roadId = `road-${baseTs}-${idx}`;
      const branchLabel = segmentBranchLabels[entry.origIdx];
      const segName =
        validEntries.length === 1
          ? payload.roadName
          : idx === 0
          ? payload.roadName
          : branchLabel
          ? `${payload.roadName} · ${branchLabel}`
          : `${payload.roadName} (Branch ${idx + 1})`;

      // Finalize any draft junctions attached to this road segment
      const finalizedJunctions: RoadJunction[] | undefined =
        idx === 0 && draftJunctions.length > 0
          ? draftJunctions.map((j) => ({
              ...j,
              branches: j.branches?.map((b) => {
                if (b.status === 'mapping') {
                  const mappedSegRoadIdx =
                    b.segmentIndex != null
                      ? validEntries.findIndex((e) => e.origIdx === b.segmentIndex)
                      : -1;
                  return {
                    ...b,
                    status: 'mapped',
                    roadId: mappedSegRoadIdx >= 0 ? `road-${baseTs}-${mappedSegRoadIdx}` : roadId,
                  };
                }
                return b;
              }),
            }))
          : undefined;

      return {
        id: roadId,
        name: segName,
        villageName: payload.villageName,
        surface: payload.surface,
        points: entry.points,
        junctions: finalizedJunctions,
        distanceMeters: computePathDistance(entry.points),
        durationSeconds: Math.round(elapsedSeconds / validEntries.length),
        captureMode,
        createdAt: now,
      };
    });

    // Smart Auto-Linking to existing roads & any pending 2/3/4-way junction branches!
    const { linkedNewRoads, updatedExistingRoads, linkedSummaries } = autoLinkNewRoadsToNetwork(
      newRoadsRaw,
      roads,
      activeLinkedBranch ? { junctionId: activeLinkedBranch.junctionId, branchId: activeLinkedBranch.branchId } : null
    );

    const roadByOrigSegment = new Map<number, VillageRoad>();
    validEntries.forEach((entry, idx) => {
      roadByOrigSegment.set(entry.origIdx, linkedNewRoads[idx]);
    });

    const finalizedHouses = draftHouses.map((h) => {
      const matchedRoad =
        (h.segmentIndex != null ? roadByOrigSegment.get(h.segmentIndex) : undefined) ??
        linkedNewRoads[0];
      return {
        ...h,
        roadId: matchedRoad.id,
        roadName: matchedRoad.name,
        villageName: payload.villageName,
      };
    });

    setRoads([...linkedNewRoads, ...updatedExistingRoads]);
    if (finalizedHouses.length > 0) {
      setHouses((prev) => [...finalizedHouses, ...prev]);
    }

    const totalSavedDist = linkedNewRoads.reduce((sum, r) => sum + r.distanceMeters, 0);
    setIsRecording(false);
    setIsPaused(false);
    setWalkSegments([]);
    setDraftHouses([]);
    setDraftJunctions([]);
    setActiveLinkedBranch(null);
    setSegmentBranchLabels({});
    straightHeadingRef.current = null;
    straightAnchorCountRef.current = 1;
    setStraightHeadingDeg(null);
    setElapsedSeconds(0);

    if (linkedSummaries.length > 0) {
      showToast(`Saved "${payload.roadName}" · ${linkedSummaries[0]}`);
    } else {
      showToast(
        `Saved "${payload.roadName}" (${formatDistance(totalSavedDist)}) & ${finalizedHouses.length} house(s)!`
      );
    }
  };

  const handleDiscardWalk = () => {
    setIsRecording(false);
    setIsPaused(false);
    setWalkSegments([]);
    setDraftHouses([]);
    setDraftJunctions([]);
    setActiveLinkedBranch(null);
    setSegmentBranchLabels({});
    straightHeadingRef.current = null;
    straightAnchorCountRef.current = 1;
    setStraightHeadingDeg(null);
    setElapsedSeconds(0);
    setGpsError(null);
  };

  // Independent Auto Trip Lifecycle (Start -> Pause/Resume -> Close & Save separate trip -> Simulate at home)
  const handleStartAutoTrip = () => {
    setMode('auto');
    setTargetHouse(null);
    setIsAutoRecording(true);
    setIsAutoPaused(false);
    setAutoElapsedSeconds(0);
    setAutoStartedAt(new Date().toISOString());
    setAutoGpsError(null);
    setAutoSimPoint(null);
    lastAcceptedAutoTsRef.current = 0;
    autoFollowGpsRef.current = true;
    setIsFollowingGps(true);
    const startPt: LatLngPoint = {
      lat: userLocation.lat,
      lng: userLocation.lng,
      accuracy: userLocation.accuracy ?? 3.0,
      timestamp: Date.now(),
    };
    setAutoPoints([startPt]);
    setFocusTarget({
      lat: startPt.lat,
      lng: startPt.lng,
      zoom: mapViewRef.current.zoom < 18 ? 19 : undefined,
      key: Date.now(),
    });
    handleLocateMe(true);
  };

  const handlePauseResumeAutoTrip = () => {
    setIsAutoPaused((p) => !p);
  };

  const handleTestStepAuto = () => {
    const h = userHeadingDeg ?? 15;
    setAutoPoints((prev) => {
      const last = prev[prev.length - 1] ?? userLocation;
      const stepped = offsetCoord(last, h, 6);
      const nextPt: LatLngPoint = {
        lat: stepped.lat,
        lng: stepped.lng,
        accuracy: 2.0,
        timestamp: Date.now(),
      };
      setUserLocation(nextPt);
      if (autoFollowGpsRef.current) {
        setFocusTarget({ lat: nextPt.lat, lng: nextPt.lng, key: Date.now() });
      }
      return prev.length === 0 ? [userLocation, nextPt] : [...prev, nextPt];
    });
  };

  const handleCloseAndSaveAutoTrip = () => {
    const cleanPoints: LatLngPoint[] = [];
    for (const pt of autoPoints) {
      if (cleanPoints.length === 0 || haversineMeters(cleanPoints[cleanPoints.length - 1], pt) >= 0.4) {
        cleanPoints.push(pt);
      }
    }
    if (cleanPoints.length < 2) {
      showToast('Walk a few meters (or tap +Step) before closing & saving this trip.');
      return;
    }

    const nowIso = new Date().toISOString();
    const tripNum = autoTrips.length + 1;
    const tripId = `trip-${Date.now()}`;
    const roadId = `road-auto-${Date.now()}`;
    const tripName = `Auto Road ${tripNum}`;
    const dist = computePathDistance(cleanPoints);

    const newRoad: VillageRoad = {
      id: roadId,
      name: tripName,
      villageName: detectedVillage,
      surface: 'concrete',
      points: cleanPoints,
      distanceMeters: dist,
      durationSeconds: autoElapsedSeconds,
      captureMode: 'gps_walk',
      createdAt: nowIso,
    };

    const { linkedNewRoads, updatedExistingRoads } = autoLinkNewRoadsToNetwork(
      [newRoad],
      roads,
      null
    );
    const savedRoad = linkedNewRoads[0];

    const newTrip: AutoTrip = {
      id: tripId,
      name: tripName,
      villageName: detectedVillage,
      surface: 'concrete',
      points: savedRoad.points,
      distanceMeters: savedRoad.distanceMeters,
      durationSeconds: autoElapsedSeconds,
      startedAt: autoStartedAt ?? nowIso,
      endedAt: nowIso,
      linkedRoadId: savedRoad.id,
      houses: [],
    };

    setRoads([savedRoad, ...updatedExistingRoads]);
    setAutoTrips((prev) => [newTrip, ...prev]);
    setSelectedAutoTripId(newTrip.id);
    setIsAutoRecording(false);
    setIsAutoPaused(false);
    setAutoPoints([]);
    setAutoElapsedSeconds(0);
    setAutoStartedAt(null);
    setAutoGpsError(null);
    setFocusTarget({
      lat: savedRoad.points[0].lat,
      lng: savedRoad.points[0].lng,
      boundsPoints: savedRoad.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      key: Date.now(),
    });
    showToast(`Saved "${tripName}" (${formatDistance(savedRoad.distanceMeters)}). Tap Play Sim anytime!`);
  };

  const handleDiscardAutoTrip = () => {
    setIsAutoRecording(false);
    setIsAutoPaused(false);
    setAutoPoints([]);
    setAutoElapsedSeconds(0);
    setAutoStartedAt(null);
    setAutoGpsError(null);
  };

  const handleFitTripRoad = useCallback((trip: AutoTrip) => {
    if (trip.points.length >= 2) {
      setFocusTarget({
        lat: trip.points[0].lat,
        lng: trip.points[0].lng,
        boundsPoints: trip.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        key: Date.now(),
      });
    } else if (trip.points.length === 1) {
      setFocusTarget({
        lat: trip.points[0].lat,
        lng: trip.points[0].lng,
        zoom: 19,
        key: Date.now(),
      });
    }
  }, []);

  const handleSelectAutoTrip = useCallback(
    (tripId: string) => {
      setSelectedAutoTripId(tripId);
      const trip = autoTrips.find((t) => t.id === tripId);
      if (trip) handleFitTripRoad(trip);
    },
    [autoTrips, handleFitTripRoad]
  );

  const handleUpdateAutoTripMeta = useCallback(
    (tripId: string, patch: { name?: string; surface?: VillageRoad['surface'] }) => {
      const target = autoTrips.find((t) => t.id === tripId);
      if (!target) return;

      setAutoTrips((prev) =>
        prev.map((t) =>
          t.id === tripId
            ? {
                ...t,
                ...(patch.name != null ? { name: patch.name } : {}),
                ...(patch.surface != null ? { surface: patch.surface } : {}),
                houses:
                  patch.name != null
                    ? t.houses.map((h) => ({ ...h, roadName: patch.name! }))
                    : t.houses,
              }
            : t
        )
      );

      if (target.linkedRoadId) {
        setRoads((prev) =>
          prev.map((r) =>
            r.id === target.linkedRoadId
              ? {
                  ...r,
                  ...(patch.name != null ? { name: patch.name } : {}),
                  ...(patch.surface != null ? { surface: patch.surface } : {}),
                }
              : r
          )
        );
        if (patch.name != null) {
          setHouses((prev) =>
            prev.map((h) => (h.roadId === target.linkedRoadId ? { ...h, roadName: patch.name! } : h))
          );
        }
      }
    },
    [autoTrips]
  );

  const handleDeleteAutoTrip = useCallback(
    (tripId: string) => {
      const target = autoTrips.find((t) => t.id === tripId);
      const remaining = autoTrips.filter((t) => t.id !== tripId);
      setAutoTrips(remaining);
      if (selectedAutoTripId === tripId) {
        setSelectedAutoTripId(remaining[0]?.id ?? null);
        setAutoSimPoint(null);
      }
      if (target?.linkedRoadId) {
        setRoads((prev) => prev.filter((r) => r.id !== target.linkedRoadId));
        setHouses((prev) => prev.filter((h) => h.roadId !== target.linkedRoadId));
      } else if (target && target.houses.length > 0) {
        const houseIds = new Set(target.houses.map((h) => h.id));
        setHouses((prev) => prev.filter((h) => !houseIds.has(h.id)));
      }
      showToast('Deleted Auto trip.');
    },
    [autoTrips, selectedAutoTripId, showToast]
  );

  const handleAutoSimPositionChange = useCallback(
    (pos: { lat: number; lng: number; headingDeg: number } | null, panMap: boolean) => {
      setAutoSimPoint(pos);
      if (pos && panMap) {
        setFocusTarget({
          lat: pos.lat,
          lng: pos.lng,
          zoom: mapViewRef.current.zoom < 18 ? 19 : undefined,
          key: Date.now(),
        });
      }
    },
    []
  );

  const handleAddHouseOnAutoTrip = useCallback(
    (
      tripId: string,
      point: { lat: number; lng: number },
      headingDeg: number,
      houseNumber: string,
      side: HouseSide,
      shopName?: string,
      note?: string
    ) => {
      const trip = autoTrips.find((t) => t.id === tripId);
      if (!trip) return;
      const sideBearing = side === 'left' ? (headingDeg + 270) % 360 : (headingDeg + 90) % 360;
      const visual = offsetCoord(point, sideBearing, 7);

      const newHouse: VillageHouse = {
        id: `house-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        houseNumber,
        shopName,
        side,
        lat: visual.lat,
        lng: visual.lng,
        roadLat: point.lat,
        roadLng: point.lng,
        roadId: trip.linkedRoadId ?? trip.id,
        roadName: trip.name,
        villageName: trip.villageName,
        note,
        createdAt: new Date().toISOString(),
      };

      setAutoTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, houses: [...t.houses, newHouse] } : t))
      );
      setHouses((prev) => [newHouse, ...prev]);
      showToast(
        `Added ${houseNumber}${shopName ? ` (${shopName})` : ''} (${
          side === 'left' ? 'Left' : 'Right'
        })`
      );
    },
    [autoTrips, showToast]
  );

  const handleRemoveHouseOnAutoTrip = useCallback((tripId: string, houseId: string) => {
    setAutoTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? { ...t, houses: t.houses.filter((h) => h.id !== houseId) } : t
      )
    );
    setHouses((prev) => prev.filter((h) => h.id !== houseId));
  }, []);

  // AutoMapX Control & Moment-Rewind Handlers
  const commitAmxTipIfNeeded = useCallback((momentLabel?: string, overrideHeading?: number) => {
    const cur = amxCursorRef.current;
    const h = overrideHeading ?? cur.headingDeg;
    const prevPts = amxPointsRef.current;
    const lastNode = prevPts[prevPts.length - 1];
    const dist = lastNode ? haversineMeters(lastNode, cur) : 0;

    if (!lastNode || dist >= 0.4 || momentLabel) {
      const nextTotal = (lastNode?.cumulativeMeters ?? 0) + dist;
      amxTotalMetersRef.current = nextTotal;
      const node: AutoMapXNode = {
        lat: cur.lat,
        lng: cur.lng,
        accuracy: 1.5,
        timestamp: Date.now(),
        headingDeg: h,
        cumulativeMeters: nextTotal,
        speedMps: amxSpeedRef.current,
        momentLabel: !lastNode ? momentLabel ?? 'Start' : momentLabel,
      };
      const nextPts = [...prevPts, node];
      amxPointsRef.current = nextPts;
      setAmxPoints(nextPts);
    }
  }, []);

  const handleAmxUseLiveGpsAsStart = useCallback(() => {
    if (amxIsRunning && !amxIsPaused) return;
    const nextH = userHeadingDeg ?? amxCursorRef.current.headingDeg;
    const nextCur = { lat: userLocation.lat, lng: userLocation.lng, headingDeg: nextH };
    amxCursorRef.current = nextCur;
    setAmxCursor(nextCur);
    if (amxPointsRef.current.length <= 1) {
      const startNode: AutoMapXNode = {
        lat: nextCur.lat,
        lng: nextCur.lng,
        accuracy: userLocation.accuracy ?? 2.0,
        timestamp: Date.now(),
        headingDeg: nextH,
        cumulativeMeters: 0,
        speedMps: amxSpeedRef.current,
        momentLabel: 'Start',
      };
      amxPointsRef.current = [startNode];
      setAmxPoints([startNode]);
      amxTotalMetersRef.current = 0;
    }
    autoFollowGpsRef.current = true;
    setIsFollowingGps(true);
    setFocusTarget({
      lat: nextCur.lat,
      lng: nextCur.lng,
      zoom: mapViewRef.current.zoom < 18 ? 19 : undefined,
      key: Date.now(),
    });
    showToast('AutoMapX anchored at Live GPS.');
  }, [amxIsRunning, amxIsPaused, userLocation, userHeadingDeg, showToast]);

  const handleAmxStart = useCallback(() => {
    setAmxPickingStart(false);
    setAmxRewindIdx(null);
    autoFollowGpsRef.current = true;
    setIsFollowingGps(true);
    if (amxPointsRef.current.length === 0) {
      const cur = amxCursorRef.current;
      const startNode: AutoMapXNode = {
        lat: cur.lat,
        lng: cur.lng,
        accuracy: 1.5,
        timestamp: Date.now(),
        headingDeg: cur.headingDeg,
        cumulativeMeters: 0,
        speedMps: amxSpeedRef.current,
        momentLabel: 'Start',
      };
      amxPointsRef.current = [startNode];
      setAmxPoints([startNode]);
      amxTotalMetersRef.current = 0;
    }
    amxLastTickRef.current = Date.now();
    setAmxIsRunning(true);
    setAmxIsPaused(false);
  }, []);

  const handleAmxPauseResume = useCallback(() => {
    if (!amxIsRunning) return;
    if (!amxIsPaused) {
      commitAmxTipIfNeeded();
      setAmxIsPaused(true);
    } else {
      setAmxRewindIdx(null);
      amxLastTickRef.current = Date.now();
      setAmxIsPaused(false);
    }
  }, [amxIsRunning, amxIsPaused, commitAmxTipIfNeeded]);

  const handleAmxDiscard = useCallback(() => {
    setAmxIsRunning(false);
    setAmxIsPaused(false);
    setAmxElapsedSeconds(0);
    setAmxRewindIdx(null);
    setAmxPickingStart(true);
    amxPointsRef.current = [];
    setAmxPoints([]);
    amxTotalMetersRef.current = 0;
    setAmxDraftHouses([]);
    showToast('AutoMapX reset. Tap anywhere on map to pick a new start.');
  }, [showToast]);

  const handleAmxCommitRewind = useCallback(
    (idx: number) => {
      const pts = amxPointsRef.current;
      if (pts.length === 0) return;
      const clamped = Math.max(0, Math.min(idx, pts.length - 1));
      const trimmed = pts.slice(0, clamped + 1);
      const targetNode = trimmed[trimmed.length - 1];
      amxPointsRef.current = trimmed;
      setAmxPoints(trimmed);
      amxTotalMetersRef.current = targetNode.cumulativeMeters;
      const restored = {
        lat: targetNode.lat,
        lng: targetNode.lng,
        headingDeg: targetNode.headingDeg,
      };
      amxCursorRef.current = restored;
      setAmxCursor(restored);
      setAmxRewindIdx(null);
      if (targetNode.timestamp) {
        setAmxDraftHouses((prev) =>
          prev.filter((h) => new Date(h.createdAt).getTime() <= targetNode.timestamp!)
        );
      }
      setFocusTarget({ lat: targetNode.lat, lng: targetNode.lng, key: Date.now() });
      showToast(
        `Rewound to ${Math.round(targetNode.cumulativeMeters)}m · Heading ${Math.round(
          targetNode.headingDeg
        )}°`
      );
    },
    [showToast]
  );

  const handleAmxSymbolAction = useCallback(
    (action: AutoMapXSymbolAction) => {
      if (amxRewindIdx != null) {
        handleAmxCommitRewind(amxRewindIdx);
      }

      const cur = amxCursorRef.current;
      const now = Date.now();

      if (amxPointsRef.current.length === 0) {
        const startNode: AutoMapXNode = {
          lat: cur.lat,
          lng: cur.lng,
          accuracy: 1.5,
          timestamp: now,
          headingDeg: cur.headingDeg,
          cumulativeMeters: 0,
          speedMps: amxSpeedRef.current,
          momentLabel: 'Start',
        };
        amxPointsRef.current = [startNode];
        setAmxPoints([startNode]);
      }

      if (action === 'straight_step') {
        if (!amxIsRunning || amxIsPaused) {
          const moved = offsetCoord(cur, cur.headingDeg, 5);
          const nextCur = { lat: moved.lat, lng: moved.lng, headingDeg: cur.headingDeg };
          amxCursorRef.current = nextCur;
          setAmxCursor(nextCur);
          commitAmxTipIfNeeded('Straight +5m', cur.headingDeg);
          if (autoFollowGpsRef.current) {
            setFocusTarget({ lat: nextCur.lat, lng: nextCur.lng, key: now });
          }
        } else {
          commitAmxTipIfNeeded('Straight', cur.headingDeg);
        }
        return;
      }

      const simpleDeltaMap: Partial<Record<AutoMapXSymbolAction, { delta: number; label: string }>> =
        {
          nudge_left_5: { delta: -5, label: 'Steer -5°' },
          nudge_right_5: { delta: 5, label: 'Steer +5°' },
          nudge_left_15: { delta: -15, label: 'Steer -15°' },
          nudge_right_15: { delta: 15, label: 'Steer +15°' },
          slight_left: { delta: -30, label: 'Slight Left' },
          slight_right: { delta: 30, label: 'Slight Right' },
          turn_left: { delta: -90, label: 'Left 90°' },
          turn_right: { delta: 90, label: 'Right 90°' },
          sharp_left: { delta: -120, label: 'Sharp Left' },
          sharp_right: { delta: 120, label: 'Sharp Right' },
          u_turn: { delta: 180, label: 'U-Turn' },
        };

      const deltaCfg = simpleDeltaMap[action];
      if (deltaCfg) {
        const nextH = (cur.headingDeg + deltaCfg.delta + 360) % 360;
        const nextCur = { ...cur, headingDeg: nextH };
        amxCursorRef.current = nextCur;
        setAmxCursor(nextCur);
        commitAmxTipIfNeeded(deltaCfg.label, nextH);
        return;
      }

      if (
        action === 'gentle_left' ||
        action === 'gentle_right' ||
        action === 'curve_left' ||
        action === 'curve_right'
      ) {
        commitAmxTipIfNeeded(undefined, cur.headingDeg);
        const isGentle = action === 'gentle_left' || action === 'gentle_right';
        const isLeft = action === 'gentle_left' || action === 'curve_left';
        const totalDelta = isGentle ? (isLeft ? -18 : 18) : isLeft ? -45 : 45;
        const steps = isGentle ? 6 : 5;
        const stepMeters = isGentle ? 2.0 : 1.5;
        const label = isGentle
          ? isLeft
            ? 'Gentle L'
            : 'Gentle R'
          : isLeft
          ? 'Curve L'
          : 'Curve R';

        let cursorPos: { lat: number; lng: number } = { lat: cur.lat, lng: cur.lng };
        const addedNodes: AutoMapXNode[] = [];
        let runningTotal = amxPointsRef.current[amxPointsRef.current.length - 1]?.cumulativeMeters ?? 0;

        for (let k = 1; k <= steps; k++) {
          const stepH = (cur.headingDeg + (totalDelta * k) / steps + 360) % 360;
          const p = offsetCoord(cursorPos, stepH, stepMeters);
          runningTotal += haversineMeters(cursorPos, p);
          addedNodes.push({
            lat: p.lat,
            lng: p.lng,
            accuracy: 1.5,
            timestamp: now + k,
            headingDeg: stepH,
            cumulativeMeters: runningTotal,
            speedMps: amxSpeedRef.current,
            momentLabel: k === steps ? label : undefined,
          });
          cursorPos = p;
        }

        const finalH = (cur.headingDeg + totalDelta + 360) % 360;
        const nextCur = { lat: cursorPos.lat, lng: cursorPos.lng, headingDeg: finalH };
        amxCursorRef.current = nextCur;
        setAmxCursor(nextCur);
        amxTotalMetersRef.current = runningTotal;
        const merged = [...amxPointsRef.current, ...addedNodes];
        amxPointsRef.current = merged;
        setAmxPoints(merged);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: nextCur.lat, lng: nextCur.lng, key: now });
        }
        return;
      }

      if (action === 's_curve_left' || action === 's_curve_right') {
        commitAmxTipIfNeeded(undefined, cur.headingDeg);
        const sideSign = action === 's_curve_right' ? 1 : -1;
        const lateralBearing = (cur.headingDeg + 90 * sideSign + 360) % 360;
        const totalForward = 10;
        const totalShift = 3.5;
        const steps = 6;
        const label = action === 's_curve_right' ? 'S-Bend R' : 'S-Bend L';

        let prevPos: { lat: number; lng: number } = { lat: cur.lat, lng: cur.lng };
        const sNodes: AutoMapXNode[] = [];
        let runningTotal = amxPointsRef.current[amxPointsRef.current.length - 1]?.cumulativeMeters ?? 0;

        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const fwdMeters = totalForward * t;
          const latMeters = totalShift * 0.5 * (1 - Math.cos(Math.PI * t));
          const forwardStep = offsetCoord(cur, cur.headingDeg, fwdMeters);
          const shifted =
            latMeters > 0.05 ? offsetCoord(forwardStep, lateralBearing, latMeters) : forwardStep;
          runningTotal += haversineMeters(prevPos, shifted);
          sNodes.push({
            lat: shifted.lat,
            lng: shifted.lng,
            accuracy: 1.5,
            timestamp: now + k,
            headingDeg: cur.headingDeg,
            cumulativeMeters: runningTotal,
            speedMps: amxSpeedRef.current,
            momentLabel: k === steps ? label : undefined,
          });
          prevPos = shifted;
        }

        const nextCur = { lat: prevPos.lat, lng: prevPos.lng, headingDeg: cur.headingDeg };
        amxCursorRef.current = nextCur;
        setAmxCursor(nextCur);
        amxTotalMetersRef.current = runningTotal;
        const merged = [...amxPointsRef.current, ...sNodes];
        amxPointsRef.current = merged;
        setAmxPoints(merged);
        if (autoFollowGpsRef.current) {
          setFocusTarget({ lat: nextCur.lat, lng: nextCur.lng, key: now });
        }
      }
    },
    [amxRewindIdx, amxIsRunning, amxIsPaused, commitAmxTipIfNeeded, handleAmxCommitRewind]
  );

  const handleAmxRewindByMeters = useCallback(
    (meters: number) => {
      const pts = amxPointsRef.current;
      if (pts.length < 2) return;
      const lastDist = pts[pts.length - 1].cumulativeMeters;
      const targetDist = Math.max(0, lastDist - meters);
      let targetIdx = 0;
      for (let i = pts.length - 1; i >= 0; i--) {
        if (pts[i].cumulativeMeters <= targetDist) {
          targetIdx = i;
          break;
        }
      }
      handleAmxCommitRewind(targetIdx);
    },
    [handleAmxCommitRewind]
  );

  const handleAmxUndoLastMoment = useCallback(() => {
    const pts = amxPointsRef.current;
    if (pts.length < 2) return;
    let momentIdx = -1;
    for (let i = pts.length - 1; i >= 1; i--) {
      if (pts[i].momentLabel) {
        momentIdx = i;
        break;
      }
    }
    const targetIdx = momentIdx > 0 ? Math.max(0, momentIdx - 1) : Math.max(0, pts.length - 2);
    handleAmxCommitRewind(targetIdx);
  }, [handleAmxCommitRewind]);

  const handleAmxAddHouse = useCallback(
    (houseNumber: string, side: HouseSide, shopName?: string) => {
      const cur = amxCursorRef.current;
      const sideBearing = side === 'left' ? (cur.headingDeg + 270) % 360 : (cur.headingDeg + 90) % 360;
      const visual = offsetCoord(cur, sideBearing, 7);
      const newHouse: VillageHouse = {
        id: `house-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        houseNumber,
        shopName,
        side,
        lat: visual.lat,
        lng: visual.lng,
        roadLat: cur.lat,
        roadLng: cur.lng,
        roadId: 'amx-draft',
        roadName: 'AutoMapX Road',
        villageName: detectedVillage,
        createdAt: new Date().toISOString(),
      };
      setAmxDraftHouses((prev) => [...prev, newHouse]);
      showToast(
        `Tagged ${houseNumber}${shopName ? ` (${shopName})` : ''} (${
          side === 'left' ? 'Left' : 'Right'
        })`
      );
    },
    [detectedVillage, showToast]
  );

  const handleAmxSaveRoad = useCallback(
    (payload: { roadName: string; villageName: string; surface: VillageRoad['surface'] }) => {
      commitAmxTipIfNeeded();
      const rawPts = amxPointsRef.current;
      const cleanPoints: LatLngPoint[] = [];
      for (const pt of rawPts) {
        if (cleanPoints.length === 0 || haversineMeters(cleanPoints[cleanPoints.length - 1], pt) >= 0.4) {
          cleanPoints.push({
            lat: pt.lat,
            lng: pt.lng,
            accuracy: pt.accuracy,
            timestamp: pt.timestamp,
          });
        }
      }
      if (cleanPoints.length < 2) {
        showToast('Move at least a few meters before saving this AutoMapX road.');
        return;
      }

      const nowIso = new Date().toISOString();
      const roadId = `road-amx-${Date.now()}`;
      const newRoad: VillageRoad = {
        id: roadId,
        name: payload.roadName,
        villageName: payload.villageName,
        surface: payload.surface,
        points: cleanPoints,
        distanceMeters: computePathDistance(cleanPoints),
        durationSeconds: amxElapsedSeconds,
        captureMode: 'simulated_walk',
        createdAt: nowIso,
      };

      const { linkedNewRoads, updatedExistingRoads, linkedSummaries } = autoLinkNewRoadsToNetwork(
        [newRoad],
        roads,
        null
      );
      const savedRoad = linkedNewRoads[0];

      const finalizedHouses = amxDraftHouses.map((h) => ({
        ...h,
        roadId: savedRoad.id,
        roadName: savedRoad.name,
        villageName: payload.villageName,
      }));

      setRoads([savedRoad, ...updatedExistingRoads]);
      if (finalizedHouses.length > 0) {
        setHouses((prev) => [...finalizedHouses, ...prev]);
      }

      setAmxIsRunning(false);
      setAmxIsPaused(false);
      setAmxElapsedSeconds(0);
      setAmxRewindIdx(null);
      setAmxPickingStart(true);
      amxPointsRef.current = [];
      setAmxPoints([]);
      amxTotalMetersRef.current = 0;
      setAmxDraftHouses([]);

      // Automatically switch AutoMapX into Simulator mode on the newly saved road so houses can be attached right away
      setAmxSimRoadId(savedRoad.id);
      setAmxSubMode('simulate');
      setFocusTarget({
        lat: savedRoad.points[0].lat,
        lng: savedRoad.points[0].lng,
        boundsPoints: savedRoad.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        key: Date.now(),
      });

      showToast(
        linkedSummaries[0]
          ? `Saved "${savedRoad.name}" · ${linkedSummaries[0]} · Simulator ready!`
          : `Saved "${savedRoad.name}" (${formatDistance(savedRoad.distanceMeters)}) · Play Simulator to add houses!`
      );
    },
    [amxElapsedSeconds, amxDraftHouses, commitAmxTipIfNeeded, roads, showToast]
  );

  const selectedAmxSimRoad = useMemo(
    () =>
      (amxSimRoadId ? roads.find((r) => r.id === amxSimRoadId) : null) ??
      roads.find((r) => r.captureMode === 'simulated_walk') ??
      roads[0] ??
      null,
    [roads, amxSimRoadId]
  );

  const handleAmxFitSimRoad = useCallback((road: VillageRoad) => {
    if (road.points.length >= 2) {
      setFocusTarget({
        lat: road.points[0].lat,
        lng: road.points[0].lng,
        boundsPoints: road.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        key: Date.now(),
      });
    } else if (road.points.length === 1) {
      setFocusTarget({
        lat: road.points[0].lat,
        lng: road.points[0].lng,
        zoom: 19,
        key: Date.now(),
      });
    }
  }, []);

  const handleAmxSelectSimRoad = useCallback(
    (roadId: string) => {
      setAmxSimRoadId(roadId);
      const road = roads.find((r) => r.id === roadId);
      if (road) handleAmxFitSimRoad(road);
    },
    [roads, handleAmxFitSimRoad]
  );

  const handleAmxSimPositionChange = useCallback(
    (pos: { lat: number; lng: number; headingDeg: number } | null, panMap: boolean) => {
      setAmxSimPoint(pos);
      if (pos && panMap) {
        setFocusTarget({
          lat: pos.lat,
          lng: pos.lng,
          zoom: mapViewRef.current.zoom < 18 ? 19 : undefined,
          key: Date.now(),
        });
      }
    },
    []
  );

  const handleAmxUpdateSimRoadMeta = useCallback(
    (roadId: string, patch: { name?: string; surface?: VillageRoad['surface'] }) => {
      setRoads((prev) =>
        prev.map((r) =>
          r.id === roadId
            ? {
                ...r,
                ...(patch.name != null ? { name: patch.name } : {}),
                ...(patch.surface != null ? { surface: patch.surface } : {}),
              }
            : r
        )
      );
      if (patch.name != null) {
        setHouses((prev) =>
          prev.map((h) => (h.roadId === roadId ? { ...h, roadName: patch.name! } : h))
        );
      }
      setAutoTrips((prev) =>
        prev.map((t) =>
          t.linkedRoadId === roadId
            ? {
                ...t,
                ...(patch.name != null ? { name: patch.name } : {}),
                ...(patch.surface != null ? { surface: patch.surface } : {}),
                houses:
                  patch.name != null
                    ? t.houses.map((h) => ({ ...h, roadName: patch.name! }))
                    : t.houses,
              }
            : t
        )
      );
    },
    []
  );

  const handleAmxAddHouseOnSavedRoad = useCallback(
    (
      roadId: string,
      point: { lat: number; lng: number },
      headingDeg: number,
      houseNumber: string,
      side: HouseSide,
      shopName?: string,
      note?: string
    ) => {
      const road = roads.find((r) => r.id === roadId);
      if (!road) return;
      const sideBearing = side === 'left' ? (headingDeg + 270) % 360 : (headingDeg + 90) % 360;
      const visual = offsetCoord(point, sideBearing, 7);

      const newHouse: VillageHouse = {
        id: `house-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        houseNumber,
        shopName,
        side,
        lat: visual.lat,
        lng: visual.lng,
        roadLat: point.lat,
        roadLng: point.lng,
        roadId: road.id,
        roadName: road.name,
        villageName: road.villageName,
        note,
        createdAt: new Date().toISOString(),
      };

      setHouses((prev) => [newHouse, ...prev]);
      setAutoTrips((prev) =>
        prev.map((t) =>
          t.linkedRoadId === road.id ? { ...t, houses: [...t.houses, newHouse] } : t
        )
      );
      showToast(
        `Added ${houseNumber}${shopName ? ` (${shopName})` : ''} (${
          side === 'left' ? 'Left' : 'Right'
        })`
      );
    },
    [roads, showToast]
  );

  const handleAmxRemoveSavedHouse = useCallback((houseId: string) => {
    setHouses((prev) => prev.filter((h) => h.id !== houseId));
    setAutoTrips((prev) =>
      prev.map((t) => ({
        ...t,
        houses: t.houses.filter((h) => h.id !== houseId),
      }))
    );
  }, []);

  const interactionMode: MapInteractionMode = useMemo(() => {
    if (isPickingSpot) return 'pick_user_location';
    if (mode === 'automapx' && amxSubMode === 'build' && amxPickingStart && !amxIsRunning) {
      return 'pick_automapx_start';
    }
    if (mode === 'add' && isRecording && !isPaused && captureMode === 'manual_trace') {
      return 'manual_trace';
    }
    return 'browse';
  }, [isPickingSpot, mode, amxSubMode, amxPickingStart, amxIsRunning, isRecording, isPaused, captureMode]);

  const handleMapClick = (lat: number, lng: number) => {
    if (mode === 'automapx' && amxSubMode === 'simulate' && selectedAmxSimRoad) {
      const clickPt = { lat, lng };
      const sampled = buildSimulatorWaypoints(selectedAmxSimRoad.points, 4);
      let minDist = Infinity;
      for (const pt of sampled) {
        const d = haversineMeters(clickPt, pt);
        if (d < minDist) minDist = d;
      }
      if (minDist <= 45) {
        setAmxSimJumpRequest({ lat, lng, key: Date.now() });
      }
      return;
    }
    if (interactionMode === 'pick_automapx_start') {
      const nextCur = {
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7)),
        headingDeg: amxCursorRef.current.headingDeg,
      };
      amxCursorRef.current = nextCur;
      setAmxCursor(nextCur);
      const startNode: AutoMapXNode = {
        lat: nextCur.lat,
        lng: nextCur.lng,
        accuracy: 1.5,
        timestamp: Date.now(),
        headingDeg: nextCur.headingDeg,
        cumulativeMeters: 0,
        speedMps: amxSpeedRef.current,
        momentLabel: 'Start',
      };
      amxPointsRef.current = [startNode];
      setAmxPoints([startNode]);
      amxTotalMetersRef.current = 0;
      maybeDetectVillage(lat, lng);
      showToast('AutoMapX start placed on map! Set speed & tap Start.');
      return;
    }
    if (interactionMode === 'manual_trace') {
      setWalkSegments((prev) => {
        const next = prev.length > 0 ? [...prev] : [[]];
        const lastIdx = next.length - 1;
        next[lastIdx] = [...next[lastIdx], { lat, lng, timestamp: Date.now() }];
        return next;
      });
      return;
    }
    if (interactionMode === 'pick_user_location') {
      setIsLiveGps(false);
      const pt: LatLngPoint = { lat, lng, accuracy: 2.0, timestamp: Date.now() };
      lastNavGpsRef.current = pt;
      setUserLocation(pt);
      setNavOrigin({ lat, lng });
      setIsPickingSpot(false);
      maybeDetectVillage(lat, lng);
      showToast('Updated your location spot on the map.');
    }
  };

  const isolateNavigation = mode === 'navigate' && Boolean(targetHouse);

  const previewMapElement = (
    <VillageMap
      roads={roads}
      houses={houses}
      draftHouses={[]}
      activeWalkSegments={[]}
      draftJunctions={[]}
      currentGps={userLocation}
      userHeadingDeg={userHeadingDeg}
      gpsQuality={gpsQuality}
      routeResult={previewRouteResult}
      alternativeRoutes={previewRouteOptions}
      liveProgress={null}
      startHouse={previewFromHouse}
      targetHouse={previewToHouse}
      darkMode={theme === 'dark'}
      isolateNavigation={false}
      activeInstruction={null}
      distanceToNextTurnMeters={null}
      interactionMode="browse"
      onMapClick={() => {}}
      onNavigateHouse={startNavigateToHouse}
      onSelectPendingBranch={handleSelectPendingBranch}
      onCenterGps={() => handleLocateMe(true)}
      isFollowingGps={isFollowingGps}
      initialView={mapViewRef.current}
      onViewChange={(view) => {
        mapViewRef.current = view;
      }}
      onUserDrag={() => {
        autoFollowGpsRef.current = false;
        setIsFollowingGps(false);
      }}
      focusTarget={focusTarget}
    />
  );

  const selectedAutoTrip = useMemo(
    () => (selectedAutoTripId ? autoTrips.find((t) => t.id === selectedAutoTripId) ?? null : null),
    [autoTrips, selectedAutoTripId]
  );

  const autoTripOverlay: AutoTripOverlay | null = useMemo(() => {
    if (isAutoRecording) {
      return {
        points: autoPoints,
        simPoint: null,
        houses: [],
      };
    }
    if (selectedAutoTrip) {
      return {
        points: selectedAutoTrip.points,
        simPoint: autoSimPoint,
        houses: selectedAutoTrip.houses,
      };
    }
    return null;
  }, [isAutoRecording, autoPoints, selectedAutoTrip, autoSimPoint]);

  const autoMapElement = (
    <VillageMap
      roads={roads}
      houses={houses}
      draftHouses={[]}
      activeWalkSegments={[]}
      draftJunctions={[]}
      currentGps={userLocation}
      userHeadingDeg={userHeadingDeg}
      gpsQuality={gpsQuality}
      routeResult={null}
      alternativeRoutes={[]}
      liveProgress={null}
      targetHouse={null}
      darkMode={theme === 'dark'}
      isolateNavigation={false}
      activeInstruction={null}
      distanceToNextTurnMeters={null}
      interactionMode="browse"
      onMapClick={() => {}}
      onNavigateHouse={startNavigateToHouse}
      onSelectPendingBranch={handleSelectPendingBranch}
      onCenterGps={() => handleLocateMe(true)}
      isFollowingGps={isFollowingGps}
      initialView={mapViewRef.current}
      onViewChange={(view) => {
        mapViewRef.current = view;
      }}
      onUserDrag={() => {
        autoFollowGpsRef.current = false;
        setIsFollowingGps(false);
      }}
      focusTarget={focusTarget}
      autoTripOverlay={autoTripOverlay}
    />
  );

  const mapElement = (
    <VillageMap
      roads={roads}
      houses={houses}
      draftHouses={draftHouses}
      activeWalkSegments={walkSegments}
      draftJunctions={draftJunctions}
      currentGps={userLocation}
      userHeadingDeg={userHeadingDeg}
      gpsQuality={gpsQuality}
      routeResult={navRouteResult}
      alternativeRoutes={navRouteOptions}
      liveProgress={mode === 'add' ? null : liveProgress}
      targetHouse={mode === 'add' ? null : targetHouse}
      darkMode={theme === 'dark'}
      isolateNavigation={isolateNavigation}
      activeInstruction={mode === 'add' ? null : activeNavInstruction}
      distanceToNextTurnMeters={mode === 'add' ? null : distanceToNextTurnMeters}
      interactionMode={interactionMode}
      onMapClick={handleMapClick}
      onNavigateHouse={startNavigateToHouse}
      onSelectPendingBranch={handleSelectPendingBranch}
      onExitNavigation={handleExitNavigation}
      onCenterGps={() => handleLocateMe(true)}
      isFollowingGps={isFollowingGps}
      topControlsOffset={mode === 'navigate'}
      initialView={mapViewRef.current}
      onViewChange={(view) => {
        mapViewRef.current = view;
      }}
      onUserDrag={() => {
        autoFollowGpsRef.current = false;
        setIsFollowingGps(false);
      }}
      focusTarget={focusTarget}
    />
  );

  const autoMapXOverlay: AutoMapXOverlay = useMemo(
    () => ({
      subMode: amxSubMode,
      cursor: amxCursor,
      points: amxPoints,
      rewindIndex: amxRewindIdx,
      isRunning: amxIsRunning,
      isPaused: amxIsPaused,
      houses: amxSubMode === 'build' ? amxDraftHouses : [],
      simRoadPoints: amxSubMode === 'simulate' ? selectedAmxSimRoad?.points : undefined,
      simPoint: amxSubMode === 'simulate' ? amxSimPoint : null,
    }),
    [
      amxSubMode,
      amxCursor,
      amxPoints,
      amxRewindIdx,
      amxIsRunning,
      amxIsPaused,
      amxDraftHouses,
      selectedAmxSimRoad,
      amxSimPoint,
    ]
  );

  const autoMapXMapElement = (
    <VillageMap
      roads={roads}
      houses={houses}
      draftHouses={[]}
      activeWalkSegments={[]}
      draftJunctions={[]}
      currentGps={userLocation}
      userHeadingDeg={userHeadingDeg}
      gpsQuality={gpsQuality}
      routeResult={null}
      alternativeRoutes={[]}
      liveProgress={null}
      targetHouse={null}
      darkMode={theme === 'dark'}
      isolateNavigation={false}
      activeInstruction={null}
      distanceToNextTurnMeters={null}
      interactionMode={interactionMode}
      onMapClick={handleMapClick}
      onNavigateHouse={startNavigateToHouse}
      onSelectPendingBranch={handleSelectPendingBranch}
      onCenterGps={() => {
        autoFollowGpsRef.current = true;
        setIsFollowingGps(true);
        if (amxSubMode === 'simulate' && amxSimPoint) {
          setFocusTarget({ lat: amxSimPoint.lat, lng: amxSimPoint.lng, key: Date.now() });
        } else if (amxIsRunning || amxPoints.length > 1) {
          setFocusTarget({ lat: amxCursor.lat, lng: amxCursor.lng, key: Date.now() });
        } else {
          handleLocateMe(true);
        }
      }}
      isFollowingGps={isFollowingGps}
      initialView={mapViewRef.current}
      onViewChange={(view) => {
        mapViewRef.current = view;
      }}
      onUserDrag={() => {
        autoFollowGpsRef.current = false;
        setIsFollowingGps(false);
      }}
      focusTarget={focusTarget}
      autoMapXOverlay={autoMapXOverlay}
    />
  );

  return (
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Clean Minimal Top Header — Primary Workspace Tabs live in the Bottom Nav */}
      <header className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 h-11 flex items-center justify-between gap-2 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            GramPath
          </span>
          {amxIsRunning && mode !== 'automapx' && (
            <button
              type="button"
              onClick={() => setMode('automapx')}
              className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/70 text-violet-800 dark:text-violet-300 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  amxIsPaused ? 'bg-amber-500' : 'bg-violet-600 animate-pulse'
                }`}
              />
              <span>AutoMapX {amxIsPaused ? 'Paused' : 'Live'}</span>
            </button>
          )}
          {isAutoRecording && mode !== 'auto' && (
            <button
              type="button"
              onClick={() => setMode('auto')}
              className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>Auto Live</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center cursor-pointer transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <PWAInstallButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 relative flex flex-col lg:flex-row">
        {mode === 'preview' ? (
          <div className="w-full h-full">
            <SavedDataView
              roads={roads}
              houses={houses}
              mapSlot={previewMapElement}
              fromHouseId={previewFromHouseId}
              toHouseId={previewToHouseId}
              onSelectFromHouse={(id) => {
                setPreviewFromHouseId(id);
                setPreviewSelectedRouteIndex(0);
              }}
              onSelectToHouse={(id) => {
                setPreviewToHouseId(id);
                setPreviewSelectedRouteIndex(0);
              }}
              routeOptions={previewRouteOptions}
              selectedRouteIndex={previewSafeRouteIdx}
              onSelectRouteIndex={setPreviewSelectedRouteIndex}
              onNavigateHouse={startNavigateToHouse}
              onMapPendingBranch={handleSelectPendingBranch}
              onFocusRoad={(road) => {
                if (road.points.length >= 2) {
                  setFocusTarget({
                    lat: road.points[0].lat,
                    lng: road.points[0].lng,
                    boundsPoints: road.points.map((p) => ({ lat: p.lat, lng: p.lng })),
                    key: Date.now(),
                  });
                } else if (road.points.length === 1) {
                  setFocusTarget({
                    lat: road.points[0].lat,
                    lng: road.points[0].lng,
                    zoom: 18,
                    key: Date.now(),
                  });
                }
              }}
              onFocusHouse={(house) =>
                setFocusTarget({
                  lat: house.lat,
                  lng: house.lng,
                  zoom: 19,
                  key: Date.now(),
                })
              }
              onFitAll={() => handleFitAllSaved()}
              onDeleteHouse={(id) => {
                setHouses((prev) => prev.filter((h) => h.id !== id));
                setAutoTrips((prev) =>
                  prev.map((t) => ({
                    ...t,
                    houses: t.houses.filter((h) => h.id !== id),
                  }))
                );
              }}
              onDeleteRoad={(id) => {
                setRoads((prev) => prev.filter((r) => r.id !== id));
                setHouses((prev) => prev.filter((h) => h.roadId !== id));
              }}
              onImportBackup={(data) => {
                setRoads((prev) => {
                  const ids = new Set(prev.map((r) => r.id));
                  return [...data.roads.filter((r) => !ids.has(r.id)), ...prev];
                });
                setHouses((prev) => {
                  const ids = new Set(prev.map((h) => h.id));
                  return [...data.houses.filter((h) => !ids.has(h.id)), ...prev];
                });
                showToast('Restored backup into localStorage.');
              }}
              onClearAll={() => {
                const empty = clearLocalStore();
                setRoads(empty.roads);
                setHouses(empty.houses);
                setTargetHouse(null);
                setPreviewFromHouseId(null);
                setPreviewToHouseId(null);
                showToast('Cleared all saved roads and houses.');
              }}
            />
          </div>
        ) : mode === 'auto' ? (
          <AutoWorkspace
            trips={autoTrips}
            selectedTripId={selectedAutoTripId}
            onSelectTrip={handleSelectAutoTrip}
            onDeleteTrip={handleDeleteAutoTrip}
            onUpdateTripMeta={handleUpdateAutoTripMeta}
            onFitTripRoad={handleFitTripRoad}
            isAutoRecording={isAutoRecording}
            isAutoPaused={isAutoPaused}
            autoPoints={autoPoints}
            autoElapsedSeconds={autoElapsedSeconds}
            gpsPrecisionMode={gpsPrecisionMode}
            onTogglePrecisionMode={() =>
              setGpsPrecisionMode((m) => (m === 'accurate_5m' ? 'relaxed_15m' : 'accurate_5m'))
            }
            gpsQuality={gpsQuality}
            gpsError={autoGpsError}
            onStartAuto={handleStartAutoTrip}
            onPauseResumeAuto={handlePauseResumeAutoTrip}
            onCloseAndSaveAuto={handleCloseAndSaveAutoTrip}
            onDiscardAuto={handleDiscardAutoTrip}
            onTestStepAuto={handleTestStepAuto}
            onLocateMe={() => handleLocateMe(true)}
            onSimPositionChange={handleAutoSimPositionChange}
            onAddHouseOnTrip={handleAddHouseOnAutoTrip}
            onRemoveHouseOnTrip={handleRemoveHouseOnAutoTrip}
            onFocusHouse={(house) =>
              setFocusTarget({
                lat: house.lat,
                lng: house.lng,
                zoom: 19,
                key: Date.now(),
              })
            }
            nextSuggestedHouse={nextSuggestedHouse}
            mapSlot={autoMapElement}
          />
        ) : mode === 'automapx' ? (
          <AutoMapXWorkspace
            subMode={amxSubMode}
            onChangeSubMode={(nextSub) => {
              setAmxSubMode(nextSub);
              if (nextSub === 'simulate' && selectedAmxSimRoad) {
                handleAmxFitSimRoad(selectedAmxSimRoad);
              }
            }}
            liveGps={userLocation}
            gpsQuality={gpsQuality}
            cursor={amxCursor}
            points={amxPoints}
            speedMps={amxSpeedMps}
            isRunning={amxIsRunning}
            isPaused={amxIsPaused}
            elapsedSeconds={amxElapsedSeconds}
            isPickingStart={amxPickingStart}
            rewindIndex={amxRewindIdx}
            draftHouses={amxDraftHouses}
            detectedVillage={detectedVillage}
            nextSuggestedHouse={nextSuggestedHouse}
            onTogglePickStart={() => setAmxPickingStart((v) => !v)}
            onUseLiveGpsAsStart={handleAmxUseLiveGpsAsStart}
            onSetSpeedMps={setAmxSpeedMps}
            onSetHeadingDeg={(deg) => {
              const nextCur = { ...amxCursorRef.current, headingDeg: ((deg % 360) + 360) % 360 };
              amxCursorRef.current = nextCur;
              setAmxCursor(nextCur);
            }}
            onStart={handleAmxStart}
            onPauseResume={handleAmxPauseResume}
            onDiscard={handleAmxDiscard}
            onSymbolAction={handleAmxSymbolAction}
            onRewindByMeters={handleAmxRewindByMeters}
            onUndoLastMoment={handleAmxUndoLastMoment}
            onSetRewindIndex={setAmxRewindIdx}
            onCommitRewind={handleAmxCommitRewind}
            onAddHouse={handleAmxAddHouse}
            onRemoveHouse={(id) => setAmxDraftHouses((prev) => prev.filter((h) => h.id !== id))}
            onSaveRoad={handleAmxSaveRoad}
            onLocateLiveGps={() => handleLocateMe(true)}
            savedRoads={roads}
            savedHouses={houses}
            selectedSimRoadId={selectedAmxSimRoad?.id ?? null}
            onSelectSimRoad={handleAmxSelectSimRoad}
            onFitSimRoad={handleAmxFitSimRoad}
            onUpdateSimRoadMeta={handleAmxUpdateSimRoadMeta}
            onSimPositionChange={handleAmxSimPositionChange}
            simJumpRequest={amxSimJumpRequest}
            onAddHouseOnSavedRoad={handleAmxAddHouseOnSavedRoad}
            onRemoveSavedHouse={handleAmxRemoveSavedHouse}
            onFocusHouse={(house) =>
              setFocusTarget({
                lat: house.lat,
                lng: house.lng,
                zoom: 19,
                key: Date.now(),
              })
            }
            mapSlot={autoMapXMapElement}
          />
        ) : mode === 'add' ? (
          <AddWalkWorkspace
            captureMode={captureMode}
            onChangeCaptureMode={setCaptureMode}
            gpsPrecisionMode={gpsPrecisionMode}
            onTogglePrecisionMode={() =>
              setGpsPrecisionMode((m) => (m === 'accurate_5m' ? 'relaxed_15m' : 'accurate_5m'))
            }
            gpsQuality={gpsQuality}
            currentGps={userLocation}
            isRecording={isRecording}
            isPaused={isPaused}
            segments={walkSegments}
            draftHouses={draftHouses}
            draftJunctions={draftJunctions}
            pendingBranches={pendingBranches}
            activeBranchLabel={activeLinkedBranch?.label ?? null}
            straightHeadingDeg={straightHeadingDeg}
            elapsedSeconds={elapsedSeconds}
            gpsError={gpsError}
            detectedVillage={detectedVillage}
            onStartWalk={handleStartWalk}
            onPauseResume={handlePauseResumeWalk}
            onUndoLastPoint={handleUndoLastPoint}
            onDiscardWalk={handleDiscardWalk}
            onSimulateStep={handleSimulateStep}
            onStraightSymbol={handleStraightSymbol}
            onCreateMultiBranchJunction={handleCreateMultiBranchJunction}
            onSelectPendingBranch={handleSelectPendingBranch}
            onAddHouseOnWalk={handleAddHouseOnWalk}
            onRemoveDraftHouse={(id) =>
              setDraftHouses((prev) => prev.filter((h) => h.id !== id))
            }
            onSaveWalkedRoad={handleSaveWalkedRoad}
            nextSuggestedHouse={nextSuggestedHouse}
            onLocateMe={handleLocateMe}
            mapSlot={mapElement}
          />
        ) : (
          <>
            {/* Desktop Left Panel for Navigate */}
            <aside className="hidden lg:block w-[360px] shrink-0 h-full">
              <NavigationPanel
                houses={houses}
                userLocation={userLocation}
                isLiveGps={isLiveGps}
                isPickingSpot={isPickingSpot}
                onToggleLiveGps={() => {
                  setIsLiveGps((prev) => {
                    const next = !prev;
                    if (next) handleLocateMe();
                    return next;
                  });
                }}
                onTogglePickSpot={() => setIsPickingSpot((v) => !v)}
                targetHouse={targetHouse}
                routeResult={navRouteResult}
                routeOptions={navRouteOptions}
                selectedRouteIndex={safeSelectedRouteIndex}
                onSelectRouteIndex={(idx) => {
                  setSelectedRouteIndex(idx);
                  setCurrentNavStepIdx(0);
                  simIdxRef.current = 0;
                  setIsSimulatingNav(false);
                }}
                liveProgress={liveProgress}
                currentStepIndex={activeNavStepIdx}
                distanceToNextTurnMeters={distanceToNextTurnMeters}
                voiceEnabled={voiceEnabled}
                isSimulatingNav={isSimulatingNav}
                onToggleVoice={() => setVoiceEnabled((v) => !v)}
                onSelectHouseToNavigate={startNavigateToHouse}
                onExitNavigation={handleExitNavigation}
                onStepNavSim={stepNavSimulation}
                onToggleAutoSim={() => setIsSimulatingNav((v) => !v)}
                onFocusPoint={(lat, lng, zoom) =>
                  setFocusTarget({ lat, lng, zoom, key: Date.now() })
                }
              />
            </aside>

            {/* Big Map Viewport with Floating Dual Search Bars (Navigate Mode Only!) */}
            <div className="flex-1 min-w-0 min-h-0 w-full h-full relative">
              {/* Floating Dual Search Bars: Hidden automatically in Add & Preview modes */}
              <div className="absolute top-2.5 inset-x-2 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-[480] grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2">
                {/* Search Bar 1: Area / Village */}
                <div className="relative min-w-0 sm:flex-1">
                  <form
                    onSubmit={handleAreaSearchSubmit}
                    className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 ml-2 sm:ml-2.5 shrink-0" />
                    <input
                      type="text"
                      placeholder="Village / area..."
                      value={areaQuery}
                      onChange={(e) => setAreaQuery(e.target.value)}
                      className="w-full min-w-0 px-1.5 sm:px-2 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
                    />
                    {areaQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setAreaQuery('');
                          setAreaResults([]);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSearchingArea}
                      className="px-2 sm:px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold shrink-0 cursor-pointer border-l border-slate-200 dark:border-slate-700"
                    >
                      {isSearchingArea ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Area'}
                    </button>
                  </form>

                  {areaResults.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto z-50">
                      {areaResults.map((item) => (
                        <button
                          key={item.place_id}
                          type="button"
                          onClick={() => {
                            setFocusTarget({
                              lat: Number(item.lat),
                              lng: Number(item.lon),
                              zoom: 17,
                              key: Date.now(),
                            });
                            setDetectedVillage(
                              item.display_name.split(',')[0]?.trim() || 'My Village'
                            );
                            setAreaResults([]);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{item.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search Bar 2: House Number or Shop Name */}
                <div className="relative min-w-0 sm:w-60 sm:shrink-0">
                  <form
                    onSubmit={handleHouseSearchSubmit}
                    className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-emerald-400 dark:border-emerald-700 rounded-xl shadow-md overflow-hidden focus-within:ring-2 focus-within:ring-emerald-600"
                  >
                    <Store className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 ml-2 shrink-0" />
                    <input
                      type="text"
                      placeholder="House or Shop..."
                      value={houseQuery}
                      onFocus={() => setHouseDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setHouseDropdownOpen(false), 180)}
                      onChange={(e) => {
                        setHouseQuery(e.target.value);
                        setHouseDropdownOpen(true);
                      }}
                      className="w-full min-w-0 px-1.5 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-2 sm:px-2.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Track
                    </button>
                  </form>

                  {houseDropdownOpen && matchingHouses.length > 0 && (
                    <div className="absolute right-0 w-64 sm:w-72 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto z-50">
                      {matchingHouses.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onMouseDown={() => startNavigateToHouse(h)}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/60 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              House <span className="font-mono">{h.houseNumber}</span>
                              {h.shopName && (
                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                  {' '}
                                  · {h.shopName}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-slate-500 dark:text-slate-400 shrink-0 text-[11px]">
                            {h.side === 'left' ? 'Left' : 'Right'} · {h.roadName}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {interactionMode === 'pick_user_location' && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[450] px-3 py-1.5 bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 text-xs font-medium rounded-lg shadow flex items-center gap-2 whitespace-nowrap">
                  <span>Tap map to place your location</span>
                  <button
                    type="button"
                    onClick={() => setIsPickingSpot(false)}
                    className="underline text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {mapElement}

              {/* Mobile Compact Bottom Sheet for Navigate */}
              <div className="lg:hidden absolute bottom-0 inset-x-0 z-[500]">
                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-lg">
                  <button
                    type="button"
                    onClick={() => setMobileSheetOpen((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <span className="truncate pr-2">
                      {targetHouse
                        ? `Tracking House ${targetHouse.houseNumber}${
                            targetHouse.shopName ? ` · ${targetHouse.shopName}` : ''
                          } (${targetHouse.side === 'left' ? 'Left' : 'Right'})`
                        : `Select a House or Shop (${houses.length}) to Track`}
                    </span>
                    {mobileSheetOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    )}
                  </button>

                  {mobileSheetOpen && (
                    <div className="max-h-[58vh] overflow-y-auto border-t border-slate-100 dark:border-slate-800">
                      <NavigationPanel
                        houses={houses}
                        userLocation={userLocation}
                        isLiveGps={isLiveGps}
                        isPickingSpot={isPickingSpot}
                        onToggleLiveGps={() => {
                          setIsLiveGps((prev) => {
                            const next = !prev;
                            if (next) handleLocateMe();
                            return next;
                          });
                        }}
                        onTogglePickSpot={() => {
                          setIsPickingSpot((v) => !v);
                          setMobileSheetOpen(false);
                        }}
                        targetHouse={targetHouse}
                        routeResult={navRouteResult}
                        routeOptions={navRouteOptions}
                        selectedRouteIndex={safeSelectedRouteIndex}
                        onSelectRouteIndex={(idx) => {
                          setSelectedRouteIndex(idx);
                          setCurrentNavStepIdx(0);
                          simIdxRef.current = 0;
                          setIsSimulatingNav(false);
                        }}
                        liveProgress={liveProgress}
                        currentStepIndex={activeNavStepIdx}
                        distanceToNextTurnMeters={distanceToNextTurnMeters}
                        voiceEnabled={voiceEnabled}
                        isSimulatingNav={isSimulatingNav}
                        onToggleVoice={() => setVoiceEnabled((v) => !v)}
                        onSelectHouseToNavigate={(h) => {
                          startNavigateToHouse(h);
                          setMobileSheetOpen(false);
                        }}
                        onExitNavigation={handleExitNavigation}
                        onStepNavSim={stepNavSimulation}
                        onToggleAutoSim={() => setIsSimulatingNav((v) => !v)}
                        onFocusPoint={(lat, lng, zoom) => {
                          setFocusTarget({ lat, lng, zoom, key: Date.now() });
                          setMobileSheetOpen(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {toastMessage && (
          <div className="fixed bottom-16 right-4 z-[1100] max-w-xs sm:max-w-sm bg-slate-900 dark:bg-slate-800 text-white border border-slate-800 dark:border-slate-700 text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3">
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <OfflineIndicator />
      </main>

      {/* Persistent Thumb-Zone Bottom Navigation Bar with AutoMapX */}
      <nav
        aria-label="Primary Workspace Navigation"
        className="shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 h-14 px-1 sm:px-6 grid grid-cols-5 items-center z-40"
      >
        <button
          type="button"
          onClick={() => setMode('navigate')}
          className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            mode === 'navigate'
              ? 'text-sky-700 dark:text-sky-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Navigation className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
            Navigate
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('add');
            setTargetHouse(null);
          }}
          className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            mode === 'add'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <PlusCircle className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
            Add
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('automapx');
            setTargetHouse(null);
            handleLocateMe(false);
            if (amxPoints.length === 0 && !amxIsRunning) {
              const cur = {
                lat: userLocation.lat,
                lng: userLocation.lng,
                headingDeg: userHeadingDeg ?? amxCursorRef.current.headingDeg,
              };
              amxCursorRef.current = cur;
              setAmxCursor(cur);
            }
          }}
          className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            mode === 'automapx'
              ? 'text-violet-700 dark:text-violet-400'
              : 'text-slate-600 dark:text-slate-300 hover:text-violet-700 dark:hover:text-violet-300'
          }`}
        >
          <div className="relative">
            <Gauge className="w-5 h-5" />
            {amxIsRunning && !amxIsPaused && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-violet-600 animate-pulse" />
            )}
          </div>
          <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">
            AutoMapX
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('auto');
            setTargetHouse(null);
            if (!isAutoRecording) {
              const trip =
                (selectedAutoTripId ? autoTrips.find((t) => t.id === selectedAutoTripId) : null) ??
                autoTrips[0] ??
                null;
              if (trip) {
                setSelectedAutoTripId(trip.id);
                setTimeout(() => handleFitTripRoad(trip), 60);
              }
            }
          }}
          className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            mode === 'auto'
              ? 'text-sky-700 dark:text-sky-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Route className="w-5 h-5" />
            {isAutoRecording && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
            Auto
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('preview');
            setTimeout(() => {
              if (!previewFromHouse && !previewToHouse) {
                handleFitAllSaved();
              }
            }, 60);
          }}
          className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            mode === 'preview'
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Eye className="w-5 h-5" />
          <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
            Preview ({houses.length})
          </span>
        </button>
      </nav>
    </div>
  );
}

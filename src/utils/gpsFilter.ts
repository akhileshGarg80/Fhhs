import type { LatLngPoint } from '../types/map.ts';
import { haversineMeters } from './geo.ts';

export type GpsPrecisionMode = 'accurate_5m' | 'relaxed_15m';

export interface GpsQualityReport {
  accuracyMeters: number | null;
  quality: 'ultra' | 'good' | 'weak' | 'none';
  label: string;
  accepted: boolean;
}

/**
 * Evaluates raw hardware GPS fix against a practical 5m village road precision limit.
 */
export function evaluateGpsFix(
  accuracy: number | undefined,
  precisionMode: GpsPrecisionMode
): GpsQualityReport {
  if (accuracy == null || !Number.isFinite(accuracy)) {
    return {
      accuracyMeters: null,
      quality: 'none',
      label: 'No GPS',
      accepted: false,
    };
  }

  const rounded = Number(accuracy.toFixed(1));
  const limit = precisionMode === 'accurate_5m' ? 5.0 : 15.0;

  if (rounded <= 5.0) {
    return {
      accuracyMeters: rounded,
      quality: 'ultra',
      label: `±${rounded} m`,
      accepted: true,
    };
  }
  if (rounded <= 15.0) {
    return {
      accuracyMeters: rounded,
      quality: 'good',
      label: `±${rounded} m`,
      accepted: rounded <= limit,
    };
  }
  return {
    accuracyMeters: rounded,
    quality: 'weak',
    label: `±${rounded} m`,
    accepted: false,
  };
}

/**
 * Inverse-variance weighted Kalman-style smoothing + walking velocity spike rejection
 * and short-window median anchor to suppress GNSS jitter on mobile devices.
 */
export class PrecisionGpsSmoother {
  private estLat: number | null = null;
  private estLng: number | null = null;
  private variance = 12; // meters^2
  private recentWindow: LatLngPoint[] = [];

  reset(): void {
    this.estLat = null;
    this.estLng = null;
    this.variance = 12;
    this.recentWindow = [];
  }

  update(raw: LatLngPoint, lastTimestamp?: number): LatLngPoint {
    const acc = Math.max(1.0, raw.accuracy ?? 4);
    const measVar = acc * acc;

    this.recentWindow.push(raw);
    if (this.recentWindow.length > 4) {
      this.recentWindow.shift();
    }

    if (this.estLat === null || this.estLng === null) {
      this.estLat = raw.lat;
      this.estLng = raw.lng;
      this.variance = measVar;
      return raw;
    }

    const dtSec =
      lastTimestamp && raw.timestamp
        ? Math.max(0.2, Math.min(10, (raw.timestamp - lastTimestamp) / 1000))
        : 1;

    const rawJump = haversineMeters(
      { lat: this.estLat, lng: this.estLng },
      { lat: raw.lat, lng: raw.lng }
    );

    // Reject impossible teleportation spikes while walking (e.g., > 8 m/s with coarse fix)
    const maxPlausibleJump = Math.max(12, dtSec * 7.5);
    if (rawJump > maxPlausibleJump && acc > 4.5) {
      return {
        lat: Number(this.estLat.toFixed(7)),
        lng: Number(this.estLng.toFixed(7)),
        accuracy: raw.accuracy,
        timestamp: raw.timestamp,
      };
    }

    // If stationary or micro-jitter (< 1.5m), blend with inverse-variance weighted window
    if (rawJump < 1.5 && this.recentWindow.length >= 2) {
      let wSum = 0;
      let latSum = 0;
      let lngSum = 0;
      for (const pt of this.recentWindow) {
        const ptAcc = Math.max(1.0, pt.accuracy ?? 6);
        const w = 1 / (ptAcc * ptAcc);
        wSum += w;
        latSum += pt.lat * w;
        lngSum += pt.lng * w;
      }
      if (wSum > 0) {
        const avgLat = latSum / wSum;
        const avgLng = lngSum / wSum;
        this.estLat = this.estLat * 0.45 + avgLat * 0.55;
        this.estLng = this.estLng * 0.45 + avgLng * 0.55;
        this.variance = Math.min(this.variance, measVar);
        return {
          lat: Number(this.estLat.toFixed(7)),
          lng: Number(this.estLng.toFixed(7)),
          accuracy: raw.accuracy,
          timestamp: raw.timestamp,
        };
      }
    }

    // Walking speed ~1.4 m/s -> adapt process noise when moving so marker tracks tightly
    const motionNoise = rawJump >= 1.5 ? Math.max(5.0, rawJump * 3.2) : 1.2;
    const processNoise = motionNoise * dtSec;
    this.variance += processNoise;

    let gain = this.variance / (this.variance + measVar);
    if (rawJump >= 1.5 && acc <= 10) {
      gain = Math.max(gain, 0.55);
    }

    this.estLat = this.estLat + gain * (raw.lat - this.estLat);
    this.estLng = this.estLng + gain * (raw.lng - this.estLng);
    this.variance = (1 - gain) * this.variance;

    return {
      lat: Number(this.estLat.toFixed(7)),
      lng: Number(this.estLng.toFixed(7)),
      accuracy: raw.accuracy,
      timestamp: raw.timestamp,
    };
  }
}

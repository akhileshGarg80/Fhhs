export interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export async function searchPlaceNominatim(query: string): Promise<NominatimSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(
    q
  )}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimSearchResult[];
  return Array.isArray(data) ? data : [];
}

export async function reverseGeocodeVillage(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return 'My Village';
    const data = (await res.json()) as { address?: Record<string, string> };
    const addr = data.address ?? {};
    return (
      addr.village ||
      addr.hamlet ||
      addr.suburb ||
      addr.town ||
      addr.city_district ||
      addr.county ||
      'My Village'
    );
  } catch {
    return 'My Village';
  }
}

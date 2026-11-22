import type { PlaceType, ShopCategory, VillageHouse } from '../types/map.ts';

export const PLACE_TYPE_OPTIONS: {
  id: PlaceType;
  label: string;
  shortLabel: string;
  color: string;
}[] = [
  { id: 'house', label: 'House / Ghar', shortLabel: 'House', color: '#15803d' },
  { id: 'shop', label: 'Shop / Dukan', shortLabel: 'Shop', color: '#059669' },
  { id: 'temple', label: 'Temple / Mandir', shortLabel: 'Temple', color: '#ea580c' },
  { id: 'school', label: 'School / Coaching', shortLabel: 'School', color: '#4f46e5' },
  { id: 'clinic', label: 'Clinic / Hospital', shortLabel: 'Clinic', color: '#e11d48' },
  { id: 'masjid', label: 'Masjid / Mosque', shortLabel: 'Masjid', color: '#0d9488' },
  { id: 'landmark', label: 'Landmark / Chowk', shortLabel: 'Landmark', color: '#7c3aed' },
];

export const SHOP_CATEGORY_OPTIONS: {
  id: ShopCategory;
  label: string;
  shortLabel: string;
  color: string;
  keywords: string[];
}[] = [
  {
    id: 'kirana',
    label: 'Kirana / Grocery',
    shortLabel: 'Kirana',
    color: '#059669',
    keywords: ['kirana', 'grocery', 'ration', 'general store', 'rashan', 'provision'],
  },
  {
    id: 'online',
    label: 'Online Shop / CSC',
    shortLabel: 'Online',
    color: '#0284c7',
    keywords: ['online', 'csc', 'cyber', 'internet', 'jan seva', 'mp online', 'photocopy', 'bank'],
  },
  {
    id: 'medical',
    label: 'Medical / Pharmacy',
    shortLabel: 'Medical',
    color: '#e11d48',
    keywords: ['medical', 'pharmacy', 'chemist', 'dawai', 'medicine'],
  },
  {
    id: 'hardware',
    label: 'Hardware / Mobile',
    shortLabel: 'Hardware',
    color: '#b45309',
    keywords: ['hardware', 'electric', 'electronics', 'mobile', 'repair', 'cement'],
  },
  {
    id: 'tea_snacks',
    label: 'Tea / Sweets / Hotel',
    shortLabel: 'Tea/Hotel',
    color: '#d97706',
    keywords: ['tea', 'chai', 'hotel', 'sweets', 'mithai', 'nashta', 'dhaba', 'bakery'],
  },
  {
    id: 'tailor',
    label: 'Cloth / Tailor',
    shortLabel: 'Cloth',
    color: '#9333ea',
    keywords: ['cloth', 'kapda', 'tailor', 'silai', 'garments', 'saree'],
  },
  {
    id: 'general',
    label: 'General Shop',
    shortLabel: 'General',
    color: '#0f766e',
    keywords: ['shop', 'dukan', 'store', 'bazaar'],
  },
];

export function getEffectivePlaceType(
  h: Pick<VillageHouse, 'placeType' | 'shopName' | 'shopCategory'>
): PlaceType {
  if (h.placeType) return h.placeType;
  if (h.shopCategory || h.shopName?.trim()) return 'shop';
  return 'house';
}

export function isPublicPoi(
  h: Pick<VillageHouse, 'placeType' | 'shopName' | 'shopCategory'>
): boolean {
  return getEffectivePlaceType(h) !== 'house';
}

export function getPlaceBadgeLabel(
  h: Pick<VillageHouse, 'placeType' | 'shopName' | 'shopCategory'>
): string {
  const pt = getEffectivePlaceType(h);
  if (pt === 'shop') {
    const cat = h.shopCategory
      ? SHOP_CATEGORY_OPTIONS.find((c) => c.id === h.shopCategory)
      : undefined;
    return cat ? `${cat.shortLabel} Shop` : 'Shop';
  }
  const found = PLACE_TYPE_OPTIONS.find((p) => p.id === pt);
  return found ? found.shortLabel : 'House';
}

export function getPlaceColor(
  placeType: PlaceType,
  shopCategory?: ShopCategory,
  side?: 'left' | 'right',
  isStart?: boolean,
  isTarget?: boolean
): string {
  if (isTarget) return '#dc2626';
  if (isStart) return '#0284c7';
  if (placeType === 'shop') {
    const cat = shopCategory
      ? SHOP_CATEGORY_OPTIONS.find((c) => c.id === shopCategory)
      : undefined;
    return cat ? cat.color : '#059669';
  }
  if (placeType !== 'house') {
    const found = PLACE_TYPE_OPTIONS.find((p) => p.id === placeType);
    return found ? found.color : '#059669';
  }
  return side === 'left' ? '#15803d' : '#d97706';
}

export function getPlaceMarkerSvgHtml(
  placeType: PlaceType,
  shopCategory?: ShopCategory,
  size = 13
): string {
  const s = size;
  if (placeType === 'temple') {
    // Saffron Temple spire / kalash silhouette
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 2v3"/><path d="M9 5h6"/><path d="M7 11l5-6 5 6"/><path d="M5 15h14"/><path d="M6 15v6h12v-6"/><path d="M10 21v-3a2 2 0 0 1 4 0v3"/></svg>`;
  }
  if (placeType === 'school') {
    // Graduation cap / school
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
  }
  if (placeType === 'clinic') {
    // Medical cross
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10M7 12h10"/></svg>`;
  }
  if (placeType === 'masjid') {
    // Dome & minar
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 3v2"/><path d="M6 12a6 6 0 0 1 12 0"/><path d="M4 12h16v9H4z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/></svg>`;
  }
  if (placeType === 'landmark') {
    // Star landmark
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 7.1-1.01L12 2z"/></svg>`;
  }
  if (placeType === 'shop') {
    if (shopCategory === 'online') {
      // Online Shop / CSC Monitor-Globe
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="3"/></svg>`;
    }
    if (shopCategory === 'medical') {
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 5v14M5 12h14"/></svg>`;
    }
    if (shopCategory === 'kirana') {
      // Kirana shopping basket
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 10h14l-1.5 9h-11z"/><path d="M9 10l3-5 3 5"/></svg>`;
    }
    // Storefront
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 9l1-5h16l1 5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/></svg>`;
  }
  // Default house icon
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>`;
}

/**
 * Returns relevance rank (0 = exact best match, higher = weaker match, null = no match)
 * supporting searches like: "shop", "online shop", "kirana", "temple", "mandir", "school", or house numbers.
 */
export function getPlaceSearchScore(h: VillageHouse, rawQuery: string): number | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    // Empty query: prioritize POIs (Shops, Temples, Schools) first cleanly
    return isPublicPoi(h) ? 0 : 1;
  }

  const num = h.houseNumber.toLowerCase();
  const shop = (h.shopName ?? '').toLowerCase();
  const road = h.roadName.toLowerCase();
  const note = (h.note ?? '').toLowerCase();
  const pt = getEffectivePlaceType(h);
  const cat = h.shopCategory;
  const catOpt = cat ? SHOP_CATEGORY_OPTIONS.find((c) => c.id === cat) : undefined;
  const ptOpt = PLACE_TYPE_OPTIONS.find((p) => p.id === pt);

  if (num === q) return 0;
  if (shop === q) return 0;

  // Smart category intent matching
  const tokens = q.split(/\s+/).filter(Boolean);
  const wantsShop = tokens.some((t) => t === 'shop' || t === 'dukan' || t === 'store');
  const wantsOnline = tokens.some(
    (t) => t === 'online' || t === 'csc' || t === 'cyber' || t === 'internet'
  );
  const wantsKirana = tokens.some((t) => t === 'kirana' || t === 'grocery' || t === 'ration');
  const wantsTemple = tokens.some((t) => t === 'temple' || t === 'mandir');
  const wantsSchool = tokens.some((t) => t === 'school' || t === 'coaching');
  const wantsClinic = tokens.some((t) => t === 'clinic' || t === 'hospital' || t === 'doctor');
  const wantsMasjid = tokens.some((t) => t === 'masjid' || t === 'mosque');
  const wantsMedical = tokens.some((t) => t === 'medical' || t === 'pharmacy' || t === 'dawai');

  if (wantsOnline) {
    if (cat === 'online' || shop.includes('online') || shop.includes('csc') || note.includes('online')) {
      return 0;
    }
    return null;
  }
  if (wantsKirana) {
    if (cat === 'kirana' || shop.includes('kirana') || note.includes('kirana')) return 0;
    return null;
  }
  if (wantsMedical) {
    if (cat === 'medical' || pt === 'clinic' || shop.includes('medical') || shop.includes('pharmacy')) {
      return 0;
    }
    return null;
  }
  if (wantsTemple) {
    if (pt === 'temple' || shop.includes('mandir') || shop.includes('temple')) return 0;
    return null;
  }
  if (wantsSchool) {
    if (pt === 'school' || shop.includes('school')) return 0;
    return null;
  }
  if (wantsClinic) {
    if (pt === 'clinic' || cat === 'medical' || shop.includes('clinic') || shop.includes('hospital')) {
      return 0;
    }
    return null;
  }
  if (wantsMasjid) {
    if (pt === 'masjid' || shop.includes('masjid') || shop.includes('mosque')) return 0;
    return null;
  }
  if (wantsShop) {
    if (pt === 'shop' || Boolean(h.shopName?.trim())) return 1;
    return null;
  }

  // Direct substring matching across all metadata
  if (shop.startsWith(q)) return 1;
  if (num.startsWith(q)) return 2;
  if (
    shop.includes(q) ||
    num.includes(q) ||
    road.includes(q) ||
    note.includes(q) ||
    (ptOpt?.label.toLowerCase().includes(q) ?? false) ||
    (catOpt?.label.toLowerCase().includes(q) ?? false) ||
    (catOpt?.keywords.some((kw) => kw.includes(q) || q.includes(kw)) ?? false)
  ) {
    return 3;
  }

  return null;
}

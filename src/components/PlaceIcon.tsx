import {
  Building2,
  Coffee,
  Cross,
  Flame,
  Globe,
  GraduationCap,
  Home,
  MapPin,
  Shirt,
  ShoppingBasket,
  Store,
  Wrench,
} from 'lucide-react';
import type { PlaceType, ShopCategory } from '../types/map.ts';

interface PlaceIconProps {
  placeType?: PlaceType;
  shopCategory?: ShopCategory;
  shopName?: string;
  className?: string;
}

export default function PlaceIcon({
  placeType,
  shopCategory,
  shopName,
  className = 'w-3.5 h-3.5',
}: PlaceIconProps) {
  const effective: PlaceType =
    placeType ?? (shopCategory || shopName?.trim() ? 'shop' : 'house');

  switch (effective) {
    case 'temple':
      return <Flame className={className} />;
    case 'school':
      return <GraduationCap className={className} />;
    case 'clinic':
      return <Cross className={className} />;
    case 'masjid':
      return <Building2 className={className} />;
    case 'landmark':
      return <MapPin className={className} />;
    case 'shop':
      switch (shopCategory) {
        case 'online':
          return <Globe className={className} />;
        case 'kirana':
          return <ShoppingBasket className={className} />;
        case 'medical':
          return <Cross className={className} />;
        case 'hardware':
          return <Wrench className={className} />;
        case 'tea_snacks':
          return <Coffee className={className} />;
        case 'tailor':
          return <Shirt className={className} />;
        default:
          return <Store className={className} />;
      }
    case 'house':
    default:
      return <Home className={className} />;
  }
}

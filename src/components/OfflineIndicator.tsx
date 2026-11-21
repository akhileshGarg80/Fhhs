import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall.ts';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-4 z-[1200] flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode · GPS &amp; saved village data active</span>
    </div>
  );
}

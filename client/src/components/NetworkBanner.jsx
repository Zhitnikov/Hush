import { useNetworkStore } from '../utils/networkStatus';

export default function NetworkBanner() {
  const online = useNetworkStore((s) => s.online);
  if (online) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-600 text-white text-center text-xs py-1.5 font-medium">
      Нет сети — сообщения отправятся после восстановления связи
    </div>
  );
}

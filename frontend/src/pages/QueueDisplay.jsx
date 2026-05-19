import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getQueue, getPublicTenant } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { playNotificationSound, unlockAudio } from '../utils/helpers';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import { applyTheme } from '../utils/theme';

export default function QueueDisplay() {
  const [preparing, setPreparing] = useState([]);
  const [ready, setReady] = useState([]);
  const [time, setTime] = useState(new Date());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';
  const [branding, setBranding] = useState(null);
  const prevReadyRef = useRef([]);
  const { joinRoom, onEvent, connected } = useSocket();

  useEffect(() => {
    if (branding?.id) {
      joinRoom('queue', branding.id);
    }
  }, [branding?.id, connected]);

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    const clock = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clock); };
  }, []);

  useEffect(() => {
    if (tenantSlug) {
      getPublicTenant(tenantSlug).then(res => {
        if (res.data.success) {
          setBranding(res.data.data);
          applyTheme(res.data.data.primaryColor);
        }
      });
    }
  }, [tenantSlug]);

  const brandingColor = branding?.primaryColor || '#0a3d01';
  const homeLink = '/';

  const handleStartBoard = () => {
    unlockAudio();
    setAudioUnlocked(true);
  };

  // Dynamic favicon & title
  useDynamicBranding(branding?.name || 'Order Queue', branding?.favicon);

  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent('order_update', () => loadQueue());
    const unsub2 = onEvent('queue_update', (data) => {
      loadQueue();
    });
    return () => { unsub(); unsub2(); };
  }, [onEvent]);

  const loadQueue = async () => {
    try {
      const res = await getQueue();
      const data = res.data.data;
      // Check for new ready orders
      const newReady = data.ready.filter(o => !prevReadyRef.current.find(p => p.id === o.id));
      prevReadyRef.current = data.ready;
      setPreparing(data.preparing);
      setReady(data.ready);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 overflow-hidden relative">

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to={homeLink} className="inline-flex items-center gap-1.5 sm:gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-full text-xs sm:text-sm font-bold text-slate-700 transition-all border border-slate-200/80 shadow-sm">
            <span className="text-base sm:text-lg leading-none">←</span> <span className="hidden sm:inline">Back Home</span><span className="sm:hidden">Back</span>
          </Link>
          <span className="text-slate-300 ml-1 hidden sm:inline">|</span>
          <span className="text-slate-700 font-bold hidden sm:inline">{branding?.name || 'Order Queue'}</span>
        </div>
        <div className="text-right">
          <div className="font-heading text-lg sm:text-2xl font-black text-slate-900 tracking-tight tabular-nums">
            {time.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{time.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {/* Queue Board */}
      <div className="flex flex-col md:grid md:grid-cols-2 h-[calc(100vh-80px)]">
        {/* Now Preparing */}
        <div className="flex-1 md:flex-auto border-b md:border-b-0 md:border-r border-slate-200/80 p-4 md:p-6 flex flex-col overflow-hidden bg-white">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-6 flex-shrink-0">
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-full animate-pulse" style={{ backgroundColor: brandingColor }} />
            <h2 className="font-heading text-xl sm:text-2xl md:text-3xl font-black tracking-tight" style={{ color: brandingColor }}>Now Preparing</h2>
            <span className="badge text-xs sm:text-sm md:text-base font-black px-2.5 py-1 rounded-full" style={{ backgroundColor: `${brandingColor}15`, color: brandingColor }}>{preparing.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            {preparing.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <div className="text-4xl">🍳</div>
                <p className="font-bold text-sm sm:text-base">No orders being prepared</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 pb-4">
                {preparing.map((order, idx) => (
                  <div key={order.id}
                    className="bg-slate-50/50 border border-slate-200/60 rounded-[2rem] p-4 text-center animate-fade-in-up transition-all hover:shadow-md hover:bg-white"
                    style={{ animationDelay: `${idx * 0.05}s` }}>
                    <p className="queue-number font-black text-4xl sm:text-5xl md:text-6xl" style={{ color: brandingColor }}>{order.orderNumber.split('-')[1]}</p>
                    <p className="text-slate-800 text-xs sm:text-sm mt-2 font-black truncate">{order.customerName}</p>
                    <span className="inline-block mt-2 text-[9px] sm:text-[10px] font-bold bg-slate-200/60 text-slate-600 px-3 py-1 rounded-full uppercase tracking-wider">
                      {order.orderType === 'dine_in' ? '🍽️ Dine In' : '🥡 Take Out'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Now Serving / Ready */}
        <div className="flex-1 md:flex-auto p-4 md:p-6 flex flex-col bg-emerald-50/40 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-6 flex-shrink-0">
            <div className="w-3 h-3 md:w-4 md:h-4 bg-emerald-500 rounded-full animate-pulse" />
            <h2 className="font-heading text-xl sm:text-2xl md:text-3xl font-black text-emerald-600 tracking-tight">Now Serving</h2>
            <span className="badge bg-emerald-100 text-emerald-700 text-xs sm:text-sm md:text-base font-black px-2.5 py-1 rounded-full">{ready.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            {ready.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <div className="text-4xl">🔔</div>
                <p className="font-bold text-sm sm:text-base">No orders ready</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4 pb-4">
                {ready.map((order, idx) => (
                  <div key={order.id}
                    className="bg-white border-2 border-emerald-500/80 rounded-[2rem] p-4 text-center animate-fade-in-up shadow-lg shadow-emerald-500/5 hover:scale-[1.03] transition-all relative overflow-hidden"
                    style={{ animationDelay: `${idx * 0.05}s` }}>
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-emerald-500"></div>
                    <p className="queue-number text-emerald-600 font-black text-4xl sm:text-5xl md:text-6xl animate-pulse">{order.orderNumber.split('-')[1]}</p>
                    <p className="text-slate-800 text-xs sm:text-sm mt-2 font-black truncate">{order.customerName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

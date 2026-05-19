import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { playNotificationSound } from '../utils/helpers';

export default function GlobalThankYou() {
  const [showThankYou, setShowThankYou] = useState(false);
  const { onEvent, joinRoom } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';

  useEffect(() => {
    const initThankYou = async () => {
      let roomId = 'global';
      
      if (tenantSlug) {
        try {
          const { getPublicTenant } = await import('../services/api');
          const res = await getPublicTenant(tenantSlug);
          if (res.data.success) {
            roomId = res.data.data.id;
          }
        } catch (e) {
          console.error('Failed to resolve tenant for thank you screen:', e);
        }
      }

      joinRoom('kiosk', roomId);
    };

    initThankYou();

    if (!onEvent) return;

    const unsub = onEvent('order_update', (data) => {
      const order = data.order;
      if (!order) return;

      if (order.status === 'completed') {
        const activeOrdersKey = tenantSlug ? `${tenantSlug}_active_orders` : 'active_orders';
        const lastOrderKey = tenantSlug ? `${tenantSlug}_last_order_number` : 'last_order_number';
        
        const activeOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
        const lastOrderNumber = localStorage.getItem(lastOrderKey);
        
        // Check if this completed order is one of the kiosk's active orders or the last order
        if (activeOrders.includes(order.orderNumber) || order.orderNumber === lastOrderNumber) {
          // Remove from local storage
          const updatedOrders = activeOrders.filter(num => num !== order.orderNumber);
          localStorage.setItem(activeOrdersKey, updatedOrders.length > 0 ? JSON.stringify(updatedOrders) : '[]');
          if (updatedOrders.length === 0) localStorage.removeItem(activeOrdersKey);
          
          if (localStorage.getItem(lastOrderKey) === order.orderNumber) {
            localStorage.removeItem(lastOrderKey);
          }

          // Show the global thank you screen
          setShowThankYou(true);

          // After 5 seconds, hide the screen and navigate home
          setTimeout(() => {
            setShowThankYou(false);
            const homePath = '/';
            navigate(homePath);
          }, 5000);
        }
      }
    });

    return () => unsub();
  }, [onEvent, joinRoom, navigate, tenantSlug]);

  if (!showThankYou) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6">
      <div className="text-center animate-fade-in-up w-full max-w-2xl">
        <div className="text-7xl sm:text-8xl mb-6 animate-bounce">🎉</div>
        <h1 className="font-heading text-4xl sm:text-6xl font-black text-white mb-4 leading-tight">
          Thank You!
        </h1>
        <p className="text-slate-300 text-lg sm:text-xl font-medium mb-10">
          We hope you enjoy your meal.<br/>See you again soon!
        </p>
        
        <div className="w-24 h-1.5 bg-emerald-500 mx-auto rounded-full mb-10 shadow-[0_0_20px_rgba(16,185,129,0.5)]"></div>
        
        <button 
          onClick={() => {
            setShowThankYou(false);
            const homePath = '/';
            navigate(homePath);
          }}
          className="bg-white text-slate-900 font-bold text-lg sm:text-xl px-12 py-5 rounded-2xl shadow-2xl hover:bg-slate-50 transition-all active:scale-95"
        >
          Return to Menu
        </button>
      </div>
    </div>
  );
}

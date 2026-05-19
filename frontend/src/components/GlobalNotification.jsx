import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { playNotificationSound, updateAppBadge, requestNotificationPermission, showSystemNotification } from '../utils/helpers';
import { getOrder } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function GlobalNotification() {
  const [readyOrderNumbers, setReadyOrderNumbers] = useState([]);
  const [cancelledOrderNumbers, setCancelledOrderNumbers] = useState([]);
  const alertIntervalRef = useRef(null);
  const alertFlowTimerRef = useRef(null);
  const alertActiveRef = useRef(false);
  const { onEvent } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';
  const { user } = useAuth();

  // Helper to safely clear the chime loop
  const clearChimeLoop = useCallback(() => {
    if (alertFlowTimerRef.current) {
      clearTimeout(alertFlowTimerRef.current);
      alertFlowTimerRef.current = null;
    }
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    alertActiveRef.current = false;
  }, []);

  // Listen for socket events
  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent('order_update', (data) => {
      const activeOrdersKey = tenantSlug ? `${tenantSlug}_active_orders` : 'active_orders';
      const lastOrderKey = tenantSlug ? `${tenantSlug}_last_order_number` : 'last_order_number';
      
      const activeOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
      const lastOrderNumber = localStorage.getItem(lastOrderKey);
      
      const isMyOrder = activeOrders.includes(data.order?.orderNumber) || 
                       data.order?.orderNumber === lastOrderNumber ||
                       (user && data.order?.customerId === user.id);

      if (isMyOrder) {
        requestNotificationPermission();

        // Sync order to local active orders list if it matched by user id
        if (data.order?.orderNumber && !activeOrders.includes(data.order.orderNumber)) {
          const updated = [...activeOrders, data.order.orderNumber];
          localStorage.setItem(activeOrdersKey, JSON.stringify(updated));
        }

        if (data.eventType === 'ready' || data.order.status === 'ready') {
          triggerReadyAlert(data.order.orderNumber);
        } else if (data.eventType === 'cancelled' || data.order.status === 'cancelled') {
          triggerCancelledAlert(data.order.orderNumber, data.order.cancellationReason);
          // Auto-remove from active orders list in realtime
          const currentActive = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
          const updated = currentActive.filter(num => num !== data.order.orderNumber);
          localStorage.setItem(activeOrdersKey, updated.length > 0 ? JSON.stringify(updated) : '[]');
          if (updated.length === 0) localStorage.removeItem(activeOrdersKey);
        } else if (data.eventType === 'completed' || data.order.status === 'completed') {
          // Also cleanup completed orders in realtime
          const currentActive = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
          const updated = currentActive.filter(num => num !== data.order.orderNumber);
          localStorage.setItem(activeOrdersKey, updated.length > 0 ? JSON.stringify(updated) : '[]');
          if (updated.length === 0) localStorage.removeItem(activeOrdersKey);
        }
      }
    });
    return unsub;
  }, [onEvent, tenantSlug, user]);

  // Polling fallback
  useEffect(() => {
    const checkOrders = async () => {
      const activeOrdersKey = tenantSlug ? `${tenantSlug}_active_orders` : 'active_orders';
      const lastOrderKey = tenantSlug ? `${tenantSlug}_last_order_number` : 'last_order_number';

      const activeOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
      const lastOrderNumber = localStorage.getItem(lastOrderKey);
      const ordersToCheck = Array.from(new Set([...activeOrders, lastOrderNumber].filter(Boolean)));
      if (ordersToCheck.length === 0) return;

      requestNotificationPermission();

      for (const orderNum of ordersToCheck) {
        try {
          const res = await getOrder(orderNum);
          const status = res.data.data.status;
          if (status === 'ready') {
            triggerReadyAlert(orderNum);
          } else if (status === 'cancelled' || status === 'completed') {
            if (status === 'cancelled') {
              triggerCancelledAlert(orderNum, res.data.data.cancellationReason);
            }
            // Cleanup inactive orders found during polling
            const activeOrdersNow = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
            const updated = activeOrdersNow.filter(num => num !== orderNum);
            localStorage.setItem(activeOrdersKey, updated.length > 0 ? JSON.stringify(updated) : '[]');
            if (updated.length === 0) localStorage.removeItem(activeOrdersKey);
          }
        } catch (e) {
          if (e.response && e.response.status === 404) {
            // Order was deleted or not found, remove it from active tracking
            const activeOrdersNow = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
            const updated = activeOrdersNow.filter(num => num !== orderNum);
            localStorage.setItem(activeOrdersKey, updated.length > 0 ? JSON.stringify(updated) : '[]');
            if (updated.length === 0) localStorage.removeItem(activeOrdersKey);
            if (localStorage.getItem(lastOrderKey) === orderNum) localStorage.removeItem(lastOrderKey);
          }
        }
      }
    };

    checkOrders();
    const int = setInterval(checkOrders, 5000);
    return () => clearInterval(int);
  }, [tenantSlug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearChimeLoop();
  }, [clearChimeLoop]);

  // Update native PWA app badge with customer's ready orders count
  useEffect(() => {
    updateAppBadge(readyOrderNumbers.length);
    return () => {
      updateAppBadge(0);
    };
  }, [readyOrderNumbers]);

  const triggerReadyAlert = (orderNum) => {
    const dismissed = sessionStorage.getItem(`ready_dismissed_${orderNum}`);
    if (dismissed) return;

    const displayNum = orderNum?.includes('-') ? orderNum.split('-')[1] : orderNum;
    showSystemNotification('Order is Ready! 🍽️', `Your Order #${displayNum} is ready to be picked up at the counter.`);

    setReadyOrderNumbers(prev => {
      if (prev.includes(orderNum)) return prev;
      const next = [...prev, orderNum];
      
      // Only start the alert flow if one isn't already active
      // This prevents socket + polling from double-triggering the chime sequence
      if (!alertActiveRef.current) {
        startAlertFlow(next);
      }
      return next;
    });
  };

  const triggerCancelledAlert = (orderNum, reason) => {
    const dismissed = sessionStorage.getItem(`cancel_dismissed_${orderNum}`);
    if (dismissed) return;

    const displayNum = orderNum?.includes('-') ? orderNum.split('-')[1] : orderNum;
    showSystemNotification('Order Cancelled ⚠️', `Order #${displayNum} has been cancelled: ${reason || 'Please contact counter.'}`);

    setCancelledOrderNumbers(prev => {
      if (prev.find(o => o.number === orderNum)) return prev;
      const next = [...prev, { number: orderNum, reason: reason || 'Cancelled by staff' }];
      
      // Stop any ready chimes and play a single warning chime
      clearChimeLoop();
      playNotificationSound('default');
      
      return next;
    });
  };

  const startAlertFlow = (orderNums) => {
    // Prevent re-entry if already running
    if (alertActiveRef.current) return;
    alertActiveRef.current = true;

    // Clear any previous timers/intervals
    clearChimeLoop();
    // Re-set active since clearChimeLoop resets it
    alertActiveRef.current = true;

    // 1. Play initial chime
    playNotificationSound('ready');
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);

    // 2. Speech (Re-enabled - Only one source to prevent double voice)
    setTimeout(() => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const text = orderNums.length > 1 
          ? `Your orders ${orderNums.join(' and ')} are ready. Please proceed to the counter.`
          : `Your order ${orderNums[0]} is ready. Please proceed to the counter.`;
        
        console.log(`📢 Speaking: "${text}"`);
        const msg = new SpeechSynthesisUtterance(text);
        msg.rate = 0.9; msg.pitch = 1.1; msg.volume = 1;
        
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
          || voices.find(v => v.lang.startsWith('en')) || voices[0];
        if (preferred) msg.voice = preferred;
        
        msg.onerror = (e) => console.error('Speech error:', e);
        msg.onend = () => console.log('🏁 Speech finished.');
        window.speechSynthesis.speak(msg);
      } else {
        console.warn('⚠️ Speech synthesis not supported in this browser.');
      }
    }, 600);

    // 3. Start chime loop after speech has had time to play
    alertFlowTimerRef.current = setTimeout(() => {
      alertFlowTimerRef.current = null;
      playNotificationSound('ready');
      // Start the repeating chime interval
      alertIntervalRef.current = setInterval(() => {
        playNotificationSound('ready');
        if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
      }, 3000);
    }, 4000);
  };

  const dismissReadyAlert = () => {
    readyOrderNumbers.forEach(num => sessionStorage.setItem(`ready_dismissed_${num}`, 'true'));
    const lastNum = readyOrderNumbers[readyOrderNumbers.length - 1];
    setReadyOrderNumbers([]);
    
    clearChimeLoop();
    if (navigator.vibrate) navigator.vibrate(0);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    
    if (lastNum) {
      const targetPath = `/order/${lastNum}`;
      navigate(targetPath);
    }
  };

  const dismissCancelAlert = () => {
    cancelledOrderNumbers.forEach(o => sessionStorage.setItem(`cancel_dismissed_${o.number}`, 'true'));
    setCancelledOrderNumbers([]);
  };

  if (readyOrderNumbers.length === 0 && cancelledOrderNumbers.length === 0) return null;

  return (
    <>
      {/* READY ALERT */}
      {readyOrderNumbers.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-emerald-900/90 backdrop-blur-md p-6" onClick={dismissReadyAlert}>
          <div className="text-center animate-fade-in-up w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-7xl sm:text-8xl mb-4 animate-bounce">🔔</div>
            <h1 className="font-heading text-4xl sm:text-6xl font-black text-white mb-2 leading-tight">
              {readyOrderNumbers.length > 1 ? 'Your Orders are Ready!' : 'Your Order is Ready!'}
            </h1>
            <p className="text-emerald-200 text-lg sm:text-xl font-medium mb-4">Queue Number{readyOrderNumbers.length > 1 ? 's' : ''}</p>
            
            <div className="flex flex-wrap justify-center gap-4 mb-10">
              {readyOrderNumbers.map(num => (
                <div key={num} className="bg-white/10 backdrop-blur-md border-2 border-white/20 px-6 py-4 rounded-3xl">
                  <p className="font-heading text-4xl sm:text-6xl font-black text-white tracking-tight">
                    {num?.includes('-') ? num.split('-')[1] : num}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-emerald-300 text-base sm:text-lg mb-10">Please proceed to the counter to pick up your order{readyOrderNumbers.length > 1 ? 's' : ''}.</p>
            <button onClick={dismissReadyAlert} className="bg-white text-emerald-800 font-bold text-lg sm:text-xl px-12 py-5 rounded-2xl shadow-2xl hover:bg-emerald-50 transition-all active:scale-95">
              Got it! ✓
            </button>
          </div>
        </div>
      )}

      {/* CANCEL ALERT */}
      {cancelledOrderNumbers.length > 0 && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-red-950/90 backdrop-blur-md p-6" onClick={dismissCancelAlert}>
          <div className="text-center animate-fade-in-up w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-7xl sm:text-8xl mb-4 animate-shake">⚠️</div>
            <h1 className="font-heading text-4xl sm:text-6xl font-black text-white mb-2 leading-tight">
              Order Cancelled
            </h1>
            
            <div className="space-y-4 mb-10">
              {cancelledOrderNumbers.map(o => (
                <div key={o.number} className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                  <p className="text-white font-heading text-3xl font-black">
                    Order #{o.number?.includes('-') ? o.number.split('-')[1] : o.number}
                  </p>
                </div>
              ))}
            </div>
            
            <p className="text-red-300 text-base sm:text-lg mb-10">Please proceed to the counter if you have questions or for refund assistance.</p>
            
            <button onClick={dismissCancelAlert} className="bg-white text-red-800 font-bold text-lg sm:text-xl px-12 py-5 rounded-2xl shadow-2xl hover:bg-red-50 transition-all active:scale-95">
              I Understand
            </button>
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getOrder, cancelOrder, getPublicTenant, submitFeedback } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, unlockAudio, formatMinutes } from '../utils/helpers';

import { applyTheme, clearTheme } from '../utils/theme';

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Received', icon: '📋', activeBg: 'bg-primary-500', activeRing: 'ring-primary-100', inactiveBg: 'bg-primary-50' },
  { key: 'confirmed', label: 'Payment Confirmed', icon: '✅', activeBg: 'bg-emerald-500', activeRing: 'ring-emerald-100', inactiveBg: 'bg-emerald-50' },
  { key: 'preparing', label: 'Preparing', icon: '👨‍🍳', activeBg: 'bg-primary-500', activeRing: 'ring-primary-100', inactiveBg: 'bg-slate-100' },
  { key: 'ready', label: 'Ready for Pickup', icon: '🔔', activeBg: 'bg-amber-500', activeRing: 'ring-amber-100', inactiveBg: 'bg-amber-50' },
];

export default function OrderConfirmation() {
  const { user } = useAuth();
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const { joinRoom, onEvent, connected } = useSocket();
  const { clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'project-million';
  const [branding, setBranding] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const lastAnnouncedStatusRef = useRef(null);

  // Feedback State
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    clearCart();
    const unlock = () => unlockAudio();
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  useEffect(() => {
    if (branding?.id) {
      joinRoom('kiosk', branding.id);
    }
  }, [branding?.id, connected]);

  useEffect(() => {
    if (tenantSlug) {
      getPublicTenant(tenantSlug).then(res => {
        if (res.data.success) {
          setBranding(res.data.data);
          if (res.data.data.primaryColor) {
            applyTheme(res.data.data.primaryColor);
          }
        }
      });
    }
    return () => clearTheme();
  }, [tenantSlug]);

  const brandingColor = branding?.primaryColor || '#0a3d01';
  const homeLink = '/';
  const menuLink = '/menu';
  const queueLink = '/queue';

  useEffect(() => {
    if (order && (order.status === 'completed' || order.status === 'cancelled')) {
      const activeOrdersKey = tenantSlug ? `${tenantSlug}_active_orders` : 'active_orders';
      const lastOrderKey = tenantSlug ? `${tenantSlug}_last_order_number` : 'last_order_number';

      if (order.status === 'cancelled') {
        if (localStorage.getItem(lastOrderKey) === order.orderNumber) {
          localStorage.removeItem(lastOrderKey);
        }
        const activeOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
        const updatedOrders = activeOrders.filter(num => num !== order.orderNumber);
        localStorage.setItem(activeOrdersKey, updatedOrders.length > 0 ? JSON.stringify(updatedOrders) : '[]');
        if (updatedOrders.length === 0) localStorage.removeItem(activeOrdersKey);
      }
    }
  }, [order?.status, tenantSlug]);

  useEffect(() => {
    loadOrder();
    const interval = setInterval(loadOrder, 5000);
    return () => clearInterval(interval);
  }, [orderNumber]);

  useEffect(() => {
    if (order?.tenantId) {
      joinRoom('kiosk', order.tenantId);
    }
  }, [order?.tenantId, connected]);

  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent('order_update', (data) => {
      if (data.order?.orderNumber === orderNumber) {
        if (data.order.status === 'ready' && lastAnnouncedStatusRef.current !== 'ready') {
          lastAnnouncedStatusRef.current = 'ready';
        }
        setOrder(data.order);
        if (data.order.status !== 'pending') {
          setPaymentRequest(null);
        }
      }
    });

    const unsub2 = onEvent('payment_request', (data) => {
      if (data.orderNumber === orderNumber) {
        setPaymentRequest(data);
      }
    });

    return () => {
      unsub();
      unsub2();
    };
  }, [onEvent, orderNumber]);

  const [paymentRequest, setPaymentRequest] = useState(null);

  const loadOrder = async () => {
    try {
      const res = await getOrder(orderNumber);
      setOrder(res.data.data);
      if (res.data.data.feedbackRating) setFeedbackSubmitted(true);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) return;
    setSubmittingFeedback(true);
    try {
      await submitFeedback({ orderNumber, rating, comment });
      setFeedbackSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-surface-50 flex items-center justify-center"><p className="text-surface-400">Loading...</p></div>;
  if (!order) return <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center"><h2 className="text-xl font-bold mb-4">Order not found</h2><Link to={menuLink} className="btn-primary" style={{ backgroundColor: brandingColor }}>Back to Menu</Link></div>;

  const currentStep = STATUS_STEPS.findIndex(s => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const isCompleted = order.status === 'completed';
  const isReady = order.status === 'ready';

  return (
    <div className="min-h-screen bg-surface-50 pb-8" style={{ '--primary-custom': brandingColor }}>
      <div className="p-4 md:p-6 pb-0">
        <Link to={homeLink} className="inline-flex items-center gap-2 px-4 py-2 md:px-5 md:py-3 bg-white rounded-full text-xs md:text-sm font-bold text-surface-700 shadow-sm border border-surface-200 hover:border-primary-300 hover:shadow-md transition-all">
          <span className="text-lg md:text-xl leading-none">←</span> <span>Back Home</span>
        </Link>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 md:pt-8">

        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 text-center mb-4 sm:mb-6 shadow-xl relative overflow-hidden animate-fade-in-up border-t-[12px] sm:border-t-[16px]" style={{ animationDelay: '0.1s', borderTopColor: isCancelled ? '#ef4444' : brandingColor }}>
          {isCancelled && (
            <div className="absolute top-4 right-4 rotate-12 border-4 border-red-500 text-red-500 font-black px-4 py-1 rounded-xl text-xs sm:text-sm uppercase tracking-widest animate-bounce-in shadow-lg bg-white/95 z-20">
              Cancelled ❌
            </div>
          )}

          <p className="text-[10px] sm:text-xs md:text-sm font-bold text-slate-400 uppercase tracking-[0.15em] mb-3 sm:mb-4">Your Queue Number</p>
          <p className={`font-heading text-6xl sm:text-8xl md:text-9xl font-black tracking-tighter mb-2 leading-none ${isCancelled ? 'text-slate-300 line-through opacity-70' : 'text-slate-900'}`}>
            {order.orderNumber.includes('-') ? order.orderNumber.split('-')[1] : order.orderNumber}
          </p>

          {isCancelled && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-left mb-6 flex gap-3 items-start animate-fade-in">
              <span className="text-xl">⚠️</span>
              <div>
                <h4 className="font-bold text-red-800 text-sm">Order Cancelled</h4>
                <p className="text-xs text-red-600 font-medium leading-relaxed">
                  This transaction was cancelled by the store. {order.cancellationReason && `Reason: ${order.cancellationReason}. `}
                  If any payments were made, they have been voided. Please proceed to the counter for questions or refunds.
                </p>
              </div>
            </div>
          )}

          {order.estimatedPrepTime && !isReady && !isCompleted && !isCancelled && (
            <div className="mb-6 animate-bounce-in">
              <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 px-5 py-3 rounded-2xl shadow-lg" style={{ backgroundColor: `${brandingColor}15` }}>
                <span className="text-2xl">🕒</span>
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70 mb-0.5" style={{ color: brandingColor }}>Estimated Wait</p>
                  <p className="text-xl font-black leading-none" style={{ color: brandingColor }}>{formatMinutes(order.estimatedPrepTime)}</p>
                </div>
              </div>
            </div>
          )}

          <p className={`font-medium mb-6 sm:mb-8 text-xs sm:text-sm md:text-base px-1 sm:px-2 ${isCancelled ? 'text-red-500 font-black' : 'text-slate-700'}`}>
            {isCancelled
              ? "THIS ORDER HAS BEEN VOIDED / CANCELLED"
              : isReady
                ? "YOUR ORDER IS READY! Please proceed to the counter."
                : "Please wait for your number to be called or displayed on the queue screen."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-2">
            <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold text-xs sm:text-sm ${order.orderType === 'dine_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {order.orderType === 'dine_in' ? '🏠 Dine In' : '🥡 Take Out'}
            </span>
            {isCancelled ? (
              <span className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-red-100 text-red-700 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1 border border-red-200">
                ❌ VOIDED RECEIPT
              </span>
            ) : order.paymentMethod === 'points' ? (
              <span className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-purple-100 text-purple-700 font-bold text-xs sm:text-sm">
                🎁 Point Redemption
              </span>
            ) : (
              <span className={`font-bold text-xs sm:text-sm flex items-center gap-2 ${order.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-slate-800'}`}>
                {order.paymentStatus === 'paid' ? '✅ RECEIPT' : '⏳ ORDER SLIP - PAY AT COUNTER'}
              </span>
            )}
          </div>
        </div>

        {(isReady || isCompleted) && !isCancelled && (
          <div className="bg-white rounded-[2rem] p-8 mb-6 shadow-xl border border-surface-100 animate-fade-in-up relative overflow-hidden group">
            {!feedbackSubmitted ? (
              <>
                <div className="relative z-10 text-center">
                  <h4 className="text-2xl font-black text-slate-900 mb-2">How was your meal? 🍔</h4>
                  <p className="text-slate-500 text-xs mb-6">Your feedback helps us make your next visit even better!</p>

                  <div className="flex justify-center gap-3 mb-8">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className={`text-4xl transition-all hover:scale-125 active:scale-95 ${rating >= star ? 'drop-shadow-lg scale-110' : 'opacity-30 grayscale'}`}
                      >
                        {star === 1 ? '😞' : star === 2 ? '😐' : star === 3 ? '😊' : star === 4 ? '😋' : '😍'}
                      </button>
                    ))}
                  </div>

                  {rating > 0 && (
                    <form onSubmit={handleFeedbackSubmit} className="animate-fade-in">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none transition-all mb-4 h-24 resize-none"
                        placeholder="Any comments or suggestions? (Optional)"
                      />
                      <button
                        type="submit"
                        disabled={submittingFeedback}
                        className="w-full py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-primary-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        style={{ backgroundColor: brandingColor }}
                      >
                        {submittingFeedback ? 'Sending...' : 'Send Feedback →'}
                      </button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-4 animate-bounce-in">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✨</div>
                <h4 className="text-xl font-black text-slate-900 mb-1">Thank you!</h4>
                <p className="text-slate-500 text-xs">We've received your feedback. Enjoy your meal!</p>
              </div>
            )}
          </div>
        )}

        {!order.customerId && !isCancelled && !isCompleted && !isReady && (
          <div className="bg-slate-900 rounded-[2rem] p-6 mb-6 text-white shadow-2xl relative overflow-hidden group border border-white/5 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/20 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary-500/30 transition-all duration-500"></div>
            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-2xl shadow-xl backdrop-blur-md border border-white/20">💎</div>
              <div className="flex-1">
                <h4 className="text-lg font-black text-white mb-1 tracking-tight">Save this meal to your story!</h4>
                <p className="text-slate-400 text-[11px] leading-relaxed mb-4">Sign up now to start your Personal Timeline and earn <span className="text-primary-400 font-bold">{Math.floor(order.total / (branding?.points_rate || 100))} points</span> on this order.</p>
                <Link to={tenantSlug ? `/member-portal?tenant=${tenantSlug}&action=register` : '/member-portal?action=register'} className="inline-block px-6 py-2.5 bg-primary-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/40 active:scale-95">
                  Create My VIP Account
                </Link>
              </div>
            </div>
          </div>
        )}

        {!isCancelled && !isCompleted && (
          <div className="bg-white rounded-3xl p-6 md:p-8 mb-6 animate-fade-in-up shadow-sm" style={{ animationDelay: '0.2s' }}>
            <div className="space-y-6">
              {STATUS_STEPS.map((step, idx) => {
                const isActive = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={step.key} className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 transition-all ${isCurrent ? `${step.activeBg} text-white ring-8 ${step.activeRing}` : isActive ? `${step.activeBg} text-white` : `${step.inactiveBg} opacity-50 grayscale`}`}>
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <p className={`font-bold text-sm md:text-base ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</p>
                    </div>
                    {isActive && <span className="text-emerald-500 text-xl">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="glass-card p-4 sm:p-5 mb-4 sm:mb-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h3 className="font-heading font-bold text-surface-900 mb-3 text-sm sm:text-base">Order Details</h3>
          <div className="space-y-1 text-xs sm:text-sm">
            <div className="flex justify-between py-1"><span className="text-surface-500">Customer</span><span className="font-medium">{order.customerName}</span></div>
            <div className="flex justify-between py-1"><span className="text-surface-500">Payment</span><span className="font-medium uppercase">{order.paymentMethod}</span></div>
            <div className="flex justify-between py-1"><span className="text-surface-500">Placed</span><span className="font-medium">{formatDate(order.createdAt)}</span></div>
          </div>
          <div className="border-t border-surface-100 mt-3 pt-3">
            {order.items?.map(item => (
              <div key={item.id} className="flex justify-between text-xs sm:text-sm py-1 gap-2">
                <span className="text-surface-600 flex-1 min-w-0">
                  {item.quantity}× {item.productName}
                  {item.addons ? ` (${JSON.parse(item.addons).map(a => a.name).join(', ')})` : ''}
                </span>
                <span className="font-medium flex-shrink-0">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-surface-200 mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-xs sm:text-sm"><span className="text-surface-500">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
            <div className="flex justify-between font-bold text-base sm:text-lg font-heading pt-2 border-t border-surface-200">
              <span>{isCancelled ? 'Total (Voided)' : 'Total'}</span>
              <span style={{ color: isCancelled ? '#ef4444' : brandingColor }} className={isCancelled ? 'line-through opacity-60' : ''}>
                {formatCurrency(order.total)}
              </span>
            </div>
          </div>
        </div>

        {order.paymentStatus === 'paid' && order.customerId && (
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 mb-6 text-white shadow-xl shadow-emerald-200 overflow-hidden relative animate-bounce-in" style={{ animationDelay: '0.4s' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Loyalty Reward</p>
                <h4 className="text-2xl font-black mb-1">+{Math.floor(order.total / (branding?.points_rate || 100))} Points Earned!</h4>
                <p className="text-xs font-medium text-emerald-50">Thanks for being a member, {order.customerName.split(' ')[0]}!</p>
              </div>
              <div className="text-4xl">💎</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up mb-4 no-print" style={{ animationDelay: '0.5s' }}>
          <Link to={queueLink} className="btn-secondary flex-1 justify-center text-sm sm:text-base py-3">📋 View Queue</Link>
          <Link to={menuLink} className="btn-primary flex-1 justify-center text-sm sm:text-base py-3" style={{ backgroundColor: brandingColor }}>🍽️ Order Again</Link>
        </div>
      </div>

      {paymentRequest && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-fade-in">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-scale-in border border-white/20 relative">

            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 sm:p-10 text-white text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-400/20 rounded-full blur-2xl -ml-10 -mb-10"></div>

              <div className="relative z-10 flex flex-col items-center">
                <div className="bg-white px-6 py-3 rounded-2xl shadow-xl mb-5 flex items-center justify-center">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg" alt="GCash" className="h-8 object-contain" />
                </div>
                <h3 className="text-3xl font-black mb-2 tracking-tight">Scan to Pay</h3>
                <p className="text-blue-100 text-sm font-medium opacity-90">Open your GCash app and scan the code below</p>
              </div>

              <button
                onClick={() => setPaymentRequest(null)}
                className="absolute top-6 right-6 w-10 h-10 bg-black/20 hover:bg-black/40 rounded-full flex items-center justify-center transition-colors text-white z-20 backdrop-blur-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-8 text-center bg-slate-50 relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-1 w-16 h-1.5 bg-slate-200/80 rounded-full"></div>

              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/60">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">Total Amount Due</p>
                <p className="text-5xl font-black text-slate-900 tracking-tighter">
                  {formatCurrency(paymentRequest.amount)}
                </p>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-3xl shadow-xl border border-slate-100">
                  {paymentRequest.gcashQr ? (
                    <img
                      src={paymentRequest.gcashQr.startsWith('http') ? paymentRequest.gcashQr : `${import.meta.env.VITE_API_URL?.replace('/api', '')}${paymentRequest.gcashQr}`}
                      alt="GCash QR"
                      className="w-full max-w-[400px] h-auto rounded-xl"
                    />
                  ) : (
                    <div className="w-56 h-56 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm p-8 text-center border-2 border-dashed border-slate-200">
                      <p>No QR code uploaded.<br />Please pay at the counter.</p>
                    </div>
                  )}
                </div>

                {paymentRequest.gcashQr && (
                  <button
                    onClick={async () => {
                      const url = paymentRequest.gcashQr.startsWith('http') ? paymentRequest.gcashQr : `${import.meta.env.VITE_API_URL?.replace('/api', '')}${paymentRequest.gcashQr}`;
                      try {
                        const response = await fetch(url);
                        const blob = await response.blob();
                        const blobUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = `GCash_QR_Order_${orderNumber}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(blobUrl);
                      } catch (error) {
                        console.error('Download failed:', error);
                        // Fallback: open in new tab if blob fails
                        window.open(url, '_blank');
                      }
                    }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                  >
                    <span>📥</span> Save QR Image
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

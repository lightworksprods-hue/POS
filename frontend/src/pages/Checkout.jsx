import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { createOrder, getPublicTenant } from '../services/api';
import { formatCurrency } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { applyTheme } from '../utils/theme';

const TRANSLATIONS = {
  en: {
    checkout: "Checkout",
    back: "Back",
    dineIn: "Dine In",
    takeOut: "Take Out",
    cash: "Cash",
    gcash: "GCash",
    maya: "Maya",
    card: "Card",
    nameLabel: "Your Name (Optional)",
    namePlaceholder: "Enter your name",
    orderType: "Order Type",
    paymentMethod: "Payment Method",
    pointsRedemption: "Points Redemption",
    noPaymentNeeded: "No payment needed — using your loyalty points",
    orderNotes: "Order Notes",
    notesPlaceholder: "Any special requests...",
    orderSummary: "Order Summary",
    subtotal: "Subtotal",
    tax: "Tax (12%)",
    total: "Total",
    placingOrder: "Placing Order...",
    insufficientPoints: "Insufficient Points ({pts} Needed)",
    claimPoints: "Claim for {pts} Points",
    orderWithPoints: "Order — {price} + {pts} pts",
    placeOrderTotal: "Place Order — {price}"
  },
  tl: {
    checkout: "Magbayad na",
    back: "Bumalik",
    dineIn: "Kakain Dito",
    takeOut: "Iuuwi",
    cash: "Cash",
    gcash: "GCash",
    maya: "Maya",
    card: "Card",
    nameLabel: "Iyong Pangalan (Opsyonal)",
    namePlaceholder: "Ilagay ang iyong pangalan",
    orderType: "Uri ng Order",
    paymentMethod: "Paraan ng Pagbabayad",
    pointsRedemption: "Redeem ng Puntos",
    noPaymentNeeded: "Walang kailangang bayad — gagamitin ang iyong mga puntos",
    orderNotes: "Habilin sa Order",
    notesPlaceholder: "Iba pang habilin o request...",
    orderSummary: "Buod ng Order",
    subtotal: "Subtotal",
    tax: "Buwis (12%)",
    total: "Kabuuan",
    placingOrder: "Ipinapadala...",
    insufficientPoints: "Kulang ang Puntos ({pts} Kailangan)",
    claimPoints: "Kunin gamit ang {pts} Puntos",
    orderWithPoints: "Order — {price} + {pts} pts",
    placeOrderTotal: "Ipadala ang Order — {price}"
  }
};

export default function Checkout() {
  const { items, getSubtotal, getTotalPointsCost, clearCart } = useCart();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';
  const [branding, setBranding] = useState(null);

  const lang = localStorage.getItem('pos_lang') || 'en';
  const t = (key) => TRANSLATIONS[lang][key] || key;

  const ORDER_TYPES = [
    { id: 'dine_in', label: t('dineIn'), icon: '🍽️' },
    { id: 'take_out', label: t('takeOut'), icon: '🥡' }
  ];

  const PAYMENT_METHODS = [
    { id: 'cash', label: t('cash'), icon: '💵' },
    { id: 'gcash', label: t('gcash'), icon: '📱' },
    { id: 'maya', label: t('maya'), icon: '💳' }
  ];

  const [customerName, setCustomerName] = useState(user?.name || '');
  const [orderType, setOrderType] = useState('dine_in');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const slug = tenantSlug || user?.tenantSlug;
    if (slug) {
      getPublicTenant(slug).then(res => {
        if (res.data.success) {
          setBranding(res.data.data);
          applyTheme(res.data.data.primaryColor);
        }
      });
    }
  }, [tenantSlug, user?.tenantSlug]);


  const brandingColor = branding?.primaryColor || '#0a3d01';
  const cartLink = '/cart';
  const menuLink = '/menu';
  const isFullRedemption = items.length > 0 && items.every(item => item.isRedemption);
  const totalPointsCost = getTotalPointsCost();
  const hasInsufficientPoints = totalPointsCost > (user?.points || 0);

  const [paymentMethod, setPaymentMethod] = useState(isFullRedemption ? 'points' : 'cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const subtotal = getSubtotal();
  const tax = 0;
  const total = subtotal;


  if (items.length === 0 && !submitting) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-xl font-bold text-surface-900 mb-2">{t('emptyCartTitle')}</h2>
        <p className="text-surface-500 mb-6">{t('emptyCartDesc')}</p>
        <Link to={menuLink} className="btn-primary px-8" style={{ backgroundColor: brandingColor }}>{t('browseMenu')}</Link>
      </div>
    );
  }

  if (items.length === 0) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (totalPointsCost > 0) {
      if (!user) {
        setError('You must be logged in to claim rewards.');
        return;
      }
      if (hasInsufficientPoints) {
        setError(`Insufficient points. You need ${totalPointsCost} points but only have ${user.points || 0}.`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const orderItems = items.map(item => ({
        productId: item.id, 
        quantity: item.quantity, 
        size: item.size, 
        flavor: item.flavor,
        notes: item.notes, 
        addons: item.selectedAddons?.map(a => a.id) || [],
        isRedemption: item.isRedemption || false,
        comboChoices: item.comboChoices // Add this!
      }));
      
      const res = await createOrder({ 
        customerId: user?.id,
        customerName: customerName.trim() || user?.name || 'Guest', 
        orderType, 
        paymentMethod, 
        items: orderItems, 
        notes 
      });
      const order = res.data.data;
      
      const activeOrdersKey = tenantSlug ? `${tenantSlug}_active_orders` : 'active_orders';
      const lastOrderKey = tenantSlug ? `${tenantSlug}_last_order_number` : 'last_order_number';

      const activeOrders = JSON.parse(localStorage.getItem(activeOrdersKey) || '[]');
      if (!activeOrders.includes(order.orderNumber)) {
        activeOrders.push(order.orderNumber);
        localStorage.setItem(activeOrdersKey, JSON.stringify(activeOrders));
      }
      localStorage.setItem(lastOrderKey, order.orderNumber);

      await refreshUser();
      clearCart();
      navigate(`/order/${order.orderNumber}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to place order.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-surface-50 pb-8" style={{ '--primary-custom': brandingColor }}>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-surface-200/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to={cartLink} className="text-surface-500 hover:text-surface-700 font-medium text-sm">← {t('back')}</Link>
          <h1 className="font-heading font-bold text-lg text-surface-900">{t('checkout')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}

        {/* Name */}
        <div className="glass-card p-5 animate-fade-in-up">
          <label className="block text-sm font-semibold text-surface-700 mb-2">{t('nameLabel')}</label>
          <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
            className="input-field" placeholder={t('namePlaceholder')} id="customer-name" />
        </div>

        {/* Order Type */}
        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <label className="block text-sm font-semibold text-surface-700 mb-3">{t('orderType')}</label>
          <div className="grid grid-cols-2 gap-3">
            {ORDER_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setOrderType(t.id)}
                className={`p-4 rounded-xl border-2 text-center font-semibold transition-all ${orderType === t.id ? 'border-transparent text-white' : 'border-surface-200 hover:border-primary-300 text-surface-600'}`}
                style={orderType === t.id ? { backgroundColor: brandingColor, borderColor: brandingColor, color: '#ffffff' } : {}}>
                <div className="text-2xl mb-1">{t.icon}</div>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method — hidden for points-only redemptions */}
        {isFullRedemption ? (
          <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">💎</div>
              <div>
                <p className="font-semibold text-emerald-700">{t('pointsRedemption')}</p>
                <p className="text-xs text-surface-500">{t('noPaymentNeeded')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <label className="block text-sm font-semibold text-surface-700 mb-3">{t('paymentMethod')}</label>
            <div className="grid grid-cols-3 gap-3">
              {PAYMENT_METHODS.map(m => (
                <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id)}
                  className={`p-3 rounded-xl border-2 text-center font-medium text-sm transition-all ${paymentMethod === m.id ? 'border-transparent text-white' : 'border-surface-200 hover:border-primary-300 text-surface-600'}`}
                  style={paymentMethod === m.id ? { backgroundColor: brandingColor, borderColor: brandingColor, color: '#ffffff' } : {}}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
        )}


        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <label className="block text-sm font-semibold text-surface-700 mb-2">{t('orderNotes')}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-field h-20 resize-none text-sm" placeholder={t('notesPlaceholder')} />
        </div>

        {/* Summary */}
        <div className="glass-card p-5 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <h3 className="font-heading font-bold text-surface-900 mb-3">{t('orderSummary')}</h3>
          {items.map(item => {
            let price = item.price;
            if (item.selectedAddons) item.selectedAddons.forEach(a => { price += a.price; });
            return (
              <div key={item.cartKey} className="flex justify-between text-sm py-1.5 border-b border-surface-100 last:border-0">
                <span className="text-surface-600">{item.quantity}× {item.name}</span>
                <span className="text-surface-900 font-medium">{formatCurrency(price * item.quantity)}</span>
              </div>
            );
          })}
          <div className="border-t border-surface-200 mt-3 pt-3">
            <div className="flex justify-between text-lg font-bold font-heading">
              <span>{t('total')}</span><span className="text-primary-600">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={submitting || (totalPointsCost > 0 && hasInsufficientPoints)} 
          className={`w-full py-4 text-lg transition-all rounded-xl font-bold ${hasInsufficientPoints && totalPointsCost > 0 ? 'bg-red-100 text-red-400 cursor-not-allowed' : 'btn-primary'}`} 
          id="place-order-btn"
          style={!(hasInsufficientPoints && totalPointsCost > 0) ? { backgroundColor: brandingColor } : {}}
        >
          {submitting ? t('placingOrder') : 
           hasInsufficientPoints && totalPointsCost > 0 ? t('insufficientPoints').replace('{pts}', totalPointsCost) :
           isFullRedemption ? t('claimPoints').replace('{pts}', totalPointsCost) : 
           totalPointsCost > 0 ? t('orderWithPoints').replace('{price}', formatCurrency(total)).replace('{pts}', totalPointsCost) :
           t('placeOrderTotal').replace('{price}', formatCurrency(total))}
        </button>
      </form>
    </div>
  );
}

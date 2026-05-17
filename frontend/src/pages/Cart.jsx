import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatCurrency } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { getPublicTenant, getProducts } from '../services/api';
import { applyTheme } from '../utils/theme';

const TRANSLATIONS = {
  en: {
    emptyCartTitle: "Your cart is empty",
    emptyCartDesc: "Add some delicious items from our menu!",
    browseMenu: "Browse Menu",
    backToMenu: "Back to Menu",
    shoppingCart: "Shopping Cart",
    orderSummary: "Order Summary",
    pointsTotal: "Points Total",
    pointsBalance: "Points Balance",
    itemsInCart: "Items in Cart",
    redeemReward: "Redeem reward for",
    points: "Points",
    clearCart: "Clear Cart",
    subtotal: "Subtotal",
    checkout: "Checkout",
    addedTogether: "Frequently Added Together"
  },
  tl: {
    emptyCartTitle: "Walang laman ang iyong cart",
    emptyCartDesc: "Magdagdag ng masasarap na pagkain mula sa aming menu!",
    browseMenu: "Tingnan ang Menu",
    backToMenu: "Bumalik sa Menu",
    shoppingCart: "Iyong Cart",
    orderSummary: "Buod ng Order",
    pointsTotal: "Kabuuang Puntos",
    pointsBalance: "Natitirang Puntos",
    itemsInCart: "Mga Pagkain sa Cart",
    redeemReward: "I-redeem bilang regalo gamit ang",
    points: "Puntos",
    clearCart: "I-clear ang Cart",
    subtotal: "Subtotal",
    checkout: "Magbayad na",
    addedTogether: "Madalas na Isinasabay"
  }
};

export default function Cart() {
  const { items, updateQuantity, removeFromCart, toggleRedemption, clearCart, getSubtotal, getItemCount, getTotalPointsCost, addToCart } = useCart();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'project-million';
  const [branding, setBranding] = useState(null);
  
  const isCustomer = user && user.role === 'customer';
  const subtotal = getSubtotal();
  const totalPoints = getTotalPointsCost();
  const count = getItemCount();

  const lang = localStorage.getItem('pos_lang') || 'en';
  const t = (key) => TRANSLATIONS[lang][key] || key;

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

  const [recommendations, setRecommendations] = useState([]);
  const [showUpsell, setShowUpsell] = useState(true);
  const [allProducts, setAllProducts] = useState([]);

  // Fetch products list once on mount
  useEffect(() => {
    getProducts().then(res => {
      if (res.data && res.data.success) {
        const flatProducts = (res.data.data || []).flatMap(c => 
          (c.products || []).map(p => ({ ...p, categoryName: c.name.toLowerCase() }))
        );
        setAllProducts(flatProducts);
      }
    }).catch(err => console.error('Failed to load upselling recommendations:', err));
  }, []);

  // Compute suggested upsell items instantly whenever items in cart or allProducts list updates
  useEffect(() => {
    if (allProducts.length === 0) return;

    // 1. Identify what categories are in the cart
    const cartProductIds = new Set(items.map(i => i.id));
    const cartCategoryNames = new Set(items.map(i => {
      const matched = allProducts.find(p => p.id === i.id);
      return matched ? matched.categoryName : '';
    }));

    let suggested = [];

    // Rule A: If cart has a Main/Burger but NO Drinks
    const hasMain = cartCategoryNames.has('burgers') || cartCategoryNames.has('mains') || cartCategoryNames.has('combo') || cartCategoryNames.has('pizza') || cartCategoryNames.has('meals');
    const hasDrink = cartCategoryNames.has('drinks') || cartCategoryNames.has('beverages');
    const hasSide = cartCategoryNames.has('sides') || cartCategoryNames.has('snacks') || cartCategoryNames.has('appetizers');

    if (hasMain && !hasDrink) {
      suggested = allProducts.filter(p => 
        (p.categoryName === 'drinks' || p.categoryName === 'beverages') && 
        !cartProductIds.has(p.id) && p.available && p.stock > 0
      );
    } 
    
    // Rule B: If cart has a Main but NO Sides
    if (suggested.length === 0 && hasMain && !hasSide) {
      suggested = allProducts.filter(p => 
        (p.categoryName === 'sides' || p.categoryName === 'snacks' || p.categoryName === 'appetizers') && 
        !cartProductIds.has(p.id) && p.available && p.stock > 0
      );
    }

    // Rule C: If they have a Drink but NO Food
    if (suggested.length === 0 && hasDrink && !hasMain) {
      suggested = allProducts.filter(p => 
        (p.categoryName === 'burgers' || p.categoryName === 'mains' || p.categoryName === 'combo') && 
        !cartProductIds.has(p.id) && p.available && p.stock > 0
      );
    }

    // Rule D: Fallback - Popular items (not in cart)
    if (suggested.length === 0) {
      suggested = allProducts.filter(p => 
        !cartProductIds.has(p.id) && p.available && p.stock > 0
      );
    }

    setRecommendations(suggested.slice(0, 4));
  }, [items, allProducts]);

  const brandingColor = branding?.primaryColor || '#0a3d01';
  const menuLink = '/menu';
  const checkoutLink = '/checkout';

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center px-4">
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="font-heading text-2xl font-bold text-surface-900 mb-2">{t('emptyCartTitle')}</h2>
        <p className="text-surface-500 mb-6">{t('emptyCartDesc')}</p>
        <Link to={menuLink} className="btn-primary" style={{ backgroundColor: brandingColor }}>{t('browseMenu')}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 pb-40">
      {/* Top Left Back Button */}
      <div className="p-3 sm:p-4 md:p-6 lg:px-8 pb-0 flex justify-between items-center">
        <Link to={menuLink} className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-3 bg-white rounded-full text-xs sm:text-sm font-bold text-surface-700 shadow-sm border border-surface-200 hover:border-primary-300 hover:shadow-md transition-all">
          <span className="text-lg sm:text-xl leading-none">←</span> {t('backToMenu')}
        </Link>
        
        {isCustomer && (
          <div className="bg-white border border-surface-200 px-4 py-2 rounded-2xl shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{t('pointsBalance')}</p>
            <p className="text-sm font-black text-emerald-600 leading-none">💎 {Math.floor(user.points)} <span className="text-[10px]">PTS</span></p>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4 md:mb-6">
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-surface-900 mb-1">{t('shoppingCart')}</h1>
          <p className="text-surface-500 text-base md:text-lg font-medium">{count} {t('items')}</p>
        </div>

        <div className="space-y-5">
          {items.map((item, idx) => {
            let itemPrice = item.price;
            if (item.selectedAddons) item.selectedAddons.forEach(a => { itemPrice += a.price; });
            const lineTotal = item.isRedemption ? 0 : itemPrice * item.quantity;

            return (
              <div key={item.cartKey} className={`glass-card p-4 md:p-6 animate-fade-in-up border-2 transition-all ${item.isRedemption ? 'border-emerald-500/50 bg-emerald-50/10' : 'border-transparent'}`} style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="flex gap-3 md:gap-5">
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-surface-100 rounded-xl md:rounded-2xl flex items-center justify-center text-3xl md:text-5xl flex-shrink-0 relative overflow-hidden">
                    <img src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=200&auto=format&fit=crop'} className="w-full h-full object-cover" />
                    {item.isRedemption && (
                      <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[1px] flex items-center justify-center">✅</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="font-heading font-bold text-surface-900 text-base md:text-xl pr-4">{item.name}</h3>
                        <button onClick={() => removeFromCart(item.cartKey)} className="text-surface-400 hover:text-red-500 text-2xl md:text-3xl w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors -mt-1 -mr-1 md:-mt-2 md:-mr-2">×</button>
                      </div>
                      
                      {item.isRedemption ? (
                        <div className="mt-2 flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full self-start inline-flex">
                          💎 Redeemed for {item.pointsCost * item.quantity} Pts
                        </div>
                      ) : (
                        <>
                          {item.selectedAddons && item.selectedAddons.length > 0 && (
                            <p className="text-xs md:text-sm font-medium mt-1" style={{ color: brandingColor }}>+ {item.selectedAddons.map(a => a.name).join(', ')}</p>
                          )}
                        </>
                      )}
                      
                      {item.notes && <p className="text-xs md:text-sm text-surface-500 mt-1 italic">"{item.notes}"</p>}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 md:mt-4 gap-2 sm:gap-0">
                      <div className="flex items-center gap-2 md:gap-3 bg-surface-100 p-1 md:p-1.5 rounded-xl md:rounded-2xl self-start sm:self-auto">
                        <button onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                          className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-white shadow-sm hover:bg-surface-50 flex items-center justify-center text-surface-700 font-bold text-lg md:text-2xl transition-all active:scale-95">−</button>
                        <span className="w-8 md:w-12 text-center font-bold text-lg md:text-xl text-surface-900">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                          className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl shadow-sm hover:brightness-110 flex items-center justify-center text-white font-bold text-lg md:text-2xl transition-all active:scale-95"
                          style={{ backgroundColor: brandingColor }}
                        >+</button>
                      </div>
                      <span className={`font-heading font-black text-xl md:text-3xl self-end sm:self-auto ${item.isRedemption ? 'text-emerald-500' : ''}`} style={!item.isRedemption ? { color: brandingColor } : {}}>
                        {item.isRedemption ? 'FREE' : formatCurrency(lineTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center md:justify-end animate-fade-in-up" style={{ animationDelay: `${items.length * 0.05}s` }}>
          <button onClick={clearCart} className="flex items-center gap-2 text-red-500 hover:text-red-600 font-bold text-lg px-6 py-3 rounded-2xl bg-white border-2 border-red-100 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm">
            {t('clearCart')}
          </button>
        </div>

        {/* Smart Upsell Carousel */}
        {showUpsell && recommendations.length > 0 && (
          <div className="mt-12 mb-8 animate-fade-in-up" style={{ animationDelay: `${items.length * 0.05 + 0.1}s` }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading font-black text-slate-800 text-lg md:text-2xl flex items-center gap-2">
                <span className="w-1.5 h-6 rounded-full" style={{ backgroundColor: brandingColor }}></span>
                🔥 {t('addedTogether')}
              </h3>
              <button 
                onClick={() => setShowUpsell(false)} 
                className="w-8 h-8 bg-surface-100 hover:bg-surface-200 text-surface-500 font-bold rounded-full border border-surface-200 transition-all flex items-center justify-center active:scale-95"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {recommendations.map(rec => (
                <div key={rec.id} className="bg-white border border-surface-200 rounded-[2rem] p-3 sm:p-4 flex flex-col justify-between hover:shadow-lg transition-all group relative overflow-hidden">
                  <div className="aspect-[4/3] rounded-[1.5rem] overflow-hidden bg-surface-50 mb-3 relative">
                    <img src={rec.image || 'https://via.placeholder.com/150'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1 mb-1">{rec.name}</h4>
                    <p className="font-black text-xs sm:text-sm mb-3" style={{ color: brandingColor }}>{formatCurrency(rec.price)}</p>
                  </div>
                  <button
                    onClick={() => addToCart(rec)}
                    className="w-full py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95 border border-slate-200 text-slate-700 hover:text-white"
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = brandingColor; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = ''; }}
                  >
                    <span>+ Add</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom checkout bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-surface-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs md:text-sm font-semibold text-surface-500 uppercase tracking-wider mb-0.5 md:mb-1">{t('subtotal')}</p>
            <p className="font-heading text-2xl md:text-4xl font-black text-surface-900">{formatCurrency(subtotal)}</p>
          </div>
          <Link to={checkoutLink} className="py-3 md:py-5 px-6 md:px-10 text-base md:text-xl rounded-xl md:rounded-2xl shadow-xl shadow-primary-500/30 whitespace-nowrap text-center flex-1 max-w-[200px] md:max-w-none text-white font-black" style={{ backgroundColor: brandingColor }} id="checkout-btn">
            {t('checkout')} <span className="hidden sm:inline">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

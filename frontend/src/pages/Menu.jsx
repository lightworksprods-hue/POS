import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getProducts, changePassword, getOrder } from '../services/api';
import { useCart } from '../context/CartContext';
import { useSocket } from '../context/SocketContext';
import { formatCurrency, unlockAudio } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import { applyTheme, clearTheme } from '../utils/theme';
import SeasonalEffects from '../components/SeasonalEffects';


const TRANSLATIONS = {
  en: {
    backHome: "Back Home",
    back: "Back",
    points: "Points",
    changePassword: "Change Password",
    orderHistory: "Order History",
    signOut: "Sign Out",
    allItems: "All Items",
    searchInstructions: "Tap an item to customize and add to cart",
    reviewCart: "Review Cart →",
    items: "Items",
    addToCart: "Add to Cart",
    soldOut: "Sold Out",
    customAddons: "Custom Add-ons",
    specialInstructions: "Special Instructions",
    instructionsPlaceholder: "e.g. No onions, extra sauce...",
    rewardsGallery: "Rewards Gallery",
    vipMember: "VIP Member",
    howToEarn: "How to earn points",
    earnInfo: "Earn 1 Point for every ₱100 spent!",
    redeemReward: "Redeem Reward",
    needPoints: "Need More Points",
    noRewards: "No Rewards Available",
    checkBackLater: "Check back later for exciting items!",
    selectSide: "Select Side/Drink",
    summary: "Selection Summary",
    addCombo: "Add Combo to Cart",
    changeSelections: "Change Selections",
    step1: "Step 1: Choose Item",
    step2: "Step 2: Choose Side/Drink",
    updateSecurity: "Update Security",
    cancel: "Cancel",
    savePassword: "Save Password"
  },
  tl: {
    backHome: "Bumalik sa Home",
    back: "Bumalik",
    points: "Mga Puntos",
    changePassword: "Palitan ang Password",
    orderHistory: "Kasaysayan ng Order",
    signOut: "Mag-Sign Out",
    allItems: "Lahat ng Pagkain",
    searchInstructions: "Pumili ng pagkain para i-customize at ilagay sa cart",
    reviewCart: "Tingnan ang Cart →",
    items: "Piraso",
    addToCart: "Ilagay sa Cart",
    soldOut: "Ubos Na",
    customAddons: "Karagdagang Sangkap",
    specialInstructions: "Espesyal na Habilin",
    instructionsPlaceholder: "Halimbawa: Walang sibuyas, dagdagan ang sarsa...",
    rewardsGallery: "Mga Libreng Regalo",
    vipMember: "VIP Member",
    howToEarn: "Paano makakuha ng puntos",
    earnInfo: "Makakuha ng 1 Puntos sa bawat ₱100 na binili mo!",
    redeemReward: "Kunin ang Regalo",
    needPoints: "Kailangan pang Puntos",
    noRewards: "Walang Regalo sa Ngayon",
    checkBackLater: "Bumalik muli mamaya para sa mga bagong regalo!",
    selectSide: "Pumili ng Side o Inumin",
    summary: "Buod ng mga Pinili",
    addCombo: "Ilagay ang Combo sa Cart",
    changeSelections: "Palitan ang mga Pinili",
    step1: "Hakbang 1: Pumili ng Pagkain",
    step2: "Hakbang 2: Pumili ng Side o Inumin",
    updateSecurity: "I-update ang Seguridad",
    cancel: "I-cancel",
    savePassword: "I-save ang Password"
  }
};

export default function Menu() {
  const { user, logoutUser } = useAuth();
  const isCustomer = user && user.role === 'customer';
  const [categories, setCategories] = useState([]);
  const [tenantName, setTenantName] = useState('Our Menu');
  const [branding, setBranding] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showRewards, setShowRewards] = useState(false);
  const [addOpts, setAddOpts] = useState({ size: '', flavor: '', addons: [], notes: '', comboChoices: null });
  const [comboStep, setComboStep] = useState(1); // 1 or 2
  const { addToCart, getItemCount, items, getSubtotal } = useCart();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [lang, setLang] = useState(localStorage.getItem('pos_lang') || 'en');

  const toggleLanguage = () => {
    const nextLang = lang === 'en' ? 'tl' : 'en';
    setLang(nextLang);
    localStorage.setItem('pos_lang', nextLang);
  };

  const t = (key) => {
    return TRANSLATIONS[lang][key] || key;
  };

  useEffect(() => { loadProducts(); }, [searchParams.get('tenant')]);

  useEffect(() => {
    const reorderNumber = searchParams.get('reorder');
    if (reorderNumber) {
      handleReorder(reorderNumber);
    }
  }, [searchParams]);

  const handleReorder = async (orderNumber) => {
    try {
      const res = await getOrder(orderNumber);
      if (res.data && res.data.data && res.data.data.items) {
        const orderItems = res.data.data.items;
        for (const item of orderItems) {
          const productObj = {
            id: item.productId,
            name: item.productName,
            price: item.productPrice,
            stock: 999, // default to high so cart accepts it
          };
          
          const options = {
            size: item.size || '',
            flavor: item.flavor || '',
            notes: item.notes || '',
            addons: item.addons ? JSON.parse(item.addons) : [],
            comboChoices: item.comboChoices ? (typeof item.comboChoices === 'string' ? JSON.parse(item.comboChoices) : item.comboChoices) : null,
            isRedemption: item.isRedemption || false
          };
          
          for (let i = 0; i < item.quantity; i++) {
            addToCart(productObj, options);
          }
        }
      }
    } catch (e) {
      console.error('Failed to reorder:', e);
    } finally {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('reorder');
      setSearchParams(newParams, { replace: true });
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await getProducts();
      setCategories(res.data.data || []);
      if (res.data.tenantName) setTenantName(res.data.tenantName);
      if (res.data.branding) {
        setBranding(res.data.branding);
        if (res.data.branding.primaryColor) {
          applyTheme(res.data.branding.primaryColor);
        }
      }
    } catch (e) {
      console.error('Failed to load products:', e);
    } finally {
      setLoading(false);
    }
  };

  // Cleanup theme on unmount
  useEffect(() => {
    return () => clearTheme();
  }, []);

  const handleProductClick = (product) => {
    if (product.isCombo) {
      setComboStep(1);
      setAddOpts({ size: '', flavor: '', addons: [], notes: '', comboChoices: { group1: null, group2: null } });
    } else {
      setAddOpts({ size: '', flavor: '', addons: [], notes: '', comboChoices: null });
    }
    setSelectedProduct(product);
  };

  const brandingColor = '#000000';
  const itemCount = getItemCount();

  const { joinRoom, leaveRoom, connected } = useSocket();

  useEffect(() => {
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
      return () => leaveRoom('kiosk', branding.id);
    }
  }, [branding?.id, connected]);

  const handleAddToCart = (product) => {
    addToCart(product, { ...addOpts, isRedemption: product.isRedemption });
    setSelectedProduct(null);
    setAddOpts({ size: '', flavor: '', addons: [], notes: '', comboChoices: null });
    setComboStep(1);
  };

  const toggleAddon = (addon) => {
    setAddOpts(prev => ({
      ...prev,
      addons: prev.addons.find(a => a.id === addon.id)
        ? prev.addons.filter(a => a.id !== addon.id)
        : [...prev.addons, { id: addon.id, name: addon.name, price: addon.price }]
    }));
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage({ type: '', text: '' });
    try {
      await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordMessage({ type: '', text: '' });
      }, 2000);
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update password.'
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Dynamic favicon & title
  useDynamicBranding(tenantName, branding?.favicon);

  if (loading) return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-[#34d399] border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const filteredCategories = activeCategory === 'all' ? categories : categories.filter(c => String(c.id) === activeCategory);

  return (
    <div className="min-h-screen bg-surface-50 pb-24 relative overflow-hidden" style={{ '--primary-custom': brandingColor }}>
      <SeasonalEffects brandingColor={brandingColor} forcedEffect={branding?.seasonal_effect} />
      {/* Sticky Top Header Row */}
      <div className="sticky top-0 z-40 bg-surface-50/90 backdrop-blur-xl border-b border-surface-200/50 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 md:px-5 md:py-3 bg-white rounded-full text-xs md:text-sm font-bold text-surface-700 shadow-sm border border-surface-200 hover:border-primary-300 hover:shadow-md transition-all active:scale-95">
              <span className="text-lg md:text-xl leading-none">←</span> <span className="hidden sm:inline">{t('backHome')}</span><span className="sm:hidden">{t('back')}</span>
            </Link>
          </div>

          <div className="flex items-center gap-4 relative">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 bg-white rounded-full text-xs md:text-sm font-black shadow-sm border border-surface-200 hover:border-primary-300 hover:shadow-md transition-all active:scale-95"
            >
              <span className={lang === 'en' ? 'text-primary-500' : 'text-surface-400'} style={lang === 'en' ? { color: brandingColor } : {}}>ENG</span>
              <span className="text-surface-300 font-normal">|</span>
              <span className={lang === 'tl' ? 'text-primary-500' : 'text-surface-400'} style={lang === 'tl' ? { color: brandingColor } : {}}>PH</span>
            </button>

            {isCustomer && user && (
              <>
                <button
                  onClick={() => setShowRewards(true)}
                  className="animate-fade-in flex items-center gap-3 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-2xl shadow-sm hover:bg-emerald-100 transition-all active:scale-95 group"
                >
                  <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">💎</div>
                  <div className="text-left hidden sm:block">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">{t('points')}</p>
                    <p className="text-sm font-black text-emerald-900 leading-none">{Math.floor(user.points || 0)}</p>
                  </div>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-primary-500/20 hover:scale-105 active:scale-95 transition-all border-2 border-white"
                    style={{ backgroundColor: brandingColor }}
                  >
                    {getInitials(user.name)}
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-3 w-56 bg-white rounded-3xl shadow-2xl border border-surface-100 overflow-hidden z-50 animate-scale-in origin-top-right">
                      <div className="p-4 border-b border-surface-50 bg-surface-50/50">
                        <p className="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-1">Signed in as</p>
                        <p className="font-bold text-surface-900 truncate">{user.name}</p>
                      </div>
                      <div className="p-2">
                        {!user?.isGoogle && (
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowPasswordModal(true);
                            }}
                            className="flex items-center gap-3 w-full p-3 rounded-2xl text-surface-600 hover:bg-surface-50 hover:text-primary-600 transition-all font-bold text-sm"
                          >
                            <span>🔒</span> {t('changePassword')}
                          </button>
                        )}
                        <Link
                          to="/account"
                          className="flex items-center gap-3 w-full p-3 rounded-2xl text-surface-600 hover:bg-surface-50 hover:text-primary-600 transition-all font-bold text-sm"
                        >
                          <span>📜</span> {t('orderHistory')}
                        </Link>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            logoutUser();
                          }}
                          className="flex items-center gap-3 w-full p-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm"
                        >
                          <span>👋</span> {t('signOut')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-4 md:pt-6 flex flex-col md:flex-row gap-8 md:gap-12 lg:gap-16">
        {/* Left Sidebar: Categories */}
        <div className="w-full md:w-56 lg:w-64 flex-shrink-0 animate-fade-in-up relative max-w-full min-w-0">
          <div className="md:sticky md:top-6 md:max-h-[calc(100vh-3rem)] flex flex-col">
            <div className="flex-shrink-0 mb-6">
              <div className="flex items-center gap-3 mb-2 md:mb-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-white/50 backdrop-blur-sm rounded-2xl overflow-hidden flex items-center justify-center shadow-lg border-2 border-white flex-shrink-0">
                  <img src="/logo.png" className="w-full h-full object-cover" alt="Kainlowkal" />
                </div>
                <h1 className="font-heading text-xl md:text-2xl lg:text-3xl font-bold text-surface-900 uppercase leading-tight" style={{ color: brandingColor }}>{tenantName}</h1>
              </div>
              <p className="text-surface-500 text-xs md:text-sm mb-3 md:mb-6">{t('searchInstructions')}</p>
            </div>

            <div className="flex overflow-x-auto md:grid md:grid-cols-1 gap-2 md:gap-4 pb-2 md:pb-20 scrollbar-hide px-1 md:overflow-y-auto rounded-xl md:rounded-3xl">
              <button
                onClick={() => setActiveCategory('all')}
                className={`flex-shrink-0 w-20 md:w-auto flex flex-col items-center justify-center text-center aspect-square rounded-2xl md:rounded-3xl p-2 md:p-3 transition-all ${activeCategory === 'all' ? 'text-white shadow-lg shadow-primary-500/30 scale-[1.05]' : 'bg-white text-surface-600 border border-surface-200 hover:border-primary-300 hover:bg-surface-50 hover:scale-[1.05]'}`}
                style={activeCategory === 'all' ? { backgroundColor: brandingColor } : {}}
              >
                <span className="text-3xl md:text-4xl lg:text-5xl mb-1 md:mb-2 lg:mb-3">🍽️</span>
                <span className="text-[10px] md:text-sm lg:text-base font-bold leading-tight">{t('allItems')}</span>
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(String(cat.id))}
                  className={`flex-shrink-0 w-20 md:w-auto flex flex-col items-center justify-center text-center aspect-square rounded-2xl md:rounded-3xl p-2 md:p-3 transition-all ${activeCategory === String(cat.id) ? 'text-white shadow-lg shadow-primary-500/30 scale-[1.05]' : 'bg-white text-surface-600 border border-surface-200 hover:border-primary-300 hover:bg-surface-50 hover:scale-[1.05]'}`}
                  style={activeCategory === String(cat.id) ? { backgroundColor: brandingColor } : {}}
                >
                  <span className="text-3xl md:text-4xl lg:text-5xl mb-1 md:mb-2 lg:mb-3">{cat.icon || '📦'}</span>
                  <span className="text-[10px] md:text-sm lg:text-base font-bold leading-tight line-clamp-2">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Content: Products Grid */}
        <div className="flex-1 animate-fade-in-up">
          {filteredCategories.map(cat => (
            <div key={cat.id} className="mb-12">
              <h2 className="font-heading text-xl md:text-2xl font-bold text-surface-800 mb-6 flex items-center gap-2">
                <span className="w-2 h-8 rounded-full" style={{ backgroundColor: brandingColor }}></span>
                {cat.name}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {cat.products?.map((product, idx) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className={`glass-card text-left overflow-hidden group flex flex-col ${(!product.available || product.stock <= 0) ? 'opacity-75 grayscale-[0.5] cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
                    disabled={!product.available || product.stock <= 0}
                  >
                    <div className="h-32 md:h-48 bg-white flex items-center justify-center text-6xl md:text-8xl transition-transform duration-500 w-full relative">
                      <img
                        src={product.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop'}
                        className="w-full h-full object-cover"
                      />
                      {product.tags && (
                        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
                          {product.tags.split(',').map(tag => {
                            if (tag === 'recommended') return (
                              <span key={tag} className="bg-amber-500/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-amber-400/20">
                                ⭐ Best Seller
                              </span>
                            );
                            if (tag === 'spicy') return (
                              <span key={tag} className="bg-red-600/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-red-500/20">
                                🌶️ Spicy
                              </span>
                            );
                            if (tag === 'halal') return (
                              <span key={tag} className="bg-emerald-600/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-emerald-500/20">
                                🕌 Halal
                              </span>
                            );
                            if (tag === 'sugar_free') return (
                              <span key={tag} className="bg-cyan-600/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-cyan-500/20">
                                🍬 Sugar-Free
                              </span>
                            );
                            if (tag === 'gluten_free') return (
                              <span key={tag} className="bg-yellow-600/95 text-slate-900 text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-yellow-500/20">
                                🌾 Gluten-Free
                              </span>
                            );
                            if (tag === 'nuts') return (
                              <span key={tag} className="bg-amber-800/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-amber-700/20">
                                🥜 Has Nuts
                              </span>
                            );
                            if (tag === 'vegan') return (
                              <span key={tag} className="bg-lime-600/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm border border-lime-500/20">
                                🌿 Vegan
                              </span>
                            );
                            return null;
                          })}
                        </div>
                      )}
                      {(!product.available || product.stock <= 0) && (
                        <div className="absolute inset-0 bg-surface-900/60 backdrop-blur-[2px] flex items-center justify-center">
                          <span className="bg-red-500 text-white font-black px-4 py-1.5 rounded-xl text-xs uppercase tracking-widest -rotate-12">Sold Out</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4 md:p-5 flex flex-col flex-1 w-full bg-white">
                      <h3 className="font-heading font-bold text-surface-900 text-lg md:text-xl mb-1 line-clamp-1">{product.name}</h3>
                      <p className="text-xs md:text-sm text-surface-500 line-clamp-2 mb-3 md:mb-4 flex-1">{product.description}</p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="font-heading font-black text-xl md:text-2xl" style={{ color: brandingColor }}>₱{product.price.toFixed(2)}</span>
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center text-lg md:text-xl font-black transition-all group-hover:scale-110 text-white" style={{ backgroundColor: brandingColor }}>
                          +
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Cart Button */}
      {itemCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4 sm:px-6">
          <Link
            to="/cart"
            className="flex items-center justify-between w-full h-16 px-4 sm:px-6 rounded-3xl text-white shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all animate-bounce-in"
            style={{ backgroundColor: brandingColor }}
          >
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 8h13l1.5 13H4L5.5 8z" /><path d="M8 11V6a4 4 0 0 1 8 0v5" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none mb-1 truncate">{itemCount} {t('items')}</p>
                <p className="text-lg font-black leading-none">₱{getSubtotal().toFixed(2)}</p>
              </div>
            </div>
            <span className="font-black uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap ml-2">{t('reviewCart')}</span>
          </Link>
        </div>
      )}

      {/* Product Detail Modal / Combo Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-fade-in-up shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* Modal Header Image */}
            <div className="h-40 md:h-56 bg-surface-100 flex items-center justify-center text-7xl relative overflow-hidden flex-shrink-0">
              <img
                src={(selectedProduct.isCombo && addOpts.comboChoices?.[`group${comboStep}`]?.image) || selectedProduct.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop'}
                className="w-full h-full object-cover transition-all duration-700"
              />
              {/* Back Button for Combo Step 2 */}
              {selectedProduct.isCombo && comboStep > 1 && (
                <button
                  onClick={() => setComboStep(1)}
                  className="absolute top-4 left-4 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all z-20 group"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}

              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all z-20 group"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <h2 className="font-heading text-xl md:text-2xl font-bold text-white">{selectedProduct.name}</h2>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 scrollbar-hide">
              {/* Full-Sized Badges in Details Panel */}
              {selectedProduct.tags && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedProduct.tags.split(',').map(tag => {
                    const badgeStyles = {
                      recommended: { text: 'Best Seller', icon: '⭐', style: 'bg-amber-500 text-white' },
                      spicy: { text: 'Spicy', icon: '🌶️', style: 'bg-red-600 text-white' },
                      halal: { text: 'Halal Certified', icon: '🕌', style: 'bg-emerald-600 text-white' },
                      sugar_free: { text: 'Sugar-Free', icon: '🍬', style: 'bg-cyan-600 text-white' },
                      gluten_free: { text: 'Gluten-Free', icon: '🌾', style: 'bg-yellow-500 text-slate-900' },
                      nuts: { text: 'Contains Nuts', icon: '🥜', style: 'bg-amber-800 text-white' },
                      vegan: { text: 'Vegan', icon: '🌿', style: 'bg-lime-600 text-white' }
                    }[tag];
                    if (!badgeStyles) return null;
                    return (
                      <span key={tag} className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1 ${badgeStyles.style}`}>
                        {badgeStyles.icon} {badgeStyles.text}
                      </span>
                    );
                  })}
                </div>
              )}

              {selectedProduct.isCombo ? (
                <div className="space-y-6">
                  {/* Combo Step Progress */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`flex-1 h-2 rounded-full transition-all ${comboStep >= 1 ? 'bg-primary-500' : 'bg-surface-200'}`} style={comboStep >= 1 ? { backgroundColor: brandingColor } : {}}></div>
                    <div className={`flex-1 h-2 rounded-full transition-all ${comboStep >= 2 ? 'bg-primary-500' : 'bg-surface-200'}`} style={comboStep >= 2 ? { backgroundColor: brandingColor } : {}}></div>
                  </div>

                  <div className="animate-fade-in" key={comboStep}>
                    <h3 className="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] mb-4">
                      {comboStep === 1 ? (selectedProduct.comboGroup1Name || t('step1')) : (selectedProduct.comboGroup2Name || t('step2'))}
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      {(selectedProduct.comboOptions || [])
                        .filter(opt => opt.groupNumber === comboStep)
                        .map(opt => {
                          const isSelected = addOpts.comboChoices?.[`group${comboStep}`]?.id === opt.product.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                setAddOpts(prev => ({
                                  ...prev,
                                  comboChoices: { ...prev.comboChoices, [`group${comboStep}`]: opt.product }
                                }));
                              }}
                              className={`relative flex flex-col rounded-[24px] overflow-hidden border-2 transition-all duration-300 group ${isSelected ? 'shadow-lg -translate-y-1' : 'border-surface-100 bg-white hover:border-surface-300 shadow-sm'}`}
                              style={isSelected ? { borderColor: brandingColor, backgroundColor: `${brandingColor}08` } : {}}
                            >
                              {/* Checkmark Badge */}
                              {isSelected && (
                                <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md animate-scale-in" style={{ backgroundColor: brandingColor }}>
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                </div>
                              )}

                              <div className="aspect-[4/3] overflow-hidden bg-surface-50">
                                <img
                                  src={opt.product.image || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1000&auto=format&fit=crop'}
                                  className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}
                                  alt={opt.product.name}
                                />
                              </div>

                              <div className="p-3 text-center">
                                <p className={`font-black text-[11px] leading-tight uppercase tracking-tight mb-1 transition-colors ${isSelected ? 'text-surface-900' : 'text-surface-600'}`}>{opt.product.name}</p>
                                {opt.priceBonus > 0 && (
                                  <span className="inline-block px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-black" style={{ backgroundColor: `${brandingColor}20`, color: brandingColor }}>
                                    +₱{opt.priceBonus}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                    </div>

                    {/* Next Button for Step 1 */}
                    {comboStep === 1 && addOpts.comboChoices?.group1 && (
                      <div className="pt-6 animate-fade-in-up">
                        <button
                          onClick={() => setComboStep(2)}
                          className="w-full py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                          style={{ backgroundColor: brandingColor }}
                        >
                          {selectedProduct.comboGroup2Name || t('selectSide')} →
                        </button>
                      </div>
                    )}
                  </div>

                  {comboStep === 2 && addOpts.comboChoices?.group1 && addOpts.comboChoices?.group2 && (
                    <div className="pt-6 border-t border-surface-100 animate-bounce-in">
                      <div className="bg-surface-50 p-4 rounded-2xl mb-6">
                        <p className="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-2">{t('summary')}</p>
                        <div className="flex justify-between text-sm font-bold text-surface-700">
                          <span>{addOpts.comboChoices.group1.name}</span>
                          <span>+ {addOpts.comboChoices.group2.name}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddToCart(selectedProduct)}
                        className="w-full py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                        style={{ backgroundColor: brandingColor }}
                      >
                        {t('addCombo')} ₱{selectedProduct.price.toFixed(2)}
                      </button>
                      <button onClick={() => setComboStep(1)} className="w-full py-3 text-surface-400 text-[10px] font-black uppercase tracking-widest hover:text-surface-600 transition-colors">
                        ← {t('changeSelections')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-surface-500 text-sm mb-6">{selectedProduct.description}</p>
                  <div className="flex items-center gap-4 mb-8">
                    <p className="font-heading text-3xl font-bold" style={{ color: brandingColor }}>₱{selectedProduct.price.toFixed(2)}</p>
                    {selectedProduct.pointsCost && isCustomer && (
                      <div className="bg-amber-50 text-amber-600 text-xs font-bold px-3 py-1.5 rounded-xl border border-amber-100">
                        💎 Redeem for {selectedProduct.pointsCost} Points
                      </div>
                    )}
                  </div>

                  {/* Add-ons */}
                  {selectedProduct.addons && selectedProduct.addons.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-xs font-black text-surface-400 uppercase tracking-widest mb-3">{t('customAddons')}</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.addons.map(addon => (
                          <button key={addon.id} onClick={() => toggleAddon(addon)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${addOpts.addons.find(a => a.id === addon.id) ? 'border-transparent text-white' : 'bg-surface-50 border-surface-200 text-surface-600 hover:border-primary-300'}`}
                            style={addOpts.addons.find(a => a.id === addon.id) ? { backgroundColor: brandingColor } : {}}>
                            {addon.name} +₱{addon.price}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="mb-8">
                    <h3 className="text-xs font-black text-surface-400 uppercase tracking-widest mb-3">{t('specialInstructions')}</h3>
                    <textarea
                      value={addOpts.notes}
                      onChange={e => setAddOpts(p => ({ ...p, notes: e.target.value }))}
                      className="w-full bg-surface-50 border border-surface-200 rounded-2xl p-4 text-surface-900 placeholder-surface-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none h-24 resize-none"
                      placeholder={t('instructionsPlaceholder')}
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => handleAddToCart(selectedProduct)}
                      className="flex-1 py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      style={{ backgroundColor: brandingColor }}
                      disabled={!selectedProduct.available}
                    >
                      {t('addToCart')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Premium Rewards Gallery Modal */}
      {showRewards && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          {/* Dark blurred backdrop */}
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setShowRewards(false)}></div>
          
          <div className="relative bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            
            {/* Header Section */}
            <div className="relative p-8 md:p-10 text-white overflow-hidden shrink-0" style={{ backgroundColor: brandingColor }}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
              
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-widest mb-4 border border-white/20 shadow-sm backdrop-blur-md">
                    <span>💎</span> VIP Member
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tight uppercase mb-2 drop-shadow-sm">Rewards Gallery</h2>
                  <p className="text-white/90 font-bold text-lg flex items-center gap-2">
                    You have <span className="text-2xl font-black bg-white/20 px-3 py-1 rounded-xl shadow-inner">{Math.floor(user?.points || 0)}</span> Points
                  </p>
                </div>
                <button onClick={() => setShowRewards(false)} className="w-12 h-12 bg-black/20 hover:bg-black/40 rounded-full flex items-center justify-center text-xl transition-all shadow-sm backdrop-blur-md">✕</button>
              </div>
            </div>

            {/* Info Banner */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 px-8 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg shadow-inner shrink-0">
                  ℹ️
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">{t('howToEarn')}</h4>
                  <p className="text-[11px] font-bold text-slate-500">
                    {lang === 'tl' ? (
                      <>Makakuha ng <strong className="text-slate-700">1 Puntos</strong> sa bawat <strong className="text-slate-700">₱{branding?.points_rate || '100'}</strong> na binili mo!</>
                    ) : (
                      <>Earn <strong className="text-slate-700">1 Point</strong> for every <strong className="text-slate-700">₱{branding?.points_rate || '100'}</strong> spent on your orders!</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Products Grid */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categories.flatMap(c => c.products).filter(p => p.pointsCost).map(product => {
                  const canAfford = (user?.points || 0) >= product.pointsCost;
                  const progress = Math.min(100, ((user?.points || 0) / product.pointsCost) * 100);
                  
                  return (
                    <div key={product.id} className="group bg-white border border-slate-200 rounded-[2rem] p-5 shadow-sm hover:shadow-xl transition-all relative overflow-hidden flex flex-col justify-between h-full">
                      
                      {/* Decorative background element for affordable items */}
                      {canAfford && (
                        <div className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full blur-2xl transition-all group-hover:scale-150" style={{ backgroundColor: brandingColor }}></div>
                      )}

                      <div className="relative z-10 flex gap-5 items-center mb-6">
                        <div className="relative shrink-0">
                          <img src={product.image || 'https://via.placeholder.com/150'} className={`w-20 h-20 rounded-2xl object-cover shadow-md transition-transform group-hover:scale-105 ${!canAfford ? 'grayscale opacity-80' : ''}`} />
                          {canAfford && (
                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-500 text-white text-xs flex items-center justify-center rounded-full shadow-md border-2 border-white">✓</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className={`font-black text-lg leading-tight mb-1 ${canAfford ? 'text-slate-900' : 'text-slate-500'}`}>{product.name}</h4>
                          <p className="font-black text-sm flex items-center gap-1" style={{ color: brandingColor }}>
                            💎 {product.pointsCost} <span className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">Pts</span>
                          </p>
                        </div>
                      </div>

                      <div className="relative z-10 mt-auto">
                        {!canAfford && (
                          <div className="mb-4">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                              <span>Progress</span>
                              <span>{Math.floor(user?.points || 0)} / {product.pointsCost}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, backgroundColor: brandingColor }}></div>
                            </div>
                          </div>
                        )}

                        <button
                          disabled={!canAfford || !product.available}
                          onClick={() => {
                            addToCart(product, { isRedemption: true });
                            setShowRewards(false);
                          }}
                          className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98] ${
                            canAfford 
                              ? 'text-white shadow-lg ring-2 ring-transparent ring-offset-2' 
                              : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                          style={canAfford ? { backgroundColor: brandingColor, '--tw-ring-color': brandingColor } : {}}
                        >
                          {canAfford ? 'Redeem Reward' : `Need ${product.pointsCost - Math.floor(user?.points || 0)} More Points`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {categories.flatMap(c => c.products).filter(p => p.pointsCost).length === 0 && (
                <div className="text-center py-20">
                  <div className="text-6xl mb-4 opacity-50">🎁</div>
                  <h3 className="text-xl font-black text-slate-800">No Rewards Available</h3>
                  <p className="text-slate-500 font-medium">Check back later for exciting items you can redeem!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}></div>
          <div className="bg-white rounded-[40px] w-full max-w-md p-8 relative z-10 shadow-2xl animate-fade-in-up">
            <h3 className="text-2xl font-black text-slate-900 mb-6">Update Security</h3>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Current Password</label>
                <input
                  type="password"
                  required
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-1 outline-none transition-all"
                  style={{ '--tw-ring-color': brandingColor, borderColor: brandingColor }}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">New Password</label>
                <input
                  type="password"
                  required
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-1 outline-none transition-all"
                  style={{ '--tw-ring-color': brandingColor, borderColor: brandingColor }}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-1 outline-none transition-all"
                  style={{ '--tw-ring-color': brandingColor, borderColor: brandingColor }}
                  placeholder="••••••••"
                />
              </div>

              {passwordMessage.text && (
                <div className={`p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest ${passwordMessage.type === 'success' ? 'bg-surface-50' : 'bg-red-50 text-red-600'}`} style={passwordMessage.type === 'success' ? { color: brandingColor } : {}}>
                  {passwordMessage.text}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-50 transition-all"
                  style={{ backgroundColor: brandingColor, boxShadow: `0 10px 15px -3px ${brandingColor}33` }}
                >
                  {passwordLoading ? 'Updating...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

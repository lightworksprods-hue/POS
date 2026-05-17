import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getOrder, getPublicTenant } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import SeasonalEffects from '../components/SeasonalEffects';

export default function Landing() {
  const [lastOrder, setLastOrder] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, logoutUser } = useAuth();
  const [searchParams] = useSearchParams();
  const isCustomer = user && user.role === 'customer';
  const { joinRoom, leaveRoom, connected } = useSocket();

  // Dynamic favicon, title & OG meta
  useDynamicBranding(tenant?.name || 'PROJECT MILLION', tenant?.favicon, {
    image: tenant?.ogImage || tenant?.logo,
    description: `Order from ${tenant?.name || 'PROJECT MILLION'} — Self-Service Kiosk`
  });

  useEffect(() => {
    if (tenant?.id) {
      joinRoom('kiosk', tenant.id);
      return () => leaveRoom('kiosk', tenant.id);
    }
  }, [tenant?.id, connected]);

  useEffect(() => {
    const init = async () => {
      // Check for tenant from URL (defaulting to project-million)
      const tenantSlug = searchParams.get('tenant') || 'project-million';
      try {
        const res = await getPublicTenant(tenantSlug);
        if (res.data.success) {
          setTenant(res.data.data);
        }
      } catch (e) {
        console.error('Failed to load tenant info:', e);
      }

      // Check for last order
      const lastOrderKey = tenantSlug ? `${tenantSlug}_last_order_number` : 'last_order_number';
      const saved = localStorage.getItem(lastOrderKey);
      if (saved) {
        try {
          const res = await getOrder(saved);
          const order = res.data.data;
          if (order && (order.status === 'completed' || order.status === 'cancelled')) {
            localStorage.removeItem('last_order_number');
            setLastOrder(null);
          } else {
            setLastOrder(saved);
          }
        } catch (error) {
          localStorage.removeItem('last_order_number');
          setLastOrder(null);
        }
      }
      setLoading(false);
    };
    init();
  }, [searchParams]);

  const tenantName = tenant ? tenant.name : 'PROJECT MILLION';
  const menuLink = tenant ? `/menu?tenant=${tenant.slug}` : '/menu';
  const queueLink = tenant ? `/queue?tenant=${tenant.slug}` : '/queue';
  const portalLink = tenant ? `/member-portal?tenant=${tenant.slug}` : '/member-portal';
  const primaryColor = tenant?.primaryColor || '#f97316';

  // Smart background fallback based on tenant type
  const burgerBackground = 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=2000&auto=format&fit=crop';
  const defaultBackground = 'https://images.unsplash.com/photo-1586816001966-79b736744398?q=80&w=2000&auto=format&fit=crop';

  const bannerImage = tenant?.bannerImage || (tenant?.slug === 'burger-palace' ? burgerBackground : defaultBackground);

  const [currentAssetIndex, setCurrentAssetIndex] = useState(0);

  // Safe asset resolution (handles JSON objects and string-encoded JSON from API)
  let rawAssets = tenant?.bannerAssets || [];
  if (typeof rawAssets === 'string') {
    try { rawAssets = JSON.parse(rawAssets); } catch (e) { rawAssets = []; }
  }

  const assets = (Array.isArray(rawAssets) && rawAssets.length > 0)
    ? rawAssets.filter(a => a && typeof a === 'string' && a.trim() !== '')
    : [bannerImage];

  useEffect(() => {
    if (assets.length > 1) {
      const interval = setInterval(() => {
        setCurrentAssetIndex((prev) => (prev + 1) % assets.length);
      }, 10000); // 10 seconds for a better feel
      return () => clearInterval(interval);
    }
  }, [assets]);

  if (loading) return <div className="min-h-screen bg-surface-900 flex items-center justify-center">
    <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
  </div>;

  const isSuspended = tenant && !tenant.active && user?.role !== 'superadmin';

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center text-5xl mb-8 animate-pulse">
          🚫
        </div>
        <h1 className="font-heading text-4xl md:text-6xl font-black text-white mb-4 uppercase tracking-tighter">
          Service <span className="text-red-500">Suspended</span>
        </h1>
        <p className="text-surface-400 text-lg md:text-xl max-w-md mx-auto mb-10 leading-relaxed">
          The storefront for <span className="text-white font-bold">{tenant.name}</span> is temporarily unavailable.
          Please contact the system administrator for more information.
        </p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Link to="/" className="py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-all">
            Return Home
          </Link>
          <Link to="/login" className="text-surface-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors">
            Staff Login →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden" style={{ '--primary-custom': primaryColor }}>
      {/* Background Layer */}
      <div className="fixed inset-0 z-0 bg-black">
        <style>
          {`
              @keyframes kenburns {
                0% { transform: scale(1.1); }
                100% { transform: scale(1.5); }
              }
              .animate-kenburns {
                animation: kenburns 15s linear infinite alternate;
              }
              .asset-transition {
                transition: opacity 2s ease-in-out;
              }
              .btn-custom {
                background-color: var(--primary-custom);
                color: white;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
              }
              .btn-custom:hover {
                filter: brightness(1.1);
              }
            `}
        </style>

        {assets.map((asset, index) => {
          // Resolve URL: 
          // 1. If it's a full URL or data URI, use it as is.
          // 2. If it's an upload (/uploads/...), prefix with backend API URL.
          // 3. If it's a local public asset (starts with / but not /uploads/), use it as is.
          const backendUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || (import.meta.env.PROD ? '' : 'http://localhost:5000');
          const fullUrl = (asset.startsWith('http') || asset.startsWith('data:') || (asset.startsWith('/') && !asset.startsWith('/uploads/')))
            ? asset
            : `${backendUrl}${asset}`;

          const isVid = typeof asset === 'string' && (
            /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(asset.split(/[?#]/)[0]) ||
            (asset.includes('/uploads/') && !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(asset))
          );
          const isActive = index === currentAssetIndex;

          return (
            <div
              key={`${asset}-${index}`}
              className={`absolute inset-0 asset-transition ${isActive ? 'opacity-100' : 'opacity-0'}`}
              style={{ zIndex: isActive ? 1 : 0 }}
            >
              {isVid ? (
                <video
                  key={fullUrl}
                  autoPlay muted loop playsInline
                  preload="auto"
                  className="w-full h-full object-cover"
                >
                  <source src={fullUrl} />
                </video>
              ) : (
                <img
                  src={fullUrl}
                  alt=""
                  className={`w-full h-full object-cover ${isActive ? 'animate-kenburns' : ''}`}
                />
              )}
            </div>
          );
        })}

        <div className="absolute inset-0 bg-gradient-to-b from-surface-950/80 via-surface-950/40 to-surface-950/90 z-10" />
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full blur-[100px] animate-pulse-slow z-20 opacity-30" style={{ backgroundColor: primaryColor }} />
        <SeasonalEffects brandingColor={primaryColor} forcedEffect={tenant?.seasonal_effect} />
      </div>

      {/* Main Content Wrapper - Centered */}
      <div className="relative z-20 w-full max-w-5xl mx-auto px-6 py-20 flex flex-col items-center justify-center text-center animate-fade-in-up">
        {isCustomer && (
          <div className="inline-flex flex-col items-center gap-2 mb-8 animate-fade-in">
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-8 py-3 rounded-[2rem] text-emerald-400 font-bold text-lg backdrop-blur-md shadow-xl shadow-emerald-500/10 flex flex-col items-center">
              <span className="text-white">Welcome back, <span className="text-emerald-400">{user.name}</span>!</span>
            </div>
            <div className="text-[10px] text-emerald-500/60 font-black uppercase tracking-[0.3em] mt-2">
              💎 {Math.floor(user.points)} Loyalty Points Available
            </div>
          </div>
        )}

        <div className="flex justify-center mb-10">
          {tenant?.logo ? (
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-[40px] overflow-hidden shadow-2xl ring-8 ring-white/5 animate-scale-in transition-transform hover:scale-110 duration-500">
              <img src={tenant.logo} className="w-full h-full object-cover" alt={tenant.name} />
            </div>
          ) : (
            <div className="w-24 h-24 md:w-32 md:h-32 bg-white/10 backdrop-blur-md rounded-[40px] flex items-center justify-center text-5xl shadow-2xl border border-white/20 animate-scale-in ring-8 ring-white/5">
              {tenant?.slug === 'burger-palace' ? '🍔' : '🍔'}
            </div>
          )}
        </div>

        <h1 className="font-heading text-6xl md:text-9xl font-black text-white leading-[0.85] mb-8 uppercase tracking-tighter">
          {tenant ? (
            <>
              {tenant.name.split(' ')[0]} <br />
              <span style={{ color: primaryColor }} className="drop-shadow-[0_0_30px_rgba(var(--primary-custom),0.3)]">
                {tenant.name.split(' ').slice(1).join(' ')}
              </span>
            </>
          ) : (
            <>
              PROJECT
              <br />
              <span className="bg-gradient-to-r from-primary-400 to-amber-400 bg-clip-text text-transparent">
                MILLION
              </span>
            </>
          )}
        </h1>

        <p className="text-lg md:text-2xl text-surface-300 max-w-2xl mx-auto font-medium leading-relaxed mb-12">
          {tenant?.landing_description || (tenant?.slug === 'burger-palace'
            ? 'The most royal burgers in the palace. Order now and skip the wait!'
            : 'Fresh food, fast service. Order right from this screen and enjoy your meal.')}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
          {user && user.role !== 'customer' ? (
            <>
              <Link
                to={tenant ? `/${user.role === 'admin' ? 'admin' : user.role === 'kitchen' ? 'kitchen' : 'cashier'}?tenant=${tenant.slug}` : `/${user.role === 'admin' ? 'admin' : user.role === 'kitchen' ? 'kitchen' : 'cashier'}`}
                className="btn-custom w-full text-lg py-5 rounded-2xl font-black tracking-widest uppercase flex items-center justify-center gap-2 mb-2 shadow-xl"
              >
                Go to {user.role.charAt(0).toUpperCase() + user.role.slice(1)} 🚀
              </Link>

              <Link to={menuLink} className="w-full py-4 px-6 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-2xl font-bold transition-all flex items-center justify-center">
                Start New Order
              </Link>
            </>
          ) : (
            <>
              <Link to={menuLink} className="btn-custom w-full text-xl py-6 rounded-3xl font-black tracking-widest uppercase flex items-center justify-center gap-3 shadow-2xl transition-all hover:scale-105" id="start-order-btn">
                {isCustomer ? 'Start Ordering' : 'Start Order'}
              </Link>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-2">
                {!user && (
                  <Link to={portalLink} className="py-4 px-6 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <span></span> Sign In
                  </Link>
                )}
                <Link to={queueLink} className="py-4 px-6 bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2" id="view-queue-btn">
                  <span></span> Queue
                </Link>
              </div>

              {lastOrder && (
                <Link
                  to={tenant ? `/order/${lastOrder}?tenant=${tenant.slug}` : `/order/${lastOrder}`}
                  className="w-full mt-2 py-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-2xl font-bold flex items-center justify-center gap-2 animate-pulse"
                >
                  <span></span> View Order
                </Link>
              )}
            </>
          )}

          {!user ? (
            <Link to={tenant ? `/login?tenant=${tenant.slug}` : '/login'} className="text-surface-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors mt-6">
              Staff Secure Login →
            </Link>
          ) : (
            <button
              onClick={logoutUser}
              className="text-red-400 text-[10px] font-black uppercase tracking-widest hover:text-red-300 transition-colors mt-6"
            >
              {user.role === 'customer' ? `Not ${user.name.split(' ')[0]}? Sign Out` : `Log Out System [${user.role}]`}
            </button>
          )}
        </div>
      </div>

      {/* Legal Footer */}
      <div className="relative z-10 mt-auto py-8 text-center border-t border-white/5 w-full max-w-sm mx-auto">
        <div className="flex justify-center gap-6 text-[10px] font-bold text-surface-500 uppercase tracking-widest">
          <Link to={tenant ? `/privacy?tenant=${tenant.slug}` : '/privacy'} className="hover:text-white transition-colors">Privacy</Link>
          <Link to={tenant ? `/terms?tenant=${tenant.slug}` : '/terms'} className="hover:text-white transition-colors">Terms</Link>
          <Link to={tenant ? `/data-deletion?tenant=${tenant.slug}` : '/data-deletion'} className="hover:text-white transition-colors">Conditions</Link>
        </div>
      </div>
    </div>
  );
}

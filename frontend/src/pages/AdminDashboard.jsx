import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { getAdminSummary } from '../services/api';
import ProductsTab from '../components/admin/ProductsTab';
import CategoriesTab from '../components/admin/CategoriesTab';
import OrdersTab from '../components/admin/OrdersTab';
import InventoryTab from '../components/admin/InventoryTab';
import InventoryLogsTab from '../components/admin/InventoryLogsTab';
import ExpensesTab from '../components/admin/ExpensesTab';
import ReportsTab from '../components/admin/ReportsTab';
import SettingsTab from '../components/admin/SettingsTab';
import AuditLogsTab from '../components/admin/LogsTab';
import StaffTab from '../components/admin/StaffTab';
import SuppliersTab from '../components/admin/SuppliersTab';
import FeedbackTab from '../components/admin/FeedbackTab';
import { formatCurrency } from '../utils/helpers';
import { applyTheme, clearTheme } from '../utils/theme';
import { useDynamicBranding } from '../hooks/useDynamicBranding';

export default function AdminDashboard() {
  const { user, logoutUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dynamic favicon & title
  useDynamicBranding(`${user?.tenantName || 'Admin'} Dashboard`, user?.tenantFavicon);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    
    // Apply initial colors
    const initialColor = user.tenantColor || user.tenant?.primaryColor;
    if (initialColor) applyTheme(initialColor);

    loadSummary();

    // CLEANUP: Wipe the theme when leaving the dashboard
    return () => clearTheme();
  }, [user, navigate]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const res = await getAdminSummary();
      const data = res.data.data;
      setSummary(data);

      const tenantColor = data.branding?.primaryColor || user?.tenant?.primaryColor || user?.tenantColor;
      if (tenantColor) applyTheme(tenantColor);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'orders', label: 'Orders', icon: '🛍️' },
    { id: 'categories', label: 'Categories', icon: '📁' },
    { id: 'products', label: 'Products', icon: '🍔' },
    { id: 'staff', label: 'Staff', icon: '👥' },
    { id: 'suppliers', label: 'Suppliers', icon: '🤝' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'inventory-logs', label: 'Stock History', icon: '📜' },
    { id: 'expenses', label: 'Expenses', icon: '💸' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'feedback', label: 'Feedback', icon: '💬' },
    { id: 'audit', label: 'Audit Logs', icon: '📜' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  if (loading && !summary) return <div className="min-h-screen flex items-center justify-center bg-surface-50">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-surface-500 font-bold uppercase tracking-widest text-xs">Initializing Dashboard...</p>
    </div>
  </div>;

  return (
    <div className="h-screen bg-surface-50 flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar / Bottom Nav (Mobile) */}
      <aside className="w-full md:w-64 bg-surface-900 text-white flex flex-col md:h-screen z-30 flex-shrink-0 order-last md:order-first border-t md:border-t-0 md:border-r border-surface-800 pb-safe">
        {/* Desktop Only Header */}
        <div className="hidden md:flex p-6 border-b border-surface-800 justify-between items-center">
          <h1 className="font-heading text-xl font-black tracking-tight text-white flex items-center gap-2">
            <img src="/logo.png" className="w-8 h-8 rounded-lg object-cover bg-white shadow-md border border-white/10" alt="Kainlowkal" />
            <span className="truncate">{user?.tenantName || 'ADMIN'}</span>
          </h1>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="flex md:flex-col overflow-x-auto md:overflow-y-auto px-2 py-3 md:p-4 gap-2 md:gap-1 scrollbar-hide justify-between md:justify-start">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-shrink-0 md:flex-1 md:w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-xl font-bold transition-all ${activeTab === item.id ? 'bg-primary-600/10 md:bg-primary-600 text-primary-500 md:text-white shadow-none md:shadow-lg md:shadow-primary-600/20' : 'text-surface-400 hover:text-white md:hover:bg-surface-800'}`}
            >
              <span className="text-xl md:text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] md:text-sm whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Desktop Only Logout */}
        <div className="hidden md:block p-4 border-t border-surface-800 mt-auto">
          <button onClick={logoutUser} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
            <span>🚪</span> Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden md:h-screen">
        {/* Header */}
        <header className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-4">
            <img src="/logo.png" className="w-10 h-10 rounded-xl object-cover bg-white shadow-sm border border-slate-100" alt="Kainlowkal" />
            <div>
              <h1 className="font-heading text-lg font-bold text-surface-900 leading-tight">
                {user?.tenantName || 'Store'} Management
              </h1>
              <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                Admin Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-surface-900">{user?.name}</p>
              <p className="text-[10px] font-bold text-surface-400 uppercase">{user?.role}</p>
            </div>
            <div className="flex items-center gap-2 border-l border-surface-200 pl-2 sm:pl-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-primary-500/20">
                {user?.name?.charAt(0)}
              </div>
              <button onClick={logoutUser} className="md:hidden p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <span className="text-xl">🚪</span>
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {activeTab === 'overview' && summary && (
            <div className="animate-fade-in space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-heading text-3xl font-black text-surface-900 tracking-tight">Business Intelligence</h2>
                  <p className="text-surface-500 font-medium">Real-time performance metrics for your shop.</p>
                </div>
              </div>
              
              {/* Main KPI Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Today's Revenue" value={formatCurrency(summary.revenue)} icon="💰" color="blue" />
                <StatCard title="Today's Expenses" value={formatCurrency(summary.totalExpenses || 0)} icon="💸" color="red" />
                <StatCard title="Net Profit" value={formatCurrency((summary.revenue || 0) - (summary.totalExpenses || 0))} icon="📈" color="emerald" />
                <StatCard title="Orders Today" value={summary.ordersCount} icon="🛒" color="purple" />
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-surface-200">
                  <h3 className="font-heading font-bold text-surface-900 mb-6">Sales Performance (Last 14 Days)</h3>
                  <div className="h-[300px] w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={summary.dailySales || []} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={user?.tenantColor || user?.tenant?.primaryColor || '#f97316'} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={user?.tenantColor || user?.tenant?.primaryColor || '#f97316'} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickFormatter={(value) => `₱${value}`} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                          itemStyle={{ fontWeight: 900, color: '#0f172a' }}
                          labelStyle={{ fontWeight: 700, color: '#64748b', marginBottom: '4px' }}
                          formatter={(value) => [formatCurrency(value), 'Revenue']}
                        />
                        <Area type="monotone" dataKey="revenue" stroke={user?.tenantColor || user?.tenant?.primaryColor || '#f97316'} strokeWidth={4} fillOpacity={1} fill="url(#colorRevenue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-surface-200">
                  <h3 className="font-heading font-bold text-surface-900 mb-6">Top Categories</h3>
                  <div className="space-y-4">
                    {summary.topCategories?.map((cat, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-surface-50 group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-surface-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">{i+1}</div>
                          <span className="font-bold text-surface-700">{cat.name}</span>
                        </div>
                        <span className="text-primary-600 font-black">{cat._count.products} <span className="text-[10px] text-surface-400">items</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'categories' && <CategoriesTab />}
          {activeTab === 'products' && <ProductsTab />}
          {activeTab === 'staff' && <StaffTab />}
          {activeTab === 'suppliers' && <SuppliersTab />}
          {activeTab === 'inventory' && <InventoryTab />}
          {activeTab === 'inventory-logs' && <InventoryLogsTab />}
          {activeTab === 'expenses' && <ExpensesTab />}
          { activeTab === 'reports' && <ReportsTab /> }
          { activeTab === 'feedback' && <FeedbackTab /> }
          { activeTab === 'audit' && <AuditLogsTab /> }
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-surface-200 hover:shadow-xl hover:shadow-primary-500/5 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${colors[color]} group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
      <p className="text-surface-500 font-bold text-sm mb-1">{title}</p>
      <p className="text-3xl font-black text-surface-900 tracking-tight">{value}</p>
    </div>
  );
}

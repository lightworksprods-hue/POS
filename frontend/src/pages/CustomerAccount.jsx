import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getOrderHistory, changePassword } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';

export default function CustomerAccount() {
  const { user, logoutUser, loading: authLoading, refreshUser } = useAuth();
  const { joinRoom, onEvent, connected } = useSocket();
  const [activity, setActivity] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/member-portal');
    } else if (user) {
      loadActivity();
      if (searchParams.get('action') === 'change-password') {
        setShowPasswordModal(true);
      }
    }
  }, [user, authLoading, navigate, searchParams]);

  // Real-time Points Listener
  useEffect(() => {
    if (user && connected) {
      const room = `user-${user.id}`;
      joinRoom(room, user.tenantId);
      
      const cleanup = onEvent('loyalty_updated', (data) => {
        console.log('✨ Live Points Update Received:', data);
        refreshUser(); // Refresh AuthContext user (points)
        loadActivity(); // Refresh activity timeline
      });

      return cleanup;
    }
  }, [user, connected, joinRoom, onEvent, refreshUser]);

  const loadActivity = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const res = await axios.get(`${API_URL}/customer/activity`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActivity(res.data.data.timeline);
      setFavorites(res.data.data.favorites);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'cancelled': return 'bg-red-50 text-red-600 border-red-100';
      case 'ready': return 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse';
      case 'preparing': return 'bg-sky-50 text-sky-600 border-sky-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-primary-600 font-bold animate-pulse uppercase tracking-[0.2em] text-xs">Loading VIP Profile...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Premium Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/menu" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <span className="text-2xl leading-none">←</span>
          </Link>
          <h1 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">My VIP Journey</h1>
          <button onClick={() => logoutUser()} className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">Logout</button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 pt-8">
        {/* VIP Member Card */}
        <div className="relative bg-slate-900 rounded-[2.5rem] p-8 mb-10 shadow-2xl overflow-hidden border border-white/5">
          {/* Animated Background Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full -mr-20 -mt-20 blur-[80px] animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full -ml-20 -mb-20 blur-[60px]"></div>

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl shadow-2xl backdrop-blur-md border border-white/20 ring-4 ring-white/5">
                💎
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mb-1">Loyalty Level</p>
                <div className="px-4 py-1.5 bg-primary-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-primary-500/40">
                  Gold Member
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-black text-white mb-1 tracking-tight">{user?.name}</h2>
            <p className="text-slate-300 text-sm font-medium mb-6 opacity-90">Member since {new Date(user?.createdAt).getFullYear()}</p>
    
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary-100 mb-1">Available Points</p>
                <p className="text-2xl font-black text-white">{Math.floor(user?.points || 0)} <span className="text-[10px] text-slate-400">PTS</span></p>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary-100 mb-1">Orders Placed</p>
                <p className="text-2xl font-black text-white">{activity.filter(a => a.type === 'order').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Favorites Quick View */}
        {favorites.length > 0 && (
          <div className="mb-10 animate-fade-in-up">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">My Top Favorites</h3>
            <div className="flex flex-wrap gap-2">
              {favorites.map(f => (
                <div key={f.name} className="px-4 py-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center gap-2">
                  <span className="text-sm">❤️</span>
                  <span className="text-xs font-bold text-slate-700">{f.name}</span>
                  <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-black text-slate-400">{f.count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The VIP Activity Timeline */}
        <div className="mb-6 ml-2">
          <h3 className="text-xl font-black tracking-tight text-slate-900">Personal Timeline</h3>
        </div>

        <div className="relative space-y-8 pb-10">
          {/* Timeline Connector Line */}
          <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-slate-200"></div>

          {activity.map((item, idx) => (
            <div key={idx} className="relative pl-14 group animate-fade-in-up" style={{ animationDelay: `${idx * 0.1}s` }}>
              {/* Timeline Indicator */}
              <div className={`absolute left-4 w-4.5 h-4.5 rounded-full border-4 border-slate-50 z-10 transition-transform group-hover:scale-125 ${
                item.type === 'milestone' ? 'bg-primary-500 ring-4 ring-primary-500/20' : 'bg-slate-300'
              }`}></div>

              <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm hover:border-primary-500/30 transition-all">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-sm font-black text-slate-900 tracking-tight">{item.title}</h4>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{formatDate(item.date)}</span>
                </div>
                
                <p className="text-xs text-slate-500 leading-relaxed mb-4">{item.description}</p>

                {item.type === 'order' && (
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Amount</span>
                      <span className="text-sm font-black text-slate-900">{formatCurrency(item.total)}</span>
                    </div>
                    {item.hasRedemption ? (
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shadow-inner">
                        <span className="text-xs">🎁</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Reward Order</span>
                      </div>
                    ) : (
                      <Link 
                        to={`/menu?reorder=${item.orderNumber}`} 
                        className="px-5 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary-600 transition-all shadow-lg shadow-slate-900/10 active:scale-95"
                      >
                        Re-order Again
                      </Link>
                    )}
                  </div>
                )}

                {item.type === 'milestone' && (
                  <div className="p-3 bg-primary-50 rounded-xl border border-primary-100">
                    <p className="text-[10px] font-bold text-primary-600">You earned a permanent loyalty spot! 🏆</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {activity.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-slate-400 font-bold mb-6">No activity recorded yet.</p>
              <Link to="/menu" className="bg-primary-500 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px]">Start Your Journey</Link>
            </div>
          )}
        </div>
      </div>

      {/* Account Settings Shortcut - Hide if Google User */}
      {!user?.isGoogle && (
        <div className="max-w-xl mx-auto px-6 mt-10">
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">⚙️</div>
              <div>
                <p className="text-xs font-black text-slate-900">Security Settings</p>
                <p className="text-[10px] text-slate-400">Update your account password</p>
              </div>
            </div>
            <button 
              onClick={() => setShowPasswordModal(true)}
              className="text-[10px] font-black text-primary-600 uppercase tracking-widest hover:underline"
            >
              Manage
            </button>
          </div>
        </div>
      )}

      {/* Password Modal Restored */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-scale-in">
            <h3 className="font-heading text-xl font-black text-slate-900 mb-6 text-center">Update Password</h3>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <input 
                type="password" 
                placeholder="Current Password" 
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-primary-500" 
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                required
              />
              <input 
                type="password" 
                placeholder="New Password" 
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-primary-500" 
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                required
              />
              <input 
                type="password" 
                placeholder="Confirm New Password" 
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-primary-500" 
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                required
              />
              {passwordMessage.text && (
                <p className={`text-[10px] font-bold text-center ${passwordMessage.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
                  {passwordMessage.text}
                </p>
              )}
              <div className="flex gap-2 pt-4">
                <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl">Cancel</button>
                <button type="submit" disabled={passwordLoading} className="flex-2 py-4 bg-primary-500 text-white font-bold rounded-2xl shadow-lg shadow-primary-500/20">
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

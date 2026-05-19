import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login, requestOTP, resetPassword, getPublicTenant } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { unlockAudio } from '../utils/helpers';
import { applyTheme } from '../utils/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  // Forgot password states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const tenantSlug = searchParams.get('tenant') || 'project-million';
  const [branding, setBranding] = useState(null);
  const brandingColor = '#000000';

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
  }, [tenantSlug]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login({ email, password, tenantSlug });
      const { token, user } = res.data.data;
      unlockAudio(); // Automatically enable sound system
      loginUser(token, user);
      
      // Redirect based on role
      if (user.role === 'superadmin') navigate('/superadmin');
      else if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'cashier') navigate('/cashier');
      else if (user.role === 'kitchen') navigate('/kitchen');
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed.');
    } finally { setLoading(false); }
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      await requestOTP({ email: forgotEmail.trim(), tenantSlug });
      setForgotStep(2);
      setForgotSuccess('A 6-digit security code has been sent to your email.');
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Failed to send security code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode || !newPassword || !confirmNewPassword) return;
    if (newPassword !== confirmNewPassword) {
      setForgotError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setForgotError('Password must be at least 6 characters.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      await resetPassword({ 
        email: forgotEmail.trim(), 
        otp: otpCode, 
        newPassword,
        tenantSlug 
      });
      setForgotSuccess('Your password has been successfully reset! You can now log in.');
      setTimeout(() => {
        setShowForgotModal(false);
        // Reset states
        setForgotEmail('');
        setOtpCode('');
        setNewPassword('');
        setConfirmNewPassword('');
        setForgotStep(1);
        setForgotSuccess('');
      }, 3000);
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-900 via-surface-800 to-surface-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 animate-fade-in-up">
          <h1 className="font-heading text-3xl font-bold text-white mb-2">Staff Login</h1>
          <p className="text-surface-400">
            Sign in to Kainlowkal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-800/50 backdrop-blur-lg border border-surface-700/50 rounded-2xl p-6 space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-3 bg-surface-900/50 border border-surface-700 rounded-xl text-white placeholder-surface-500 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all" placeholder="email@example.com" />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Password</label>
            <input 
              type={showPassword ? "text" : "password"} 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
              className="w-full px-4 py-3 bg-surface-900/50 border border-surface-700 rounded-xl text-white placeholder-surface-500 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all pr-12" 
              placeholder="••••••••" 
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[32px] p-2 flex items-center justify-center text-surface-400 hover:text-white transition-colors"
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex justify-end text-xs pt-1">
            <button
              type="button"
              onClick={() => {
                setShowForgotModal(true);
                setForgotEmail(email);
              }}
              className="text-surface-400 hover:text-white transition-colors font-semibold"
            >
              Forgot Password?
            </button>
          </div>

          <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl text-white font-bold transition-all transform active:scale-[0.98] shadow-lg" style={{ backgroundColor: brandingColor }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center mt-6">
          <a 
            href="/" 
            className="text-sm font-semibold text-surface-400 hover:text-white transition-all"
          >
            ← Back to Kiosk
          </a>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-surface-800 border border-surface-700 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white tracking-tight">Forgot Password</h3>
              <button 
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotStep(1);
                  setForgotError('');
                  setForgotSuccess('');
                }} 
                className="text-surface-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {forgotError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs mb-4">
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-400 text-xs mb-4">
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestOTP} className="space-y-4">
                <p className="text-sm text-surface-300 leading-relaxed">
                  Enter your email address below, and we will send you a 6-digit security code to verify your identity.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Email Address</label>
                  <input 
                    type="email" required
                    className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none transition-all placeholder-surface-600 font-bold"
                    placeholder="e.g. admin@mkfood.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={forgotLoading}
                  className="w-full py-3.5 mt-2 rounded-xl text-white font-bold transition-all transform active:scale-[0.98]"
                  style={{ backgroundColor: brandingColor }}
                >
                  {forgotLoading ? 'Sending security code...' : 'Request Security Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <p className="text-sm text-surface-300 leading-relaxed">
                  Enter the 6-digit security code sent to <strong className="text-white">{forgotEmail}</strong> and set your new password.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Security Code</label>
                  <input 
                    type="text" required maxLength={6}
                    className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none transition-all placeholder-surface-600 text-center font-mono font-bold tracking-widest"
                    placeholder="000000"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">New Password</label>
                  <input 
                    type="password" required minLength={6}
                    className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none transition-all placeholder-surface-600"
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Confirm New Password</label>
                  <input 
                    type="password" required minLength={6}
                    className="w-full bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none transition-all placeholder-surface-600"
                    placeholder="Repeat new password"
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setForgotStep(1);
                      setForgotError('');
                      setForgotSuccess('');
                    }}
                    className="flex-1 py-3.5 bg-surface-700 hover:bg-surface-600 text-white rounded-xl font-bold transition-all text-sm"
                  >
                    Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={forgotLoading}
                    className="flex-1 py-3.5 rounded-xl text-white font-bold transition-all transform active:scale-[0.98]"
                    style={{ backgroundColor: brandingColor }}
                  >
                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { login, googleLogin, registerCustomer, getPublicTenant, requestOTP, verifyOTP, checkOTP, verifyRegistration, resendRegistrationOTP, resetPassword } from '../services/api';
import { useAuth } from '../context/AuthContext';

import { GoogleLogin } from '@react-oauth/google';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import { applyTheme, clearTheme } from '../utils/theme';

export default function MemberPortal() {
  const [mode, setMode] = useState('login'); // login, register, verify
  const [formData, setFormData] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resendSuccessMessage, setResendSuccessMessage] = useState('');

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
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPasswords, setShowForgotPasswords] = useState(false);

  const [tenantData, setTenantData] = useState(null);
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [searchParams] = useSearchParams();
  const { loginUser, logoutUser, user } = useAuth();
  const navigate = useNavigate();

  const tenantSlug = searchParams.get('tenant') || 'kainlowkal';
  const actionParam = searchParams.get('action');

  // Handle ?action=register
  useEffect(() => {
    if (actionParam === 'register') {
      setMode('register');
    }
  }, [actionParam]);

  useDynamicBranding(
    tenantData ? `${tenantData.name} - Member Portal` : 'Member Portal',
    tenantData?.favicon
  );

  useEffect(() => {
    if (tenantSlug) {
      loadTenant();
    }
    return () => clearTheme();
  }, [tenantSlug]);

  const loadTenant = async () => {
    try {
      const res = await getPublicTenant(tenantSlug);
      setTenantData(res.data.data);
      if (res.data.data.primaryColor) {
        applyTheme(res.data.data.primaryColor);
      }
    } catch (e) {
      console.error('Failed to load tenant branding:', e);
    } finally {
      setLoadingBranding(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await login({ email: formData.email, password: formData.password, tenantSlug });
        loginUser(res.data.data.token, res.data.data.user);
        navigate('/menu');
      } else if (mode === 'register') {
        if (formData.password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        await registerCustomer({ ...formData, tenantSlug });
        setMode('verify');
      } else if (mode === 'verify') {
        const res = await verifyRegistration({ email: formData.email, otp, tenantSlug });
        loginUser(res.data.token, res.data.user);
        setSuccess(true);
        setTimeout(() => {
          navigate('/menu');
        }, 2000);
      }
    } catch (err) {
      console.error('Registration/Verification Error:', err);
      const msg = err.response?.data?.message || err.message || 'Something went wrong.';
      const status = err.response?.status ? `(${err.response.status}) ` : '';
      setError(`${status}${msg}`);
      if (err.response?.data?.unverified) {
        setMode('verify'); // Transition directly to OTP verification view!
      }
    } finally {
      setLoading(false);
    }
  };


  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const res = await googleLogin({ token: credentialResponse.credential, tenantSlug });
      loginUser(res.data.data.token, res.data.data.user);
      navigate('/menu');
    } catch (err) {
      console.error('Frontend Error:', err);
      const msg = err.response?.data?.message || err.message || 'Unknown Error';
      const status = err.response?.status ? `(${err.response.status}) ` : '';
      setError(`${status}${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google Login was cancelled or failed.');
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

  const handleResendForgotOTP = async () => {
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      await requestOTP({ email: forgotEmail.trim(), tenantSlug });
      setForgotSuccess('A new 6-digit security code has been sent to your Gmail!');
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Failed to resend security code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResendRegisterOTP = async () => {
    if (!formData.email.trim()) return;
    setLoading(true);
    setError('');
    setResendSuccessMessage('');
    try {
      await resendRegistrationOTP({ email: formData.email.trim(), tenantSlug });
      setResendSuccessMessage('A new verification code has been sent to your Gmail!');
      setTimeout(() => setResendSuccessMessage(''), 6000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      await checkOTP({ email: forgotEmail.trim(), otp: otpCode.trim(), tenantSlug });
      setForgotStep(3);
      setForgotSuccess('Security code verified! Please set your new password below.');
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Invalid or expired security code.');
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

  if (loadingBranding) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-slate-900/5 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-slate-800/5 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Back Button */}
        <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mb-8 text-sm font-bold uppercase tracking-widest">
          ← Back to Kiosk
        </Link>

        <div className="bg-white border border-slate-100 rounded-[40px] p-8 md:p-10 shadow-2xl shadow-slate-200/50 relative overflow-hidden">
          {/* Success State */}
          {success ? (
            <div className="text-center py-6 animate-fade-in">
              <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500/50 rounded-full flex items-center justify-center text-3xl mx-auto mb-8 shadow-2xl shadow-emerald-500/20 animate-bounce-in">
                ✅
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Account Created!</h2>
              <p className="text-slate-600 font-bold mb-10 leading-relaxed">
                Welcome to the club. <br />
                You can now sign in to start earning points.
              </p>
              <button
                onClick={() => setSuccess(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-emerald-600/20 transition-all uppercase tracking-widest"
              >
                Sign In Now →
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <div className="w-20 h-20 rounded-3xl overflow-hidden flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary-500/20 border-2 border-white/10">
                  <img src="/logo.png" className="w-full h-full object-cover" alt="Kainlowkal" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
                  {user ? `Welcome back, ${user.name.split(' ')[0]}!` : (mode === 'login' ? 'Welcome Back!' : (mode === 'verify' ? 'Verify Email' : 'Join the Club'))}
                </h1>
                {user ? (
                  <p className="text-slate-500 text-sm">
                    Not you? <button onClick={logoutUser} className="text-slate-800 font-bold hover:underline transition-colors">Sign Out</button>
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm">
                    {mode === 'login' ? (
                      <>Sign in to <span className="inline-flex gap-0 font-heading"><span className="italic font-normal">Kain</span><span className="font-black">lowkal</span></span> to earn points.</>
                    ) : (mode === 'verify' ? (
                      `Enter the code sent to ${formData.email}`
                    ) : (
                      <>Create a <span className="inline-flex gap-0 font-heading"><span className="italic font-normal">Kain</span><span className="font-black">lowkal</span></span> account to start earning rewards.</>
                    ))}
                  </p>
                )}
              </div>

              {user ? (
                <div className="space-y-6 animate-fade-in-up">
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-center">
                    <p className="text-slate-500 text-sm mb-4">You are currently signed in as <span className="text-slate-900 font-bold">{user.email}</span></p>
                    <Link
                      to="/menu"
                      className="w-full inline-block bg-primary-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-primary-600/20 hover:bg-primary-500 active:scale-[0.98] transition-all uppercase tracking-widest"
                    >
                      🚀 Order Now
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-2xl text-xs font-bold mb-6 text-center animate-shake">
                      ⚠️ {error}
                    </div>
                  )}

                  {mode !== 'verify' && (
                    <div className="mb-6 flex flex-col items-center gap-3">
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={handleGoogleError}
                        theme="filled_black"
                        shape="pill"
                        width="300"
                      />
                    </div>
                  )}

                  {mode !== 'verify' && (
                    <div className="relative mb-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-3 text-slate-400 uppercase tracking-widest font-bold">Or use email</span>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'verify' ? (
                      <div className="animate-fade-in">
                        {resendSuccessMessage && (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-600 text-xs mb-4 text-center font-bold">
                            🎉 {resendSuccessMessage}
                          </div>
                        )}
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">6-Digit Code</label>
                        <input
                          type="text"
                          maxLength="6"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-center text-3xl font-black tracking-[0.5em] text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none focus:ring-4 focus:ring-primary-500/10"
                          placeholder="000000"
                          required
                        />
                        <div className="flex justify-between items-center mt-4 px-1">
                          <button
                            type="button"
                            onClick={() => setMode('register')}
                            className="text-slate-400 hover:text-slate-800 text-xs font-semibold hover:underline transition-colors"
                          >
                            ← Change Email
                          </button>
                          <button
                            type="button"
                            onClick={handleResendRegisterOTP}
                            disabled={loading}
                            className="text-indigo-600 hover:text-indigo-500 text-xs font-semibold hover:underline transition-colors disabled:opacity-50"
                          >
                            Resend Code
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {mode === 'register' && (
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Full Name</label>
                            <input
                              type="text"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none focus:ring-4 focus:ring-primary-500/10"
                              placeholder="John Doe"
                              required
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Email Address</label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none focus:ring-4 focus:ring-primary-500/10"
                            placeholder="you@example.com"
                            required
                          />
                        </div>
                        <div className="relative">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Password</label>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 pr-12 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none focus:ring-4 focus:ring-primary-500/10"
                            placeholder="••••••••"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-[38px] p-2 text-slate-400 hover:text-slate-800 transition-colors"
                          >
                            {showPassword ? (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                          {mode === 'login' && (
                            <div className="flex justify-end text-xs pt-2 px-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowForgotModal(true);
                                  setForgotEmail(formData.email);
                                }}
                                className="text-indigo-600 hover:underline hover:text-indigo-550 transition-colors font-semibold"
                              >
                                Forgot Password?
                              </button>
                            </div>
                          )}
                        </div>

                        {mode === 'register' && (
                          <div className="relative">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Confirm Password</label>
                            <input
                              type={showPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 pr-12 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none focus:ring-4 focus:ring-primary-500/10"
                              placeholder="••••••••"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-4 top-[38px] p-2 text-slate-400 hover:text-slate-800 transition-colors"
                            >
                              {showPassword ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-5 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black uppercase tracking-widest transition-all shadow-xl shadow-primary-600/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        mode === 'login' ? 'Sign In' : (mode === 'verify' ? 'Verify Email' : 'Create Account')
                      )}
                    </button>
                  </form>

                  {mode !== 'verify' && (
                    <div className="mt-8 pt-8 border-t border-slate-100 text-center">
                      <p className="text-slate-400 text-sm mb-4">
                        {mode === 'login' ? "Don't have an account?" : "Already a member?"}
                        <button
                          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                          className="ml-2 text-slate-900 font-bold hover:underline transition-colors"
                        >
                          {mode === 'login' ? 'Join Now' : 'Sign In'}
                        </button>
                      </p>
                      <Link to="/menu" className="text-slate-400 text-xs font-bold hover:text-slate-800 transition-colors uppercase tracking-widest">
                        Continue as Guest →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
          <div className="bg-white border border-slate-100 w-full max-w-md rounded-[40px] p-8 shadow-2xl shadow-slate-200/50 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Forgot Password</h3>
              <button 
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotStep(1);
                  setForgotError('');
                  setForgotSuccess('');
                }} 
                className="text-slate-400 hover:text-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {forgotError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-600 text-xs mb-4">
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-600 text-xs mb-4">
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 1 && (
              <form onSubmit={handleRequestOTP} className="space-y-4">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Enter your email address below, and we will send you a 6-digit security code to verify your identity.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Email Address</label>
                  <input 
                    type="email" required
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none text-sm font-bold focus:ring-4 focus:ring-primary-500/10"
                    placeholder="you@example.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={forgotLoading}
                  className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black uppercase tracking-widest transition-all shadow-xl shadow-primary-600/20 mt-2"
                >
                  {forgotLoading ? 'Sending security code...' : 'Request Security Code'}
                </button>
              </form>
            )}

            {forgotStep === 2 && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Enter the 6-digit security code sent to <strong className="text-slate-900">{forgotEmail}</strong>.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Security Code</label>
                  <input 
                    type="text" required maxLength={6}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none text-center text-3xl font-black tracking-[0.5em] font-mono focus:ring-4 focus:ring-primary-500/10"
                    placeholder="000000"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                  />
                </div>
                <div className="flex justify-end text-xs px-1">
                  <button 
                    type="button" 
                    onClick={handleResendForgotOTP}
                    disabled={forgotLoading}
                    className="text-indigo-600 hover:underline hover:text-indigo-550 transition-colors font-semibold disabled:opacity-50"
                  >
                    Didn't receive code? Resend Code
                  </button>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setForgotStep(1);
                      setForgotError('');
                      setForgotSuccess('');
                    }}
                    className="flex-1 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-800 transition-all font-bold text-sm uppercase tracking-widest"
                  >
                    Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={forgotLoading}
                    className="flex-1 py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black uppercase tracking-widest transition-all shadow-xl shadow-primary-600/20"
                  >
                    {forgotLoading ? 'Verifying...' : 'Verify Code'}
                  </button>
                </div>
              </form>
            )}

            {forgotStep === 3 && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Your security code was verified! Please set your new password below.
                </p>

                <div className="relative">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">New Password</label>
                  <input 
                    type={showForgotPasswords ? "text" : "password"} required minLength={6}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 pr-12 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none text-sm focus:ring-4 focus:ring-primary-500/10"
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswords(!showForgotPasswords)}
                    className="absolute right-4 top-[38px] p-2 text-slate-400 hover:text-slate-800 transition-colors"
                  >
                    {showForgotPasswords ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Confirm New Password</label>
                  <input 
                    type={showForgotPasswords ? "text" : "password"} required minLength={6}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 pr-12 text-slate-800 placeholder-slate-300 focus:bg-white focus:border-primary-500 transition-all outline-none text-sm focus:ring-4 focus:ring-primary-500/10"
                    placeholder="Repeat new password"
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswords(!showForgotPasswords)}
                    className="absolute right-4 top-[38px] p-2 text-slate-400 hover:text-slate-800 transition-colors"
                  >
                    {showForgotPasswords ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setForgotStep(2);
                      setForgotError('');
                      setForgotSuccess('');
                    }}
                    className="flex-1 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-800 transition-all font-bold text-sm uppercase tracking-widest"
                  >
                    Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={forgotLoading}
                    className="flex-1 py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black uppercase tracking-widest transition-all shadow-xl shadow-primary-600/20"
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

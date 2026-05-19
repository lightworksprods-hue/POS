import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
});

// Auth & Tenant interceptor
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // TENANT DETECTION: Extract company name from URL (e.g. mcdonalds.your-pos.com)
  const hostname = window.location.hostname;
  const urlParams = new URLSearchParams(window.location.search);
  const tenantQuery = urlParams.get('tenant');
  
  let tenantSlug = 'kainlowkal'; // Default
  const isPlatformDomain = hostname.includes('vercel.app') || hostname.includes('onrender.com');

  if (tenantQuery) {
    tenantSlug = tenantQuery;
  } else if (!isPlatformDomain && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    tenantSlug = hostname.split('.')[0]; 
  }
  
  config.headers['x-tenant-slug'] = tenantSlug;

  // If we have a slug, we should let the backend resolve the ID by slug 
  // or use the saved ID only if it matches the current session logic
  const savedTenantId = localStorage.getItem('tenant_id');
  if (savedTenantId && !tenantQuery) {
    config.headers['x-tenant-id'] = savedTenantId;
  }
  // If tenantQuery exists, we DONT send a hardcoded ID so the backend uses the Slug

  return config;
});

// Auth
export const login = (data) => api.post('/auth/login', data);
export const googleLogin = (data) => api.post('/auth/google', data);
export const register = (data) => api.post('/auth/register', data);
export const registerCustomer = (data) => api.post('/auth/register-customer', data);
export const getMe = () => api.get('/auth/me');
export const changePassword = (data) => api.post('/auth/change-password', data);
export const requestOTP = (data) => api.post('/auth/request-otp', data);
export const verifyOTP = (data) => api.post('/auth/verify-otp', data);
export const checkOTP = (data) => api.post('/auth/check-otp', data);
export const resetPassword = (data) => api.post('/auth/reset-password', data);
export const verifyRegistration = (data) => api.post('/auth/verify-registration', data);
export const resendRegistrationOTP = (data) => api.post('/auth/resend-registration-otp', data);

// Products (Public)
export const getProducts = () => api.get('/products');
export const getProduct = (id) => api.get(`/products/${id}`);
export const getPublicTenant = (slug) => api.get(`/public/tenant/${slug}`);

// Categories
export const getCategories = () => api.get('/categories');

// Orders (Kiosk)
export const createOrder = (data) => api.post('/orders', data);
export const getOrder = (orderNumber) => api.get(`/orders/${orderNumber}`);
export const getQueue = () => api.get('/orders/queue/active');
export const cancelOrder = (orderNumber) => api.post(`/orders/${orderNumber}/cancel`);
export const getOrderHistory = () => api.get('/orders/history');

// Cashier
export const getCashierOrders = (status) => api.get(`/cashier/orders${status ? `?status=${status}` : ''}`);
export const confirmOrder = (id, data) => api.post(`/cashier/orders/${id}/confirm`, data);
export const cashierCancelOrder = (id, data) => api.post(`/cashier/orders/${id}/cancel`, data);
export const calculatePayment = (data) => api.post('/cashier/calculate', data);

// Kitchen
export const getKitchenOrders = () => api.get('/kitchen/orders');
export const startPreparing = (id, prepTime) => api.post(`/kitchen/orders/${id}/start`, { prepTime });
export const completeOrder = (id) => api.post(`/kitchen/orders/${id}/complete`);
export const markServed = (id) => api.post(`/kitchen/orders/${id}/served`);

// Admin
export const getAdminOrders = (status, page) => api.get(`/admin/orders?status=${status || 'all'}&page=${page || 1}`);
export const getAdminProducts = () => api.get('/admin/products');
export const createProduct = (data) => api.post('/admin/products', data);
export const updateProduct = (id, data) => api.put(`/admin/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/admin/products/${id}`);
export const getStaff = () => api.get('/admin/staff');
export const createStaff = (data) => api.post('/admin/staff', data);
export const updateStaff = (id, data) => api.put(`/admin/staff/${id}`, data);
export const deleteStaff = (id) => api.delete(`/admin/staff/${id}`);
export const getInventory = () => api.get('/admin/inventory');
export const restockProduct = (id, quantity) => api.post(`/admin/inventory/${id}/restock`, { quantity });
export const getAuditLogs = () => api.get('/admin/audit-logs');
export const getSettings = () => api.get('/admin/settings');
export const updateSettings = (settings) => api.post('/admin/settings', { settings });
export const uploadImage = (data) => api.post('/admin/upload-image', data);

// Categories Admin
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// Reports
export const getDailyReport = (days) => api.get(`/reports/daily?days=${days || 7}`);
export const getBestsellers = () => api.get('/reports/bestsellers');
export const getAdminSummary = () => api.get('/reports/summary');
export const getKitchenTimes = () => api.get('/reports/kitchen-times');
export const getForecasting = () => api.get('/reports/forecasting');

// Suppliers
export const getSuppliers = () => api.get('/suppliers');
export const createSupplier = (data) => api.post('/suppliers', data);
export const updateSupplier = (id, data) => api.put(`/suppliers/${id}`, data);
export const deleteSupplier = (id) => api.delete(`/suppliers/${id}`);

// Combos
export const getComboOptions = (productId) => api.get(`/admin/products/${productId}/combo-options`);
export const updateComboOptions = (productId, data) => api.post(`/admin/products/${productId}/combo-options`, data);

// Superadmin
export const getTenants = () => api.get('/superadmin/tenants');
export const createTenant = (data) => api.post('/superadmin/tenants', data);
export const updateTenant = (id, data) => api.patch(`/superadmin/tenants/${id}`, data);
export const getBetaApplications = () => api.get('/superadmin/beta-applications');

// Feedback
export const submitFeedback = (data) => api.post('/feedback/submit', data);
export const getFeedbackStats = () => api.get('/feedback/stats');
export const requestPayment = (orderId, data) => api.post(`/cashier/orders/${orderId}/request-payment`, data);
export const hardDeleteOrder = (id) => api.delete(`/admin/orders/${id}`);

// Public Beta
export const submitBetaApplication = (data) => api.post('/public/beta/apply', data);

export default api;

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCashierOrders, confirmOrder, cashierCancelOrder, calculatePayment, markServed, startPreparing, completeOrder } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, getElapsedMinutes, playNotificationSound, unlockAudio, updateAppBadge, requestNotificationPermission, showSystemNotification } from '../utils/helpers';
import { useDynamicBranding } from '../hooks/useDynamicBranding';
import { applyTheme, clearTheme } from '../utils/theme';

export default function CashierDashboard() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // pending, confirmed, preparing, ready
  const [paymentData, setPaymentData] = useState({ received: '', method: 'cash', discountType: '', discountPercent: '', referenceNumber: '' });
  const [calcResult, setCalcResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('Customer changed mind');
  const [qrStatus, setQrStatus] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showRefKeypad, setShowRefKeypad] = useState(false);
  const { joinRoom, onEvent, connected } = useSocket();
  const { logoutUser, user } = useAuth();

  // Dynamic favicon & title
  useDynamicBranding(`${user?.tenantName || 'Cashier'} Dashboard`, user?.tenantFavicon);

  useEffect(() => {
    if (user?.tenantColor) applyTheme(user.tenantColor);
    return () => clearTheme();
  }, [user?.tenantColor]);

  useEffect(() => {
    loadOrders();
    if (connected && user?.tenantId) {
      joinRoom('cashier', user.tenantId);
    }

    // Request system push notification permissions
    requestNotificationPermission();

    // Unlock audio for dashboard notifications
    const unlock = () => {
      unlockAudio();
      setAudioUnlocked(true);
      console.log('Audio unlocked for Cashier Dashboard');
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, [connected, user?.tenantId]);

  useEffect(() => {
    if (!connected || !onEvent) return;

    const unsub = onEvent('new_order', (data) => {
      console.log('Realtime New Order:', data);
      playNotificationSound('newOrder');

      const displayNum = data.order?.orderNumber?.includes('-') ? data.order.orderNumber.split('-')[1] : data.order?.orderNumber;
      showSystemNotification('New Order Received! 💵', `Order #${displayNum} is waiting for payment/confirmation.`);

      loadOrders(); // Refresh list to show the new order
    });

    const unsub2 = onEvent('order_update', (data) => {
      console.log('Realtime Order Update:', data);
      loadOrders(); // Refresh list when order status changes
    });

    return () => { unsub(); unsub2(); };
  }, [connected, onEvent]);

  useEffect(() => {
    if (selectedOrder && selectedOrder.status === 'pending') {
      calculateTotals();
    }
  }, [paymentData.received, paymentData.method, paymentData.discountType, paymentData.discountPercent, selectedOrder]);

  const loadOrders = async () => {
    try {
      const res = await getCashierOrders();
      setOrders(res.data.data);
      if (selectedOrder) {
        const updated = res.data.data.find(o => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
        else setSelectedOrder(null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Auto-fill amount for online payments
  useEffect(() => {
    if (!selectedOrder) return;

    if (paymentData.method !== 'cash') {
      // For GCash/Maya/Card, assume exact amount
      setPaymentData(p => ({ ...p, received: selectedOrder.total.toString() }));
    } else {
      // When switching back to Cash, clear it so cashier can type actual cash received
      setPaymentData(p => ({ ...p, received: '' }));
      setCalcResult(null);
    }
  }, [paymentData.method, selectedOrder?.id]);

  useEffect(() => {
    if (selectedOrder) {
      setQrStatus(null);
      setPaymentData(p => ({
        ...p,
        method: selectedOrder.paymentMethod,
        received: selectedOrder.paymentStatus === 'paid' ? selectedOrder.total.toString() : ''
      }));
    }
  }, [selectedOrder?.id]);

  // Update native PWA app badge with pending orders count
  useEffect(() => {
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    updateAppBadge(pendingCount);
    return () => {
      updateAppBadge(0);
    };
  }, [orders]);

  const calculateTotals = async () => {
    if (!selectedOrder) return;
    try {
      const res = await calculatePayment({
        subtotal: selectedOrder.subtotal,
        discountType: paymentData.discountType,
        discountPercent: paymentData.discountPercent,
        amountReceived: parseFloat(paymentData.received) || 0
      });
      setCalcResult(res.data.data);
    } catch (e) { console.error(e); }
  };

  const handleConfirmPayment = async () => {
    if (!selectedOrder || !calcResult) return;
    if (!paymentData.received) return alert('Please enter the amount received.');
    if (calcResult.isInsufficient) return alert('Insufficient payment amount. The total due is ' + calcResult.total);

    // Enforce reference number for online payments
    if ((paymentData.method === 'gcash' || paymentData.method === 'maya') && !paymentData.referenceNumber) {
      return alert(`Please enter the Reference Number (Last 4 Digits) for ${paymentData.method.toUpperCase()} payment.`);
    }

    setProcessing(true);
    try {
      await confirmOrder(selectedOrder.id, {
        amountReceived: parseFloat(paymentData.received) || calcResult.total,
        paymentMethod: paymentData.method,
        discountType: paymentData.discountType || undefined,
        discountPercent: paymentData.discountPercent ? parseFloat(paymentData.discountPercent) : undefined,
        referenceNumber: paymentData.referenceNumber || undefined
      });
      setSelectedOrder(null);
      setPaymentData({ received: '', method: 'cash', discountType: '', discountPercent: '', referenceNumber: '' });
      setCalcResult(null);
      loadOrders();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to confirm order');
    } finally {
      setProcessing(false);
    }
  };

  const handleServeOrder = async () => {
    if (!selectedOrder) return;
    setProcessing(true);
    try {
      await markServed(selectedOrder.id);
      setSelectedOrder(null);
      loadOrders();
    } catch (e) {
      alert('Failed to mark order as served');
    } finally {
      setProcessing(false);
    }
  };

  const handleStartPreparing = async () => {
    if (!selectedOrder) return;
    setProcessing(true);
    try {
      await startPreparing(selectedOrder.id, 15);
      setSelectedOrder(null);
      loadOrders();
    } catch (e) {
      alert('Failed to start preparing');
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;
    setProcessing(true);
    try {
      await completeOrder(selectedOrder.id);
      setSelectedOrder(null);
      loadOrders();
    } catch (e) {
      alert('Failed to mark order as ready');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    if (!selectedOrder) return;
    setCancelReason('Customer changed mind');
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedOrder || !cancelReason.trim()) return;

    setProcessing(true);
    try {
      const orderId = selectedOrder.id;
      // Clear panel immediately for better UX
      setSelectedOrder(null);
      setShowCancelModal(false);
      setPaymentData({ method: 'cash', received: '', discountType: '', discountAmount: 0, referenceNumber: '' });
      setCalcResult(null);

      await cashierCancelOrder(orderId, { reason: cancelReason });
      loadOrders();
    } catch (e) {
      alert('Failed to cancel order');
    } finally {
      setProcessing(false);
    }
  };

  // Quick cash buttons
  const addCash = (amount) => {
    const current = parseFloat(paymentData.received) || 0;
    setPaymentData(p => ({ ...p, received: (current + amount).toString() }));
  };
  const exactCash = () => {
    if (calcResult) setPaymentData(p => ({ ...p, received: calcResult.total.toString() }));
  };

  const filteredOrders = orders.filter(o => o.status === activeTab);

  if (loading) return <div className="min-h-screen bg-surface-50 p-6 flex items-center justify-center">Loading...</div>;

  return (
    <div className="h-screen flex flex-col bg-surface-100 overflow-hidden relative">

      {/* Cancellation Reason Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-surface-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="bg-red-50 p-6 border-b border-red-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-2xl">⚠️</div>
              <div>
                <h3 className="font-heading font-bold text-xl text-red-900">Cancel Order</h3>
                <p className="text-red-600 text-sm">This action cannot be undone.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-surface-700 mb-2">Reason for cancellation:</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Out of stock, customer changed mind..."
                  className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none h-32"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {['Out of stock', 'Customer changed mind', 'Wrong order', 'Payment failed'].map(r => (
                  <button
                    key={r}
                    onClick={() => setCancelReason(r)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${cancelReason === r ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-surface-200 text-surface-600 hover:bg-surface-50'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 bg-surface-50 border-t border-surface-100 flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3.5 bg-white border border-surface-200 text-surface-700 font-bold rounded-2xl hover:bg-surface-100 transition-all"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={!cancelReason.trim() || processing}
                className="flex-[1.5] py-3.5 bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                {processing ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-surface-200 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {user?.tenantLogo ? (
            <img src={user.tenantLogo} className="w-8 h-8 rounded-lg object-cover shadow-sm" alt={user.tenantName} />
          ) : (
            <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center text-sm shadow-inner">🏢</div>
          )}
          <div className="flex flex-col">
            <h2 className="font-heading font-black text-lg sm:text-xl text-primary-600 tracking-tight uppercase truncate leading-tight">{user?.tenantName || 'Cashier'} Dashboard</h2>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                {connected ? 'Live Sync Active' : 'Connection Lost'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-xs sm:text-sm font-medium text-surface-600 hidden sm:inline">👤 {user?.name}</span>
          <button onClick={logoutUser} className="text-surface-400 hover:text-red-500 text-xs sm:text-sm font-medium transition-colors">Log Out</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Panel: Order List */}
        <div className={`${selectedOrder ? 'hidden md:flex' : 'flex'} md:w-1/2 flex-col border-r border-surface-200 bg-surface-50 flex-1 md:flex-none min-w-0`}>
          <div className="p-2 sm:p-4 border-b border-surface-200 flex gap-1.5 sm:gap-2 overflow-x-auto bg-white flex-shrink-0 scrollbar-hide">
            {['pending', 'confirmed', 'preparing', 'ready', 'completed'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold capitalize whitespace-nowrap transition-all ${activeTab === tab ? 'bg-primary-500 text-white shadow-md' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
                {tab}
                <span className={`ml-1.5 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[10px] sm:text-xs ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-surface-200 text-surface-500'}`}>
                  {orders.filter(o => o.status === tab).length}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="h-full flex items-center justify-center text-surface-400 font-medium text-sm">No {activeTab} orders</div>
            ) : (
              filteredOrders.map((order, idx) => (
                <button key={order.id} onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                  className={`w-full text-left glass-card p-3 sm:p-4 transition-all animate-fade-in-up hover:-translate-y-1 ${selectedOrder?.id === order.id ? 'border-primary-500 shadow-md shadow-primary-500/10 ring-1 ring-primary-500/50' : ''}`}
                  style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-heading font-bold text-base sm:text-lg text-surface-900">{order.orderNumber}</h3>
                      <p className="text-xs sm:text-sm text-surface-500">{order.customerName}</p>
                    </div>
                    <div className="text-right">
                      <span className={`badge text-[10px] sm:text-xs mb-1 ${order.orderType === 'dine_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {order.orderType === 'dine_in' ? 'Dine In' : 'Take Out'}
                      </span>
                      {order.paymentMethod === 'points' && (
                        <span className="badge text-[10px] sm:text-xs bg-purple-100 text-purple-700 ml-1">🎁 Reward</span>
                      )}
                      <p className="text-[10px] sm:text-xs text-surface-400">{getElapsedMinutes(order.createdAt)} min ago</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-surface-100">
                    <span className="text-xs sm:text-sm font-medium text-surface-600">{order.items?.length || 0} items</span>
                    <span className="font-heading font-bold text-primary-600 text-sm sm:text-base">
                      {order.paymentMethod === 'points' ? '🎁 FREE' : formatCurrency(order.total)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Order Details & Cash Register */}
        <div className={`${selectedOrder ? 'flex' : 'hidden md:flex'} md:w-1/2 flex-col bg-white overflow-hidden relative flex-1 md:flex-none`}>
          {/* Mobile back button */}
          {selectedOrder && (
            <button onClick={() => setSelectedOrder(null)} className="md:hidden flex items-center gap-2 px-4 py-3 text-sm font-bold text-surface-600 border-b border-surface-200 bg-surface-50">
              <span className="text-lg">←</span> Back to Orders
            </button>
          )}
          {!selectedOrder ? (
            <div className="h-full flex flex-col items-center justify-center text-surface-400">
              <div className="text-6xl mb-4">💳</div>
              <p className="font-medium">Select an order to view details</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden animate-slide-in">
              {/* Order Header */}
              <div className="p-6 border-b border-surface-200 bg-surface-50 flex-shrink-0 flex justify-between items-start">
                <div>
                  <h2 className="font-heading text-2xl font-bold text-surface-900 mb-1">{selectedOrder.orderNumber}</h2>
                  <p className="text-surface-500">{selectedOrder.customerName} • {formatDate(selectedOrder.createdAt)}</p>
                </div>
                <span className={`badge text-sm px-3 py-1 badge-${selectedOrder.status}`}>{selectedOrder.status.toUpperCase()}</span>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Points Redemption Banner */}
                {selectedOrder.paymentMethod === 'points' && (
                  <div className="mx-6 mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-3 flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-xl flex-shrink-0">🎁</div>
                    <div>
                      <p className="font-bold text-purple-700 text-sm">Points Redemption Order</p>
                      <p className="text-xs text-purple-500">This order was claimed using loyalty points — no cash payment needed.</p>
                    </div>
                  </div>
                )}

                {/* Order Items Area */}
                <div className="p-6 border-b border-surface-200 bg-white flex-shrink-0">
                  <h3 className="font-semibold text-surface-700 mb-4">Order Items</h3>
                  <div className="space-y-3">
                    {selectedOrder.items?.map(item => (
                      <div key={item.id} className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-surface-900"><span className="text-surface-500 mr-2">{item.quantity}×</span>{item.productName}</p>
                          {item.addons && <p className="text-xs text-surface-500 ml-6">+ {JSON.parse(item.addons).map(a => a.name).join(', ')}</p>}
                          {item.comboChoices && (
                            <p className="text-xs text-primary-500 ml-6 font-semibold">
                              + {(() => {
                                try {
                                  const choices = JSON.parse(item.comboChoices);
                                  return Object.values(choices).filter(Boolean).map(c => c.name).join(' + ');
                                } catch (e) { return ''; }
                              })()}
                            </p>
                          )}
                          {item.notes && <p className="text-xs text-amber-600 ml-6 italic">Note: {item.notes}</p>}
                        </div>
                        <span className="font-medium text-surface-900">{formatCurrency(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cash Register / Payment Section */}
                <div className="p-6 bg-surface-50 flex-1">
                  {selectedOrder.status === 'pending' ? (
                    <div className="space-y-4">
                      {/* Payment Calculator */}
                      {calcResult && (
                        <div className="bg-white p-4 rounded-2xl border border-surface-200 shadow-sm space-y-2">
                          <div className="flex justify-between text-sm"><span className="text-surface-500">Subtotal</span><span>{formatCurrency(calcResult.subtotal)}</span></div>
                          {calcResult.discountAmount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>-{formatCurrency(calcResult.discountAmount)}</span></div>}
                          {calcResult.taxAmount > 0 && <div className="flex justify-between text-sm"><span className="text-surface-500">Tax ({calcResult.taxRate}%)</span><span>{formatCurrency(calcResult.taxAmount)}</span></div>}
                          <div className="flex justify-between items-center pt-2 mt-2 border-t border-surface-100">
                            <span className="font-bold text-surface-900">Total Due</span>
                            <span className="font-heading text-2xl font-black text-primary-600">{formatCurrency(calcResult.total)}</span>
                          </div>

                          <div className="pt-4 border-t border-surface-200 mt-4">
                            <div className="flex justify-between items-end mb-2">
                              <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount Received</label>
                              <button onClick={exactCash} className="text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">Exact Amount</button>
                            </div>

                            {/* Display Screen (Clickable to toggle keypad) */}
                            <button
                              type="button"
                              onClick={() => setShowKeypad(!showKeypad)}
                              className={`w-full p-4 mb-4 rounded-2xl border-2 flex items-center justify-between shadow-inner transition-all hover:scale-[1.01] active:scale-[0.99] focus:outline-none ${calcResult.isInsufficient && paymentData.received
                                ? 'bg-red-50 border-red-300 text-red-600'
                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                }`}
                            >
                              <span className="text-xl font-bold opacity-50">₱</span>
                              <span className="text-4xl font-heading font-black tracking-tighter">
                                {(() => {
                                  if (!paymentData.received) return '0.00';
                                  const parts = paymentData.received.split('.');
                                  const formattedInt = parseFloat(parts[0] || '0').toLocaleString('en-US');
                                  return parts.length > 1 ? `${formattedInt}.${parts[1]}` : `${formattedInt}.00`;
                                })()}
                              </span>
                            </button>

                            {/* Numeric Keypad (Collapsible) */}
                            {showKeypad && (
                              <div className="grid grid-cols-3 gap-2 animate-fade-in-up">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                  <button key={num} onClick={() => setPaymentData(p => ({ ...p, received: p.received === '0' ? num.toString() : p.received + num }))} className="py-4 bg-white border border-surface-200 hover:bg-surface-50 active:bg-surface-100 rounded-2xl text-2xl font-black text-surface-800 transition-all shadow-sm active:scale-95">
                                    {num}
                                  </button>
                                ))}
                                <button onClick={() => {
                                  if (!paymentData.received.includes('.')) {
                                    setPaymentData(p => ({ ...p, received: p.received ? p.received + '.' : '0.' }));
                                  }
                                }} className="py-4 bg-surface-100 border border-surface-200 hover:bg-surface-200 rounded-2xl text-2xl font-black text-surface-800 transition-all shadow-sm active:scale-95">
                                  .
                                </button>
                                <button onClick={() => setPaymentData(p => ({ ...p, received: p.received === '0' ? '0' : p.received + '0' }))} className="py-4 bg-white border border-surface-200 hover:bg-surface-50 active:bg-surface-100 rounded-2xl text-2xl font-black text-surface-800 transition-all shadow-sm active:scale-95">
                                  0
                                </button>
                                <button onClick={() => setPaymentData(p => ({ ...p, received: p.received.slice(0, -1) }))} className="py-4 bg-surface-200 border border-surface-300 hover:bg-surface-300 rounded-2xl text-2xl font-black text-surface-900 transition-all shadow-sm flex items-center justify-center active:scale-95">
                                  ⌫
                                </button>
                                <button
                                  onClick={() => setPaymentData(p => ({ ...p, received: '' }))}
                                  className="col-span-3 py-3 mt-1 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl font-black uppercase tracking-widest text-xs shadow-sm transition-all active:scale-[0.98]"
                                >
                                  Clear Amount
                                </button>
                              </div>
                            )}

                            <div className={`flex justify-between items-center mt-4 p-4 rounded-2xl shadow-sm border ${calcResult.isInsufficient && paymentData.received ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                              <span className="font-bold text-sm uppercase tracking-wider">{calcResult.isInsufficient ? 'Insufficient' : 'Change Due'}</span>
                              <span className="font-heading text-2xl font-black">{calcResult.isInsufficient ? '-' : formatCurrency(calcResult.change)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Payment controls — simplified for points redemption */}
                      {selectedOrder.paymentMethod === 'points' ? (
                        <div className="flex gap-3 pt-2">
                          <button onClick={handleCancel} disabled={processing} className="btn-danger flex-1 py-4">Cancel Order</button>
                          <button
                            onClick={() => {
                              setPaymentData(p => ({ ...p, received: '0', method: 'points' }));
                              setTimeout(() => handleConfirmPayment(), 100);
                            }}
                            disabled={processing}
                            className="flex-[2] py-4 shadow-xl font-bold transition-all btn-primary bg-purple-600 hover:bg-purple-700"
                          >
                            {processing ? 'Processing...' : '🎁 Confirm Reward Claim'}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-3">
                            <select value={paymentData.method} onChange={e => setPaymentData(p => ({ ...p, method: e.target.value }))} className="input-field py-3 bg-white w-1/2">
                              <option value="cash">💵 Cash</option>
                              <option value="gcash">📱 GCash</option>
                              <option value="maya">💳 Maya</option>
                            </select>
                            <select value={paymentData.discountType} onChange={e => setPaymentData(p => ({ ...p, discountType: e.target.value }))} className="input-field py-3 bg-white w-1/2">
                              <option value="">No Discount</option>
                              <option value="senior">Senior Citizen (20%)</option>
                              <option value="pwd">PWD (20%)</option>
                            </select>
                          </div>

                          {(paymentData.method === 'gcash' || paymentData.method === 'maya') && (
                            <div className="animate-fade-in space-y-4 mt-2">
                              <div className="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                                <label className="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-3 text-center">
                                  Enter {paymentData.method.toUpperCase()} Ref No.
                                </label>

                                {/* Display Screen (Clickable) */}
                                <button
                                  onClick={() => setShowRefKeypad(!showRefKeypad)}
                                  className="w-full flex justify-center gap-3 mb-2 focus:outline-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
                                  type="button"
                                >
                                  {[0, 1, 2, 3].map(i => (
                                    <div key={i} className={`w-12 h-14 rounded-xl flex items-center justify-center text-2xl font-mono font-black transition-all duration-200 ${paymentData.referenceNumber[i]
                                      ? 'bg-blue-50 text-blue-700 border-2 border-blue-500 shadow-sm scale-105'
                                      : 'bg-surface-100 text-surface-300 border-2 border-transparent'
                                      }`}>
                                      {paymentData.referenceNumber[i] || '•'}
                                    </div>
                                  ))}
                                </button>


                                {/* Keypad (Collapsible) */}
                                {showRefKeypad && (
                                  <div className="grid grid-cols-3 gap-2 px-2 sm:px-6 pt-3 border-t border-surface-100 animate-fade-in-up">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                      <button
                                        key={num}
                                        type="button"
                                        onClick={() => setPaymentData(p => ({ ...p, referenceNumber: (p.referenceNumber + num).slice(0, 4) }))}
                                        className="py-3 sm:py-4 bg-surface-50 hover:bg-surface-100 active:bg-surface-200 active:scale-95 rounded-xl text-xl font-bold text-surface-700 transition-all shadow-sm border border-surface-200/60"
                                      >
                                        {num}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setPaymentData(p => ({ ...p, referenceNumber: '' }))}
                                      className="py-3 sm:py-4 bg-red-50 hover:bg-red-100 active:bg-red-200 active:scale-95 rounded-xl text-xs font-black text-red-600 transition-all shadow-sm border border-red-100 uppercase tracking-wider"
                                    >
                                      Clear
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPaymentData(p => ({ ...p, referenceNumber: (p.referenceNumber + '0').slice(0, 4) }))}
                                      className="py-3 sm:py-4 bg-surface-50 hover:bg-surface-100 active:bg-surface-200 active:scale-95 rounded-xl text-xl font-bold text-surface-700 transition-all shadow-sm border border-surface-200/60"
                                    >
                                      0
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPaymentData(p => ({ ...p, referenceNumber: p.referenceNumber.slice(0, -1) }))}
                                      className="py-3 sm:py-4 bg-surface-200 hover:bg-surface-300 active:bg-surface-400 active:scale-95 rounded-xl text-xl font-bold text-surface-800 transition-all shadow-sm border border-surface-300"
                                    >
                                      ⌫
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      setQrStatus('sending');
                                      await (await import('../services/api')).requestPayment(selectedOrder.id);
                                      setQrStatus('sent');
                                      setTimeout(() => setQrStatus(null), 3500);
                                    } catch (e) {
                                      setQrStatus('error');
                                      setTimeout(() => setQrStatus(null), 3500);
                                    }
                                  }}
                                  disabled={qrStatus === 'sending' || qrStatus === 'sent'}
                                  className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 border ${qrStatus === 'sent'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-inner'
                                    : qrStatus === 'error'
                                      ? 'bg-red-50 text-red-600 border-red-200'
                                      : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-600 shadow-md hover:shadow-lg hover:-translate-y-0.5'
                                    }`}
                                >
                                  {qrStatus === 'sending' ? (
                                    <>
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                      Sending to Kiosk...
                                    </>
                                  ) : qrStatus === 'sent' ? (
                                    <>
                                      <span className="text-emerald-500 text-lg drop-shadow-sm">✅</span> {paymentData.method.toUpperCase()} QR Sent to Kiosk!
                                    </>
                                  ) : qrStatus === 'error' ? (
                                    <>
                                      <span className="text-red-500 text-lg">⚠️</span> Failed to Send
                                    </>
                                  ) : (
                                    <>📱 Send {paymentData.method.toUpperCase()} QR to Kiosk</>
                                  )}
                                </button>
                                {qrStatus === 'sent' && (
                                  <p className="text-xs text-center text-emerald-600 font-semibold animate-fade-in-up">
                                    Customer is now viewing the QR code.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-3 pt-2">
                            <button onClick={handleCancel} disabled={processing} className="btn-danger flex-1 py-4">Cancel Order</button>
                            <button
                              onClick={handleConfirmPayment}
                              disabled={
                                processing || 
                                !paymentData.received || 
                                calcResult?.isInsufficient || 
                                ((paymentData.method === 'gcash' || paymentData.method === 'maya') && paymentData.referenceNumber.length < 4)
                              }
                              className={`flex-[2] py-4 shadow-xl font-bold transition-all ${
                                (!paymentData.received || calcResult?.isInsufficient || ((paymentData.method === 'gcash' || paymentData.method === 'maya') && paymentData.referenceNumber.length < 4)) 
                                ? 'bg-surface-300 text-surface-500 cursor-not-allowed opacity-50' 
                                : 'btn-primary'
                              }`}
                            >
                              {processing 
                                ? 'Processing...' 
                                : !paymentData.received 
                                  ? 'Enter Amount' 
                                  : calcResult?.isInsufficient 
                                    ? 'Insufficient' 
                                    : (paymentData.method === 'gcash' || paymentData.method === 'maya') && paymentData.referenceNumber.length < 4
                                      ? 'Enter Ref ID'
                                      : 'Confirm Payment'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white p-6 rounded-2xl border border-surface-200 shadow-sm">
                      <h3 className="font-bold text-surface-900 mb-4 text-center">Payment Summary</h3>
                      <div className="space-y-2 text-sm mb-6">
                        <div className="flex justify-between"><span className="text-surface-500">Subtotal</span><span className="font-medium">{formatCurrency(selectedOrder.subtotal)}</span></div>
                        {selectedOrder.discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount ({selectedOrder.discountType})</span><span>-{formatCurrency(selectedOrder.discountAmount)}</span></div>}
                        {selectedOrder.taxAmount > 0 && <div className="flex justify-between"><span className="text-surface-500">Tax</span><span className="font-medium">{formatCurrency(selectedOrder.taxAmount)}</span></div>}
                        <div className="flex justify-between font-bold text-lg pt-2 border-t border-surface-100"><span>Total</span><span className="text-primary-600">{formatCurrency(selectedOrder.total)}</span></div>
                        <div className="flex justify-between pt-2"><span className="text-surface-500">Method</span><span className="font-medium uppercase">{selectedOrder.paymentMethod}</span></div>
                      </div>

                      {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                        <div className="space-y-3 mb-3">
                          {selectedOrder.status === 'confirmed' && (
                            <button 
                              onClick={handleStartPreparing} 
                              disabled={processing} 
                              className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-2xl shadow-lg shadow-orange-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 animate-bounce-in"
                            >
                              {processing ? 'Processing...' : (
                                <>
                                  <span className="text-xl">🍳</span>
                                  <span>START PREPARING</span>
                                </>
                              )}
                            </button>
                          )}
                          {selectedOrder.status === 'preparing' && (
                            <button 
                              onClick={handleCompleteOrder} 
                              disabled={processing} 
                              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 animate-bounce-in"
                            >
                              {processing ? 'Processing...' : (
                                <>
                                  <span className="text-xl">✅</span>
                                  <span>MARK AS READY</span>
                                </>
                              )}
                            </button>
                          )}
                          {selectedOrder.status === 'ready' && (
                            <button 
                              onClick={handleServeOrder} 
                              disabled={processing} 
                              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 animate-bounce-in"
                            >
                              {processing ? 'Processing...' : (
                                <>
                                  <span className="text-xl">🥡</span>
                                  <span>MARK AS SERVED</span>
                                </>
                              )}
                            </button>
                          )}
                          <button onClick={handleCancel} disabled={processing} className="btn-danger w-full py-3">Cancel Order</button>
                        </div>
                      )}
                      <button onClick={() => window.print()} className="btn-secondary w-full py-3">🖨️ Print Receipt</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Printable Receipt */}
              <div className="print-only receipt-container">
                <div className="receipt-header">
                  <span className="receipt-logo">{user?.tenantName || 'Hometown Brew'}</span>
                  <span className="receipt-subtitle">Official Receipt</span>
                </div>

                <div className="receipt-info">
                  <p><span>ORDER NO:</span> <strong>{selectedOrder.orderNumber}</strong></p>
                  <p><span>CASHIER:</span> <span>{user?.name}</span></p>
                  <p><span>DATE:</span> <span>{formatDate(selectedOrder.createdAt)}</span></p>
                  <p><span>TYPE:</span> <span>{selectedOrder.orderType?.toUpperCase()}</span></p>
                </div>

                <div className="receipt-divider"></div>

                <table className="w-full receipt-table">
                  <thead>
                    <tr>
                      <th className="w-1/2">ITEM</th>
                      <th className="text-center">QTY</th>
                      <th className="text-right">PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map(item => (
                      <tr key={item.id}>
                        <td>
                          {item.productName}
                          {item.addons && JSON.parse(item.addons).map(a => (
                            <div key={a.name} style={{ fontSize: '9px', opacity: 0.7 }}>+ {a.name}</div>
                          ))}
                          {item.comboChoices && (
                            <div style={{ fontSize: '9px', opacity: 0.8, fontWeight: 'bold' }}>
                              + {(() => {
                                try {
                                  const choices = JSON.parse(item.comboChoices);
                                  return Object.values(choices).filter(Boolean).map(c => c.name).join(' + ');
                                } catch (e) { return ''; }
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-right">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="receipt-divider"></div>

                <div className="space-y-1">
                  <div className="receipt-total-row">
                    <span>SUBTOTAL</span>
                    <span>{formatCurrency(selectedOrder.subtotal)}</span>
                  </div>
                  {selectedOrder.discountAmount > 0 && (
                    <div className="receipt-total-row">
                      <span>DISCOUNT ({selectedOrder.discountType})</span>
                      <span>-{formatCurrency(selectedOrder.discountAmount)}</span>
                    </div>
                  )}
                  {selectedOrder.taxAmount > 0 && (
                    <div className="receipt-total-row">
                      <span>VAT (12%)</span>
                      <span>{formatCurrency(selectedOrder.taxAmount)}</span>
                    </div>
                  )}
                  <div className="receipt-total-row receipt-total-main">
                    <span>TOTAL</span>
                    <span>{formatCurrency(selectedOrder.total)}</span>
                  </div>
                </div>

                <div className="receipt-info mt-4" style={{ borderTop: '1px solid #000', paddingTop: '2mm' }}>
                  <p><span>METHOD:</span> <strong>{selectedOrder.paymentMethod?.toUpperCase()}</strong></p>
                  {selectedOrder.amountReceived > 0 && (
                    <>
                      <p><span>RECEIVED:</span> <span>{formatCurrency(selectedOrder.amountReceived)}</span></p>
                      <p><span>CHANGE:</span> <span>{formatCurrency(selectedOrder.amountReceived - selectedOrder.total)}</span></p>
                    </>
                  )}
                </div>

                <div className="receipt-footer">
                  <p>CUSTOMER COPY</p>
                  <p>THANK YOU FOR YOUR PATRONAGE!</p>
                  <p className="mt-2" style={{ fontSize: '8px', opacity: 0.6 }}>{window.location.hostname}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

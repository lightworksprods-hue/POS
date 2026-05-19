const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/cashier/orders — Get orders for cashier (pending + confirmed + preparing)
router.get('/orders', authenticate, authorize('cashier', 'admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = { tenantId: req.tenantId };
    
    if (status && status !== 'all') {
      where.status = status;
    } else {
      where.status = { in: ['pending', 'confirmed', 'preparing', 'ready', 'completed'] };
    }

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load orders.' });
  }
});

// POST /api/cashier/orders/:id/confirm — Confirm order + process payment
router.post('/orders/:id/confirm', authenticate, authorize('cashier', 'admin'), async (req, res) => {
  let currentStep = 'initializing';
  try {
    const orderId = parseInt(req.params.id);
    const { amountReceived, paymentMethod, discountType, discountPercent, referenceNumber } = req.body;
    
    currentStep = 'fetching order';
    const order = await prisma.order.findUnique({
      where: { id: orderId, tenantId: req.tenantId },
      include: { items: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Order is already processed.' });
    }

    currentStep = 'calculating totals';
    let discountAmount = 0;
    if (discountType === 'senior' || discountType === 'pwd') {
      discountAmount = order.subtotal * 0.20;
    } else if (discountType === 'promo' && discountPercent) {
      discountAmount = order.subtotal * (discountPercent / 100);
    }

    const taxRate = parseFloat(process.env.TAX_RATE || '0.00');
    const total = order.subtotal - discountAmount;
    const taxAmount = taxRate > 0 ? (total - (total / (1 + taxRate))) : 0;
    const taxableAmount = total - taxAmount;
    const method = paymentMethod || order.paymentMethod;
    const isPointsRedemption = method === 'points';
    const received = isPointsRedemption ? 0 : (parseFloat(amountReceived) || total);
    const change = isPointsRedemption ? 0 : (received - total);

    if (!isPointsRedemption && received < total) {
      return res.status(400).json({
        success: false,
        message: `Insufficient payment. Total: ₱${total.toFixed(2)}, Received: ₱${received.toFixed(2)}`
      });
    }

    // Calculate loyalty points (skip for points redemption — you don't earn points on free items)
    if (order.customerId && !isPointsRedemption) {
      currentStep = 'processing loyalty';
      let rate = 100; // default: 1 point per ₱100
      try {
        const tenantId = order.tenantId || 1;
        const rateSetting = await prisma.systemSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'points_rate' } } });
        if (rateSetting) rate = parseFloat(rateSetting.value);
      } catch (e) {
        // SystemSetting table may not exist yet, use default rate
        console.log('SystemSetting table not available, using default points rate:', rate);
      }
      const earnedPoints = Math.floor(total / rate);
      
      if (earnedPoints > 0) {
        await prisma.user.update({
          where: { id: order.customerId },
          data: { points: { increment: earnedPoints } }
        });
        
        if (req.io && req.io.emitLoyaltyUpdate) {
          req.io.emitLoyaltyUpdate(order.customerId, earnedPoints, order.tenantId);
        }
      }
    }

    // For points redemption orders, still emit a loyalty update so the customer's UI refreshes
    if (isPointsRedemption && order.customerId) {
      if (req.io && req.io.emitLoyaltyUpdate) {
        req.io.emitLoyaltyUpdate(order.customerId, 0, order.tenantId);
      }
    }

    currentStep = 'updating order';
    let newNotes = order.notes || '';
    if (referenceNumber) {
      newNotes = newNotes ? `${newNotes} | Ref: ${referenceNumber}` : `Ref: ${referenceNumber}`;
    }

    const updated = await prisma.order.update({
      where: { id: orderId, tenantId: req.tenantId },
      data: {
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: method,
        discountType: discountType || null,
        discountAmount,
        taxAmount,
        total,
        cashierId: req.user.id,
        confirmedAt: new Date(),
        notes: newNotes !== '' ? newNotes : null
      },
      include: { items: true }
    });

    currentStep = 'creating payment record';
    await prisma.payment.create({
      data: {
        orderId,
        amountDue: total,
        amountReceived: received,
        changeAmount: change,
        paymentMethod: method,
        discountType: discountType || null,
        discountAmount,
        taxAmount,
        cashierId: req.user.id
      }
    });

    currentStep = 'creating notification';
    await prisma.notification.create({
      data: {
        orderId,
        type: 'payment_confirmed',
        message: `Order #${order.orderNumber} confirmed.`,
        module: 'kitchen'
      }
    });

    currentStep = 'creating audit log';
    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user.id,
        action: 'confirm_order',
        entityType: 'order',
        entityId: orderId.toString(),
        details: `Confirmed Order #${order.orderNumber}`
      }
    });

    currentStep = 'emitting websockets';
    const io = req.io;
    if (io) {
      io.emitKitchenOrder && io.emitKitchenOrder(updated);
      io.emitOrderUpdate && io.emitOrderUpdate(updated, 'confirmed');
    }

    res.json({
      success: true,
      data: { order: updated }
    });
  } catch (error) {
    console.error(`Confirm error at step [${currentStep}]:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Failed at ${currentStep}`,
      error: error.message
    });
  }
});

// POST /api/cashier/orders/:id/cancel — Cashier cancel order
router.post('/orders/:id/cancel', authenticate, authorize('cashier', 'admin'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId, tenantId: req.tenantId },
      include: { items: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed or already cancelled order.' });
    }

    // Restore stock
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } }
      });
    }

    // Points Reversal Logic
    if (order.customerId) {
      let pointsToReturn = 0;
      let pointsToDeduct = 0;

      // 1. Calculate points to return (from redemptions)
      for (const item of order.items) {
        // Fallback: If the entire order is 'points' payment, treat items as redemptions
        const isActuallyRedemption = item.isRedemption || order.paymentMethod === 'points';
        
        if (isActuallyRedemption) {
          const product = await prisma.product.findUnique({ where: { id: item.productId } });
          if (product && product.pointsCost) {
            pointsToReturn += (product.pointsCost * item.quantity);
          }
        }
      }

      // 2. Calculate points to deduct (earned points if order was already confirmed/paid)
      // Points are only earned when order status moves from pending to confirmed
      if (order.status !== 'pending' && order.paymentMethod !== 'points') {
        let rate = 100;
        try {
          const tid = order.tenantId || 1;
          const rateSetting = await prisma.systemSetting.findUnique({ where: { tenantId_key: { tenantId: tid, key: 'points_rate' } } });
          if (rateSetting) rate = parseFloat(rateSetting.value);
        } catch (e) { /* use default */ }
        pointsToDeduct = Math.floor(order.total / rate);
      }

      const pointAdjustment = pointsToReturn - pointsToDeduct;
      
      if (pointAdjustment !== 0) {
        await prisma.user.update({
          where: { id: order.customerId },
          data: { points: { increment: pointAdjustment } }
        });

        // Emit loyalty update to customer
        if (req.io && req.io.emitLoyaltyUpdate) {
          req.io.emitLoyaltyUpdate(order.customerId, pointAdjustment, order.tenantId);
        }
      }
    }

    const updated = await prisma.order.update({
      where: { id: orderId, tenantId: req.tenantId },
      data: {
        status: 'cancelled',
        paymentStatus: order.paymentStatus === 'paid' ? 'refunded' : 'unpaid',
        cancellationReason: reason || 'Cancelled by cashier'
      },
      include: { items: true }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user.id,
        action: 'cancel_order',
        entityType: 'order',
        entityId: orderId.toString(),
        details: reason || 'Cancelled by cashier'
      }
    });

    const io = req.io;
    if (io && io.emitOrderUpdate) {
      io.emitOrderUpdate(updated, 'cancelled');
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Cancel Order Error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order.' });
  }
});

// POST /api/cashier/calculate — Calculate payment totals
router.post('/calculate', async (req, res) => {
  try {
    const { subtotal, discountType, discountPercent, amountReceived } = req.body;
    
    let discountAmount = 0;
    if (discountType === 'senior' || discountType === 'pwd') {
      discountAmount = subtotal * 0.20;
    } else if (discountType === 'promo' && discountPercent) {
      discountAmount = subtotal * (discountPercent / 100);
    }

    const taxRate = parseFloat(process.env.TAX_RATE || '0.00');
    const total = subtotal - discountAmount;
    const taxAmount = taxRate > 0 ? (total - (total / (1 + taxRate))) : 0;
    const taxableAmount = total - taxAmount;
    const change = (amountReceived || 0) - total;

    res.json({
      success: true,
      data: {
        subtotal,
        discountType,
        discountAmount,
        taxableAmount,
        taxRate: taxRate * 100,
        taxAmount,
        total,
        amountReceived: amountReceived || 0,
        change: Math.max(0, change),
        isInsufficient: amountReceived ? amountReceived < total : false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Calculation failed.' });
  }
});

// POST /api/cashier/orders/:id/request-payment — Trigger payment popup on kiosk
router.post('/orders/:id/request-payment', authenticate, authorize('cashier', 'admin'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { method } = req.body;
    const order = await prisma.order.findUnique({
      where: { id: orderId, tenantId: req.tenantId }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId }
    });

    // Fetch maya_qr from system settings
    let mayaQr = null;
    try {
      const mayaQrSetting = await prisma.systemSetting.findUnique({
        where: { tenantId_key: { tenantId: req.tenantId, key: 'maya_qr' } }
      });
      if (mayaQrSetting) mayaQr = mayaQrSetting.value;
    } catch (e) {
      console.error('Error fetching Maya QR setting:', e);
    }

    if (req.io && req.io.emitPaymentRequest) {
      req.io.emitPaymentRequest(order, tenant, mayaQr, method);
    }

    res.json({ success: true, message: 'Payment request sent to kiosk.' });
  } catch (error) {
    console.error('Request Payment Error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment request.' });
  }
});

module.exports = router;

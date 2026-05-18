const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/kitchen/orders
router.get('/orders', authenticate, authorize('kitchen', 'admin', 'cashier'), async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { 
        status: { in: ['confirmed', 'preparing', 'ready'] },
        tenantId: req.tenantId
      },
      include: { items: true },
      orderBy: { confirmedAt: 'asc' }
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load kitchen orders.' });
  }
});

// POST /api/kitchen/orders/:id/start
router.post('/orders/:id/start', authenticate, authorize('kitchen', 'admin', 'cashier'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { prepTime } = req.body; // Minutes from kitchen
    const order = await prisma.order.findUnique({ 
      where: { id: orderId, tenantId: req.tenantId } 
    });
    if (!order || order.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Order not found or not confirmed.' });
    }
    const updated = await prisma.order.update({
      where: { id: orderId, tenantId: req.tenantId },
      data: { 
        status: 'preparing', 
        kitchenStartedAt: new Date(),
        estimatedPrepTime: prepTime ? parseInt(prepTime) : null
      },
      include: { items: true }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user.id,
        action: 'kitchen_start',
        entityType: 'order',
        entityId: orderId.toString(),
        details: `Kitchen started preparing Order #${updated.orderNumber}`
      }
    });

    const io = req.io;
    if (io && io.emitOrderUpdate) io.emitOrderUpdate(updated, 'preparing');
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update order.' });
  }
});

// POST /api/kitchen/orders/:id/complete
router.post('/orders/:id/complete', authenticate, authorize('kitchen', 'admin', 'cashier'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await prisma.order.findUnique({ 
      where: { id: orderId, tenantId: req.tenantId } 
    });
    if (!order || !['confirmed', 'preparing'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Invalid order state.' });
    }
    const updated = await prisma.order.update({
      where: { id: orderId, tenantId: req.tenantId },
      data: { status: 'ready', kitchenCompletedAt: new Date(), kitchenStartedAt: order.kitchenStartedAt || new Date() },
      include: { items: true }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user.id,
        action: 'kitchen_complete',
        entityType: 'order',
        entityId: orderId.toString(),
        details: `Kitchen finished Order #${updated.orderNumber}. Ready for pickup.`
      }
    });

    const io = req.io;
    if (io && io.emitOrderUpdate) io.emitOrderUpdate(updated, 'ready');
    if (io && io.emitQueueUpdate) io.emitQueueUpdate({ order: updated, type: 'ready' });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to complete order.' });
  }
});

// POST /api/kitchen/orders/:id/served
router.post('/orders/:id/served', authenticate, authorize('kitchen', 'admin', 'cashier'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const updated = await prisma.order.update({
      where: { id: orderId, tenantId: req.tenantId },
      data: { status: 'completed' },
      include: { items: true }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user.id,
        action: 'order_served',
        entityType: 'order',
        entityId: orderId.toString(),
        details: `Order #${updated.orderNumber} served to customer.`
      }
    });

    const io = req.io;
    if (io && io.emitOrderUpdate) io.emitOrderUpdate(updated, 'completed');
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark as served.' });
  }
});

module.exports = router;

const jwt = require('jsonwebtoken');

module.exports = (io, prisma) => {
  io.on('connection', (socket) => {
    console.log(`📱 Client connected: ${socket.id}`);

    // Join specific rooms based on module (Secure)
    socket.on('join', async (room) => {
      // Security: Only allow joining sensitive rooms if authenticated
      if (room.includes('cashier') || room.includes('kitchen') || room.includes('admin')) {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
          console.warn(`🛑 Unauthorized join attempt: No token for ${room}`);
          return;
        }

        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
          
          if (!user || !user.active) {
            console.warn(`🛑 Unauthorized join attempt: Invalid user for ${room}`);
            return;
          }

          // Verify user belongs to this tenant room
          if (room.includes(`tenant-${user.tenantId}`)) {
            socket.join(room);
            console.log(`👤 Verified: ${user.name} joined room: ${room}`);
          } else if (user.role === 'superadmin') {
            socket.join(room);
            console.log(`👤 Superadmin joined room: ${room}`);
          } else {
            console.warn(`🛑 Cross-tenant join blocked: ${user.name} tried to join ${room}`);
          }
        } catch (err) {
          console.warn(`🛑 Unauthorized join attempt: Token error for ${room}`);
          return;
        }
      } else {
        // Public rooms (queue, kiosk, etc.)
        socket.join(room);
        console.log(`👤 Guest joined room: ${room}`);
      }
    });

    // Leave room
    socket.on('leave', (room) => {
      socket.leave(room);
    });

    socket.on('disconnect', () => {
      console.log(`📴 Client disconnected: ${socket.id}`);
    });
  });

  // Helper: broadcast order update to all relevant modules
  io.emitOrderUpdate = (order, eventType) => {
    const payload = { order, eventType, timestamp: new Date().toISOString() };
    const tId = order.tenantId;
    
    // Notify all modules in this tenant's private rooms
    io.to(`tenant-${tId}-cashier`).emit('order_update', payload);
    io.to(`tenant-${tId}-kitchen`).emit('order_update', payload);
    io.to(`tenant-${tId}-queue`).emit('order_update', payload);
    io.to(`tenant-${tId}-kiosk`).emit('order_update', payload);
    io.to(`tenant-${tId}-admin`).emit('order_update', payload);
    
    // For specific order tracking page
    io.to(`tenant-${tId}-order-${order.orderNumber}`).emit('order_update', payload);
    
    // For specific customer's logged-in devices
    if (order.customerId) {
      io.to(`tenant-${tId}-user-${order.customerId}`).emit('order_update', payload);
    }
  };

  // Helper: send notification to a specific module
  io.emitNotification = (module, notification, tenantId) => {
    const targetRoom = tenantId ? `tenant-${tenantId}-${module}` : module;
    io.to(targetRoom).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  };

  // Helper: broadcast new order to cashier
  io.emitNewOrder = (order) => {
    const tId = order.tenantId;
    io.to(`tenant-${tId}-cashier`).emit('new_order', {
      order,
      timestamp: new Date().toISOString()
    });
    io.to(`tenant-${tId}-admin`).emit('new_order', {
      order,
      timestamp: new Date().toISOString()
    });
  };

  // Helper: broadcast to kitchen when order is confirmed
  io.emitKitchenOrder = (order) => {
    const tId = order.tenantId;
    io.to(`tenant-${tId}-kitchen`).emit('new_kitchen_order', {
      order,
      timestamp: new Date().toISOString()
    });
  };

  // Helper: broadcast queue update
  io.emitQueueUpdate = (data, tenantId) => {
    const targetRoom = tenantId ? `tenant-${tenantId}-queue` : 'queue';
    io.to(targetRoom).emit('queue_update', {
      ...data,
      timestamp: new Date().toISOString()
    });
  };

  // Helper: notify specific user about loyalty update
  io.emitLoyaltyUpdate = (userId, points, tenantId) => {
    const targetRoom = tenantId ? `tenant-${tenantId}-user-${userId}` : `user-${userId}`;
    io.to(targetRoom).emit('loyalty_updated', {
      userId,
      points,
      timestamp: new Date().toISOString()
    });
  };

  // Helper: send payment request to kiosk
  io.emitPaymentRequest = (order, tenant, mayaQr, method) => {
    const tId = order.tenantId;
    io.to(`tenant-${tId}-kiosk`).emit('payment_request', {
      orderNumber: order.orderNumber,
      amount: order.total,
      gcashQr: tenant.gcashQr,
      mayaQr: mayaQr,
      method: method,
      timestamp: new Date().toISOString()
    });
    // Also notify specific order page
    io.to(`tenant-${tId}-order-${order.orderNumber}`).emit('payment_request', {
      orderNumber: order.orderNumber,
      amount: order.total,
      gcashQr: tenant.gcashQr,
      mayaQr: mayaQr,
      method: method,
      timestamp: new Date().toISOString()
    });
  };
};

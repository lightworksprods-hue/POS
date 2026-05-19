const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/categories — Public: Get all active categories
router.get('/', async (req, res) => {
  try {
    let tenantId = 1;

    // 1. Priority: If user is authenticated, use their tenantId (Crucial for Admin Panel)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (user) tenantId = user.tenantId;
      } catch (e) {
        // Token invalid or expired, fallback to headers
      }
    } else {
      // 2. Fallback: Use headers for public Kiosk users
      tenantId = req.headers['x-tenant-id'] ? parseInt(req.headers['x-tenant-id']) : null;
      const tenantSlug = req.headers['x-tenant-slug'] || 'kainlowkal';

      if (tenantSlug) {
        const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (tenant) tenantId = tenant.id;
      }

      if (!tenantId) {
        const firstTenant = await prisma.tenant.findFirst({ where: { active: true } });
        tenantId = firstTenant ? firstTenant.id : 1;
      }
    }

    const categories = await prisma.category.findMany({
      where: { active: true, tenantId: tenantId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load categories.' });
  }
});

// POST /api/categories — Admin: Create category
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });

    const maxSort = await prisma.category.aggregate({ 
      where: { tenantId: req.user.tenantId },
      _max: { sortOrder: true } 
    });
    const category = await prisma.category.create({
      data: { 
        tenantId: req.user.tenantId,
        name, 
        description, 
        icon: icon || '🍔', 
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
        active: true
      }
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create category.' });
  }
});

// PUT /api/categories/:id — Admin: Update category
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, description, icon, active, sortOrder } = req.body;
    const category = await prisma.category.update({
      where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
      data: { name, description, icon, active, sortOrder }
    });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update category.' });
  }
});

// DELETE /api/categories/:id — Admin: Delete category
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    
    // Find the category first to check ownership
    const category = await prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    // Security check: Admins can only delete their own tenant's categories
    if (req.user.role !== 'superadmin' && category.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, message: 'Permission denied.' });
    }

    // Soft delete by deactivating
    await prisma.category.update({
      where: { id: categoryId },
      data: { active: false }
    });

    res.json({ success: true, message: 'Category deactivated successfully.' });
  } catch (error) {
    console.error('Delete Category Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category. It might be in use by active orders.' });
  }
});

module.exports = router;

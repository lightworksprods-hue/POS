const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = '34858099230-uvb83hlp4q6rdje145o0tkqlqgjdsuno.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const { sendOTPEmail } = require('../lib/mailer');




// POST /api/auth/request-otp — Send a code to email
router.post('/request-otp', async (req, res) => {
  const { email, tenantSlug } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  try {
    // Determine tenant
    let tenantId = null;
    let tenantName = 'Kainlowkal';
    if (tenantSlug && tenantSlug !== 'kainlowkal') {
      const tenantRecord = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenantRecord) {
        tenantId = tenantRecord.id;
        tenantName = tenantRecord.name;
      }
    } else {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    // Find user in this tenant
    const user = await prisma.user.findFirst({
      where: { email, tenantId: tenantId }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found in this shop.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpires: expires }
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    await sendOTPEmail(email, otp, tenant || {});

    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) {
    console.error('OTP Request Error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP.' });
  }
});

// POST /api/auth/verify-otp — Login using code
router.post('/verify-otp', async (req, res) => {
  const { email, otp, tenantSlug } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

  try {
    // Find tenant
    let tenantId = null;
    if (tenantSlug && tenantSlug !== 'kainlowkal') {
      const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (t) tenantId = t.id;
    } else {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    const user = await prisma.user.findFirst({
      where: { 
        email, 
        tenantId, 
        otpCode: otp, 
        otpExpires: { gt: new Date() } 
      },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired code.' });
    }

    // Clear OTP after success
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpires: null }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name,
        tenantSlug: user.tenant?.slug,
        points: user.points || 0
      }
    });
  } catch (error) {
    console.error('OTP Verify Error:', error);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});

// POST /api/auth/check-otp — Verify code without clearing it
router.post('/check-otp', async (req, res) => {
  const { email, otp, tenantSlug } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

  try {
    let tenantId = null;
    if (tenantSlug && tenantSlug !== 'kainlowkal') {
      const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (t) tenantId = t.id;
    } else {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    const user = await prisma.user.findFirst({
      where: { 
        email, 
        tenantId, 
        otpCode: otp, 
        otpExpires: { gt: new Date() } 
      }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code.' });
    }

    res.json({ success: true, message: 'OTP is valid.' });
  } catch (error) {
    console.error('OTP Check Error:', error);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});

// POST /api/auth/reset-password — Reset password using OTP code
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword, tenantSlug } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required' });
  }

  try {
    // Find tenant
    let tenantId = null;
    if (tenantSlug && tenantSlug !== 'kainlowkal') {
      const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (t) tenantId = t.id;
    } else {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    const user = await prisma.user.findFirst({
      where: { 
        email, 
        tenantId, 
        otpCode: otp, 
        otpExpires: { gt: new Date() } 
      }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code.' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear OTP
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        password: hashedPassword,
        otpCode: null, 
        otpExpires: null 
      }
    });

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Password Reset Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('Login attempt received for:', req.body.email);
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // TENANT DETECTION: Determine which shop the user is trying to log into
    const { tenantSlug } = req.body;
    let tenantId = null;

    if (tenantSlug && tenantSlug !== 'kainlowkal') {
      const tenantRecord = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenantRecord) tenantId = tenantRecord.id;
    } else {
      // MASTER TENANT: Find the kainlowkal ID dynamically
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    // FIND USER: Look for the email specifically within this store
    const user = await prisma.user.findFirst({ 
      where: { 
        email,
        OR: [
          { tenantId: tenantId },
          { role: 'superadmin' } // Superadmins can log in from anywhere
        ]
      },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // VERIFICATION CHECK: Customers MUST be verified to log in
    if (user.role === 'customer' && !user.isVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Email not verified. Please check your inbox or sign up again to receive a new code.',
        unverified: true
      });
    }

    // TENANT SECURITY CHECK: 
    // If a tenantSlug is provided, the user MUST belong to that tenant (Superadmins bypass this).
    if (user.role !== 'superadmin' && tenantSlug && tenantSlug !== 'kainlowkal') {
      if (user.tenant?.slug !== tenantSlug) {
        return res.status(403).json({ 
          success: false, 
          message: `Access denied. This account does not belong to ${tenantSlug.replace(/-/g, ' ')}.` 
        });
      }
    }

    if (!user.active) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, tenantId: user.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Audit log
    try {
      await prisma.auditLog.create({
        data: { 
          tenantId: user.tenantId || 1,
          userId: user.id, 
          action: 'login', 
          entityType: 'user', 
          entityId: user.id.toString(),
          details: `User ${user.name} logged in as ${user.role} at ${user.tenant?.name || 'Project Million'}`
        }
      });
    } catch (auditError) {
      console.error('Audit log failed:', auditError);
    }

    res.json({
      success: true,
      data: {
        token,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant?.name,
          tenantSlug: user.tenant?.slug,
          tenantLogo: user.tenant?.logo,
          tenantFavicon: user.tenant?.favicon,
          tenantColor: user.tenant?.primaryColor,
          tenantSecondaryColor: user.tenant?.secondaryColor,
          points: user.points || 0,
          isGoogle: user.isGoogle
        }
      }
    });
  } catch (error) {
    console.error('Login crash details:', error);
    res.status(500).json({ success: false, message: error.message || 'Login failed.' });
  }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { token, tenantSlug } = req.body;
    
    if (!token) return res.status(400).json({ success: false, message: 'Google token required' });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    // Resolve Tenant ID based on slug dynamically
    let tenantId = null;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenant) tenantId = tenant.id;
    }
    // Fallback to Master Tenant if slug is missing
    if (!tenantId) {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    // Find user by email WITHIN this specific tenant
    let user = await prisma.user.findFirst({ 
      where: { email, tenantId },
      include: { tenant: true }
    });

    // If user exists but isGoogle isn't set, update it
    if (user && !user.isGoogle) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isGoogle: true },
        include: { tenant: true }
      });
    }

    // If user doesn't exist, auto-register as customer
    if (!user) {
      // Create a random complex password since they use Google
      const randomPass = await bcrypt.hash(Math.random().toString(36).slice(-10) + 'GoOgLe', 12);
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: randomPass,
          role: 'customer',
          tenantId,
          isGoogle: true
        },
        include: { tenant: true }
      });
    }

    if (!user.active) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    // Generate JWT
    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role, tenantId: user.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant?.name,
          tenantSlug: user.tenant?.slug,
          tenantLogo: user.tenant?.logo,
          tenantFavicon: user.tenant?.favicon,
          tenantColor: user.tenant?.primaryColor,
          tenantSecondaryColor: user.tenant?.secondaryColor,
          points: user.points || 0,
          isGoogle: user.isGoogle
        }
      }
    });

  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ success: false, message: 'Google Authentication failed.' });
  }
});

// POST /api/auth/register-customer (Public)
router.post('/register-customer', async (req, res) => {
  try {
    const { email, password, name, tenantSlug } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Resolve tenantId from slug dynamically
    let tenantId = null;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenant) tenantId = tenant.id;
    }
    // Fallback to Master Tenant if slug is missing
    if (!tenantId) {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    const existing = await prisma.user.findFirst({ where: { email, tenantId } });
    if (existing && existing.isVerified) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    // OTP Generation
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user;
    if (existing) {
      console.log('Updating unverified user:', email);
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          password: hashedPassword,
          name,
          otpCode: otp,
          otpExpires: expires,
          isVerified: false
        }
      });
    } else {
      console.log('Creating new unverified user:', email);
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          tenantId,
          role: 'customer',
          otpCode: otp,
          otpExpires: expires,
          isVerified: false
        }
      });
    }

    // Send the email
    console.log('Attempting to send OTP to:', email);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    await sendOTPEmail(email, otp, tenant);

    console.log('OTP Sent Successfully');
    res.status(201).json({ 
      success: true, 
      message: 'OTP sent! Please verify your email to complete registration.',
      email 
    });
  } catch (error) {
    console.error('CRITICAL REGISTRATION ERROR:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during registration.' 
    });
  }
});

// POST /api/auth/resend-registration-otp — Resend registration verification code
router.post('/resend-registration-otp', async (req, res) => {
  const { email, tenantSlug } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

  try {
    let tenantId = null;
    if (tenantSlug && tenantSlug !== 'kainlowkal') {
      const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (t) tenantId = t.id;
    } else {
      const masterTenant = await prisma.tenant.findUnique({ where: { slug: 'kainlowkal' } });
      if (masterTenant) tenantId = masterTenant.id;
    }

    const user = await prisma.user.findFirst({
      where: { email, tenantId, isVerified: false }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'No unverified account found with this email.' });
    }

    // Generate brand new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpires: expires }
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    await sendOTPEmail(email, otp, tenant || {});

    res.json({ success: true, message: 'A new verification code has been sent to your Gmail!' });
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend verification code.' });
  }
});

// POST /api/auth/verify-registration — Complete signup
router.post('/verify-registration', async (req, res) => {
  const { email, otp, tenantSlug } = req.body;
  try {
    console.log('--- VERIFICATION ATTEMPT ---');
    console.log('Email:', email);
    console.log('OTP:', otp);
    console.log('TenantSlug:', tenantSlug);

    let tenantId = null;
    if (tenantSlug) {
      const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (t) tenantId = t.id;
    }
    console.log('Resolved TenantId:', tenantId);

    const user = await prisma.user.findFirst({
      where: { 
        email, 
        tenantId,
        otpCode: otp
      }
    });

    if (!user) {
      console.error('❌ User not found with these credentials');
      return res.status(401).json({ success: false, message: 'Invalid or expired code.' });
    }

    if (user.otpExpires < new Date()) {
      console.error('❌ OTP has expired');
      return res.status(401).json({ success: false, message: 'Code has expired. Please sign up again.' });
    }

    console.log('✅ User found, proceeding to verify');

    // Mark as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, otpCode: null, otpExpires: null },
      include: { tenant: true }
    });

    // Generate login token immediately after verification
    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role, tenantId: updatedUser.tenantId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        tenantId: updatedUser.tenantId,
        tenantName: updatedUser.tenant?.name,
        tenantSlug: updatedUser.tenant?.slug,
        points: updatedUser.points || 0
      }
    });
  } catch (error) {
    console.error('VERIFICATION CRASH:', error);
    res.status(500).json({ success: false, message: error.message || 'Verification failed.' });
  }
});

// POST /api/auth/register (admin only)
router.post('/register', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const { email, password, name, role, pin } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Email, password, and name are required.' });
    }

    const existing = await prisma.user.findFirst({ 
      where: { 
        email, 
        tenantId: req.tenantId // Use the active tenant context
      } 
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered in this store.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const hashedPin = pin ? await bcrypt.hash(pin, 12) : null;

    // SECURITY: Only superadmins can create other superadmins
    let finalRole = role || 'cashier';
    if (finalRole === 'superadmin' && req.user.role !== 'superadmin') {
      finalRole = 'admin';
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: finalRole,
        pin: hashedPin,
        points: 0,
        tenantId: req.tenantId // Bind to the active tenant context
      },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, points: true, tenantId: true }
    });

    await prisma.auditLog.create({
      data: { 
        tenantId: req.tenantId,
        userId: req.user.id, 
        action: 'create_user', 
        entityType: 'user', 
        entityId: user.id.toString(), 
        details: `Created user: ${name} (${finalRole}) for Tenant ID: ${req.tenantId}` 
      }
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const fullUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { tenant: true }
    });

    res.json({ 
      success: true, 
      data: {
        ...fullUser,
        isGoogle: fullUser.isGoogle,
        tenantName: fullUser.tenant?.name,
        tenantColor: fullUser.tenant?.primaryColor,
        tenantSecondaryColor: fullUser.tenant?.secondaryColor
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.isGoogle) {
      return res.status(400).json({ success: false, message: 'Password cannot be changed for Google accounts.' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Incorrect current password.' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword }
    });

    await prisma.auditLog.create({
      data: { 
        tenantId: user.tenantId || 1,
        userId: user.id, 
        action: 'change_password', 
        entityType: 'user', 
        entityId: user.id.toString(), 
        details: 'User changed their password' 
      }
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

module.exports = router;

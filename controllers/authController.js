const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../prisma/client');
const { JWT_SECRET } = require('../middleware/auth');
const logAudit = require('../middleware/audit');
const { sendResetEmail } = require('../utils/mailer');

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const provisionAccountSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'MANAGER', 'WORKER', 'USER']).optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordWithTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const updateMeSchema = z.object({
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().nullable(),
  password: z.string().min(6, 'New password must be at least 6 characters').optional(),
});

exports.login = async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      const secureFlag = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      // Loosened SameSite for functionality/appearance in local/http setups (images, fetches, etc. must work reliably).
      // Can tighten later.
      res.setHeader('Set-Cookie', [
        `proscape_token=${token}; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
      ]);

      res.json({ token });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { username: 'asc' },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
};

exports.provisionAccount = async (req, res, next) => {
  try {
    let { username, password, role } = provisionAccountSchema.parse(req.body);
    if (role === 'USER') {
      role = 'WORKER';
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash: hashedPassword,
        role: role || 'WORKER',
      },
      select: { id: true, username: true, role: true },
    });

    await logAudit(
      'USER',
      newUser.id,
      'ACCOUNT_PROVISIONED',
      `Created new ${role} access for ${username}.`
    );
    res.json(newUser);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    if (e.code === 'P2002') return res.status(400).json({ error: 'Username already exists.' });
    next(e);
  }
};

exports.resetPassword = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { newPassword } = resetPasswordSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { passwordHash: hashedPassword },
    });

    await logAudit(
      'USER',
      updatedUser.id,
      'PASSWORD_RESET',
      `Administrator reset password for ${updatedUser.username}.`
    );
    res.json({ success: true, message: 'Password reset successful.' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Set expiration to 1 hour from now
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: expires
      }
    });

    // Determine frontend URL
    const frontendUrl = req.headers.origin || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password.html?token=${resetToken}`;

    await sendResetEmail(user.email, resetLink);
    
    await logAudit('USER', user.id, 'PASSWORD_RESET_REQUESTED', `User requested a password reset via email.`);
    
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.resetPasswordWithToken = async (req, res, next) => {
  try {
    const { token, newPassword } = resetPasswordWithTokenSchema.parse(req.body);
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() } // Ensure token is not expired
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    await logAudit('USER', user.id, 'PASSWORD_RESET_COMPLETED', `User successfully reset their password via token.`);
    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const userId = parseInt(req.user.userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, phone: true, role: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    next(e);
  }
};

exports.updateMe = async (req, res, next) => {
  const userId = parseInt(req.user.userId);
  try {
    const { email, phone, password } = updateMeSchema.parse(req.body);
    const data = { email: email === '' ? null : email, phone };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, username: true, email: true, phone: true, role: true }
    });

    await logAudit('USER', userId, 'PROFILE_UPDATED', `User updated their own profile.`);
    res.json(updatedUser);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    if (e.code === 'P2002') return res.status(400).json({ error: 'Email already in use.' });
    next(e);
  }
};

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../prisma/client');
const { JWT_SECRET } = require('../middleware/auth');
const logAudit = require('../middleware/audit');
const { sendResetEmail } = require('../utils/mailer');

exports.login = async (req, res, next) => {
  const { username, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ token });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (e) {
    next(e);
  }
};

exports.getAllUsers = async (req, res, next) => {
  if (
    req.user.role !== 'ADMIN' &&
    req.user.username !== 'proscapeadmin' &&
    req.user.username !== 'admin'
  ) {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
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
  if (
    req.user.role !== 'ADMIN' &&
    req.user.username !== 'proscapeadmin' &&
    req.user.username !== 'admin'
  ) {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }

  const { username, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash: hashedPassword,
        role: role || 'USER',
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
    if (e.code === 'P2002') return res.status(400).json({ error: 'Username already exists.' });
    next(e);
  }
};

exports.resetPassword = async (req, res, next) => {
  if (
    req.user.role !== 'ADMIN' &&
    req.user.username !== 'proscapeadmin' &&
    req.user.username !== 'admin'
  ) {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }

  const { id } = req.params;
  const { newPassword } = req.body;

  try {
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
    next(e);
  }
};

exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
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
    next(e);
  }
};

exports.resetPasswordWithToken = async (req, res, next) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });

  try {
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
    next(e);
  }
};

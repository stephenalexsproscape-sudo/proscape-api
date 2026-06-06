const nodemailer = require('nodemailer');

/**
 * Proscape Mailer Utility
 * Configured for Ethereal Email (Dev Preview)
 * To use real SMTP, set EMAIL_USER/EMAIL_PASS in .env
 */

const getTransporter = async () => {
  // If real credentials are provided, use them
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.office365.com',
      port: 587,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Otherwise, create a temporary Ethereal account
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
};

const sendResetEmail = async (to, resetLink) => {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: '"Proscape CRM" <noreply@proscape.com>',
      to,
      subject: 'Password Reset Request',
      text: `Click the following link to reset your password: ${resetLink}`,
      html: `<p>Click the following link to reset your password:</p><a href="${resetLink}">${resetLink}</a>`
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`✉️ Email Preview: ${previewUrl}`);
    return previewUrl || true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

const sendStaffMessageEmail = async (to, senderName, content) => {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: '"Proscape Messaging" <messages@proscape.com>',
      to,
      subject: `New Message from ${senderName}`,
      text: `${senderName} sent you a message in Proscape:\n\n${content}`,
      html: `<p><strong>${senderName}</strong> sent you a message:</p><blockquote>${content}</blockquote><p><a href="http://192.168.10.104:3000">Log in to view</a></p>`
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`✉️ Staff Email Preview: ${previewUrl}`);
    return previewUrl || true;
  } catch (error) {
    console.error('Internal Email error:', error);
    return false;
  }
};

const sendExportEmail = async (csvContent) => {
  const adminEmail = 'stephen@alexsproscape.com';
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: '"Proscape System" <system@proscape.com>',
      to: adminEmail,
      subject: 'Proscape Jobs Export',
      text: 'Please find the attached CSV export of all current jobs.',
      attachments: [
        {
          filename: `proscape_jobs_export_${new Date().toISOString().split('T')[0]}.csv`,
          content: csvContent
        }
      ]
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`📊 Export Email Preview: ${previewUrl}`);
    return previewUrl || true;
  } catch (error) {
    console.error('Export Email error:', error);
    return false;
  }
};

module.exports = { sendResetEmail, sendStaffMessageEmail, sendExportEmail };

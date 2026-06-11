const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

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

const sendStaffMessageEmail = async (to, senderName, content, origin) => {
  const portalUrl = origin || process.env.FRONTEND_URL || 'http://localhost:5173'; // Override via FRONTEND_URL env for prod/Tailscale deployments
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: '"Proscape Messaging" <messages@proscape.com>',
      to,
      subject: `New Message from ${senderName}`,
      text: `${senderName} sent you a message in Proscape:\n\n${content}`,
      html: `<p><strong>${senderName}</strong> sent you a message:</p><blockquote>${content}</blockquote><p><a href="${portalUrl}">Log in to view</a></p>`
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
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.invalid'; // Set ADMIN_EMAIL in .env for production alerts
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

const sendJobCompletionEmail = async (to, clientName, ticketId, description, notes, attachments = []) => {
  try {
    const transporter = await getTransporter();
    const mailAttachments = attachments.map(att => ({
      filename: att.fileName,
      path: path.join(__dirname, '..', att.fileUrl)
    })).filter(att => fs.existsSync(att.path));

    const info = await transporter.sendMail({
      from: '"Proscape Notifications" <notifications@proscape.com>',
      to,
      subject: `✅ Job Done: Ticket #${ticketId} - ${clientName}`,
      text: `Hello ${clientName},\n\nWe have completed your service request.\n\nDescription: ${description}\nField Notes: ${notes || 'None'}\n\nThank you for choosing Proscape!`,
      html: `<h3>Hello ${clientName},</h3><p>We are pleased to inform you that we have completed your service request:</p><div style="background:#f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 1rem;"><strong>Ticket #${ticketId}</strong><br><strong>Description:</strong> ${description}<br><strong>Field Notes:</strong> ${notes || 'None'}</div><p>Thank you for choosing Proscape!</p>`,
      attachments: mailAttachments
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`✉️ Job Completion Email Preview: ${previewUrl}`);
    return previewUrl || true;
  } catch (error) {
    console.error('Job Completion Email error:', error);
    return false;
  }
};

const sendNewClientEmail = async (customer) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.invalid'; // Set ADMIN_EMAIL in .env for production alerts
  try {
    const transporter = await getTransporter();
    
    // Extract contact details if they exist
    const contact = customer.contacts?.[0] || {};
    const firstName = contact.firstName || '';
    const lastName = contact.lastName || '';
    const phone = contact.phone || 'N/A';
    const email = contact.email || 'N/A';
    
    const info = await transporter.sendMail({
      from: '"Proscape System" <system@proscape.com>',
      to: adminEmail,
      subject: `🆕 New Client Added: ${customer.displayName}`,
      text: `A new client has been added to the database.\n\n` +
            `Display Name: ${customer.displayName}\n` +
            `Contact Name: ${firstName} ${lastName}\n` +
            `Phone: ${phone}\n` +
            `Email: ${email}\n`,
      html: `<h3>🆕 New Client Added</h3>` +
            `<p>A new client has been added to the database:</p>` +
            `<div style="background:#f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 1rem;">` +
            `<strong>Display Name:</strong> ${customer.displayName}<br>` +
            `<strong>Contact Name:</strong> ${firstName} ${lastName}<br>` +
            `<strong>Phone:</strong> ${phone}<br>` +
            `<strong>Email:</strong> ${email}` +
            `</div>`
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`✉️ New Client Email Preview: ${previewUrl}`);
    return previewUrl || true;
  } catch (error) {
    console.error('New Client Email error:', error);
    return false;
  }
};

module.exports = { 
  sendResetEmail, 
  sendStaffMessageEmail, 
  sendExportEmail, 
  sendJobCompletionEmail,
  sendNewClientEmail
};


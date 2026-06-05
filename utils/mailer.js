const nodemailer = require('nodemailer');

// For development, we use ethereal.email or a simple console logger
// In production, configure with real SMTP credentials

const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: 'ethereal.user@ethereal.email', // Replace with real credentials in production
    pass: 'ethereal_password'
  }
});

const sendResetEmail = async (to, resetLink) => {
  try {
    // In a real environment, this actually sends the email.
    // For this prototype, we'll log the link to the console so we can test it locally.
    console.log('\n======================================================');
    console.log('🚨 MOCK EMAIL SENT');
    console.log(`To: ${to}`);
    console.log(`Subject: Password Reset Request`);
    console.log(`Body: Click the following link to reset your password:`);
    console.log(`${resetLink}`);
    console.log('======================================================\n');
    
    // Example of actual sending logic (disabled for local dev without real creds):
    /*
    await transporter.sendMail({
      from: '"Proscape CRM" <noreply@proscape.com>',
      to,
      subject: 'Password Reset Request',
      text: `Click the following link to reset your password: ${resetLink}`,
      html: `<p>Click the following link to reset your password:</p><a href="${resetLink}">${resetLink}</a>`
    });
    */
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

const sendStaffMessageEmail = async (to, senderName, content) => {
  try {
    console.log('\n======================================================');
    console.log('🚨 MOCK INTERNAL EMAIL SENT');
    console.log(`To: ${to}`);
    console.log(`From: ${senderName}`);
    console.log(`Subject: New Proscape Message from ${senderName}`);
    console.log(`Body: ${content}`);
    console.log('======================================================\n');

    /*
    await transporter.sendMail({
      from: '"Proscape Messaging" <messages@proscape.com>',
      to,
      subject: `New Message from ${senderName}`,
      text: `${senderName} sent you a message in Proscape:\n\n${content}`,
      html: `<p><strong>${senderName}</strong> sent you a message:</p><blockquote>${content}</blockquote><p><a href="http://192.168.10.114:3000">Log in to view</a></p>`
    });
    */
    return true;
  } catch (error) {
    console.error('Internal Email error:', error);
    return false;
  }
};

const sendExportEmail = async (csvContent) => {
  const adminEmail = 'stephen@alexsproscape.com';
  try {
    console.log('\n======================================================');
    console.log('🚨 MOCK EXPORT EMAIL SENT');
    console.log(`To: ${adminEmail}`);
    console.log(`Subject: Proscape Jobs Export`);
    console.log(`Body: Attached is the current jobs export.`);
    console.log('======================================================\n');

    /*
    await transporter.sendMail({
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
    */
    return true;
  } catch (error) {
    console.error('Export Email error:', error);
    return false;
  }
};

module.exports = { sendResetEmail, sendStaffMessageEmail, sendExportEmail };

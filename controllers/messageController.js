const prisma = require('../prisma/client');
const { z } = require('zod');
const { sendStaffMessageEmail } = require('../utils/mailer');

const sendMessageSchema = z.object({
  receiverId: z.coerce.number(),
  content: z.string().min(1, 'Message content is required'),
  sendEmail: z.boolean().optional(),
  sendSms: z.boolean().optional(),
});

exports.getInbox = async (req, res, next) => {
  try {
    const userId = parseInt(req.user.userId);
    console.log(`[MSG] Loading inbox for user #${userId}`);
    
    const messages = await prisma.internalMessage.findMany({
      where: { receiverId: userId },
      include: {
        sender: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(messages);
  } catch (e) {
    console.error('[MSG INBOX ERROR]', e);
    next(e);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const userId = parseInt(req.user.userId);
    const count = await prisma.internalMessage.count({
      where: { receiverId: userId, isRead: false },
    });
    res.json({ count });
  } catch (e) {
    next(e);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const validatedData = sendMessageSchema.parse(req.body);
    const { receiverId, content, sendEmail, sendSms } = validatedData;
    const senderId = parseInt(req.user.userId);
    
    console.log(`[MSG] Sending message from #${senderId} to #${receiverId}`);

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
        console.warn(`[MSG] Recipient #${receiverId} not found`);
        return res.status(404).json({ error: 'Recipient not found' });
    }

    const message = await prisma.internalMessage.create({
      data: {
        senderId,
        receiverId,
        content,
        sentViaEmail: !!sendEmail,
        sentViaSms: !!sendSms,
      },
      include: {
        sender: { select: { username: true } }
      }
    });

    console.log(`[MSG] Message #${message.id} saved to DB`);

    if (sendEmail && receiver.email) {
      console.log(`[MSG] Triggering email notification to ${receiver.email}`);
      await sendStaffMessageEmail(receiver.email, message.sender.username, content);
    }

    res.json(message);
  } catch (e) {
    console.error('[MSG SEND ERROR]', e);
    next(e);
  }
};

exports.markAsRead = async (req, res, next) => {
  const messageId = parseInt(req.params.id);
  const userId = parseInt(req.user.userId);

  try {
    const message = await prisma.internalMessage.findFirst({
      where: { id: messageId, receiverId: userId }
    });

    if (!message) return res.status(404).json({ error: 'Message not found' });

    await prisma.internalMessage.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

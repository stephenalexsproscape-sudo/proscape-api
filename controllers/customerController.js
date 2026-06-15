const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');
const { z } = require('zod');
const { enqueue } = require('../utils/queue');

const createCustomerSchema = z.object({
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  displayName: z.string().optional().nullable(),
});

const updateCustomerProfileSchema = z.object({
  displayName: z.string().optional(),
  companyId: z.coerce.number().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  street1: z.string().optional().nullable(),
});

const updateSiteSpecsSchema = z.object({
  snowTrigger: z.string().optional().nullable(),
  gateCode: z.string().optional().nullable(),
  mulchYardage: z.coerce.number().optional().nullable(),
  propertyNotes: z.string().optional().nullable(),
  customSpecs: z.record(z.any()).optional().nullable(),
});

exports.getStats = async (req, res, next) => {
  try {
    const count = await prisma.customer.count();
    res.json({ totalCustomers: count });
  } catch (e) {
    next(e);
  }
};

exports.searchCustomers = async (req, res, next) => {
  const { query } = req.query;
  if (!query || query.length < 2) return res.json([]);

  try {
    const results = await prisma.customer.findMany({
      where: {
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { company: { name: { contains: query, mode: 'insensitive' } } },
          { contacts: { some: { firstName: { contains: query, mode: 'insensitive' } } } },
          { contacts: { some: { lastName: { contains: query, mode: 'insensitive' } } } },
          { addresses: { some: { street1: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        company: true,
        contacts: { where: { isPrimary: true } },
        addresses: { where: { type: 'SERVICE' } },
      },
      take: 20,
    });

    const prioritized = results.sort((a, b) => {
      const aMatch = a.displayName.toLowerCase().startsWith(query.toLowerCase());
      const bMatch = b.displayName.toLowerCase().startsWith(query.toLowerCase());
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });

    res.json(prioritized);
  } catch (e) {
    next(e);
  }
};

exports.getAllCustomers = async (req, res, next) => {
  const { companyId, brief } = req.query;
  try {
    const whereClause = companyId ? { companyId: parseInt(companyId) } : {};
    
    let queryOptions = {
      where: whereClause,
      orderBy: { displayName: 'asc' },
    };

    if (brief === 'true') {
      queryOptions.select = {
        id: true,
        displayName: true,
        company: {
          select: {
            name: true
          }
        }
      };
    } else {
      queryOptions.include = {
        company: true,
        contacts: { where: { isPrimary: true } },
        addresses: { where: { type: 'SERVICE' } },
      };
    }

    const customers = await prisma.customer.findMany(queryOptions);
    res.json(customers);
  } catch (e) {
    next(e);
  }
};

exports.getCustomerById = async (req, res, next) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid Customer ID' });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        company: true,
        contacts: true,
        addresses: true,
        messages: { orderBy: { createdAt: 'desc' } },
        serviceRequests: { orderBy: { dateReceived: 'desc' } },
        siteSpec: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (e) {
    next(e);
  }
};

exports.createCustomer = async (req, res, next) => {
  try {
    const validatedData = createCustomerSchema.parse(req.body);
    const { firstName, lastName, phone, email, displayName } = validatedData;

    const finalDisplayName = displayName || `${lastName}, ${firstName}`;
    const newCustomer = await prisma.customer.create({
      data: {
        displayName: finalDisplayName,
        contacts: {
          create: { firstName, lastName, phone, email, isPrimary: true },
        },
      },
    });

    await logAudit(
      'CUSTOMER',
      newCustomer.id,
      'CREATED',
      `Created new record: ${finalDisplayName}`
    );

    // Send email alert to admin via background queue (Phase 2)
    const fullCust = await prisma.customer.findUnique({
      where: { id: newCustomer.id },
      include: { contacts: true }
    });
    enqueue({ type: 'new-client-email', data: { customer: fullCust } });

    res.json(newCustomer);
  } catch (e) {
    next(e);
  }
};

exports.updateCustomerProfile = async (req, res, next) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid Customer ID' });
  }

  try {
    const validatedData = updateCustomerProfileSchema.parse(req.body);
    const { displayName, companyId, phone, email, street1 } = validatedData;

    const oldCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { contacts: { where: { isPrimary: true } }, addresses: { where: { type: 'SERVICE' } } },
    });

    if (!oldCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        displayName,
        companyId: companyId,
      },
    });

    const primaryContact = await prisma.contact.findFirst({
      where: { customerId, isPrimary: true },
    });
    if (primaryContact) {
      await prisma.contact.update({
        where: { id: primaryContact.id },
        data: { phone, email },
      });
    }

    const serviceAddress = await prisma.address.findFirst({
      where: { customerId, type: 'SERVICE' },
    });
    if (serviceAddress) {
      await prisma.address.update({
        where: { id: serviceAddress.id },
        data: { street1 },
      });
    } else if (street1 && street1.trim() !== '') {
      await prisma.address.create({
        data: { customerId, street1, type: 'SERVICE' },
      });
    }

    const newCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { contacts: { where: { isPrimary: true } }, addresses: { where: { type: 'SERVICE' } } },
    });

    await logAudit(
      'CUSTOMER',
      customerId,
      'PROFILE_EDITED',
      `Updated core profile details via Client Editor.`,
      oldCustomer,
      newCustomer
    );
    res.json({ success: true, customer: updatedCustomer });
  } catch (e) {
    next(e);
  }
};

exports.updateSiteSpecs = async (req, res, next) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid Customer ID' });
  }

  try {
    const validatedData = updateSiteSpecsSchema.parse(req.body);
    const { snowTrigger, gateCode, mulchYardage, propertyNotes, customSpecs } = validatedData;

    const customerExists = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customerExists) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const spec = await prisma.siteSpec.upsert({
      where: { customerId },
      update: {
        snowTrigger,
        gateCode,
        mulchYardage: mulchYardage,
        propertyNotes,
        customSpecs: customSpecs || undefined,
      },
      create: {
        customerId,
        snowTrigger,
        gateCode,
        mulchYardage: mulchYardage,
        propertyNotes,
        customSpecs: customSpecs || undefined,
      },
    });

    await logAudit('CUSTOMER', customerId, 'SPECS_UPDATED', `Updated operational site specs.`);
    res.json(spec);
  } catch (e) {
    next(e);
  }
};

exports.getAllCompanies = async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    res.json(companies);
  } catch (e) {
    next(e);
  }
};

exports.proposeSiteSpecs = async (req, res, next) => {
  const customerId = parseInt(req.params.id);
  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid Customer ID' });
  }

  try {
    const validatedData = updateSiteSpecsSchema.parse(req.body);
    const { snowTrigger, gateCode, mulchYardage, propertyNotes, customSpecs } = validatedData;

    const customerExists = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customerExists) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const content = `Worker "${req.user.username}" proposed a site spec update for client "${customerExists.displayName}" (ID: ${customerId}):\n` +
      `- Snow Trigger: ${snowTrigger || '--'}\n` +
      `- Gate Code: ${gateCode || '--'}\n` +
      `- Mulch Yardage: ${mulchYardage || '--'}\n` +
      `- Property Notes: ${propertyNotes || '--'}\n` +
      `- Custom Specs: ${customSpecs ? JSON.stringify(customSpecs) : '--'}`;

    const adminsAndManagers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER'] }
      }
    });

    for (const mgr of adminsAndManagers) {
      await prisma.internalMessage.create({
        data: {
          senderId: parseInt(req.user.userId),
          receiverId: mgr.id,
          content,
        }
      });
    }

    await logAudit(
      'CUSTOMER',
      customerId,
      'SPEC_PROPOSAL',
      `Worker ${req.user.username} proposed specs update.`,
      null,
      null,
      req.user.userId,
      req.user.role
    );

    res.json({ success: true, message: 'Proposal submitted successfully' });
  } catch (e) {
    next(e);
  }
};

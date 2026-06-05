const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');
const { z } = require('zod');

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
  const { companyId } = req.query;
  try {
    const whereClause = companyId ? { companyId: parseInt(companyId) } : {};
    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        company: true,
        contacts: { where: { isPrimary: true } },
        addresses: { where: { type: 'SERVICE' } },
      },
      orderBy: { displayName: 'asc' },
    });
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
    const { snowTrigger, gateCode, mulchYardage, propertyNotes } = validatedData;

    const spec = await prisma.siteSpec.upsert({
      where: { customerId },
      update: {
        snowTrigger,
        gateCode,
        mulchYardage: mulchYardage,
        propertyNotes,
      },
      create: {
        customerId,
        snowTrigger,
        gateCode,
        mulchYardage: mulchYardage,
        propertyNotes,
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

const prisma = require('../prisma/client');
const { z } = require('zod');

const crewSchema = z.object({
  name: z.string().min(1, 'Crew name is required'),
  color: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const jobCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  icon: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.number()),
});

// --- CREWS ---
exports.getCrews = async (req, res, next) => {
  try {
    const crews = await prisma.crew.findMany({
      orderBy: [ { sortOrder: 'asc' }, { name: 'asc' } ],
    });
    res.json(crews);
  } catch (e) {
    next(e);
  }
};

exports.createCrew = async (req, res, next) => {
  try {
    const { name, color, isActive } = crewSchema.parse(req.body);
    const crew = await prisma.crew.create({
      data: { name, color, isActive: isActive !== undefined ? isActive : true },
    });
    res.json(crew);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    if (e.code === 'P2002') return res.status(400).json({ error: 'Crew name already exists.' });
    next(e);
  }
};

exports.updateCrew = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { name, color, isActive } = crewSchema.parse(req.body);
    const crew = await prisma.crew.update({
      where: { id: parseInt(id) },
      data: { name, color, isActive },
    });
    res.json(crew);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.deleteCrew = async (req, res, next) => {
  const { id } = req.params;
  try {
    await prisma.crew.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

exports.reorderCrews = async (req, res, next) => {
  try {
    const { ids } = reorderSchema.parse(req.body);
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.crew.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );
    res.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

// --- JOB CATEGORIES ---
exports.getJobCategories = async (req, res, next) => {
  try {
    const categories = await prisma.jobCategory.findMany({
      orderBy: [ { sortOrder: 'asc' }, { name: 'asc' } ],
    });
    res.json(categories);
  } catch (e) {
    next(e);
  }
};

exports.createJobCategory = async (req, res, next) => {
  try {
    const { name, icon, isActive } = jobCategorySchema.parse(req.body);
    const category = await prisma.jobCategory.create({
      data: { name, icon, isActive: isActive !== undefined ? isActive : true },
    });
    res.json(category);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    if (e.code === 'P2002') return res.status(400).json({ error: 'Category name already exists.' });
    next(e);
  }
};

exports.updateJobCategory = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { name, icon, isActive } = jobCategorySchema.parse(req.body);
    const category = await prisma.jobCategory.update({
      where: { id: parseInt(id) },
      data: { name, icon, isActive },
    });
    res.json(category);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.deleteJobCategory = async (req, res, next) => {
  const { id } = req.params;
  try {
    await prisma.jobCategory.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

exports.reorderJobCategories = async (req, res, next) => {
  try {
    const { ids } = reorderSchema.parse(req.body);
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.jobCategory.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );
    res.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

// --- STAFF ---
exports.getStaff = async (req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      select: { id: true, username: true, email: true, phone: true },
      orderBy: { username: 'asc' },
    });
    res.json(staff);
  } catch (e) {
    next(e);
  }
};

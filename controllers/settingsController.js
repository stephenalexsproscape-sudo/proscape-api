const prisma = require('../prisma/client');

// --- CREWS ---
exports.getCrews = async (req, res, next) => {
  try {
    const crews = await prisma.crew.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(crews);
  } catch (e) {
    next(e);
  }
};

exports.createCrew = async (req, res, next) => {
  const { name, color, isActive } = req.body;
  try {
    const crew = await prisma.crew.create({
      data: { name, color, isActive: isActive !== undefined ? isActive : true },
    });
    res.json(crew);
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Crew name already exists.' });
    next(e);
  }
};

exports.updateCrew = async (req, res, next) => {
  const { id } = req.params;
  const { name, color, isActive } = req.body;
  try {
    const crew = await prisma.crew.update({
      where: { id: parseInt(id) },
      data: { name, color, isActive },
    });
    res.json(crew);
  } catch (e) {
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

// --- JOB CATEGORIES ---
exports.getJobCategories = async (req, res, next) => {
  try {
    const categories = await prisma.jobCategory.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (e) {
    next(e);
  }
};

exports.createJobCategory = async (req, res, next) => {
  const { name, icon, isActive } = req.body;
  try {
    const category = await prisma.jobCategory.create({
      data: { name, icon, isActive: isActive !== undefined ? isActive : true },
    });
    res.json(category);
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Category name already exists.' });
    next(e);
  }
};

exports.updateJobCategory = async (req, res, next) => {
  const { id } = req.params;
  const { name, icon, isActive } = req.body;
  try {
    const category = await prisma.jobCategory.update({
      where: { id: parseInt(id) },
      data: { name, icon, isActive },
    });
    res.json(category);
  } catch (e) {
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

// --- STAFF ---
exports.getStaff = async (req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      select: { id: true, username: true, email: true, phone: true },
      where: { email: { not: null } },
      orderBy: { username: 'asc' },
    });
    res.json(staff);
  } catch (e) {
    next(e);
  }
};

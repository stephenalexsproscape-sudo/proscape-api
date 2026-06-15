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
      select: { id: true, username: true, email: true, phone: true, role: true, crewId: true },
      orderBy: { username: 'asc' },
    });
    res.json(staff);
  } catch (e) {
    next(e);
  }
};

const updateStaffSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'WORKER', 'USER']).optional(),
  crewId: z.coerce.number().optional().nullable(),
});

exports.updateStaff = async (req, res, next) => {
  const staffId = parseInt(req.params.id);
  if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid Staff ID' });

  try {
    const { role, crewId } = updateStaffSchema.parse(req.body);
    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: {
        role,
        crewId: crewId || null,
      },
      select: { id: true, username: true, email: true, phone: true, role: true, crewId: true }
    });

    await logAudit('USER', staffId, 'STAFF_MEMBER_UPDATED', `Updated staff member ${updatedUser.username}: role=${role}, crewId=${crewId}`);
    res.json(updatedUser);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

// --- CALENDAR NOTE COLORS ---
const { getSettings, saveSettings } = require('../utils/settings');

const noteColorsSchema = z.object({
  DELIVERY: z.object({ bg: z.string(), border: z.string().optional() }),
  VACATION: z.object({ bg: z.string(), border: z.string().optional() }),
  EVENT: z.object({ bg: z.string(), border: z.string().optional() }),
  OTHER: z.object({ bg: z.string(), border: z.string().optional() }),
});

exports.getNoteColors = async (req, res, next) => {
  try {
    const settings = getSettings();
    res.json(settings.noteColors);
  } catch (e) {
    next(e);
  }
};

exports.updateNoteColors = async (req, res, next) => {
  try {
    const parsed = noteColorsSchema.parse(req.body);
    // Derive border color from background color if not provided
    for (const key of Object.keys(parsed)) {
      if (!parsed[key].border) {
        parsed[key].border = parsed[key].bg;
      }
    }
    const settings = getSettings();
    settings.noteColors = parsed;
    saveSettings(settings);
    res.json({ success: true, noteColors: parsed });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

// --- EMPLOYEES (CSV UPLOAD & LIST) ---
exports.getEmployees = async (req, res, next) => {
  try {
    const settings = getSettings();
    res.json(settings.employees || []);
  } catch (e) {
    next(e);
  }
};

exports.uploadEmployees = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });

  const fs = require('fs');
  const csv = require('csv-parser');
  const employees = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      const keys = Object.keys(row);
      let id = '';
      let name = '';
      let phone = '';
      keys.forEach(k => {
        const kl = k.trim().toLowerCase();
        if (kl === 'id') id = row[k].trim();
        else if (kl === 'name') name = row[k].trim();
        else if (kl === 'phone') phone = row[k].trim();
      });
      if (id && name) {
        employees.push({ id, name, phone });
      }
    })
    .on('end', () => {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        const settings = getSettings();
        settings.employees = employees;
        saveSettings(settings);

        res.json({ success: true, employees });
      } catch (e) {
        next(e);
      }
    })
    .on('error', (err) => {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      next(err);
    });
};

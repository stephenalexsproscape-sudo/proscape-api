const prisma = require('../prisma/client');
const { z } = require('zod');

const calendarNoteSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  noteType: z.string().default('OTHER'),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
});

const updateCalendarNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional().nullable(),
  noteType: z.string().optional(),
  startDate: z.string().transform((str) => new Date(str)).optional(),
  endDate: z.string().transform((str) => new Date(str)).optional(),
});

exports.getCalendarNotes = async (req, res, next) => {
  try {
    const notes = await prisma.calendarNote.findMany({
      orderBy: { startDate: 'asc' },
    });
    res.json(notes);
  } catch (e) {
    next(e);
  }
};

exports.createCalendarNote = async (req, res, next) => {
  try {
    const data = calendarNoteSchema.parse(req.body);
    const note = await prisma.calendarNote.create({
      data,
    });
    res.json(note);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: e.errors });
    }
    next(e);
  }
};

exports.updateCalendarNote = async (req, res, next) => {
  const { id } = req.params;
  try {
    const data = updateCalendarNoteSchema.parse(req.body);
    const note = await prisma.calendarNote.update({
      where: { id: parseInt(id) },
      data,
    });
    res.json(note);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: e.errors });
    }
    next(e);
  }
};

exports.deleteCalendarNote = async (req, res, next) => {
  const { id } = req.params;
  try {
    await prisma.calendarNote.delete({
      where: { id: parseInt(id) },
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

const errorHandler = (err, req, res, _next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error(err.stack || err);
  }

  // Handle Zod Validation Errors
  if (err.name === 'ZodError' || err instanceof Error && err.constructor.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors ? err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })) : err.message,
    });
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    // Handle unique constraint violations
    if (err.code === 'P2002') {
      return res.status(400).json({
        error: 'Unique constraint failed',
        field: err.meta?.target || 'unknown',
      });
    }
    // Handle record not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Record not found',
        message: err.meta?.cause || 'The requested record does not exist.',
      });
    }
    // Handle foreign key constraint failed
    if (err.code === 'P2003') {
      return res.status(400).json({
        error: 'Foreign key constraint failed',
        field: err.meta?.field_name || 'unknown',
      });
    }
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
  });
};

module.exports = errorHandler;

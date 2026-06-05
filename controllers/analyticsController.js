const prisma = require('../prisma/client');

exports.getPerformanceStats = async (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  try {
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - 30);
    
    const end = endDate ? new Date(endDate) : new Date();
    // Ensure end of day for the end date
    end.setHours(23, 59, 59, 999);

    // 1. Ticket Status Distribution (Current State)
    const statusCounts = await prisma.serviceRequest.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    // 2. Recent Job Completions (Filtered by Date)
    const recentCompletions = await prisma.serviceRequest.count({
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: start, lte: end },
      },
    });

    // 3. Lead Source Distribution (Filtered by Date)
    const leadSources = await prisma.serviceRequest.groupBy({
      by: ['clientConnection'],
      where: {
        dateReceived: { gte: start, lte: end },
      },
      _count: { id: true },
    });

    // 4. Crew Workload (Current Open Tickets)
    const crewWorkload = await prisma.serviceRequest.groupBy({
      by: ['assignedTo'],
      where: { status: 'OPEN' },
      _count: { id: true },
    });

    res.json({
      statusCounts,
      recentCompletions,
      leadSources,
      crewWorkload,
      period: { start, end }
    });
  } catch (e) {
    next(e);
  }
};

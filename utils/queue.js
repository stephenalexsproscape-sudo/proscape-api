/**
 * Simple in-process background job queue for Phase 2.
 * 
 * Purpose: Unblock API responses for side-effects like emails, SMS logs,
 * recurring job creation, exports, etc.
 * 
 * This is a lightweight implementation (no Redis/BullMQ yet) to keep
 * setup simple and usability high. Jobs are processed sequentially
 * with error isolation.
 * 
 * For production scale, replace with BullMQ + Redis as noted in deep-dive.
 * 
 * Usage:
 *   const { enqueue, registerHandler } = require('./utils/queue');
 *   registerHandler('completion-email', async (data) => { await mailer... });
 *   enqueue({ type: 'completion-email', data: { ... } });
 */

const queue = [];
let isProcessing = false;
const handlers = {};

function registerHandler(type, handlerFn) {
  if (typeof handlerFn !== 'function') {
    throw new Error(`Handler for ${type} must be a function`);
  }
  handlers[type] = handlerFn;
  console.log(`[Queue] Registered handler for type: ${type}`);
}

async function processNext() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;
  const job = queue.shift();

  try {
    const handler = handlers[job.type];
    if (handler) {
      console.log(`[Queue] Processing job: ${job.type}`);
      await handler(job.data || {});
      console.log(`[Queue] Completed job: ${job.type}`);
    } else {
      console.warn(`[Queue] No handler registered for job type: ${job.type}`);
    }
  } catch (err) {
    console.error(`[Queue] Error processing ${job.type}:`, err.message);
    // In real queue we'd retry or dead-letter; here we just log for simplicity
  } finally {
    isProcessing = false;
    // Continue processing remaining jobs (non-blocking)
    setImmediate(processNext);
  }
}

function enqueue(job) {
  if (!job || !job.type) {
    console.error('[Queue] Invalid job enqueued, must have type');
    return;
  }
  queue.push(job);
  console.log(`[Queue] Enqueued job: ${job.type} (queue size: ${queue.length})`);
  // Kick off processing if idle
  setImmediate(processNext);
}

// Optional: expose for monitoring/debug
function getQueueStatus() {
  return {
    size: queue.length,
    processing: isProcessing,
    registeredHandlers: Object.keys(handlers)
  };
}

module.exports = {
  enqueue,
  registerHandler,
  getQueueStatus
};
// server/jobs/queue.js
// Simple in-memory job queue with retry logic
// Swap to BullMQ + Redis when you outgrow this (~100+ jobs/day)

export class JobQueue {
  constructor(name, { concurrency = 2, retries = 3, retryDelay = 5000 } = {}) {
    this.name = name;
    this.concurrency = concurrency;
    this.maxRetries = retries;
    this.retryDelay = retryDelay;

    this.queue = [];
    this.active = 0;
    this.processed = 0;
    this.failed = 0;
    this.handlers = new Map();
    
    // Track recent jobs for status lookups
    this.jobHistory = new Map(); // jobId -> job (last 100)
  }

  // Register a handler for a job type
  process(jobType, handler) {
    this.handlers.set(jobType, handler);
  }

  // Add a job to the queue
  add(jobType, data, { priority = 0 } = {}) {
    const job = {
      id: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: jobType,
      data,
      priority,
      attempts: 0,
      maxRetries: this.maxRetries,
      status: 'queued',
      createdAt: Date.now(),
      error: null,
      result: null,
    };

    this.queue.push(job);
    // Sort by priority (higher = first)
    this.queue.sort((a, b) => b.priority - a.priority);
    
    // Track in history
    this._trackJob(job);

    console.log(`[${this.name}] Job queued: ${job.id} (type: ${jobType})`);
    this._tick();
    return job;
  }

  // Get job by ID (for status polling)
  getJob(jobId) {
    // Check queue first
    const queued = this.queue.find(j => j.id === jobId);
    if (queued) return queued;
    // Check history
    return this.jobHistory.get(jobId) || null;
  }

  _trackJob(job) {
    this.jobHistory.set(job.id, job);
    // Keep only last 100 jobs
    if (this.jobHistory.size > 100) {
      const oldest = this.jobHistory.keys().next().value;
      this.jobHistory.delete(oldest);
    }
  }

  // Process next jobs up to concurrency limit
  async _tick() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this.active++;
      this._execute(job);
    }
  }

  async _execute(job) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      console.error(`[${this.name}] No handler for job type: ${job.type}`);
      job.status = 'failed';
      job.error = `No handler for job type: ${job.type}`;
      this.active--;
      this.failed++;
      this._tick();
      return;
    }

    job.attempts++;
    job.status = 'active';
    console.log(`[${this.name}] Processing: ${job.id} (attempt ${job.attempts}/${job.maxRetries + 1})`);

    try {
      const result = await handler(job.data, job);
      job.status = 'completed';
      job.result = result;
      this.processed++;
      console.log(`[${this.name}] Completed: ${job.id}`);
    } catch (err) {
      console.error(`[${this.name}] Failed: ${job.id} — ${err.message}`);
      job.error = err.message;

      if (job.attempts <= job.maxRetries) {
        job.status = 'retrying';
        const delay = this.retryDelay * job.attempts; // Exponential backoff
        console.log(`[${this.name}] Retrying ${job.id} in ${delay}ms...`);
        setTimeout(() => {
          this.queue.unshift(job); // Add back to front
          this._tick();
        }, delay);
      } else {
        job.status = 'failed';
        this.failed++;
        console.error(`[${this.name}] Permanently failed: ${job.id} after ${job.attempts} attempts`);
      }
    } finally {
      this.active--;
      this._tick();
    }
  }

  getStats() {
    return {
      name: this.name,
      queued: this.queue.length,
      active: this.active,
      processed: this.processed,
      failed: this.failed,
    };
  }
}

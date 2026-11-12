const router = require('express').Router();
const { pool } = require('../db/postgres');
const { Task } = require('../db/mongo');

const STATUSES = ['planned', 'active', 'completed'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toId = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Create a sprint
router.post('/', async (req, res, next) => {
  try {
    const { name, goal, start_date, end_date } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    if (!DATE.test(start_date || '') || !DATE.test(end_date || '')) {
      return res.status(400).json({ error: 'start_date and end_date must be YYYY-MM-DD' });
    }
    if (end_date < start_date) return res.status(400).json({ error: 'end_date must not be before start_date' });
    const { rows } = await pool.query(
      `INSERT INTO sprints (name, goal, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING *`,
      [String(name).trim(), goal || null, start_date, end_date]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'a sprint with this name already exists' });
    next(err);
  }
});

// List sprints (newest first)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sprints ORDER BY start_date DESC, id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

// Change status: planned | active | completed
router.patch('/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    if (!STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query('UPDATE sprints SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, id]);
    if (!rows.length) return res.status(404).json({ error: 'sprint not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete a sprint and all of its tasks (SQL row + Mongo documents)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const { rows } = await pool.query('DELETE FROM sprints WHERE id=$1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'sprint not found' });
    const { deletedCount } = await Task.deleteMany({ sprintId: id });
    res.json({ deleted: id, tasksDeleted: deletedCount });
  } catch (err) { next(err); }
});

// Progress summary: sprint (PostgreSQL) + task statistics (MongoDB)
router.get('/:id/summary', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const { rows } = await pool.query('SELECT * FROM sprints WHERE id=$1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'sprint not found' });

    const docs = await Task.find({ sprintId: id }).select('status storyPoints').lean();
    const tasks = { todo: 0, in_progress: 0, done: 0 };
    const points = { todo: 0, in_progress: 0, done: 0 };
    docs.forEach((d) => { tasks[d.status] += 1; points[d.status] += d.storyPoints || 0; });
    const totalPoints = points.todo + points.in_progress + points.done;

    res.json({
      sprint: rows[0],
      tasks,
      points: { ...points, total: totalPoints },
      percentComplete: totalPoints ? Math.round((points.done / totalPoints) * 100) : 0,
    });
  } catch (err) { next(err); }
});

module.exports = router;

const router = require('express').Router();
const { pool } = require('../db/postgres');
const { Task, mongoose } = require('../db/mongo');

const STATUSES = ['todo', 'in_progress', 'done'];
const validId = (id) => mongoose.isValidObjectId(id);

// Create a task (checks the sprint exists in PostgreSQL first)
router.post('/', async (req, res, next) => {
  try {
    const { title, description, status, storyPoints, assignee } = req.body;
    const sprintId = Number(req.body.sprintId);
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
    if (!Number.isInteger(sprintId) || sprintId < 1) return res.status(400).json({ error: 'sprintId is required' });
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
    if (storyPoints !== undefined && !(Number.isInteger(storyPoints) && storyPoints >= 0 && storyPoints <= 100)) {
      return res.status(400).json({ error: 'storyPoints must be an integer 0-100' });
    }
    const sprint = await pool.query('SELECT 1 FROM sprints WHERE id=$1', [sprintId]);
    if (!sprint.rowCount) return res.status(404).json({ error: 'sprint not found' });

    const task = await Task.create({ title, description, status, storyPoints, assignee, sprintId });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

// List tasks (?sprintId= &status=)
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.sprintId) filter.sprintId = Number(req.query.sprintId);
    if (req.query.status) filter.status = req.query.status;
    res.json(await Task.find(filter).sort({ createdAt: 1 }));
  } catch (err) { next(err); }
});

// Update a task (title, description, status, storyPoints, assignee)
router.patch('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const allowed = ['title', 'description', 'status', 'storyPoints', 'assignee'];
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.json(task);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'invalid id' });
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;

const router = require('express').Router();
const { pool } = require('../db/postgres');
const { isMongoUp } = require('../db/mongo');

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    if (!isMongoUp()) throw new Error('MongoDB not connected');
    res.json({ status: 'ready', postgres: 'up', mongo: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

module.exports = router;

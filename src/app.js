const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
}));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.use(express.static(path.join(__dirname, '..', 'public')));   // web UI
app.use('/', require('./routes/health'));
app.use('/api/sprints', require('./routes/sprints'));
app.use('/api/tasks', require('./routes/tasks'));

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
  const status = ['ValidationError', 'CastError'].includes(err.name) ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'internal server error' : err.message });
});

module.exports = app;

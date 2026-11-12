process.env.NODE_ENV = 'test';

jest.mock('../src/db/postgres', () => ({ pool: { query: jest.fn() }, initSchema: jest.fn() }));
jest.mock('../src/db/mongo', () => ({
  Task: { create: jest.fn(), find: jest.fn(), findByIdAndUpdate: jest.fn(),
          findByIdAndDelete: jest.fn(), deleteMany: jest.fn() },
  mongoose: { isValidObjectId: (v) => /^[a-f\d]{24}$/i.test(v), connection: { readyState: 1 } },
  isMongoUp: () => true,
  connectMongo: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/postgres');
const { Task } = require('../src/db/mongo');

const OID = 'a'.repeat(24);
beforeEach(() => jest.resetAllMocks());

describe('health + UI', () => {
  it('serves the web UI', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SprintBoard');
  });
  it('/health is ok', async () => expect((await request(app).get('/health')).status).toBe(200));
  it('/ready is 503 when PostgreSQL is down', async () => {
    pool.query.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/ready')).status).toBe(503);
  });
});

describe('sprints', () => {
  const valid = { name: 'S1', start_date: '2026-11-16', end_date: '2026-11-27' };
  it('creates a sprint', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, ...valid }] });
    const res = await request(app).post('/api/sprints').send(valid);
    expect(res.status).toBe(201);
  });
  it('validates input', async () => {
    expect((await request(app).post('/api/sprints').send({ name: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/sprints').send({ ...valid, end_date: '2026-11-01' })).status).toBe(400);
  });
  it('returns 409 for duplicate names', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    expect((await request(app).post('/api/sprints').send(valid)).status).toBe(409);
  });
  it('rejects bad status and unknown sprint', async () => {
    expect((await request(app).patch('/api/sprints/1').send({ status: 'nope' })).status).toBe(400);
    pool.query.mockResolvedValue({ rows: [] });
    expect((await request(app).patch('/api/sprints/9').send({ status: 'active' })).status).toBe(404);
  });
  it('summary combines SQL and Mongo data', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, name: 'S1' }] });
    const docs = [{ status: 'done', storyPoints: 1 }, { status: 'done', storyPoints: 2 }, { status: 'todo', storyPoints: 5 }];
    Task.find.mockReturnValue({ select: () => ({ lean: async () => docs }) });
    const res = await request(app).get('/api/sprints/1/summary');
    expect(res.body.percentComplete).toBe(38);
    expect(res.body.tasks).toEqual({ todo: 1, in_progress: 0, done: 2 });
  });
  it('deleting a sprint also deletes its tasks', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1 }] });
    Task.deleteMany.mockResolvedValue({ deletedCount: 4 });
    const res = await request(app).delete('/api/sprints/1');
    expect(res.body).toEqual({ deleted: 1, tasksDeleted: 4 });
  });
});

describe('tasks', () => {
  it('validates input', async () => {
    expect((await request(app).post('/api/tasks').send({ sprintId: 1 })).status).toBe(400);
    expect((await request(app).post('/api/tasks').send({ title: 'x' })).status).toBe(400);
  });
  it('404 when the sprint does not exist', async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });
    expect((await request(app).post('/api/tasks').send({ title: 'x', sprintId: 5 })).status).toBe(404);
  });
  it('creates a task', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });
    Task.create.mockResolvedValue({ _id: OID, title: 'x', sprintId: 1 });
    expect((await request(app).post('/api/tasks').send({ title: 'x', sprintId: 1 })).status).toBe(201);
  });
  it('updates only allowed fields and rejects bad ids', async () => {
    Task.findByIdAndUpdate.mockResolvedValue({ _id: OID, status: 'done' });
    await request(app).patch(`/api/tasks/${OID}`).send({ status: 'done', sprintId: 99 });
    expect(Task.findByIdAndUpdate.mock.calls[0][1]).toEqual({ status: 'done' });
    expect((await request(app).patch('/api/tasks/bad').send({})).status).toBe(400);
  });
  it('deletes a task', async () => {
    Task.findByIdAndDelete.mockResolvedValue({ _id: OID });
    expect((await request(app).delete(`/api/tasks/${OID}`)).status).toBe(204);
  });
});

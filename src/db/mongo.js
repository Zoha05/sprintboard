const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    storyPoints: { type: Number, min: 0, max: 100, default: 1 },
    assignee: { type: String, default: '' },
    sprintId: { type: Number, required: true, index: true }, // refers to PostgreSQL sprints.id
  },
  { timestamps: true }
);

const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

const connectMongo = () =>
  mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sprintboard', {
    serverSelectionTimeoutMS: 5000,
  });

const isMongoUp = () => mongoose.connection.readyState === 1;

module.exports = { Task, connectMongo, isMongoUp, mongoose };

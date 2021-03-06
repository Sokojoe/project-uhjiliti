const mongoose = require('mongoose')
const Schema = mongoose.Schema

const usersSchema = new Schema({
  _id: {type: String, required: true},
  name: {type: String, required: true},
  hash: {type: String, required: true},
  salt: {type: String, required: true},
  projects: [{type: String, ref: 'Project'}]
})

exports.User = mongoose.model('User', usersSchema)

const projectsSchema = new Schema({
  _id: String,
  members: [{ type: String, ref: 'User' }],
  description: String,
  columns:[{type: String}],
  tickets: [{ type: Schema.Types.ObjectId, ref: 'Ticket'}]
})

exports.Project = mongoose.model('Project', projectsSchema)

const ticketSchema = new Schema({
  title: String,
  project: {type: String, ref: 'Project'},
  column: {type: String},
  description: String,
  dueDate: {type: Date, default: null},
  assignee: { type: String, ref: 'User' },
  watchers: [{ type: String, ref: 'User' }]
})

exports.Ticket = mongoose.model('Ticket', ticketSchema)

const messageSchema = new Schema({
  date: Date,
  content: String,
  author: { type: String, ref: 'User' }
})

exports.Message = mongoose.model('Message', messageSchema)

const chatSchema = new Schema({
  name: String,
  members: [{ type: String, ref: 'User' }],
  projectId: { type: String, ref: 'Project'},
  messages: [messageSchema]
})

exports.Chat = mongoose.model('Chat', chatSchema)

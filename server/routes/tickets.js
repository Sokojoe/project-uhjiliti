const usersFunctions = require('./users')
const schemas = require('./schemas')
const { check, validationResult, param } = require('express-validator/check')
const { sanitizeBody } = require('express-validator/filter')

// Project schema from schemas.js
const Project = schemas.Project

// Ticket schema from schemas.js
const Ticket = schemas.Ticket

// User schema from schemas.js
const User = schemas.User

// Helper function that responds with the list of errors
// whenever the parameters aren't valid
const breakIfInvalid = function(req, res, next) {
  let errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() })
  }
  next()
}

// CREATE

// TODO: determine who can make this action and implement (rn any authenticated user can make)
// curl -d '{"title":"ticket1", "description":"my first ticket"}' -H "Content-Type: application/json" -b cookie.txt -X POST http://localhost:4000/api/projects/cool%20ass%20project2/columns/:columnId/tickets
exports.createTicket = [
  usersFunctions.isAuthenticated,
  check('title', 'ticketName must not be empty').exists(),
  check('description', 'description must not be empty').exists(),
  check('assignee', 'assignee must not be empty')
    .exists()
    .isString(),
  check('watchers', 'watchers must not be empty, and must be an array')
    .exists()
    .isArray(),
  breakIfInvalid,
  sanitizeBody('title')
    .trim()
    .escape(),
  sanitizeBody('description').trim(),
  function(req, res) {
    let title = req.body.title
    let description = req.body.description
    let dueDate = req.body.dueDate
    let projectId = req.params.projectId
    let column = req.params.columnId
    let assignee = req.body.assignee
    let watchers = req.body.watchers ? req.body.watchers : []

    // check if a project with _id projectID exists
    Project.findById(projectId, function(err, project) {
      if (err) return res.status(500).end(err)
      if (!project) return res.status(404).end('Project id' + projectId + ' does not exist')

      // check if user is a member of the project
      if (!isProjectAuthenticated(req.session.username, project)) return res.status(401).end('Access denied')

      // Check assignees and watchers are members of the project
      if (!isProjectAuthenticated(assignee, project)) return res.status(409).end('Assignee ' + assignee + ' not part of project')
      watchers = watchers.filter(el => el !== assignee)
      for (let i = 0; i < watchers.length; i++) {
        if (!isProjectAuthenticated(watchers[i], project)) return res.status(409).end('Watcher ' + watchers[i] + ' not part of project')
      }

      // check if column exists
      if (!project.columns.includes(column)) return res.status(404).end('Column' + column + ' does not exist')

      // make a new ticket
      let newTicket = new Ticket({
        title: title,
        description: description,
        column: column,
        dueDate: dueDate,
        project: projectId,
        assignee: assignee,
        watchers: watchers
      })

      // save the ticket
      newTicket.save(function(err, ticket) {
        if (err) return res.status(500).end(err)

        // add it to the projects ticket list
        project.tickets.push(ticket._id)
        project.save(function(err) {
          if (err) return res.status(500).end(err)

          // return the newly created ticket
          res.json(ticket)
        })
      })
    })
  }
]

// /api/projects/:projectId/columns
exports.createColumn = [
  usersFunctions.isAuthenticated,
  check('columnName', 'columnName must not be empty').exists(),
  param('projectId', 'projectId must not be empty').exists(),
  breakIfInvalid,
  function(req, res) {
    let projectId = req.params.projectId
    let columnName = req.body.columnName
    Project.findOneAndUpdate({ _id: projectId }, { $addToSet: { columns: columnName } }, { new: true }, function(err, project) {
      if (err) return res.status(500).end(err)
      if (!project) return res.status(404).end('Project id' + projectId + ' does not exist')
      return res.json(project)
    })
  }
]

// READ

// api/projects/:projectId/column/:columnId/tickets
exports.getTickets = [
  usersFunctions.isAuthenticated,
  function(req, res) {
    let projectId = req.params.projectId
    let column = req.params.columnId
    Project.findById(projectId, function(err, project) {
      // Various checks
      if (err) return res.status(500).end(err)
      if (!project) return res.status(404).end('Project id' + projectId + ' does not exist')
      if (!isProjectAuthenticated(req.session.username, project)) return res.status(401).end('Access denied')
      if (!project.columns.includes(column)) return res.status(404).end('Column' + column + ' does not exist')

      Ticket.find({ project: projectId, column: column }).sort({dueDate: 1}).exec(function(err, tickets) {
        if (err) return res.status(500).end(err)

        return res.json(tickets)
      })
    })
  }
]
// UPDATE

// /api/projects/:projectId/tickets/:ticketId
exports.updateTicket = [
  usersFunctions.isAuthenticated,
  function(req, res) {
    let projectId = req.params.projectId
    let ticketId = req.params.ticketId
    let assignee = req.body.assignee
    let watchers = req.body.watchers
    let columnId = req.body.column

    Project.findById(projectId, function(err, project) {
      // Various checks
      if (err) return res.status(500).end(err)
      if (!project) return res.status(404).end('Project id ' + projectId + ' does not exist')
      if (!isProjectAuthenticated(req.session.username, project)) return res.status(401).end('Access denied')
      if (columnId) {
        let columnInProject = project.columns.find(el => {return el == columnId})
        if (columnInProject == undefined) return res.status(404).end('column ' + columnId + ' does not exist')
      }
      let ticketInProject = project.tickets.find(el => {return el == ticketId})
      if (ticketInProject == undefined) return res.status(404).end('ticket id ' + ticketId + ' does not exist')
      // Check assignees and watchers are members of the project
      if (assignee) {
        if (!isProjectAuthenticated(assignee, project)) return res.status(409).end('Assignee ' + assignee + ' not part of project')
      }
      if (watchers) {
        for (let i = 0; i < watchers.length; i++) {
          if (!isProjectAuthenticated(watchers[i], project)) return res.status(409).end('Watcher ' + watchers[i] + ' not part of project')
        }
      }

      Ticket.findByIdAndUpdate(ticketId, { $set: req.body }, function(err, ticket) {
        if (err) return res.status(500).end(err)
        return res.json(ticket)
      })
    })
  }
]

// DELETE

// /api/projects/:projectId/tickets/:ticketId
exports.deleteTicket = [
  usersFunctions.isAuthenticated,
  param('ticketId', 'ticketId must be alphanumeric').isAlphanumeric(),
  breakIfInvalid,
  function (req, res) {
    let projectId = req.params.projectId
    let ticketId = req.params.ticketId

    Project.findById(projectId, function(err, project) {
      // Various checks
      if (err) return res.status(500).end(err)
      if (!project) return res.status(404).end('Project id ' + projectId + ' does not exist')
      if (!isProjectAuthenticated(req.session.username, project)) return res.status(401).end('Access denied')
      let ticketInProject = project.tickets.find(el => {return el == ticketId})
      if (ticketInProject == undefined) return res.status(404).end('ticket id ' + ticketId + ' does not exist')

      project.tickets = project.tickets.filter(el => {return el != ticketId})
      project.save(function(err){
        if (err) return res.status(500).end(err)
        Ticket.deleteOne({_id: ticketId}, function(err){
          if (err) return res.status(500).end(err)
          return res.status(200)
        })
      })
      
    })
  }
]

function isProjectAuthenticated(username, project) {
  return project.members.includes(username)
}

import React, { Component } from 'react'
import Board from 'react-trello'
import axios from '../../axios'
import AddColForm from './AddColForm'
import { CustomLaneHeader, CustomCard } from './CustomCard'
import Button from '@material-ui/core/Button'
import AddTicketForm from './AddTicketForm'
import Slide from '@material-ui/core/Slide'

var Column = (function() {
  return function item(name, tickets) {
    this.id = name
    this.title = name
    this.style = { paddingBottom: '10px', backgroundColor: '#eeeeee' }
    this.cards = tickets
  }
})()

var Ticket = (function() {
  return function item(id, name, description, date, assignee, watchers) {
    this.id = id
    this.title = name
    this.date = date ? date.slice(0, 10) : 'NO DATE'
    this.description = description
    this.assignee = assignee
    this.watchers = watchers
    this.metadata = this // Stupid recursive definition necessary for onCardClick
  }
})()

let eventBus = undefined

// Component to display the current user's selected project board
class ProjectBoard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      ticketInfoView: false,
      boardData: {
        lanes: []
      }
    }
  }
  componentDidMount = () => {
    if (this.props.projectId != null) this.getColumns()
  }
  componentDidUpdate = prevProps => {
    if (this.props.projectId !== prevProps.projectId) this.getColumns()
  }

  // Connects to backend to add a column
  addColumn = colName => {
    axios
      .post('api/projects/' + this.props.projectId + '/columns/', { columnName: colName })
      .then(res => {
        let newLanes = this.state.boardData.lanes.slice()
        newLanes.push(new Column(colName, []))
        this.setState({ boardData: { lanes: newLanes } })
        const board = document.getElementsByClassName('board')[0]
        board.scrollLeft = 30000
      })
      .catch(err => console.error(err))
  }

  // Connects to backend to get column data ie the tickets
  getColumns = () => {
    axios
      .get('api/projects/' + this.props.projectId)
      .then(res => {
        let lanes = []
        let promiseArray = res.data.columns.map(el => {
          return this.getTickets(el)
        })
        // TODO: Move this to server side
        Promise.all(promiseArray).then(tickets => {
          for (let i = 0; i < res.data.columns.length; i++) {
            let trelloTickets = tickets[i].data.map(t => {
              return new Ticket(t._id, t.title, t.description, t.dueDate, t.assignee, t.watchers)
            })
            lanes.push(new Column(res.data.columns[i], trelloTickets))
          }
          eventBus.publish({type: 'UPDATE_LANES', lanes: lanes})
          this.setState({ boardData: { lanes: lanes } })

        })
      })
      .catch(err => {
        window.location.href = window.location.origin + '/signin'
        console.error(err)
      })
  }

  // Connects to backend to change order of columns
  orderColumn = (from, to, payload) => {
    let newCols = this.state.boardData.lanes
    const colToMove = newCols[from]
    newCols.splice(from, 1)
    newCols.splice(to, 0, colToMove)
    this.setState({ boardData: { lanes: newCols } })
    eventBus.publish({type: 'UPDATE_LANES', lanes: newCols})
    const data = {
      columns: newCols.map(el => {
        return el.id
      })
    }
    axios.patch('api/projects/' + this.props.projectId + '/columns', data)
  }

  // Connects to backend to get tickets for a column
  getTickets = columnName => {
    return axios.get('api/projects/' + this.props.projectId + '/columns/' + columnName + '/tickets').catch(err => console.error(err))
  }

  // Refreshes the state of an individual column
  refreshColumn = targetLane => {
    this.getTickets(targetLane)
      .then(res => {
        const lanes = JSON.parse(JSON.stringify(this.state.boardData.lanes))
        const index = lanes.findIndex(el => {
          return el.id === targetLane
        })
        let newData = res.data.map(t => {
          return new Ticket(t._id, t.title, t.description, t.dueDate, t.assignee, t.watchers)
        })
        lanes[index].cards = newData
        this.setState({ boardData: { lanes: lanes } })
      })
      .catch(err => console.error(err))
  }

  // Connects to backend to add a ticket
  addTicket = (card, laneId) => {
    const data = {
      title: card.title,
      description: card.description,
      dueDate: card.dueDate,
      assignee: card.assignee,
      watchers: card.watchers
    }
    axios
      .post('api/projects/' + this.props.projectId + '/columns/' + laneId + '/tickets', data)
      .then(res => {
        this.getColumns()
      })
      .catch(err => console.error(err))
  }
  // Connects to backend to update ticket
  updateTicket = (ticketId, data) => {
    axios
      .patch('api/projects/' + this.props.projectId + '/tickets/' + ticketId, data)
      .then(res => {
        this.getColumns()
      })
      .catch(err => console.error(err))
  }

  // Connects to backend to move ticket to different column
  moveTicket = (ticketId, sourceLane, targetLane, position, ticketData) => {
    const data = { column: targetLane }
    axios
      .patch('api/projects/' + this.props.projectId + '/tickets/' + ticketId, data)
      .then(res => {
        this.getColumns()
      })
      .catch(err => console.error(err))
  }
  // Connects to backend to delete a ticket
  deleteTicket = (ticketId, laneId) => {
    axios
      .delete('api/projects/' + this.props.projectId + '/tickets/' + ticketId)
      .then(res => this.getColumns())
      .catch(err => console.error(err))
  }

  render() {
    let updateTicketForm = React.createRef()
    return (
      <div>
        <AddTicketForm update="true" onUpdate={this.updateTicket} ref={updateTicketForm} />
        <Slide direction="right" in mountOnEnter>
          <Board
            className="board"
            data={this.state.boardData}
            editable
            draggable
            customLaneHeader={<CustomLaneHeader />}
            newCardTemplate={<AddTicketForm />}
            onCardAdd={this.addTicket}
            onCardClick={(ticketId, metadata, columnId) => {
              // console.log(ticketId, metadata, columnId)
              updateTicketForm.current.showUpdateView(metadata, columnId, this.props.projectId)
            }}
            addCardLink={
              <Button color="primary" style={{ paddingBottom: 0 }} size="small">
                Add Ticket
              </Button>
            }
            onCardDelete={this.deleteTicket}
            handleDragEnd={this.moveTicket}
            customCardLayout
            handleLaneDragEnd={this.orderColumn}
            eventBusHandle={handle => eventBus = handle}
            // onDataChange={newData => this.setState({boarddata: {lanes: newData}})}
            >
            <CustomCard />
          </Board>
        </Slide>
        <AddColForm onAdd={this.addColumn} />
      </div>
    )
  }
}
export default ProjectBoard

import { useState } from 'react'
import './App.css'

type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
type TaskPriority = 'low' | 'normal' | 'high'

interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
}

const columns: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'in_review', title: 'In Review' },
  { id: 'done', title: 'Done' },
]

const initialTasks: Task[] = [
  {
    id: '1',
    title: 'Design task creation modal',
    description: 'Create a polished form for adding tasks to the board.',
    status: 'todo',
    priority: 'high',
    dueDate: 'Jul 22',
  },
  {
    id: '2',
    title: 'Connect Supabase',
    description: 'Set up authentication and task persistence.',
    status: 'in_progress',
    priority: 'normal',
    dueDate: 'Jul 23',
  },
  {
    id: '3',
    title: 'Review mobile layout',
    description: 'Confirm the board works well on smaller screens.',
    status: 'in_review',
    priority: 'low',
    dueDate: 'Jul 24',
  },
  {
    id: '4',
    title: 'Create project structure',
    description: 'Initialize the React and TypeScript application.',
    status: 'done',
    priority: 'normal',
  },
]

function App() {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const handleCreateTask = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault()

  const form = event.currentTarget
  const formData = new FormData(form)

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const priority = String(
    formData.get('priority') ?? 'normal',
  ) as TaskPriority
  const dueDate = String(formData.get('dueDate') ?? '')

  if (!title) {
    return
  }

  const newTask: Task = {
    id: crypto.randomUUID(),
    title,
    description,
    status: 'todo',
    priority,
    dueDate: dueDate || undefined,
  }

  setTasks((currentTasks) => [newTask, ...currentTasks])

  form.reset()
  setIsTaskModalOpen(false)
}
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Task Board</h1>
          <p className="subtitle">
            Organize work, track progress, and keep projects moving.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => setIsTaskModalOpen(true)}
        >
          + New task
        </button>
      </header>

      <section className="board" aria-label="Task board">
        {columns.map((column) => {
          const columnTasks = tasks.filter(
            (task) => task.status === column.id,
          )

          return (
            <section className="board-column" key={column.id}>
              <div className="column-header">
                <h2>{column.title}</h2>
                <span className="task-count">{columnTasks.length}</span>
              </div>

              <div className="task-list">
                {columnTasks.map((task) => (
                  <article className="task-card" key={task.id}>
                    <div className="task-card-top">
                      <span className={`priority-badge ${task.priority}`}>
                        {task.priority}
                      </span>
                      <button
                        type="button"
                        className="task-menu"
                        aria-label={`Open menu for ${task.title}`}
                      >
                        •••
                      </button>
                    </div>

                    <h3>{task.title}</h3>
                    <p>{task.description}</p>

                    {task.dueDate && (
                      <div className="task-card-footer">
                        <span>Due {task.dueDate}</span>
                      </div>
                    )}
                  </article>
                ))}

                {columnTasks.length === 0 && (
                  <div className="empty-state">
                    <p>No tasks yet</p>
                    <span>Add a task or drag one here.</span>
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </section>
      {isTaskModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsTaskModalOpen(false)}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Create task</p>
                <h2 id="new-task-heading">Add a new task</h2>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Close new task form"
                onClick={() => setIsTaskModalOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="modal-description">
              Add the details for the work you want to track.
            </p>

            <form className="task-form" onSubmit={handleCreateTask}>
              <label className="form-field">
                <span>Task title</span>
                <input
                  type="text"
                  name="title"
                  placeholder="Enter a clear task title"
                  required
                />
              </label>

              <label className="form-field">
                <span>Description</span>
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Add more context or acceptance criteria"
                />
              </label>

              <div className="form-row">
                <label className="form-field">
                  <span>Priority</span>
                  <select name="priority" defaultValue="normal">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Due date</span>
                  <input type="date" name="dueDate" />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsTaskModalOpen(false)}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-button">
                  Create task
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
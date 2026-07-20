import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'

import { supabase } from './lib/supabase'
import './App.css'

type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
type TaskPriority = 'low' | 'normal' | 'high'

interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  user_id: string
  created_at: string
}

const columns: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'in_review', title: 'In Review' },
  { id: 'done', title: 'Done' },
]

interface DraggableTaskProps {
  task: Task
  isMenuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onDelete: () => void
}

/*
 * Displays one task card and connects it to dnd-kit.
 * The entire card can be dragged between board columns.
 */
function DraggableTask({
  task,
  isMenuOpen,
  onToggleMenu,
  onEdit,
  onDelete,
}: DraggableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: task.id,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="task-card-top">
        <span className={`priority-badge ${task.priority}`}>
          {task.priority}
        </span>

        <div className="task-menu-wrapper">
          <button
            type="button"
            className="task-menu"
            aria-label={`Open menu for ${task.title}`}
            aria-expanded={isMenuOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggleMenu()
            }}
          >
            •••
          </button>

          {isMenuOpen && (
            <div
              className="task-menu-popover"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={onEdit}
              >
                Edit task
              </button>

              <button
                type="button"
                className="delete-menu-button"
                onClick={onDelete}
              >
                Delete task
              </button>
            </div>
          )}
        </div>
      </div>

      <h3>{task.title}</h3>

      {task.description && <p>{task.description}</p>}

      {task.due_date && (
        <div className="task-card-footer">
          <span>Due {task.due_date}</span>
        </div>
      )}
    </article>
  )
}

interface DroppableColumnProps {
  columnId: TaskStatus
  children: ReactNode
}

/*
 * Turns a task-list area into a drop target.
 * The column highlights when a task is dragged over it.
 */
function DroppableColumn({
  columnId,
  children,
}: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
  })

  return (
    <div
      ref={setNodeRef}
      className={`task-list ${isOver ? 'drag-over' : ''}`}
    >
      {children}
    </div>
  )
}

function App() {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(
    null,
  )

  const [tasks, setTasks] = useState<Task[]>([])
  const [isTasksLoading, setIsTasksLoading] = useState(true)
  const [tasksError, setTasksError] = useState<string | null>(null)

  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [isSavingTask, setIsSavingTask] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')

  const [priorityFilter, setPriorityFilter] =
    useState<TaskPriority | 'all'>('all')

  /*
   * Runs once when the application first loads.
   * It restores or creates an anonymous Supabase session and then
   * retrieves only the tasks belonging to that guest user.
   */
  useEffect(() => {
    const initializeApp = async () => {
      setIsAuthLoading(true)
      setIsTasksLoading(true)
      setAuthError(null)
      setTasksError(null)

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        setAuthError(sessionError.message)
        setIsAuthLoading(false)
        setIsTasksLoading(false)
        return
      }

      if (!session) {
        const {
          data: signInData,
          error: signInError,
        } = await supabase.auth.signInAnonymously()

        if (signInError || !signInData.session) {
          setAuthError(
            signInError?.message ?? 'Unable to create guest session',
          )
          setIsAuthLoading(false)
          setIsTasksLoading(false)
          return
        }
      }

      const { data, error: tasksLoadError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (tasksLoadError) {
        setTasksError(tasksLoadError.message)
      } else {
        setTasks((data ?? []) as Task[])
      }

      setIsAuthLoading(false)
      setIsTasksLoading(false)
    }

    void initializeApp()
  }, [])

  /*
   * Reads the new-task form, saves the task to Supabase,
   * and adds the returned database row to the local board state.
   */
  const handleCreateTask = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setActionError(null)
    setIsSavingTask(true)

    const form = event.currentTarget
    const formData = new FormData(form)

    const title = String(formData.get('title') ?? '').trim()

    const description = String(
      formData.get('description') ?? '',
    ).trim()

    const priority = String(
      formData.get('priority') ?? 'normal',
    ) as TaskPriority

    const dueDate = String(formData.get('dueDate') ?? '')

    if (!title) {
      setActionError('Task title is required.')
      setIsSavingTask(false)
      return
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setActionError(
        userError?.message ?? 'Unable to identify the guest user.',
      )
      setIsSavingTask(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        title,
        description: description || null,
        status: 'todo',
        priority,
        due_date: dueDate || null,
        user_id: user.id,
      })
      .select()
      .single()

    if (insertError) {
      setActionError(insertError.message)
      setIsSavingTask(false)
      return
    }

    setTasks((currentTasks) => [
      data as Task,
      ...currentTasks,
    ])

    form.reset()
    setIsTaskModalOpen(false)
    setIsSavingTask(false)
  }

  /*
   * Updates an existing task in Supabase and replaces the matching
   * task in the local React state with the updated database row.
   */
  const handleEditTask = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!editingTask) {
      return
    }

    setActionError(null)
    setIsSavingTask(true)

    const formData = new FormData(event.currentTarget)

    const title = String(formData.get('title') ?? '').trim()

    const description = String(
      formData.get('description') ?? '',
    ).trim()

    const priority = String(
      formData.get('priority') ?? 'normal',
    ) as TaskPriority

    const dueDate = String(formData.get('dueDate') ?? '')

    if (!title) {
      setActionError('Task title is required.')
      setIsSavingTask(false)
      return
    }

    const { data, error: updateError } = await supabase
      .from('tasks')
      .update({
        title,
        description: description || null,
        priority,
        due_date: dueDate || null,
      })
      .eq('id', editingTask.id)
      .select()
      .single()

    if (updateError) {
      setActionError(updateError.message)
      setIsSavingTask(false)
      return
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === editingTask.id ? (data as Task) : task,
      ),
    )

    setEditingTask(null)
    setOpenMenuTaskId(null)
    setIsSavingTask(false)
  }

  /*
   * Confirms deletion, removes the task from Supabase,
   * and then removes it from the displayed task list.
   */
  const handleDeleteTask = async (task: Task) => {
    const confirmed = window.confirm(
      `Delete "${task.title}"? This action cannot be undone.`,
    )

    if (!confirmed) {
      return
    }

    setActionError(null)
    setOpenMenuTaskId(null)

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', task.id)

    if (deleteError) {
      setActionError(
        `The task could not be deleted: ${deleteError.message}`,
      )
      return
    }

    setTasks((currentTasks) =>
      currentTasks.filter(
        (currentTask) => currentTask.id !== task.id,
      ),
    )
  }

  /*
   * Runs after a task is dropped into a column.
   * The card moves immediately in React, then Supabase is updated.
   * If the database update fails, the card returns to its old column.
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      return
    }

    const taskId = String(active.id)
    const newStatus = String(over.id) as TaskStatus

    const validStatuses: TaskStatus[] = [
      'todo',
      'in_progress',
      'in_review',
      'done',
    ]

    if (!validStatuses.includes(newStatus)) {
      return
    }

    const movedTask = tasks.find((task) => task.id === taskId)

    if (!movedTask || movedTask.status === newStatus) {
      return
    }

    const previousStatus = movedTask.status

    setActionError(null)
    setOpenMenuTaskId(null)

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? { ...task, status: newStatus }
          : task,
      ),
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: newStatus,
      })
      .eq('id', taskId)

    if (updateError) {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === taskId
            ? { ...task, status: previousStatus }
            : task,
        ),
      )

      setActionError(
        `The task could not be moved: ${updateError.message}`,
      )
    }
  }

  if (isAuthLoading) {
    return (
      <main className="status-screen">
        <p>Preparing your workspace...</p>
      </main>
    )
  }

  if (authError) {
    return (
      <main className="status-screen error">
        <h1>Unable to start the guest session</h1>
        <p>{authError}</p>
      </main>
    )
  }

  if (isTasksLoading) {
    return (
      <main className="status-screen">
        <p>Loading your tasks...</p>
      </main>
    )
  }

  if (tasksError) {
    return (
      <main className="status-screen error">
        <h1>Unable to load tasks</h1>
        <p>{tasksError}</p>
      </main>
    )
  }

  /*
   * Creates a filtered version of the task list without modifying
   * the original tasks stored in state or Supabase.
   */
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const filteredTasks = tasks.filter((task) => {
    const title = task.title.toLowerCase()
    const description = task.description?.toLowerCase() ?? ''

    const matchesSearch =
      normalizedSearch.length === 0 ||
      title.includes(normalizedSearch) ||
      description.includes(normalizedSearch)

    const matchesPriority =
      priorityFilter === 'all' ||
      task.priority === priorityFilter

    return matchesSearch && matchesPriority
  })

  const filtersAreActive =
    normalizedSearch.length > 0 ||
    priorityFilter !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setPriorityFilter('all')
  }

  return (
    <main
      className="app-shell"
      onClick={() => setOpenMenuTaskId(null)}
    >
      <header className="app-header">
        <div>
          <p className="eyebrow">Next Play Games</p>
          <h1>FlowBoard</h1>
          <p className="subtitle">
            Organize work, track progress, and keep projects moving.
          </p>
        </div>


        <button
          type="button"
          className="primary-button"
          onClick={(event) => {
            event.stopPropagation()
            setActionError(null)
            setIsTaskModalOpen(true)
          }}
        >
          + New task
        </button>
      </header>

      {actionError && (
        <div className="action-error" role="alert">
          <span>{actionError}</span>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setActionError(null)}
          >
            ×
          </button>
        </div>
      )}

      <section
        className="board-toolbar"
        aria-label="Search and filter tasks"
        onClick={(event) => event.stopPropagation()}
      >
        <label className="search-field">
          <span className="visually-hidden">
            Search tasks
          </span>

          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <input
            type="search"
            value={searchQuery}
            placeholder="Search tasks..."
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
          />
        </label>

        <label className="filter-field">
          <span>Priority</span>

          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(
                event.target.value as TaskPriority | 'all',
              )
            }
          >
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        {filtersAreActive && (
          <button
            type="button"
            className="clear-filters-button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}

        <p className="filter-results">
          Showing {filteredTasks.length} of {tasks.length} tasks
        </p>
      </section>

      <DndContext onDragEnd={handleDragEnd}>
        <section className="board" aria-label="Task board">
          {columns.map((column) => {
            const columnTasks = filteredTasks.filter(
              (task) => task.status === column.id,
            )

            return (
              <section className="board-column" key={column.id}>
                <div className="column-header">
                  <h2>{column.title}</h2>

                  <span className="task-count">
                    {columnTasks.length}
                  </span>
                </div>

                <DroppableColumn columnId={column.id}>
                  {columnTasks.map((task) => (
                    <DraggableTask
                      task={task}
                      key={task.id}
                      isMenuOpen={openMenuTaskId === task.id}
                      onToggleMenu={() =>
                        setOpenMenuTaskId((currentId) =>
                          currentId === task.id ? null : task.id,
                        )
                      }
                      onEdit={() => {
                        setActionError(null)
                        setEditingTask(task)
                        setOpenMenuTaskId(null)
                      }}
                      onDelete={() => {
                        void handleDeleteTask(task)
                      }}
                    />
                  ))}

                  {columnTasks.length === 0 && (
                    <div className="empty-state">
                      <p>
                        {filtersAreActive
                          ? 'No matching tasks'
                          : 'No tasks yet'}
                      </p>

                      <span>
                        {filtersAreActive
                          ? 'Try changing or clearing your filters.'
                          : 'Add a task or drag one here.'}
                      </span>
                    </div>
                  )}
                </DroppableColumn>
              </section>
            )
          })}
        </section>
      </DndContext>

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
                <h2 id="new-task-heading">
                  Add a new task
                </h2>
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

            {actionError && (
              <div className="form-error" role="alert">
                {actionError}
              </div>
            )}

            <form
              className="task-form"
              onSubmit={handleCreateTask}
            >
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

                  <select
                    name="priority"
                    defaultValue="normal"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Due date</span>

                  <input
                    type="date"
                    name="dueDate"
                  />
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

                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSavingTask}
                >
                  {isSavingTask ? 'Creating...' : 'Create task'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editingTask && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setEditingTask(null)}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-task-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Edit task</p>
                <h2 id="edit-task-heading">
                  Update task details
                </h2>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Close edit task form"
                onClick={() => setEditingTask(null)}
              >
                ×
              </button>
            </div>

            <p className="modal-description">
              Make changes to this task and save when finished.
            </p>

            {actionError && (
              <div className="form-error" role="alert">
                {actionError}
              </div>
            )}

            <form
              className="task-form"
              onSubmit={handleEditTask}
            >
              <label className="form-field">
                <span>Task title</span>

                <input
                  type="text"
                  name="title"
                  defaultValue={editingTask.title}
                  required
                />
              </label>

              <label className="form-field">
                <span>Description</span>

                <textarea
                  name="description"
                  rows={4}
                  defaultValue={editingTask.description ?? ''}
                />
              </label>

              <div className="form-row">
                <label className="form-field">
                  <span>Priority</span>

                  <select
                    name="priority"
                    defaultValue={editingTask.priority}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Due date</span>

                  <input
                    type="date"
                    name="dueDate"
                    defaultValue={editingTask.due_date ?? ''}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingTask(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSavingTask}
                >
                  {isSavingTask ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="app-footer">
  <span>Built by Richard Hanly </span>
  <a
    href="https://github.com/richardrhanly-us/next-play-task-board"
    target="_blank"
    rel="noreferrer"
  >
     View project on GitHib
  </a>
</footer>

    </main>
  )
}

export default App
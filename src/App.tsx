/**
 * FlowBoard
 * ---------
 * Created by: Richard Hanly
 *
 * Kanban-style task management application built with React, TypeScript,
 * Supabase, and dnd-kit.
 *
 * React is responsible for the interactive UI and client-side state.
 * Supabase provides anonymous authentication, PostgreSQL persistence,
 * and Row Level Security (RLS).
 * dnd-kit provides the drag-and-drop interaction layer for moving tasks
 * between workflow columns.
 *
 * Data flow at a high level:
 *   Supabase -> React state -> rendered UI -> user action
 *            -> React handler -> Supabase -> updated React state
 *
 * Important implementation ideas demonstrated in this file:
 * - Typed task, label, and activity models with TypeScript
 * - Anonymous Supabase authentication and user-scoped data
 * - Persistent CRUD operations
 * - Optimistic drag-and-drop updates with rollback on failure
 * - Many-to-many task/label relationships through task_labels
 * - Activity history stored separately from current task state
 * - Combined search, priority, and label filtering
 * - Derived board statistics and due-date indicators
 */

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

// Restrict workflow status to the four valid Kanban columns.
// TypeScript can now catch invalid status values during development.
type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
type TaskPriority = 'low' | 'normal' | 'high'
type DueDateStatus = 'overdue' | 'today' | 'soon' | 'normal' | null
type TaskActivityAction = 'created' | 'status_changed' | 'edited'

// These interfaces describe the shape of data FlowBoard receives from
// Supabase. They make the database records predictable throughout the UI.
interface Label {
  id: string
  user_id: string
  name: string
  color: string | null
  created_at: string
}

// Join-table record connecting one task to one label.
// Multiple rows allow the overall task/label relationship to be many-to-many.
interface TaskLabel {
  task_id: string
  label_id: string
  user_id: string
  created_at: string
}

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

// Activity records represent events over time, while Task represents
// the task's current state.
interface TaskActivity {
  id: string
  task_id: string
  user_id: string
  action: TaskActivityAction
  from_value: string | null
  to_value: string | null
  created_at: string
}

// UI definition for the four Kanban workflow columns.
// The id is also the value persisted in tasks.status.
const columns: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'in_review', title: 'In Review' },
  { id: 'done', title: 'Done' },
]

const labelColors = [
  'purple',
  'blue',
  'green',
  'yellow',
  'red',
  'gray',
] as const

function formatTaskStatus(status: string | null) {
  if (!status) {
    return ''
  }

  const labels: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
  }

  return labels[status] ?? status
}

function formatPriority(priority: TaskPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function formatColorName(color: string) {
  return color.charAt(0).toUpperCase() + color.slice(1)
}

// Derive a display state from the due date without modifying the task.
// Completed tasks intentionally do not receive overdue warnings.
function getDueDateStatus(
  dueDate: string | null,
  taskStatus: TaskStatus,
): DueDateStatus {
  if (!dueDate || taskStatus === 'done') {
    return null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(`${dueDate}T00:00:00`)
  const differenceInDays = Math.ceil(
    (due.getTime() - today.getTime()) / 86_400_000,
  )

  if (differenceInDays < 0) {
    return 'overdue'
  }

  if (differenceInDays === 0) {
    return 'today'
  }

  if (differenceInDays <= 3) {
    return 'soon'
  }

  return 'normal'
}

interface DraggableTaskProps {
  task: Task
  labels: Label[]
  isMenuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onDelete: () => void
  onOpen: () => void
}

/**
 * Renders one task card and connects it to dnd-kit's draggable behavior.
 * The card receives task data through props; it does not own the task itself.
 * Changes are handled by callbacks passed down from App.
 */
function DraggableTask({
  task,
  labels,
  isMenuOpen,
  onToggleMenu,
  onEdit,
  onDelete,
  onOpen,
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

  const dueDateStatus = getDueDateStatus(task.due_date, task.status)

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      onClick={onOpen}
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
              <button type="button" onClick={onOpen}>
                View details
              </button>

              <button type="button" onClick={onEdit}>
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

      {labels.length > 0 && (
        <div className="task-card-labels">
          {labels.map((label) => (
            <span
              className={`task-card-label ${label.color ?? 'gray'}`}
              key={label.id}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {task.description && <p>{task.description}</p>}

      {task.due_date && (
        <div className="task-card-footer">
          <span className={`due-date ${dueDateStatus ?? 'normal'}`}>
            {dueDateStatus === 'overdue' && 'Overdue · '}
            {dueDateStatus === 'today' && 'Due today · '}
            {dueDateStatus === 'soon' && 'Due soon · '}
            {task.due_date}
          </span>
        </div>
      )}
    </article>
  )
}

interface DroppableColumnProps {
  columnId: TaskStatus
  children: ReactNode
}

/**
 * Wraps a Kanban column in dnd-kit's droppable behavior.
 * When a draggable task is released over this element, dnd-kit reports
 * this column's id back to handleDragEnd.
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

/**
 * Main application component.
 *
 * App owns the primary client-side state and coordinates communication
 * between the React UI and Supabase.
 */
function App() {
  // ----- UI state -----------------------------------------------------
  // Controls modal visibility, currently selected records, and menus.
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false)
  const [isManageLabelsModalOpen, setIsManageLabelsModalOpen] =
    useState(false)

  const [editingLabelId, setEditingLabelId] =
    useState<string | null>(null)
  const [editingLabelName, setEditingLabelName] = useState('')
  const [editingLabelColor, setEditingLabelColor] = useState('purple')

  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([])

  const [openMenuTaskId, setOpenMenuTaskId] =
    useState<string | null>(null)

  // ----- Application data --------------------------------------------
  // These arrays are the client-side representation of persisted Supabase data.
  const [labels, setLabels] = useState<Label[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabel[]>([])
  const [tasks, setTasks] = useState<Task[]>([])

  // ----- Request / error state ---------------------------------------
  const [isTasksLoading, setIsTasksLoading] = useState(true)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSavingTask, setIsSavingTask] = useState(false)

  // ----- Filter state -------------------------------------------------
  // Filtering changes the rendered view, not the underlying database rows.
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] =
    useState<TaskPriority | 'all'>('all')
  const [labelFilter, setLabelFilter] =
    useState<string | 'all'>('all')

  /**
   * Writes a lightweight audit/history event to task_activity.
   * The main tasks table stores current state; this table stores what happened.
   */
  const recordTaskActivity = async (
    taskId: string,
    action: TaskActivityAction,
    fromValue: string | null = null,
    toValue: string | null = null,
  ) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error(
        'Unable to record task activity:',
        userError?.message ?? 'Guest user not found',
      )
      return
    }

    const { error } = await supabase
      .from('task_activity')
      .insert({
        task_id: taskId,
        user_id: user.id,
        action,
        from_value: fromValue,
        to_value: toValue,
      })

    if (error) {
      console.error(
        'Unable to record task activity:',
        error.message,
      )
    }
  }

  /**
   * Initial application load.
   *
   * 1. Restore an existing Supabase session or create an anonymous one.
   * 2. Load tasks, labels, and task-label relationships.
   * 3. Store the returned rows in React state.
   * 4. React renders the board from that state.
   *
   * RLS is enforced by Supabase/PostgreSQL during these requests, so the
   * authenticated user can only receive rows allowed by the database policies.
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

      const { data: tasksData, error: tasksLoadError } =
        await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false })

      if (tasksLoadError) {
        setTasksError(tasksLoadError.message)
      } else {
        setTasks((tasksData ?? []) as Task[])
      }

      const { data: labelsData, error: labelsLoadError } =
        await supabase
          .from('labels')
          .select('*')
          .order('name', { ascending: true })

      if (labelsLoadError) {
        console.error(
          'Unable to load labels:',
          labelsLoadError.message,
        )
      } else {
        setLabels((labelsData ?? []) as Label[])
      }

      const {
        data: taskLabelsData,
        error: taskLabelsLoadError,
      } = await supabase
        .from('task_labels')
        .select('*')

      if (taskLabelsLoadError) {
        console.error(
          'Unable to load task labels:',
          taskLabelsLoadError.message,
        )
      } else {
        setTaskLabels(
          (taskLabelsData ?? []) as TaskLabel[],
        )
      }

      setIsAuthLoading(false)
      setIsTasksLoading(false)
    }

    void initializeApp()
  }, [])

  /**
   * Creates a new task.
   *
   * The form is read and validated in the client, then an INSERT is sent to
   * Supabase. After PostgreSQL creates the row, Supabase returns it and that
   * returned Task object is added to React state, causing the board to re-render.
   */
  const handleCreateTask = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setActionError(null)
    setIsSavingTask(true)

    const form = event.currentTarget
    const formData = new FormData(form)

    // Frontend validation gives immediate user feedback. Database constraints
    // and RLS still provide the backend enforcement.
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

    // Persist the new task. status starts as "todo", so every new task
    // enters the first Kanban column.
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

    await recordTaskActivity(
      (data as Task).id,
      'created',
    )

    // Updating React state changes the data the UI is rendered from.
    // React then re-renders and the new card appears without a page refresh.
    setTasks((currentTasks) => [
      data as Task,
      ...currentTasks,
    ])

    form.reset()
    setIsTaskModalOpen(false)
    setIsSavingTask(false)
  }

  /**
   * Updates an existing task in Supabase, then replaces the matching object
   * in React state with the row returned by the database.
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

    await recordTaskActivity(
      editingTask.id,
      'edited',
    )

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === editingTask.id ? (data as Task) : task,
      ),
    )

    setEditingTask(null)
    setOpenMenuTaskId(null)
    setIsSavingTask(false)
  }

  /**
   * Deletes a task after confirmation.
   * After persistence succeeds, related client-side state is also cleaned up
   * so the UI immediately reflects the deletion.
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

    setTaskLabels((currentTaskLabels) =>
      currentTaskLabels.filter(
        (taskLabel) => taskLabel.task_id !== task.id,
      ),
    )

    if (selectedTask?.id === task.id) {
      setSelectedTask(null)
    }
  }

  /**
   * Handles a completed drag-and-drop operation.
   *
   * This uses an optimistic update:
   * 1. Remember the previous task status.
   * 2. Update React state immediately so the card moves right away.
   * 3. Persist the new status to Supabase.
   * 4. If persistence fails, restore the previous React state.
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

    // Save the old value before the optimistic UI update so it can be
    // restored if the database request fails.
    const previousStatus = movedTask.status

    setActionError(null)
    setOpenMenuTaskId(null)

    // Optimistic UI update: move the card before waiting for Supabase.
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
      // Roll back the optimistic update so the UI does not claim a state
      // that the database failed to save.
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

      return
    }

    await recordTaskActivity(
      taskId,
      'status_changed',
      previousStatus,
      newStatus,
    )
  }

  // Populate the inline label editor with the selected label's current data.
  const startEditingLabel = (label: Label) => {
    setEditingLabelId(label.id)
    setEditingLabelName(label.name)
    setEditingLabelColor(label.color ?? 'gray')
    setActionError(null)
  }

  const cancelEditingLabel = () => {
    setEditingLabelId(null)
    setEditingLabelName('')
    setEditingLabelColor('purple')
  }

  /**
   * Persists label name/color changes and updates the shared label state.
   * Because task cards reference the same label objects by id, changing a
   * label once is reflected everywhere that label is rendered.
   */
  const saveEditingLabel = async (label: Label) => {
    const newName = editingLabelName.trim()

    if (!newName) {
      setActionError('Label name is required.')
      return
    }

    setActionError(null)

    const { data, error } = await supabase
      .from('labels')
      .update({
        name: newName,
        color: editingLabelColor,
      })
      .eq('id', label.id)
      .select()
      .single()

    if (error) {
      setActionError(
        `Unable to update label: ${error.message}`,
      )
      return
    }

    setLabels((currentLabels) =>
      currentLabels
        .map((currentLabel) =>
          currentLabel.id === label.id
            ? (data as Label)
            : currentLabel,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    )

    cancelEditingLabel()
  }

  /**
   * Deletes a label and removes its client-side task assignments.
   * The database relationship uses cascading deletion for related task_labels
   * rows, while the state cleanup keeps the current UI in sync immediately.
   */
  const deleteLabel = async (label: Label) => {
    const assignmentCount = taskLabels.filter(
      (taskLabel) => taskLabel.label_id === label.id,
    ).length

    const warning =
      assignmentCount === 0
        ? `Delete the label "${label.name}"?`
        : `Delete the label "${label.name}"? It will be removed from ${assignmentCount} task${assignmentCount === 1 ? '' : 's'}.`

    if (!window.confirm(warning)) {
      return
    }

    setActionError(null)

    const { error } = await supabase
      .from('labels')
      .delete()
      .eq('id', label.id)

    if (error) {
      setActionError(
        `Unable to delete label: ${error.message}`,
      )
      return
    }

    setLabels((currentLabels) =>
      currentLabels.filter(
        (currentLabel) => currentLabel.id !== label.id,
      ),
    )

    setTaskLabels((currentTaskLabels) =>
      currentTaskLabels.filter(
        (taskLabel) => taskLabel.label_id !== label.id,
      ),
    )

    if (labelFilter === label.id) {
      setLabelFilter('all')
    }

    if (editingLabelId === label.id) {
      cancelEditingLabel()
    }
  }

  // ----- Render guards ------------------------------------------------
  // Show explicit loading/error screens before rendering the main application.
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

  // ----- Derived / computed data --------------------------------------
  // Build a filtered view from the original tasks array. No task rows are
  // changed in Supabase simply because the user applies a filter.
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

    const matchesLabel =
      labelFilter === 'all' ||
      taskLabels.some(
        (taskLabel) =>
          taskLabel.task_id === task.id &&
          taskLabel.label_id === labelFilter,
      )

    // All active conditions must match, so search, priority, and labels
    // can be combined at the same time.
    return matchesSearch && matchesPriority && matchesLabel
  })

  const filtersAreActive =
    normalizedSearch.length > 0 ||
    priorityFilter !== 'all' ||
    labelFilter !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setPriorityFilter('all')
    setLabelFilter('all')
  }

  // Resolve a task's labels through task_labels, the join-table state.
  const getLabelsForTask = (taskId: string) =>
    labels.filter((label) =>
      taskLabels.some(
        (taskLabel) =>
          taskLabel.task_id === taskId &&
          taskLabel.label_id === label.id,
      ),
    )

  // Board statistics are derived from the current task state rather than
  // stored separately in the database.
  const completedTasks = tasks.filter(
    (task) => task.status === 'done',
  ).length

  const overdueTasks = tasks.filter((task) => {
    if (!task.due_date || task.status === 'done') {
      return false
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueDate = new Date(`${task.due_date}T00:00:00`)

    return dueDate < today
  }).length

  const completionPercentage =
    tasks.length === 0
      ? 0
      : Math.round((completedTasks / tasks.length) * 100)

  // ----- Main UI -------------------------------------------------------
  // Everything below is JSX: an HTML-like description of what React should
  // render from the current state.
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

        <div className="header-actions">
          <div className="label-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={(event) => {
                event.stopPropagation()
                setIsManageLabelsModalOpen(true)
              }}
            >
              Manage labels
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={(event) => {
                event.stopPropagation()
                setIsLabelModalOpen(true)
              }}
            >
              + New label
            </button>
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
        </div>
      </header>

      {/* Label management: edit name/color or delete reusable labels. */}
      {isManageLabelsModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setIsManageLabelsModalOpen(false)
            cancelEditingLabel()
          }}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-labels-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Labels</p>
                <h2 id="manage-labels-heading">
                  Manage labels
                </h2>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Close label manager"
                onClick={() => {
                  setIsManageLabelsModalOpen(false)
                  cancelEditingLabel()
                }}
              >
                ×
              </button>
            </div>

            <p className="modal-description">
              Rename, recolor, or remove labels from your workspace.
            </p>

            {actionError && (
              <div className="form-error" role="alert">
                {actionError}
              </div>
            )}

            <div className="manage-labels-list">
              {labels.length === 0 ? (
                <p>No labels created yet.</p>
              ) : (
                labels.map((label) => {
                  const isEditing = editingLabelId === label.id

                  return (
                    <div
                      className={`manage-label-row ${
                        isEditing ? 'editing' : ''
                      }`}
                      key={label.id}
                    >
                      {isEditing ? (
                        <>
                          <div className="manage-label-edit-fields">
                            <label className="form-field">
                              <span>Name</span>
                              <input
                                type="text"
                                value={editingLabelName}
                                onChange={(event) =>
                                  setEditingLabelName(
                                    event.target.value,
                                  )
                                }
                                autoFocus
                              />
                            </label>

                            <label className="form-field">
                              <span>Color</span>
                              <select
                                value={editingLabelColor}
                                onChange={(event) =>
                                  setEditingLabelColor(
                                    event.target.value,
                                  )
                                }
                              >
                                {labelColors.map((color) => (
                                  <option
                                    key={color}
                                    value={color}
                                  >
                                    {formatColorName(color)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="manage-label-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={cancelEditingLabel}
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => {
                                void saveEditingLabel(label)
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span
                            className={`task-card-label ${
                              label.color ?? 'gray'
                            }`}
                          >
                            {label.name}
                          </span>

                          <div className="manage-label-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() =>
                                startEditingLabel(label)
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="delete-label-button"
                              onClick={() => {
                                void deleteLabel(label)
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* New-label form persists labels in Supabase and then updates state. */}
      {isLabelModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsLabelModalOpen(false)}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-label-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Create label</p>
                <h2 id="new-label-heading">
                  Add a new label
                </h2>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Close new label form"
                onClick={() => setIsLabelModalOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="modal-description">
              Create a label you can assign to tasks.
            </p>

            <form
              className="task-form"
              onSubmit={async (event) => {
                event.preventDefault()

                const form = event.currentTarget
                const formData = new FormData(form)

                const name = String(
                  formData.get('labelName') ?? '',
                ).trim()

                const color = String(
                  formData.get('labelColor') ?? 'purple',
                )

                if (!name) {
                  return
                }

                const {
                  data: { user },
                  error: userError,
                } = await supabase.auth.getUser()

                if (userError || !user) {
                  setActionError(
                    userError?.message ??
                      'Unable to identify the guest user.',
                  )
                  return
                }

                const { data, error } = await supabase
                  .from('labels')
                  .insert({
                    name,
                    color,
                    user_id: user.id,
                  })
                  .select()
                  .single()

                if (error) {
                  setActionError(
                    `Unable to create label: ${error.message}`,
                  )
                  return
                }

                setLabels((currentLabels) =>
                  [...currentLabels, data as Label].sort(
                    (a, b) => a.name.localeCompare(b.name),
                  ),
                )

                form.reset()
                setIsLabelModalOpen(false)
              }}
            >
              <label className="form-field">
                <span>Label name</span>
                <input
                  type="text"
                  name="labelName"
                  placeholder="e.g. Bug, Feature, Design"
                  required
                />
              </label>

              <label className="form-field">
                <span>Color</span>
                <select
                  name="labelColor"
                  defaultValue="purple"
                >
                  {labelColors.map((color) => (
                    <option key={color} value={color}>
                      {formatColorName(color)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsLabelModalOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                >
                  Create label
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Task-details modal: current task values, labels, and activity history. */}
      {selectedTask && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedTask(null)}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-heading"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Task details</p>
                <h2 id="task-detail-heading">
                  {selectedTask.title}
                </h2>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Close task details"
                onClick={() => setSelectedTask(null)}
              >
                ×
              </button>
            </div>

            {selectedTask.description && (
              <p className="modal-description">
                {selectedTask.description}
              </p>
            )}

            <p>
              Priority: {formatPriority(selectedTask.priority)}
            </p>

            <p>
              Status: {formatTaskStatus(selectedTask.status)}
            </p>

            <div className="task-labels-section">
              {/* Checking/unchecking a label inserts or deletes a task_labels
                  join-table row, which represents the many-to-many relationship. */}
              <h3>Labels</h3>

              {labels.length === 0 ? (
                <p>No labels available.</p>
              ) : (
                <div className="task-label-options">
                  {labels.map((label) => {
                    const isAssigned = taskLabels.some(
                      (taskLabel) =>
                        taskLabel.task_id === selectedTask.id &&
                        taskLabel.label_id === label.id,
                    )

                    return (
                      <label
                        className="task-label-option"
                        key={label.id}
                      >
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={async (event) => {
                            const shouldAssign =
                              event.target.checked

                            const {
                              data: { user },
                              error: userError,
                            } = await supabase.auth.getUser()

                            if (userError || !user) {
                              setActionError(
                                userError?.message ??
                                  'Unable to identify the guest user.',
                              )
                              return
                            }

                            if (shouldAssign) {
                              const {
                                data,
                                error,
                              } = await supabase
                                .from('task_labels')
                                .insert({
                                  task_id: selectedTask.id,
                                  label_id: label.id,
                                  user_id: user.id,
                                })
                                .select()
                                .single()

                              if (error) {
                                setActionError(
                                  `Unable to assign label: ${error.message}`,
                                )
                                return
                              }

                              setTaskLabels(
                                (currentTaskLabels) => [
                                  ...currentTaskLabels,
                                  data as TaskLabel,
                                ],
                              )
                            } else {
                              const { error } = await supabase
                                .from('task_labels')
                                .delete()
                                .eq(
                                  'task_id',
                                  selectedTask.id,
                                )
                                .eq('label_id', label.id)

                              if (error) {
                                setActionError(
                                  `Unable to remove label: ${error.message}`,
                                )
                                return
                              }

                              setTaskLabels(
                                (currentTaskLabels) =>
                                  currentTaskLabels.filter(
                                    (taskLabel) =>
                                      !(
                                        taskLabel.task_id ===
                                          selectedTask.id &&
                                        taskLabel.label_id ===
                                          label.id
                                      ),
                                  ),
                              )
                            }
                          }}
                        />

                        <span>{label.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Activity is loaded from task_activity separately from the task
                record so current state and historical events stay distinct. */}
            <div className="task-activity">
              <h3>Activity</h3>

              {taskActivity.length === 0 ? (
                <p>No activity yet.</p>
              ) : (
                taskActivity.map((activity) => (
                  <div
                    className="activity-item"
                    key={activity.id}
                  >
                    <strong>
                      {activity.action === 'created'
                        ? 'Task created'
                        : activity.action === 'status_changed'
                          ? `Moved from ${formatTaskStatus(
                              activity.from_value,
                            )} to ${formatTaskStatus(
                              activity.to_value,
                            )}`
                          : 'Task edited'}
                    </strong>

                    <span>
                      {new Date(
                        activity.created_at,
                      ).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>

            {selectedTask.due_date && (
              <p>Due: {selectedTask.due_date}</p>
            )}
          </section>
        </div>
      )}

      {/* Summary values are calculated from React task state. */}
      <section
        className="board-summary"
        aria-label="Board summary"
      >
        <div className="summary-card">
          <span>Total tasks</span>
          <strong>{tasks.length}</strong>
        </div>

        <div className="summary-card">
          <span>Completed</span>
          <strong>{completedTasks}</strong>
        </div>

        <div className="summary-card">
          <span>Overdue</span>
          <strong>{overdueTasks}</strong>
        </div>

        <div className="summary-card">
          <span>Completion</span>
          <strong>{completionPercentage}%</strong>
        </div>
      </section>

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

      {/* Search and filters create a derived view of tasks in memory. */}
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

        <label className="filter-field">
          <span>Label</span>

          <select
            value={labelFilter}
            onChange={(event) =>
              setLabelFilter(event.target.value)
            }
          >
            <option value="all">All labels</option>

            {labels.map((label) => (
              <option
                value={label.id}
                key={label.id}
              >
                {label.name}
              </option>
            ))}
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

      {/* DndContext connects the board to dnd-kit. handleDragEnd contains
          the application-specific meaning of a drop: changing task status. */}
      <DndContext onDragEnd={handleDragEnd}>
        <section className="board" aria-label="Task board">
          {columns.map((column) => {
            const columnTasks = filteredTasks.filter(
              (task) => task.status === column.id,
            )

            return (
              <section
                className="board-column"
                key={column.id}
              >
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
                      labels={getLabelsForTask(task.id)}
                      key={task.id}
                      isMenuOpen={openMenuTaskId === task.id}
                      onOpen={async () => {
                        setSelectedTask(task)
                        setOpenMenuTaskId(null)

                        const { data, error } = await supabase
                          .from('task_activity')
                          .select('*')
                          .eq('task_id', task.id)
                          .order('created_at', {
                            ascending: false,
                          })

                        if (error) {
                          console.error(
                            'Unable to load task activity:',
                            error.message,
                          )
                          setTaskActivity([])
                          return
                        }

                        setTaskActivity(
                          (data ?? []) as TaskActivity[],
                        )
                      }}
                      onToggleMenu={() =>
                        setOpenMenuTaskId((currentId) =>
                          currentId === task.id
                            ? null
                            : task.id,
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

      {/* New-task form. Submission is handled by handleCreateTask above. */}
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

      {/* Edit-task form. The selected Task object supplies the initial values. */}
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
        <span>Built by Richard Hanly</span>
        <a
          href="https://github.com/richardrhanly-us/next-play-task-board"
          target="_blank"
          rel="noreferrer"
        >
          View project on GitHub
        </a>
      </footer>
    </main>
  )
}

export default App

# FlowBoard

FlowBoard is a Kanban-style task management application built with React, TypeScript, Supabase, and dnd-kit.

The application allows users to create, organize, edit, move, search, filter, label, and delete tasks across four workflow stages:

- To Do
- In Progress
- In Review
- Done

Each visitor is automatically signed in as an anonymous guest. Supabase Row Level Security ensures that users can only access their own tasks, labels, and task activity.

## Live Demo

[FlowBoard](https://next-play-task-board-black.vercel.app/)

## GitHub Repository

https://github.com/richardrhanly-us/next-play-task-board

## Features

### Kanban Task Board

Tasks are organized across four workflow columns:

- To Do
- In Progress
- In Review
- Done

Each column displays the number of tasks it currently contains.

### Drag-and-Drop Task Movement

Users can drag tasks between columns to update their status.

The interface updates immediately when a task is dropped. The new status is then saved to Supabase. If the database update fails, the card automatically returns to its previous column.

### Task Creation

Users can create tasks using the New Task button.

Each task can include:

- Title
- Description
- Priority
- Due date

New tasks are added to the To Do column and saved in Supabase.

### Task Editing

Each task card includes a menu with an Edit Task option.

Users can update:

- Title
- Description
- Priority
- Due date

Changes are saved to Supabase and immediately reflected on the board.

### Task Deletion

Users can permanently delete a task from the task menu.

A confirmation message appears before deletion to reduce accidental data loss.

### Search

The search field filters tasks by:

- Task title
- Task description

Search results update immediately while the user types.

### Priority and Label Filtering

Users can filter the board by priority and label.

Priority options include:

- All priorities
- High
- Normal
- Low

Label filtering is populated dynamically from the user's saved labels.

Search, priority filtering, and label filtering can be combined.

### Labels and Tags

Users can create reusable labels and assign them to tasks.

Labels include:

- A custom name
- A selectable color
- Many-to-many assignment across tasks

Assigned labels appear directly on task cards.

### Label Management

The Manage Labels interface allows users to:

- Rename labels
- Change label colors
- Delete labels

Deleting a label automatically removes its related task-label assignments.

### Task Activity History

FlowBoard records important task activity in Supabase, including:

- Task creation
- Status changes
- Task edits

The task details modal displays activity in reverse chronological order.

### Due-Date Indicators

Tasks with due dates display contextual indicators for:

- Overdue tasks
- Tasks due today
- Tasks due soon

Completed tasks are excluded from overdue warnings.

### Board Summary

The dashboard displays summary statistics for:

- Total tasks
- Completed tasks
- Overdue tasks
- Completion percentage

### Guest Authentication

The application automatically creates an anonymous Supabase guest session when a user first opens the app.

No email address or password is required.

The guest session is normally restored when the same user returns using the same browser.

### Data Privacy and Row Level Security

Application data is tied to the authenticated guest user's ID.

Supabase Row Level Security policies ensure that users can only access data belonging to their own workspace.

RLS is used for:

- Tasks
- Labels
- Task-label assignments
- Task activity

### Persistent Data

Application data is stored in a Supabase PostgreSQL database.

Tasks and related data remain available after:

- Refreshing the page
- Closing and reopening the browser
- Restarting the development server

### Loading, Empty, and Error States

The application includes clear interface states for:

- Guest session initialization
- Task loading
- Empty board columns
- Search results with no matches
- Database and authentication errors
- Saving task changes

### Responsive Design

The board is designed to work across desktop, tablet, and mobile screen sizes.

On smaller displays:

- Columns can scroll horizontally
- Form fields stack vertically
- Search and filter controls rearrange into a mobile-friendly layout
- Modal buttons expand to full width

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- HTML
- CSS

### Drag and Drop

- dnd-kit

### Backend Services

- Supabase Auth
- Supabase PostgreSQL
- Supabase JavaScript Client
- Supabase Row Level Security

### Deployment

- Vercel

### Version Control

- Git
- GitHub

## Application Architecture

The application uses a frontend-first architecture.

The React frontend communicates directly with Supabase using the public Supabase publishable key.

The application flow is:

1. The app checks for an existing Supabase session.
2. If no session exists, the user is signed in anonymously.
3. The app retrieves tasks, labels, and task-label assignments from Supabase.
4. Row Level Security limits the results to the current guest user.
5. Users create, edit, move, search, filter, label, or delete tasks.
6. Database changes are saved through the Supabase JavaScript client.
7. React state updates the interface immediately.
8. Task activity is recorded for important changes.

No custom backend server is required for the current version.

## Database Schema

### `tasks`

Stores the Kanban tasks.

Fields include:

- `id` — UUID primary key
- `title` — Required text
- `description` — Optional text
- `status` — `todo`, `in_progress`, `in_review`, or `done`
- `priority` — `low`, `normal`, or `high`
- `due_date` — Optional date
- `user_id` — UUID linked to the authenticated Supabase user
- `created_at` — Automatically generated timestamp

### `labels`

Stores reusable user-created labels.

Fields include:

- `id` — UUID primary key
- `user_id` — UUID linked to the authenticated Supabase user
- `name` — Label name
- `color` — Label color
- `created_at` — Automatically generated timestamp

Each user has a unique label name constraint.

### `task_labels`

Join table that creates the many-to-many relationship between tasks and labels.

Fields include:

- `task_id` — References `tasks.id`
- `label_id` — References `labels.id`
- `user_id` — UUID linked to the authenticated user
- `created_at` — Automatically generated timestamp

The combination of `task_id` and `label_id` forms the primary key.

Task-label rows are removed automatically when the related task or label is deleted.

### `task_activity`

Stores task history.

Fields include:

- `id` — UUID primary key
- `task_id` — References the related task
- `user_id` — UUID linked to the authenticated user
- `action` — Activity type
- `from_value` — Optional previous value
- `to_value` — Optional new value
- `created_at` — Automatically generated timestamp

Current activity types include:

- `created`
- `status_changed`
- `edited`

## Local Setup

### Prerequisites

- Node.js
- npm
- Git
- A Supabase project

### Clone the repository

```bash
git clone https://github.com/richardrhanly-us/next-play-task-board.git
```

Move into the project folder:

```bash
cd next-play-task-board
```

Install dependencies:

```bash
npm install
```

Create a file named `.env.local` in the project root.

Add:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Do not use a Supabase secret key or service-role key in the frontend.

Start the development server:

```bash
npm run dev
```

Open the local address shown in the terminal, usually:

```text
http://localhost:5173
```

## How to Use the App

### Create a Task

1. Click **New Task**.
2. Enter a task title.
3. Optionally enter a description.
4. Choose a priority.
5. Optionally select a due date.
6. Click **Create Task**.

The task appears in the To Do column.

### Move a Task

1. Click and hold a task card.
2. Drag it over another column.
3. Release the card.

The task status is updated and saved to Supabase.

### Edit a Task

1. Click the three-dot menu on a task card.
2. Select **Edit Task**.
3. Update the task details.
4. Click **Save Changes**.

### Delete a Task

1. Click the three-dot menu on a task card.
2. Select **Delete Task**.
3. Confirm the deletion.

### Create a Label

1. Click **New Label**.
2. Enter a label name.
3. Choose a color.
4. Create the label.

### Assign Labels to a Task

1. Open a task's details.
2. Use the Labels section.
3. Select or clear the labels assigned to the task.

Assigned labels appear on the task card.

### Manage Labels

1. Click **Manage Labels**.
2. Choose **Edit** to rename or recolor a label.
3. Click **Save** to persist changes.
4. Choose **Delete** to permanently remove a label.

Deleting a label also removes its assignments from tasks.

### Search Tasks

Enter text in the search box.

The board filters tasks by title and description.

### Filter Tasks

Use the Priority and Label dropdowns to narrow the board.

Search, priority, and label filters can be used together.

Use **Clear Filters** to restore the full board.

### View Task Activity

Open a task's details to see its activity history.

The newest events appear first.

## Advanced Features

### Anonymous Guest Workspaces

Each visitor automatically receives a private guest workspace without creating an email-and-password account.

### Row Level Security

Supabase Row Level Security protects application data at the database level rather than relying only on frontend filtering.

### Optimistic Drag-and-Drop Updates

When a task is moved, the interface updates immediately.

The database update runs afterward. If it fails, the application restores the task to its previous column and displays an error.

### Combined Search and Filtering

Search, priority filtering, and label filtering can operate at the same time.

The application creates a filtered view without modifying the original task data or stored database records.

### Many-to-Many Label Relationships

Tasks and labels use a `task_labels` join table.

This allows:

- One task to have multiple labels
- One label to be assigned to multiple tasks

### Activity Tracking

Task creation, edits, and workflow status changes are recorded separately from the task record itself.

This preserves a lightweight history of user actions.

### Full Task Management

Users can create, read, update, move, label, filter, and delete tasks from the same interface.

### Responsive Interaction Design

The board, forms, controls, menus, and modals adapt for smaller screens.

## Security Considerations

- The Supabase service-role key is never used in the frontend.
- Only the public publishable key is used by the browser.
- Row Level Security is enabled on application tables.
- Records are tied to the authenticated guest user's ID.
- `.env.local` is excluded from GitHub.
- User input is validated before database operations.
- Ownership is enforced by Supabase policies.

## Tradeoffs

### Anonymous Sessions

Anonymous authentication makes the app easy to use, but guest data is tied to the browser session.

A user opening the app on a different device or browser may receive a separate guest workspace.

### Direct Supabase Access

The frontend communicates directly with Supabase, which keeps the architecture simple and reduces hosting complexity.

A larger production application might introduce a dedicated backend API for more complex business rules, auditing, rate limiting, or integrations.

### Column Ordering

The current version stores task status but does not persist custom vertical ordering within each column.

Tasks are displayed using their creation order.

### Activity Detail

The current activity log records major task events, but task edits are stored as a general edit event rather than tracking every changed field individually.

## Future Improvements

Possible future improvements include:

- Persistent task ordering within each column
- Custom confirmation dialogs
- Toast notifications
- Task comments
- Team members and assignees
- Real-time synchronization across browser tabs
- Email or permanent account conversion
- Automated unit and integration tests
- Keyboard-accessible drag-and-drop improvements
- More detailed field-level activity history

## Author

Built by Richard Hanly.

GitHub:

https://github.com/richardrhanly-us

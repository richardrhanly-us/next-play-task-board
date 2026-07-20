# FlowBoard

FlowBoard is a Kanban-style task management application built with React, TypeScript, Supabase, and dnd-kit.

The application allows users to create, organize, edit, move, search, filter, and delete tasks across four workflow stages:

- To Do
- In Progress
- In Review
- Done

Each visitor is automatically signed in as an anonymous guest. Supabase Row Level Security ensures that users can only access their own tasks.

## Live Demo

Add your deployed application URL here:

[https://your-live-app-url.com](https://next-play-task-board-black.vercel.app/)

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

### Priority Filtering

Users can filter the board by:

- All priorities
- High
- Normal
- Low

Search and priority filters can be used together.

### Guest Authentication

The application automatically creates an anonymous Supabase guest session when a user first opens the app.

No email address or password is required.

The guest session is normally restored when the same user returns using the same browser.

### Data Privacy and Row Level Security

Every task is stored with the authenticated guest user's ID.

Supabase Row Level Security policies ensure that users can only:

- View their own tasks
- Create tasks assigned to their own account
- Update their own tasks
- Delete their own tasks

### Persistent Data

Tasks are stored in a Supabase PostgreSQL database.

Tasks remain available after:

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

### Version Control

- Git
- GitHub

## Application Architecture

The application uses a frontend-first architecture.

The React frontend communicates directly with Supabase using the public Supabase publishable key.

The application flow is:

1. The app checks for an existing Supabase session.
2. If no session exists, the user is signed in anonymously.
3. The app retrieves tasks from Supabase.
4. Row Level Security limits the results to the current guest user.
5. Users create, edit, move, search, filter, or delete tasks.
6. Database changes are saved through the Supabase JavaScript client.
7. React state updates the interface immediately.

No custom backend server is required for the current version.

## Database Schema

The application uses a tasks table with the following fields:

- id: UUID primary key
- title: Required text
- description: Optional text
- status: todo, in_progress, in_review, or done
- priority: low, normal, or high
- due_date: Optional date
- user_id: UUID linked to the authenticated Supabase user
- created_at: Timestamp created automatically

## SQL Schema

create table public.tasks (
  id uuid primary key default gen_random_uuid(),

  title text not null
    check (char_length(trim(title)) > 0),

  description text,

  status text not null default 'todo'
    check (
      status in (
        'todo',
        'in_progress',
        'in_review',
        'done'
      )
    ),

  priority text not null default 'normal'
    check (
      priority in (
        'low',
        'normal',
        'high'
      )
    ),

  due_date date,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "Users can view their own tasks"
on public.tasks
for select
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = user_id
);

create policy "Users can create their own tasks"
on public.tasks
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth.uid() = user_id
);

create policy "Users can update their own tasks"
on public.tasks
for update
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = user_id
)
with check (
  auth.uid() is not null
  and auth.uid() = user_id
);

create policy "Users can delete their own tasks"
on public.tasks
for delete
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = user_id
);

## Local Setup

Prerequisites:

- Node.js
- npm
- Git
- A Supabase project

Clone the repository:

git clone https://github.com/richardrhanly-us/next-play-task-board.git

Move into the project folder:

cd next-play-task-board

Install dependencies:

npm install

Create a file named .env.local in the project root.

Add:

VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

Do not use a Supabase secret key or service-role key.

Start the development server:

npm run dev

Open the local address shown in the terminal, usually:

http://localhost:5173

## How to Use the App

### Create a Task

1. Click New Task.
2. Enter a task title.
3. Optionally enter a description.
4. Choose a priority.
5. Optionally select a due date.
6. Click Create Task.

The task appears in the To Do column.

### Move a Task

1. Click and hold a task card.
2. Drag it over another column.
3. Release the card.

The task status is updated and saved to Supabase.

### Edit a Task

1. Click the three-dot menu on a task card.
2. Select Edit Task.
3. Update the task details.
4. Click Save Changes.

### Delete a Task

1. Click the three-dot menu on a task card.
2. Select Delete Task.
3. Confirm the deletion.

### Search Tasks

Enter text in the search box.

The board filters tasks by title and description.

### Filter by Priority

Use the Priority dropdown to display:

- All tasks
- High-priority tasks
- Normal-priority tasks
- Low-priority tasks

Click Clear Filters to restore the full board.

## Advanced Features

### Anonymous Guest Workspaces

Each visitor automatically receives a private guest workspace without creating an email-and-password account.

### Row Level Security

Supabase Row Level Security protects all task operations at the database level rather than relying only on frontend filtering.

### Optimistic Drag-and-Drop Updates

When a task is moved, the interface updates immediately.

The database update runs afterward. If it fails, the application restores the task to its previous column and displays an error.

### Search and Combined Filtering

Search and priority filters can operate at the same time.

The application creates a filtered view without modifying the original task data or stored database records.

### Full Task Management

Users can create, read, update, move, and delete tasks from the same interface.

### Responsive Interaction Design

The board, forms, controls, menus, and modals adapt for smaller screens.

## Security Considerations

- The Supabase service-role key is never used in the frontend.
- Only the public publishable key is used by the browser.
- Row Level Security is enabled on the tasks table.
- Every task is tied to the authenticated guest user's ID.
- .env.local is excluded from GitHub.
- User input is validated before database operations.
- Task ownership is enforced by Supabase policies.

## Tradeoffs

### Anonymous Sessions

Anonymous authentication makes the app easy to use, but guest data is tied to the browser session.

A user opening the app on a different device or browser may receive a separate guest workspace.

### Direct Supabase Access

The frontend communicates directly with Supabase, which keeps the architecture simple and reduces hosting costs.

A larger production application might introduce a dedicated backend API for more complex business rules, auditing, rate limiting, or integrations.

### Column Ordering

The current version stores task status but does not persist custom vertical ordering within each column.

Tasks are displayed using their creation order.

## Future Improvements

Possible future improvements include:

- Persistent task ordering within each column
- Board summary statistics
- Overdue and due-soon indicators
- Custom confirmation dialogs
- Toast notifications
- Task comments
- Activity history
- Labels and tags
- Team members and assignees
- Real-time synchronization across browser tabs
- Email or permanent account conversion
- Automated unit and integration tests
- Keyboard-accessible drag-and-drop improvements

## Author

Built by Richard Hanly.

GitHub:

https://github.com/richardrhanly-us

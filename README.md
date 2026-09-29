# JavaScript Client + Server

A single JavaScript codebase with a Vite client and an Express API, managed from the project root with npm workspaces.

## Requirements

- Node.js 20 or newer
- npm

## Run in development

```sh
npm install
npm run dev
```

Open the client at <http://localhost:5173>. The client sends API requests through Vite to the server at <http://localhost:3000>.

## Other commands

```sh
npm run build        # Build the client
npm run start:server # Run only the server
```

The API includes `GET /api/health` and a SQLite-backed notes resource:

- `GET /api/notes` lists saved notes.
- `POST /api/notes` creates a note with a JSON body such as `{ "content": "First note" }`.
- `DELETE /api/notes/:id` deletes a note by ID.

The SQLite database is created automatically at `server/data/app.sqlite` and persists across server restarts.

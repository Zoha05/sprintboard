# SprintBoard

A working agile sprint board. Create sprints, add tasks, move them across a Kanban board (To do -> In progress -> Done) and watch the progress bar fill.

| Part | Technology |
|---|---|
| Backend | Node.js + Express |
| SQL database | PostgreSQL - stores **sprints** |
| NoSQL database | MongoDB (Mongoose) - stores **tasks** |
| Web UI | Plain HTML/CSS/JS served by Express (no build step) |
| Packaging | Docker + Docker Compose |
| Orchestration | Kubernetes (Deployment, StatefulSets, Service, HPA) |
| CI | GitHub Actions (test + Docker build) |

## Option 1 - Docker Compose (easiest)
Install Docker Desktop, then:
```bash
docker compose up --build
```
Open **http://localhost:3000** in your browser. The green badge at the top shows PostgreSQL and MongoDB are connected.
Stop with `Ctrl+C`; `docker compose down -v` also deletes the data.

## Option 2 - Run without Docker
Needs Node.js 18+, PostgreSQL and MongoDB running locally.
```bash
# create the database once:  createdb sprintboard   (user sprint / password sprint - or edit .env.example)
cp .env.example .env            # optional - environment variables can also be set in your shell
npm install
npm start                       # http://localhost:3000
```

## Option 3 - Kubernetes (Docker Desktop, minikube or kind)
```bash
# 1. build the image where your cluster can see it
docker build -t sprintboard:latest .
#    minikube:  minikube image load sprintboard:latest      kind:  kind load docker-image sprintboard:latest

# 2. deploy everything
kubectl apply -f k8s/
kubectl -n sprintboard get pods -w      # wait until all pods are Running/Ready

# 3. open it
kubectl -n sprintboard port-forward svc/sprintboard 3000:80
#    then visit http://localhost:3000
```
Change the demo password in `k8s/01-config.yaml` before real use. An optional Ingress is in `k8s/optional/`.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/ready` | Liveness / readiness (`/ready` checks both databases) |
| POST | `/api/sprints` | Create `{name, goal?, start_date, end_date}` (dates `YYYY-MM-DD`) |
| GET | `/api/sprints` | List sprints |
| PATCH | `/api/sprints/:id` | Change status `{status: planned\|active\|completed}` |
| DELETE | `/api/sprints/:id` | Delete sprint **and** its tasks |
| GET | `/api/sprints/:id/summary` | Task counts, story points, % complete |
| POST | `/api/tasks` | Create `{title, sprintId, storyPoints?, assignee?, description?}` |
| GET | `/api/tasks?sprintId=&status=` | List tasks |
| PATCH | `/api/tasks/:id` | Update title / status / storyPoints / assignee / description |
| DELETE | `/api/tasks/:id` | Delete task |

Quick test from a terminal:
```bash
curl -X POST localhost:3000/api/sprints -H "Content-Type: application/json" \
  -d '{"name":"Sprint 1","goal":"MVP","start_date":"2026-11-16","end_date":"2026-11-27"}'
curl -X POST localhost:3000/api/tasks -H "Content-Type: application/json" \
  -d '{"title":"Login page","sprintId":1,"storyPoints":5}'
curl localhost:3000/api/sprints/1/summary
```

## Project structure
```
src/
  app.js, server.js        Express app + startup (retries until databases are ready)
  db/postgres.js           PostgreSQL pool + table creation
  db/mongo.js              Mongoose Task model
  routes/                  sprints.js, tasks.js, health.js
public/                    index.html, style.css, app.js  (the web UI)
tests/api.test.js          14 unit tests        ->  npm test
Dockerfile, docker-compose.yml
k8s/                       Kubernetes manifests
.github/workflows/ci.yml   CI pipeline
```

## Design notes
- **Why two databases?** Sprints are small and relational (unique names, date checks, status constraint) so they live in PostgreSQL. Tasks are many, change often and fit documents, so they live in MongoDB. A task stores `sprintId`, and the API checks the sprint exists before creating a task and deletes a sprint's tasks when the sprint is deleted. (There is no cross-database foreign key - that is the trade-off of using two databases.)
- The server waits and retries while the databases start, so start order does not matter.
- No login, as this is a single-team demo app. Adding authentication would be a natural next step.

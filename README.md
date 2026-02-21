# 🎯 BetTracker

Personal sports betting tracker with AI-powered analysis, OCR ticket import, and advanced analytics dashboard.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | PostgreSQL database |
| [Python](https://www.python.org/downloads/) | 3.10+ | Backend API |
| [Node.js](https://nodejs.org/) | 18+ | Frontend |
| [Ollama](https://ollama.com/) | Latest | Local AI (OCR + analysis) |

## Quick Start (Windows)

```bash
# 1. Clone & enter the project
cd BetTracker

# 2. Pull required AI models
ollama pull llama3.2-vision
ollama pull qwen2.5:14b-instruct

# 3. Setup backend
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# 4. Setup frontend
cd ..\frontend
npm install

# 5. Start everything
cd ..
start.bat
```

The `start.bat` script handles everything automatically:
- Starts PostgreSQL via Docker
- Runs database migrations & seeds
- Launches backend (port 8000) and frontend (port 3000)

## Manual Start

If you prefer to start services manually:

```bash
# 1. Start PostgreSQL
cd docker
docker compose up -d

# 2. Start backend
cd ../backend
.\venv\Scripts\activate
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000

# 3. Start frontend (new terminal)
cd frontend
npm run dev
```

## Environment Variables

Backend config is in `backend/.env`:

```env
DATABASE_URL=postgresql://bettracker:bettracker123@localhost:5432/bettracker
OLLAMA_URL=http://localhost:11434
OLLAMA_VISION_MODEL=llama3.2-vision
OLLAMA_TEXT_MODEL=qwen2.5:14b-instruct
```

## URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL
- **Frontend:** Next.js 16, React 19, Recharts, Tailwind CSS 4
- **AI:** Ollama (local LLM for OCR and betting analysis)

## Features

- 📊 Dashboard with advanced analytics (ROI by sport, market, odds, weekday)
- 📸 OCR import — paste or drag a betting slip screenshot
- ✏️ Manual ticket entry with inline status editing
- 🤖 AI-powered betting analysis
- 🎉 Win streak celebrations
- 🔍 Filters, sorting, and grouped statistics

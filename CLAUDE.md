# EstateIQ - AI-Powered Real Estate Training Platform

منصة تدريب ذكية للوكلاء العقاريين السعوديين. تدعم العربية والإنجليزية.

## Tech Stack

**Backend:** Node.js + Express + TypeScript + PostgreSQL + Prisma
**Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + Zustand
**AI:** Anthropic Claude + Google Gemini + ElevenLabs

## Project Structure

```
C:\Claude\AI-Powered-Professional-Training\
├── backend/                 # Express API (port 3001)
│   ├── src/
│   │   ├── controllers/     # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Database queries
│   │   ├── middleware/      # Auth, RBAC
│   │   └── routes/          # Route definitions
│   └── prisma/schema.prisma # Database schema
│
├── frontend/                # Next.js (port 3000)
│   ├── src/app/            # Pages (App Router)
│   ├── src/components/     # React components
│   └── src/lib/api/        # API client
```

---

## Production URLs (LIVE)

| Service | URL |
|---------|-----|
| **Frontend (Vercel)** | https://estateiq-app.vercel.app |
| **Backend (Cloud Run)** | https://estateiq-backend-1034531078253.us-central1.run.app |
| **Database (Cloud SQL)** | 35.223.221.237 (PostgreSQL 15) |

---

## Auto-Deploy (GitHub Integration)

### Frontend → Vercel
- **Repo:** https://github.com/inBots-Organization/estateiq-frontend
- **Auto-deploy:** Push to `main` triggers automatic deployment
- **Dashboard:** https://vercel.com/inbotsteam/estateiq-app

### Backend → GCP Cloud Run
- **Repo:** https://github.com/inBots-Organization/estateiq-backend
- **Auto-deploy:** Push to `main` triggers Cloud Build → Cloud Run
- **GCP Project:** `gen-lang-client-0276541401` (INlearn)
- **Region:** us-central1

### Deploy Workflow
```bash
# Frontend - just push to GitHub
cd frontend
git add .
git commit -m "feat: description"
git push origin main
# Vercel auto-deploys in ~1-2 minutes

# Backend - just push to GitHub
cd backend
git add .
git commit -m "feat: description"
git push origin main
# Cloud Build auto-deploys in ~3-5 minutes
```

---

## Environment Variables

### Frontend (Vercel)
```env
NEXT_PUBLIC_API_URL=https://estateiq-backend-1034531078253.us-central1.run.app/api
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=<agent-id>
```

### Backend (Cloud Run)
```env
# Database
DATABASE_URL=postgresql://estateiq:EstateIQ2024@35.223.221.237:5432/estateiq

# Auth
JWT_SECRET=<secret>

# AI Services
ANTHROPIC_API_KEY=<key>
GEMINI_API_KEY=<key>

# ElevenLabs Voice
ELEVENLABS_API_KEY=<key>
ELEVENLABS_AGENT_ID=<agent-id>
```

### Update Cloud Run Env Vars
```bash
gcloud run services update estateiq-backend \
  --region us-central1 \
  --set-env-vars "KEY=value,KEY2=value2"
```

---

## Database

### Production (Cloud SQL)
```
Host: 35.223.221.237
Database: estateiq
User: estateiq
Password: EstateIQ2024
```

### Local Development (Docker)
```bash
# Start local PostgreSQL
docker start estateiq-postgres

# Connection string
postgresql://estateiq:EstateIQ2024@localhost:5432/estateiq

# Prisma commands
cd backend
npx prisma generate    # After schema changes
npx prisma db push     # Sync to database
npx prisma studio      # View data (port 5555)
```

---

## Running Locally

```bash
# 1. Start Docker Desktop
# 2. Start PostgreSQL
docker start estateiq-postgres

# 3. Backend (Terminal 1)
cd backend && npm run dev   # http://localhost:3001

# 4. Frontend (Terminal 2)
cd frontend && npm run dev  # http://localhost:3000
```

---

## User Roles

| Role | Access |
|------|--------|
| `saas_super_admin` | Platform-wide, all orgs, billing |
| `org_admin` | Organization management |
| `trainer` | Manage assigned trainees |
| `trainee` | Training features only |

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@estateiq.com | SuperAdmin@123! |
| Org Admin | abdullah@macsoft.com | 123456 |
| Trainer | ahmed@macsoft.com | 123456 |
| Trainee | demo-trainee@macsoft.com | 123456 |

---

## Key Features

1. **Simulation Training** - AI conversations with clients
2. **Voice Training** - Real-time calls (ElevenLabs)
3. **AI Teacher** - Chat assistant
4. **Courses** - Video learning
5. **Reports** - Performance analytics
6. **Admin Dashboard** - User/group management
7. **Super Admin** - Platform management, subscriptions

---

## GCP Commands (Useful)

```bash
# View Cloud Run logs
gcloud run services logs read estateiq-backend --region us-central1

# Check Cloud Build status
gcloud builds list --limit=5

# Update Cloud Run service
gcloud run services update estateiq-backend --region us-central1 --set-env-vars "KEY=value"

# Connect to Cloud SQL
gcloud sql connect estateiq-db --user=estateiq --database=estateiq
```

---

## Troubleshooting

### Frontend Issues
```bash
# Check Vercel deployment
# Go to: https://vercel.com/inbotsteam/estateiq-app/deployments
```

### Backend Issues
```bash
# Check Cloud Run logs
gcloud run services logs read estateiq-backend --region us-central1 --limit=50

# Check if service is running
gcloud run services describe estateiq-backend --region us-central1
```

### Database Issues
```bash
# Local: restart Docker container
docker start estateiq-postgres

# Production: check Cloud SQL status
gcloud sql instances describe estateiq-db
```

### CORS Issues
CORS is configured in `backend/src/app.ts`. Allowed origins:
- http://localhost:3000
- https://estateiq-app.vercel.app
- Any *.vercel.app (preview deployments)

### Voice Training Issues
- Requires HTTPS (works on production, not localhost)
- Needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID
- Microphone permission must be granted in browser

---

## API Tokens (DO NOT COMMIT)

These are stored securely in environment variables:
- **Vercel Token:** Used for Vercel API (stored separately)
- **GCP:** Uses `gcloud auth` authentication
- **GitHub:** Uses SSH keys or personal access tokens

---

## Browser Automation (Chrome MCP)

```
> افتح المتصفح وروح على google.com
> خد screenshot للصفحة
> اضغط على زر Login
```

Claude يفهم الأوامر بالعربي ويستخدم Chrome MCP تلقائياً.

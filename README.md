# Nagpur Connect

**AI-powered civic and emergency response coordination platform for Nagpur**

> Report civic issues using your voice or text. Our AI understands your problem, identifies the responsible departments, and tracks resolution — so you don't have to navigate bureaucracy.

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- TiDB/MySQL-compatible database (optional for demo)

### Installation

```bash
# Clone the repository
cd nagpur-connect

# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your values

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Architecture

This is a **modular monolith** built with:

- **Next.js 16** with App Router and TypeScript (strict mode)
- **Tailwind CSS 4** with custom design tokens
- **TiDB/MySQL** compatible database (ULID primary keys)
- **Provider pattern** for AI, maps, notifications

### Project Structure

```
nagpur-connect/
  src/
    app/                    # Next.js App Router pages
      (public)/             # Landing, emergency, track, login, register
      (citizen)/            # Report flow
      (admin)/admin/        # City command centre
      (department)/department/ # Department triage & dispatch
      (worker)/worker/      # Mobile worker portal
      api/                  # Route handlers
    components/
      ui/                   # Design system primitives
      layout/               # Navbar, footer, sidebars
    lib/                    # Shared utilities
    modules/                # Domain modules
      incidents/domain/     # Types, state machine
      ai/                   # STT & analysis providers
      maps/                 # Map provider interface
      notifications/        # Notification providers
    db/
      schema/               # SQL migration files
```

### Design System

Dark editorial canvas inspired by the Framer reference:
- Near-black canvas with charcoal surface elevations
- Inter font from Google Fonts
- Restrained blue accent (#4D8CF5)
- Accessible semantic status colours (critical, high, medium, low)
- 44px minimum touch targets
- Glassmorphism navigation

## Portal Overview

| Portal | Route | Purpose |
| --- | --- | --- |
| **Public** | `/` | Landing, emergency, track |
| **Citizen** | `/report` | Voice/text report, AI analysis, confirm |
| **Admin** | `/admin` | City command centre, KPIs, map, config |
| **Department** | `/department` | Triage, dispatch, verification |
| **Worker** | `/worker` | Mobile task queue, evidence upload |

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | TiDB/MySQL connection string |
| `SESSION_SECRET` | Session signing secret |
| `AI_PROVIDER` | `fixture` for demo, `gemini`/`openai` for production |
| `MAP_PROVIDER` | `leaflet`, `mapbox`, or `google` |
| `NOTIFICATION_PROVIDER` | `console` for demo |

## Demo Mode

The platform runs in demo mode by default with:
- **Fixture AI provider** — deterministic analysis results
- **Console notifications** — logged to stdout
- **Fixture map** — placeholder with simulated markers
- **Sample data** — KPIs, incidents, departments, workers

No external API keys or database required for the demo.

## Security Notes

- Passwords hashed with Argon2id
- Opaque session tokens stored hashed
- RBAC + resource-scope authorization
- AI output treated as untrusted input
- Emergency contacts must be verified before activation
- Privacy levels: PUBLIC, RESTRICTED, SENSITIVE
- Append-only audit logging

## Known Limitations

- Database integration pending (demo uses fixture data)
- Real-time updates use polling (SSE/WebSocket pending)
- Map integration requires provider configuration
- Email/SMS notifications require approved provider accounts
- Emergency guidance is informational only — no dispatch

## License

Private — all rights reserved.

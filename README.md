# SmartPharm

A vision-first AI + ML operating system for physical Indian pharmacies.

## Architecture

```
pharmacy app/
├── backend/          # Python + Flask API server
│   ├── app/          # Application package
│   │   ├── models/   # SQLAlchemy database models
│   │   ├── api/      # API blueprints (routes)
│   │   ├── services/ # Business logic layer
│   │   └── utils/    # Shared utilities
│   ├── migrations/   # Alembic database migrations
│   └── tests/        # Pytest test suite
└── frontend/         # Next.js frontend (coming soon)
```

## Technology Stack

- **Backend**: Python + Flask
- **Database**: MySQL (via PyMySQL + Flask-SQLAlchemy)
- **Migrations**: Flask-Migrate (Alembic)
- **Frontend**: Next.js (planned)

## Getting Started

### Prerequisites

- Python 3.10+
- MySQL 8.0+
- Node.js 18+ (for frontend)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate    # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env with your MySQL credentials

# Create the database
mysql -u root -p -e "CREATE DATABASE smartpharm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Run migrations
flask db init
flask db migrate -m "Initial schema"
flask db upgrade

# Run the server
python run.py
```

### Running Tests

```bash
cd backend
pytest -v
```

## Core Data Model

```
Medicine (permanent identity)
    └── Batch (manufactured batch with expiry)
        └── Inventory (physical stock at a location)
```

This three-level hierarchy is the foundation of SmartPharm.
A medicine's identity is permanent. Batches come and go. Inventory tracks physical stock.

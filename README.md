# MaterialFlow

MaterialFlow runs a React frontend, FastAPI backend, and PostgreSQL database with Docker Compose.

## Run with Docker Compose

1. Copy `.env.example` to `.env`.
2. Replace the example database password in both `POSTGRES_PASSWORD` and `DATABASE_URL` with the same value.
3. If the password contains URL-reserved characters, percent-encode it in `DATABASE_URL`.
4. Start the services:

   ```sh
   docker compose up --build
   ```

The frontend is available at <http://localhost:8080> and the API at <http://localhost:8000>.

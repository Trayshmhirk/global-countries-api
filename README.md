# Global Countries API

A comprehensive Node.js + Express API that provides detailed country information including economic indicators, demographics, and exchange rates. Features data caching with MySQL and dynamic image generation for visual insights.

## Features

- POST /countries/refresh — fetches countries and exchange rates and caches them
- GET /countries — list countries (filter by ?region= or ?currency= ; sort ?sort=gdp_desc)
- GET /countries/:name — fetch a single country (by name, case-insensitive)
- DELETE /countries/:name — delete a country (by name)
- GET /status — total countries and last refresh timestamp
- GET /countries/image — serve generated summary image (cache/summary.png)

## Requirements

- Node 18+ recommended
- MySQL server

## Setup

Clone the repository and change into the project directory:

```bash
git clone <repo-url>
cd country-api
```

Create a `.env` file in the project root (you can copy `.env.example`):

```bash
cp .env.example .env
# then edit .env to set your DATABASE_PASSWORD and any other values
```

Example values (edit to match your MySQL instance):

```env
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=yourpassword
DATABASE_NAME=country_cache
PORT=3000
```

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

The server will create the necessary tables automatically on first run.

## Running the tests (endpoints)

A lightweight endpoint test script is included at `scripts/test-endpoints.sh`.

Run it with:

```bash
npm run test:endpoints
# or
npm test
```

The script hits the following endpoints in order and performs basic checks:

- POST /countries/refresh
- GET /countries
- GET /countries?region=Africa&sort=gdp_desc
- GET /countries/Nigeria
- DELETE /countries/Nigeria
- GET /status
- GET /countries/image (checks for Content-Type: image/png)

## Endpoints

- POST /countries/refresh

  - Fetches country and exchange rate data from external APIs and upserts into MySQL.
  - On success returns: `{ "ok": true, "total_refreshed_at": "<ISO timestamp>" }`.
  - If an external API fails, returns 503 with details pointing to the failing API.

- GET /countries

  - Returns list of cached countries as JSON.
  - Optional query params:
    - `region` — filter by region (e.g., `?region=Africa`)
    - `currency` — filter by currency code (e.g., `?currency=NGN`)
    - `sort=gdp_desc` — sort by estimated_gdp descending

- GET /countries/:name

  - Returns a single country (case-insensitive match by name). Returns 404 if not found.

- DELETE /countries/:name

  - Deletes the country record. Returns `{ "ok": true }` on success or 404 if not found.

- GET /status

  - Returns `{ "total_countries": <n>, "last_refreshed_at": "<ISO timestamp>" }`.

- GET /countries/image
  - Serves a generated PNG summary image (shows total countries, top 5 by estimated_gdp with flags, and timestamp).
  - If no image exists or generation fails, an error response is returned.

## Behavior details / notes

- Currency handling on refresh:

  - If a country has multiple currencies, only the first currency code is used.
  - If the currencies array is empty, `currency_code` and `exchange_rate` are set to `null` and `estimated_gdp` is set to 0; the country is still stored.
  - If a currency code is not found in the exchange rates response, `exchange_rate` and `estimated_gdp` are set to `null`; the country is still stored.

- Upsert behavior:

  - Countries are matched by `name` (the DB enforces a UNIQUE constraint on `name`), and existing rows are updated via `INSERT ... ON DUPLICATE KEY UPDATE`.
  - The estimated_gdp is recalculated for each refresh using a new random multiplier between 1000 and 2000.

- Image generation:
  - After a successful refresh the app generates `cache/summary.png` (top 5 by estimated_gdp). Flags are fetched from the stored `flag_url` when possible; for SVG flag URLs served by `flagcdn.com` the generator requests a PNG variant to draw.

## Environment variables

- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` — MySQL connection
- `PORT` — server listen port

## Troubleshooting

- If the server cannot connect to MySQL, check your `.env` and ensure MySQL is running and reachable.
- If external APIs fail, the refresh endpoint will return 503 and the DB will not be modified.

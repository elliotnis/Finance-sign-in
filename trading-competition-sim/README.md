# Youth Financetopia Challenge compatibility gateway

The canonical challenge is the React app at `/youth-financetopia`. It uses the
shared backend for teams, portfolios, timed rounds, and server-verified host
permissions.

The container on port `4173` serves the dedicated Youth-only frontend. Its nginx
configuration redirects `/` to the participant route and proxies only challenge
routes plus built assets; normal sign-up portal routes return `404`. The old
browser-local simulation files stay in this folder only as historical source and
are not served by the container.

From the repository root:

```bash
docker compose up --build
```

- Participant portal: `http://localhost:4173/youth-financetopia`
- Gamemaster console: `http://localhost:4173/youth-financetopia/gamemaster`
- Root URL: `http://localhost:4173` (redirects to the participant portal)

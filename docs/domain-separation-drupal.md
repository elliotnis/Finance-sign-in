# Sign-up Portal and Youth Financetopia Challenge Domain Separation

This project has two different audiences:

| System | Audience | Purpose | Recommended public domain |
| --- | --- | --- | --- |
| Sign-up portal | HKUST students/admins | Tutoring sessions, classes, verification, database admin | `signup.example.hkust.edu.hk` |
| Youth Financetopia Challenge | High school students | Trading game, teams, market rounds, leaderboard | `youth-financetopia.example.hkust.edu.hk` |

Use the real HKUST-approved domains once they are assigned. The names above are placeholders.

## Current Code Separation

- The normal sign-up dashboard no longer links to the trading game.
- HKUST sign-up access and Youth Financetopia Challenge access use separate admin-managed email lists.
- The trading APIs remain under `/api/trading/*` on the backend.
- The React trading portal is available at `/youth-financetopia` for the trading domain to use.
- The standalone static frontend in `trading-competition-sim/` can be served independently.

## Recommended Production Setup

Use DNS plus a reverse proxy in front of Docker:

1. Point the sign-up domain to the VPS or HKUST reverse proxy.
2. Point the Youth Financetopia Challenge domain to the same VPS or HKUST reverse proxy.
3. Route the sign-up domain to the normal frontend container.
4. Route the Youth Financetopia Challenge domain to either:
   - the React trading portal route, if you want the team/gamemaster/continuous API version, or
   - the `trading-competition-sim` container, if you want the standalone simpler high-school game.

## Drupal Role

Drupal can separate the public-facing domains if HKUST IT gives you Drupal domain aliases or separate Drupal sites. Drupal should mainly be used for:

- landing pages,
- event information,
- eligibility/instructions,
- links or redirects into the two web apps.

The actual app separation should be enforced by DNS and web server routing, not only by Drupal menu links. If Drupal only hides links, students can still type a route manually.

## Reverse Proxy Template

This example assumes:

- normal frontend container is reachable on `127.0.0.1:8080`,
- backend API is reachable on `127.0.0.1:8000`,
- standalone Youth Financetopia Challenge container is reachable on `127.0.0.1:4173`.

```nginx
server {
    listen 443 ssl;
    server_name signup.example.hkust.edu.hk;

    location ^~ /finance-development {
        return 404;
    }

    location ^~ /youth-financetopia {
        return 404;
    }

    location ^~ /trading-sim {
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name youth-financetopia.example.hkust.edu.hk;

    # Option A: route to the React trading portal.
    location = / {
        return 302 /youth-financetopia;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For the standalone high-school game instead, point the Youth Financetopia Challenge domain at port `4173`:

```nginx
server {
    listen 443 ssl;
    server_name youth-financetopia.example.hkust.edu.hk;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Environment Variables

Set these for production:

```env
FRONTEND_URL=https://signup.example.hkust.edu.hk
VITE_API_URL=/api
CORS_ORIGINS=https://signup.example.hkust.edu.hk,https://youth-financetopia.example.hkust.edu.hk
```

If both domains proxy `/api/` to the backend on the same origin, CORS is less likely to matter for browser calls, but keeping `CORS_ORIGINS` explicit is still safer.

## Final Checklist

- Confirm final domain names with HKUST IT.
- Add DNS records for both domains.
- Add TLS certificates for both domains.
- Configure the reverse proxy or Drupal domain aliases.
- Confirm `signup` domain cannot access `/finance-development`, `/youth-financetopia`, or `/trading-sim`.
- Confirm Youth Financetopia Challenge can request email codes and reach `/api/trading/*`.
- Manage sign-up allowed emails and high-school challenge allowed emails in their separate database sections.

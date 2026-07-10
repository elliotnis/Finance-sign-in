# Deploy to FNZ231 (GitHub Actions)

Pushing to `main` or `master` runs the test job and then deploys to the FNZ231 Docker Compose host. A repository-scoped self-hosted GitHub Actions runner on FNZ231 receives the deployment job over its outbound connection to GitHub. The deployment updates the existing clone at `/home/adm1/sign-up-system`, keeps its `.env` file and MongoDB Docker volume, rebuilds the images, and verifies the web page and `/api/docs` endpoint.

## One-time GitHub configuration

The runner is registered specifically to `elliotnis/Finance-sign-in` with the `fnz231-deploy` label. No SSH password or SSH port is stored in GitHub.

The following repository variable is optional; the value shown is the configured default:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VPS_DEPLOY_PATH` | `/home/adm1/sign-up-system` | Existing application checkout on the server. |

## Server requirements

FNZ231 already meets these requirements: Docker Engine, Docker Compose v2, a clone of this repository at the deployment path, and an SSH key/configuration that allows that clone to fetch `origin` from GitHub. Its `.env` remains only on the server and continues to provide SMTP, database, frontend URL, and other runtime settings. It also needs the repository-scoped GitHub Actions runner installed as the `adm1` user and running as a service.

## Deployment behaviour

1. GitHub Actions builds the frontend and syntax-checks the backend.
2. The FNZ231 runner picks up the deploy job through its outbound GitHub connection and fetches the pushed branch in the existing server clone.
3. It force-checks out `origin/main` or `origin/master` in that clone. This resets **tracked application files** only; `.env` and Docker volumes are not removed.
4. `docker compose up -d --build --remove-orphans` rebuilds and restarts the stack.
5. The workflow waits for `http://127.0.0.1/` and `http://127.0.0.1/api/docs`; a failure makes the GitHub Actions run fail.

The server keeps its inbound SSH firewall restricted to the existing internal/VPN ranges; GitHub Actions does not need inbound SSH access.

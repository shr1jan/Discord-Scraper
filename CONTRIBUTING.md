# Contributing

Thank you for your interest in contributing.

## Development Setup

1. Fork and clone the repo
2. Run `pnpm install` at the root
3. Install Python deps: `cd backend && pip install -r requirements.txt`
4. Copy `.env.example` / `.env.local.example` files and configure
5. Run `pnpm dev` to start both backend and frontend

## Guidelines

- Follow existing code style and project structure
- Keep rate-limit friendliness in mind for Discord API calls
- Avoid adding new required secrets when possible
- Test your changes locally before submitting a PR

## Pull Requests

1. Open an issue first for larger changes
2. Create a branch from `main`
3. Make your changes with clear commit messages
4. Ensure the app runs and exports work as expected
5. Submit a PR with a description of the changes

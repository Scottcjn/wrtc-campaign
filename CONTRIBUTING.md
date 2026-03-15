# Contributing to WRTC Campaign

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork** this repository
2. **Clone** your fork locally
3. **Create a branch** for your changes: `git checkout -b my-feature`
4. **Make your changes** and test them
5. **Commit** with a clear message
6. **Push** to your fork and open a **Pull Request**

## Development Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/wrtc-campaign.git
cd wrtc-campaign

# Copy environment config
cp config.example.env .env
# Edit .env with your values

# Install Node.js dependencies (if applicable)
# The project uses ES modules (.mjs)

# Install Python dependencies (if applicable)
pip install -r requirements.txt  # if present
```

## Code Style

- **JavaScript**: ES modules (`.mjs`), use `const`/`let` (no `var`)
- **Python**: Follow PEP 8, use type hints where practical
- **Commits**: Use conventional commit format (`feat:`, `fix:`, `docs:`, `chore:`)

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Reference any related issues (e.g., `Fixes #123`)
- Ensure your code doesn't break existing functionality

## Reporting Issues

- Use GitHub Issues to report bugs or suggest features
- Include steps to reproduce for bug reports
- Check existing issues before creating a new one

## Code of Conduct

Be respectful and constructive in all interactions. We're building together.

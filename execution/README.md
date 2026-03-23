# Execution (Layer 3)

This directory contains **Execution Scripts**, which are deterministic Python scripts.

## Purpose
Execution scripts handle the actual work: API calls, file processing, database interaction, etc. They should be reliable, testable, and completely separated from the decision-making logic.

## Principles
1. **Deterministic**: Same input = same output.
2. **Atomic**: Do one thing well.
3. **Configurable**: Use environment variables (from `.env`) or arguments, strict no hardcoding of secrets.

## Usage
Run these scripts via the Agent's `run_command` tool.
Example: `python3 execution/scrape_site.py --url https://example.com`

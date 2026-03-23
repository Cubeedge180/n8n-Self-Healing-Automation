# Directives (Layer 1)

This directory contains **Directives**, which are Standard Operating Procedures (SOPs) written in Markdown.

## Purpose
Directives define **what to do**. They serve as the instructions for the "Orchestration Layer" (Agent/You) to follow.

## Format
Each directive should include:
1. **Goal**: What are we trying to achieve?
2. **Inputs**: What information/files are needed?
3. **Execution Steps**: Which tools or scripts from `execution/` should be called?
4. **Outputs**: What is the expected result?
5. **Edge Cases**: How to handle common failures?

## Workflow
1. Read the relevant directive.
2. Formulate a plan.
3. Call the scripts in `execution/` as defined in the directive.

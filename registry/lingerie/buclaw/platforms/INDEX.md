# Platform Guides

This directory contains step-by-step browser instructions for specific platforms.
Each guide tells the browser agent exactly how to accomplish a task on that platform.

## How to use

1. Match the user's request to a platform below using the **keywords** and **domains**.
2. Read the matching guide file for detailed instructions and required fields.
3. Verify all **required fields** are present in the task description.
4. If any are missing, return a message listing exactly what is needed — do **not** proceed.
5. If all are present, call `browser_agent_run` with the task description enriched with the guide's step-by-step instructions.

If no platform matches, proceed with `browser_agent_run` using your best judgment — no guide is needed for every task.

## Available platforms

| Platform | File | Domains | Keywords |
|----------|------|---------|----------|
| OpenTable | opentable.md | opentable.co.uk | book, reserve, reservation, restaurant, table, opentable, dinner |

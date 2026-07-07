---
description: Run the Visuala adaptive multi-agent workflow through the orchestrator.
agent: orchestrator
---

Use the Visuala multi-agent workflow for this request:

$ARGUMENTS

Workflow requirements:
- Route adaptively through Planner, Implementer, and Reviewer as needed.
- Use only multiple-choice questions for user clarification or confirmation.
- Enforce `docs/ai-coding-rules..md`.
- Validate changes with available lint, typecheck, test, or build commands.
- Keep the final response concise and include required completion sections after code changes.

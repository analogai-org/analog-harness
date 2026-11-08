---
kind: upgrade-guide
description: "Chat-backed model selection follows the Chat main allocation instead of saved Harness defaults and Session selections."
---

# Chat owns the main model selection

English | [中文](guide.zh.md)

## Change

Harness profiles connected to the local Chat service show its Agent Execution model allocation in the chat dropdown. Saved `agent-default-model` values in `cordis.patch.yml` and historical Session selections no longer determine that label or the model for the next admitted prompt. Selecting a configured Chat model updates Chat's main allocation. Other deployments retain Session-specific selection.

## Migration

1. Open **Settings → Models** and configure the Reasoning and Fast models.
2. Under **Task Model Allocation**, set **Agent Execution** to the desired model type. The same choice is available in the Chat dashboard.
3. Confirm the chat dropdown displays that model before sending a prompt. No Session logs or projection-cache files need deletion or manual edits.

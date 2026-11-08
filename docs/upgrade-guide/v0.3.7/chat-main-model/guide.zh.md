---
kind: upgrade-guide
description: "Chat 模型选择遵循 Chat 主模型分配，不再由已保存的 Harness 默认值及会话选择决定。"
---

# Chat 管理主模型选择

[English](guide.md) | 中文

## 变更

连接本地 Chat 服务的 Harness profile 在聊天下拉框中显示智能体执行的模型分配。`cordis.patch.yml` 中已保存的 `agent-default-model` 值及历史会话选择不再决定该名称或下次接收提示时使用的模型。选择已配置的 Chat 模型会更新 Chat 主模型分配。其他部署保留会话专属选择。

## 迁移

1. 打开**设置 → 模型**，配置推理模型和快速模型。
2. 在**任务模型分配**中，将**智能体执行**设为所需模型类型。Chat 仪表板也提供同一选择。
3. 发送提示前，确认聊天下拉框显示该模型。无需删除或手动编辑会话日志及投影缓存文件。

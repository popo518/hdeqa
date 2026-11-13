import { taskInstanceId } from './data.js';

export function recordTaskCompletion(state, task, date, completedAt, transactionId) {
  const instanceId = taskInstanceId(task.id, date);
  if (state.completions[instanceId]) return { ok: false, reason: 'duplicate' };

  const reward = { ...task.reward };
  const record = {
    id: instanceId,
    taskId: task.id,
    title: task.title,
    date,
    completedAt,
    reward,
    transactionId,
    confirmation: 'user-confirmed',
    sourceId: null,
  };

  state.completions[instanceId] = record;
  state.transactions.push({
    id: transactionId,
    type: 'task-reward',
    taskId: task.id,
    taskTitle: task.title,
    date,
    createdAt: completedAt,
    resources: reward,
    note: 'مكافأة افتراضية داخل اللعبة بعد تأكيد المستخدم',
  });

  for (const [resource, quantity] of Object.entries(reward)) {
    state.resources[resource] = (state.resources[resource] || 0) + quantity;
    state.resourceLots.push({
      id: `${transactionId}-${resource}`,
      resource,
      quantity,
      remaining: quantity,
      taskId: task.id,
      transactionId,
      earnedAt: completedAt,
    });
  }

  const resourceLabels = { seeds: 'بذور', wood: 'خشب', stone: 'حجر' };
  state.history.push({
    id: transactionId,
    type: 'task',
    title: `تسجيل: ${task.title}`,
    description: `أُضيفت موارد افتراضية: ${Object.entries(reward).map(([key, value]) => `${value} ${resourceLabels[key] || key}`).join('، ')}.`,
    createdAt: completedAt,
  });

  return { ok: true, record };
}

export function spendResources(state, cost) {
  const plan = [];
  for (const [resource, amountNeeded] of Object.entries(cost)) {
    if ((state.resources[resource] || 0) < amountNeeded) return null;
    let remaining = amountNeeded;
    const lots = state.resourceLots
      .filter(lot => lot.resource === resource && lot.remaining > 0)
      .sort((a, b) => new Date(a.earnedAt) - new Date(b.earnedAt));

    for (const lot of lots) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, lot.remaining);
      remaining -= amount;
      plan.push({
        lotId: lot.id,
        transactionId: lot.transactionId,
        taskId: lot.taskId,
        resource,
        quantity: amount,
        earnedAt: lot.earnedAt,
      });
    }
    if (remaining > 0) return null;
  }

  for (const part of plan) {
    const lot = state.resourceLots.find(entry => entry.id === part.lotId);
    if (!lot || lot.remaining < part.quantity) return null;
  }

  for (const part of plan) {
    const lot = state.resourceLots.find(entry => entry.id === part.lotId);
    lot.remaining -= part.quantity;
  }
  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] -= amount;
  }
  return plan.map(({ lotId, ...part }) => part);
}

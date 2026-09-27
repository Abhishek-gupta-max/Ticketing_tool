import * as repo from '../repositories/approval.repository.js';

const row = (r) => ({
  kind: r.kind, approvalId: r.approval_id, role: r.role, approver: r.approver_id ? { id: r.approver_id, name: r.approver_name } : null,
  waitingSince: r.waiting_since, record: { id: r.record_id, number: r.record_number, title: r.title, route: r.kind === 'change' ? 'changes' : 'tickets' },
  requesterName: r.requester_name, customerName: r.customer_name,
});

export async function overview(user) {
  const [mine, all, history] = await Promise.all([repo.mine(user), repo.allPending(), repo.history(30)]);
  return {
    mine: mine.map(row),
    all: all.map(row),
    history: history.map((h) => ({
      id: h.id, kind: h.kind, decision: h.decision, decidedAt: h.decided_at, decidedBy: h.decided_by_name, role: h.role, comment: h.comment,
      record: { number: h.record_number, title: h.title, route: h.kind === 'change' ? 'changes' : 'tickets' },
    })),
    kpis: {
      mine: mine.length,
      requests: all.filter((x) => x.kind === 'request').length,
      changes: new Set(all.filter((x) => x.kind === 'change').map((x) => x.record_id)).size,
      decided: history.length,
      rejected: history.filter((h) => h.decision === 'Rejected').length,
    },
  };
}

export const myCount = async (user) => (await repo.mine(user)).length;

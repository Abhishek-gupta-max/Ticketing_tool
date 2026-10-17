import { find, distinct, mapBy, aggregate, like } from '../config/database.js';

/** Global search across records the user may see (4 results per group). */
export async function search(q, user) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const s = like(term);
  const out = [];
  const add = (group, rows, fn) => rows.forEach((r) => out.push({ group, ...fn(r) }));
  const peopleNamed = await distinct('people', 'id', { name: s });

  const scope = user.can('ticket:view_all') ? {} : { requester_id: user.personId || -1 };
  const tickets = await find('tickets', {
    deleted_at: null, ...scope, $or: [{ ticket_number: s }, { title: s }, { requester_id: { $in: peopleNamed } }],
  }, { sort: { created_at: -1 }, limit: 4, projection: { ticket_number: 1, title: 1 } });
  add('Tickets', tickets, (r) => ({ href: `/tickets/${r.ticket_number}`, title: r.title, sub: r.ticket_number }));

  if (user.isStaff) {
    add('Problems', await find('problems', { deleted_at: null, $or: [{ problem_number: s }, { title: s }] }, { limit: 4, projection: { problem_number: 1, title: 1 } }),
      (r) => ({ href: `/problems/${r.problem_number}`, title: r.title, sub: r.problem_number }));
    add('Changes', await find('changes', { deleted_at: null, $or: [{ change_number: s }, { title: s }] }, { limit: 4, projection: { change_number: 1, title: 1 } }),
      (r) => ({ href: `/changes/${r.change_number}`, title: r.title, sub: r.change_number }));
    add('Tasks', await find('tasks', { $or: [{ task_number: s }, { title: s }] }, { limit: 4, projection: { task_number: 1, title: 1 } }),
      (r) => ({ href: `/tasks/${r.task_number}`, title: r.title, sub: r.task_number }));

    const requests = await find('requests', { $or: [{ request_number: s }, { requested_for_id: { $in: peopleNamed } }] }, {
      sort: { id: -1 }, limit: 4, projection: { id: 1, request_number: 1, requested_for_id: 1 },
    });
    const [people, items] = await Promise.all([
      mapBy('people', requests.map((r) => r.requested_for_id), { projection: { name: 1 } }),
      aggregate('request_items', [{ $match: { request_id: { $in: requests.map((r) => r.id) } } }, { $group: { _id: '$request_id', n: { $sum: 1 } } }]),
    ]);
    const itemCount = new Map(items.map((i) => [i._id, i.n]));
    add('Requests', requests.filter((r) => people.has(r.requested_for_id)).map((r) => ({
      request_number: r.request_number, name: people.get(r.requested_for_id).name, n: itemCount.get(r.id) || 0,
    })), (r) => ({ href: `/requests/${r.request_number}`, title: `Request ${r.request_number} (${r.n} item${r.n === 1 ? '' : 's'})`, sub: r.name }));

    const assets = await find('assets', {
      deleted_at: null,
      $or: [{ asset_tag: s }, { name: s }, { serial_number: s }, { assigned_person_id: { $in: peopleNamed } }, { owner_person_id: { $in: peopleNamed } }],
    }, { limit: 4, projection: { asset_tag: 1, name: 1, asset_type_id: 1 } });
    const types = await mapBy('asset_types', assets.map((a) => a.asset_type_id), { projection: { name: 1 } });
    add('Assets', assets.filter((a) => types.has(a.asset_type_id)).map((a) => ({ ...a, type: types.get(a.asset_type_id).name })),
      (r) => ({ href: `/assets/${r.asset_tag}`, title: r.name, sub: r.type }));
  }

  const kbScope = user.can('kb:view_internal') ? {} : { audience: 'Public', status: 'Published' };
  const tagged = await distinct('knowledge_article_tags', 'article_id', { tag: s });
  add('Knowledge base', await find('knowledge_articles', {
    deleted_at: null, ...kbScope, $or: [{ title: s }, { id: { $in: tagged } }],
  }, { limit: 4, projection: { article_number: 1, title: 1 } }),
  (r) => ({ href: `/kb/${r.article_number}`, title: r.title, sub: r.article_number }));
  return out;
}

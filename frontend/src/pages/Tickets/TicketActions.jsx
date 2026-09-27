import Icon from '../../components/common/Icon';
import { Menu } from '../../components/common/Controls';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useAction } from '../../hooks';
import { ticketService } from '../../services/ticketService';

/** Header buttons and the More menu of a ticket. */
export default function TicketActions({ t, onState, open, followUpOnly }) {
  const { user, can } = useAuth();
  const { openNewTicket } = useUI();
  const toast = useToast();
  const take = useAction(() => ticketService.assign(t.number, user.id), { invalidate: ['ticket', 'tickets', 'dashboard'], success: `${t.number} assigned to you` });
  const isOpen = ['New', 'In Progress', 'On Hold', 'Awaiting approval'].includes(t.status);
  const ro = t.status === 'Closed';

  const followUp = () => openNewTicket({
    title: `Related to ${t.number}: ${t.title}`.slice(0, 250), description: `Linked to ${t.number}.`, customerId: t.customer.id, requesterId: t.requester.id,
    categoryId: t.category.id, assetId: t.assetId, parentNumber: t.number, kind: t.kind,
  });
  if (followUpOnly) return <button type="button" className="btn sm" onClick={followUp}>New linked ticket</button>;

  const copy = () => {
    const u = `${window.location.origin}/tickets/${t.number}`;
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Link copied'), () => toast(u));
  };
  const staff = user.isStaff && can('ticket:update');

  return (
    <div className="tools">
      {staff && isOpen && t.status !== 'Awaiting approval' ? <button type="button" className="btn primary" onClick={() => onState('Resolved')}><Icon name="check" />Resolve</button> : null}
      {staff && isOpen && t.assignee?.id !== user.id && t.status !== 'Awaiting approval' && can('ticket:assign') ? <button type="button" className="btn" disabled={take.isPending} onClick={() => take.mutate()}>Assign to me</button> : null}
      {staff && t.status === 'Resolved' ? <>
        {can('ticket:close') ? <button type="button" className="btn" onClick={() => onState('Closed')}>Close ticket</button> : null}
        <button type="button" className="btn" onClick={() => onState('In Progress')}><Icon name="refresh" />Reopen</button>
      </> : null}
      {!isOpen && can('ticket:create') ? <button type="button" className="btn" onClick={followUp}>New linked ticket</button> : null}
      <Menu label="More">
        {!ro && staff ? <button type="button" onClick={() => open('edit')}>Edit short description and description</button> : null}
        {t.kind === 'incident' && isOpen && !t.isMajor && can('major:declare') ? <button type="button" onClick={() => open('major')}>Declare major incident</button> : null}
        {!ro && can('problem:create') ? <button type="button" onClick={() => open('newProblem')}>Create problem from this ticket</button> : null}
        {!ro && can('problem:update') ? <button type="button" onClick={() => open('linkProblem')}>Link to an existing problem</button> : null}
        {!ro && can('change:create') ? <button type="button" onClick={() => open('change')}>Create change from this ticket</button> : null}
        {staff ? <div className="sep" /> : null}
        <button type="button" onClick={copy}>Copy ticket link</button>
      </Menu>
    </div>
  );
}

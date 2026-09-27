import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute, ADMIN, META, ticket } from './utils';
import TicketList from '../pages/Tickets/TicketList';
import TicketDetails from '../pages/Tickets/TicketDetails';
import CreateTicket from '../pages/Tickets/CreateTicket';
import { ticketService } from '../services/ticketService';

vi.mock('../services/authService', () => ({ authService: { me: vi.fn(() => Promise.resolve(ADMIN)) } }));
vi.mock('../services/adminService', () => ({
  metaService: { get: vi.fn(() => Promise.resolve(META)) },
  customerService: { people: vi.fn(() => Promise.resolve([{ id: 3, name: 'Ava Shah', vip: true }])) },
}));
vi.mock('../services/assetService', () => ({
  assetService: { options: vi.fn(() => Promise.resolve([])) },
  kbService: { list: vi.fn(() => Promise.resolve({ data: [] })) },
}));
vi.mock('../services/notificationService', () => ({ searchService: { search: vi.fn(() => Promise.resolve([])) }, notificationService: { list: vi.fn(() => Promise.resolve({ count: 0 })) } }));
vi.mock('../services/ticketService', () => ({
  ticketService: { list: vi.fn(), get: vi.fn(), activity: vi.fn(() => Promise.resolve([])), create: vi.fn(), setStatus: vi.fn(), exportCsv: vi.fn(), board: vi.fn() },
  attachmentService: {},
  incidentService: {},
}));

const listResponse = (rows) => ({ success: true, data: rows, meta: { page: 1, limit: 25, total: rows.length, pages: 1, counts: { open: rows.length, mine: 1, unassigned: 0, breached: 0, risk: 0, onhold: 0, resolved: 0, all: rows.length } } });

beforeEach(() => vi.clearAllMocks());

describe('Ticket list', () => {
  it('loads tickets from the API and shows them', async () => {
    ticketService.list.mockResolvedValue(listResponse([ticket(), ticket({ id: 2, number: 'INC-2026-0002', title: 'Printer offline', priority: 1 })]));
    renderRoute(<TicketList />, { path: '/tickets' });
    expect(await screen.findByText('VPN drops after sleep')).toBeInTheDocument();
    expect(screen.getByText('Printer offline')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('P1 Critical')).toBeInTheDocument();
    expect(screen.getByText('2 tickets match the current filters.')).toBeInTheDocument();
    expect(ticketService.list).toHaveBeenCalledWith(expect.objectContaining({ quick: 'open', page: 1, limit: 25, sortBy: 'created', sortOrder: 'DESC' }));
  });

  it('sends search and quick view to the server instead of filtering in the browser', async () => {
    ticketService.list.mockResolvedValue(listResponse([ticket()]));
    renderRoute(<TicketList />, { path: '/tickets' });
    await screen.findByText('VPN drops after sleep');
    await userEvent.type(screen.getByLabelText('Search tickets'), 'vpn');
    await waitFor(() => expect(ticketService.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'vpn', page: 1 })), { timeout: 2000 });
    await userEvent.click(screen.getByRole('button', { name: /^Mine/ }));
    await waitFor(() => expect(ticketService.list).toHaveBeenLastCalledWith(expect.objectContaining({ quick: 'mine' })));
  });
});

describe('Ticket details', () => {
  it('renders the ticket and opens the resolve dialog', async () => {
    ticketService.get.mockResolvedValue({
      ...ticket(), tags: [], tasks: [], openTaskCount: 0, approval: null, formValues: [], attachments: [], children: [], allowedStates: ['In Progress', 'On Hold', 'Resolved'],
      slaRows: [{ name: 'Response', target: 60, elapsed: 5, stage: 'Achieved', pct: 8 }, { name: 'Resolution', target: 480, elapsed: 10, stage: 'In progress', pct: 2 }],
      resolveBy: new Date().toISOString(), suggestedArticles: [], asset: null, problem: null, change: null, parent: null, request: null, majorIncident: null,
    });
    renderRoute(<TicketDetails />, { path: '/tickets/:number', url: '/tickets/INC-2026-0001' });
    expect(await screen.findByRole('heading', { name: 'VPN drops after sleep' })).toBeInTheDocument();
    expect(await screen.findByText('Time targets')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve ticket', hidden: true }));
    expect(within(dialog).getByText('Resolution notes are required (at least 5 characters).')).toBeInTheDocument();
    expect(ticketService.setStatus).not.toHaveBeenCalled();
  });
});

describe('Create ticket', () => {
  it('validates the summary and submits the form to the API', async () => {
    ticketService.create.mockResolvedValue({ number: 'INC-2026-0100' });
    const onClose = vi.fn();
    renderRoute(<CreateTicket onClose={onClose} />, { path: '/' });
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await userEvent.type(within(dialog).getByLabelText('Summary *'), 'abc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket', hidden: true }));
    expect(within(dialog).getByText('Add a short description of at least 5 characters.')).toBeInTheDocument();
    expect(ticketService.create).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Summary *'), 'd laptop fan noise');
    await waitFor(() => expect(within(dialog).getByLabelText('Requester *')).toHaveValue('3'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket', hidden: true }));
    await waitFor(() => expect(ticketService.create).toHaveBeenCalled());
    const [body] = ticketService.create.mock.calls[0];
    expect(body).toMatchObject({ kind: 'incident', title: 'abcd laptop fan noise', customerId: 7, requesterId: 3, impact: 2, urgency: 2 });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('ticket page')).toBeInTheDocument();
  });
});

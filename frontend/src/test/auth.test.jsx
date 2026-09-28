import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoute, ADMIN, META } from './utils';
import Login from '../pages/Auth/Login';
import ProtectedRoute from '../routes/ProtectedRoute';
import { authService } from '../services/authService';

vi.mock('../services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/adminService', () => ({ metaService: { get: vi.fn(() => Promise.resolve(META)) } }));

beforeEach(() => vi.clearAllMocks());

describe('Login', () => {
  it('validates the form before calling the API', async () => {
    authService.me.mockRejectedValue(new Error('401'));
    renderRoute(<Login />, { path: '/login' });
    await userEvent.clear(await screen.findByLabelText('Email'));
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('shows the server message when sign-in fails', async () => {
    authService.me.mockRejectedValue(new Error('401'));
    authService.login.mockRejectedValue(new Error('Email or password is incorrect.'));
    renderRoute(<Login />, { path: '/login' });
    await userEvent.clear(await screen.findByLabelText('Email'));
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  });

  it('signs in and leaves the login page', async () => {
    authService.me.mockRejectedValue(new Error('401'));
    authService.login.mockResolvedValue(ADMIN);
    renderRoute(<Login />, { path: '/login', url: '/login' });
    await userEvent.clear(await screen.findByLabelText('Email'));
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(authService.login).toHaveBeenCalledWith('admin@example.com', 'correct-horse-1'));
    expect(await screen.findByText('other page')).toBeInTheDocument();
  });
});

describe('ProtectedRoute', () => {
  it('redirects anonymous users to the login page', async () => {
    authService.me.mockRejectedValue(new Error('401'));
    renderRoute(<ProtectedRoute><div>secret</div></ProtectedRoute>, { path: '/overview' });
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('blocks users without the required permission', async () => {
    authService.me.mockResolvedValue({ ...ADMIN, role: 'Customer', isStaff: false, permissions: ['ticket:view'] });
    renderRoute(<ProtectedRoute permission="settings:manage"><div>settings</div></ProtectedRoute>, { path: '/settings' });
    expect(await screen.findByText('You do not have access to this page')).toBeInTheDocument();
  });

  it('renders the page for an authorised user', async () => {
    authService.me.mockResolvedValue(ADMIN);
    renderRoute(<ProtectedRoute permission="settings:manage"><div>settings</div></ProtectedRoute>, { path: '/settings' });
    expect(await screen.findByText('settings')).toBeInTheDocument();
  });
});

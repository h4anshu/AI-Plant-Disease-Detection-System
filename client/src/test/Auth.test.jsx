import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const api = vi.hoisted(() => ({
  loginUser: vi.fn(), registerUser: vi.fn(), getMe: vi.fn(), deleteAccount: vi.fn(), getGuestData: vi.fn(), claimGuestData: vi.fn(),
}));
vi.mock('../services/api', () => ({
  ...api,
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getPredictionHistory: async () => ({ data: [] }),
  getFieldAlerts: async () => ({ data: { fields: [] } }),
  getFields: async () => ({ data: [] }),
  deleteMyData: async () => ({ data: { deleted: 0 } }),
}));
import { AuthProvider } from '../context/AuthContext';
import Auth from '../pages/Auth';
import Profile from '../pages/Profile';
import Navbar from '../components/Navbar';
import DemoBanner from '../components/DemoBanner';

const USER = { id: 'u1', name: 'Asha Devi', email: 'asha@example.com' };
const session = { data: { token: 'tok-1', user: USER } };
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const app = (path = '/login', extra = null) => render(
  <MemoryRouter initialEntries={[path]}>
    <AuthProvider>
      <Navbar />
      <DemoBanner />
      <Routes>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/overview" element={<p>overview page</p>} />
        <Route path="/me" element={<Profile />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
      <Where />
      {extra}
    </AuthProvider>
  </MemoryRouter>,
);
const fill = (labels) => Object.entries(labels).forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
const submit = (name) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getMe.mockResolvedValue({ data: USER });
  api.getGuestData.mockResolvedValue({ data: { predictions: 0, fields: 0 } });
});

describe('signing in', () => {
  test('the right details sign in, keep the session, and go to the overview when this browser has no guest records', async () => {
    api.loginUser.mockResolvedValue(session);
    app();
    fill({ Email: 'asha@example.com', Password: 'correct horse battery' });
    submit('Sign in');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/overview'));
    expect(api.loginUser).toHaveBeenCalledWith({ email: 'asha@example.com', password: 'correct horse battery' });
    expect(localStorage.getItem('token')).toBe('tok-1');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(USER);
  });

  test('a wrong password is said plainly, and nothing is saved', async () => {
    api.loginUser.mockRejectedValue({ response: { status: 401, data: { message: 'Invalid email or password' } } });
    app();
    fill({ Email: 'asha@example.com', Password: 'wrong password' });
    submit('Sign in');
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or the password is not right.');
    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });

  test.each([[409, /already exists/], [429, /Too many tries/], [500, /Something went wrong/]])('registering: a %i answer is explained', async (status, text) => {
    api.registerUser.mockRejectedValue({ response: { status, data: { message: 'x' } } });
    app('/register');
    fill({ 'Your name': 'Asha', Email: 'asha@example.com', Password: 'correct horse battery' });
    submit('Create account');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  test('registering sends the name too; the password rule is shown before it is broken', async () => {
    api.registerUser.mockResolvedValue(session);
    app('/register');
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8');
    fill({ 'Your name': 'Asha Devi', Email: 'asha@example.com', Password: 'correct horse battery' });
    submit('Create account');
    await waitFor(() => expect(api.registerUser).toHaveBeenCalledWith({ name: 'Asha Devi', email: 'asha@example.com', password: 'correct horse battery' }));
  });

  test('someone already signed in is sent on to the overview instead of seeing the form', () => {
    localStorage.setItem('token', 'tok-1'); localStorage.setItem('user', JSON.stringify(USER));
    app('/login');
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  test('the form has real labels and a show/hide button for the password', () => {
    app();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
  });
});

describe('records made as a guest in this browser', () => {
  test('are offered after signing in, nothing moves until asked, and "Not now" leaves them', async () => {
    api.loginUser.mockResolvedValue(session);
    api.getGuestData.mockResolvedValue({ data: { predictions: 4, fields: 1 } });
    app();
    fill({ Email: 'asha@example.com', Password: 'correct horse battery' });
    submit('Sign in');
    expect(await screen.findByText(/checkups 4, saved fields 1/)).toBeInTheDocument();
    expect(api.claimGuestData).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/overview'));
    expect(api.claimGuestData).not.toHaveBeenCalled();
  });

  test('"Add to my account" moves them, says what moved and what did not fit, then continues', async () => {
    api.loginUser.mockResolvedValue(session);
    api.getGuestData.mockResolvedValue({ data: { predictions: 4, fields: 2 } });
    api.claimGuestData.mockResolvedValue({ data: { predictions: 4, fields: 1, fieldsLeft: 1 } });
    app();
    fill({ Email: 'asha@example.com', Password: 'correct horse battery' });
    submit('Sign in');
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('checkups 4, fields 1');
    expect(screen.getByText(/Fields not added: 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/overview'));
  });

  test('if the question cannot be asked the user still gets in', async () => {
    api.loginUser.mockResolvedValue(session);
    api.getGuestData.mockRejectedValue(new Error('offline'));
    app();
    fill({ Email: 'asha@example.com', Password: 'correct horse battery' });
    submit('Sign in');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/overview'));
  });
});

describe('the session', () => {
  const signedIn = () => { localStorage.setItem('token', 'tok-1'); localStorage.setItem('user', JSON.stringify(USER)); };

  test('the navbar and banner follow it: guests see "Sign in", a signed-in user sees their name and "Sign out", and no guest banner', () => {
    const { unmount } = app('/');
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Guest mode/)).toBeInTheDocument();
    unmount();
    signedIn();
    app('/');
    expect(screen.getByRole('link', { name: 'Asha Devi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText(/Guest mode/)).not.toBeInTheDocument();
  });

  test('signing out forgets the token and goes home', () => {
    signedIn();
    app('/');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
  });

  test('a saved session is checked once on load; when the server ends it ("auth:expired") the user is signed out', async () => {
    signedIn();
    app('/');
    await waitFor(() => expect(api.getMe).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('auth:expired')); });
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  test('a token the server renews (it was half used) replaces the saved one, and the user stays signed in', async () => {
    signedIn();
    api.getMe.mockResolvedValue({ data: { ...USER, token: 'tok-renewed' } });
    app('/');
    await waitFor(() => expect(localStorage.getItem('token')).toBe('tok-renewed'));
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(USER);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  test('a broken saved session is ignored, not a crash', () => {
    localStorage.setItem('token', 'tok-1'); localStorage.setItem('user', '{not json');
    app('/');
    expect(screen.getByText(/Guest mode/)).toBeInTheDocument();
  });
});

describe('Profile', () => {
  const signedIn = () => { localStorage.setItem('token', 'tok-1'); localStorage.setItem('user', JSON.stringify(USER)); };

  test('a guest sees the way to sign in or register', () => {
    app('/me');
    expect(screen.getByText(/Sign in to keep your checkups and fields on every phone/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create an account' }).length).toBeGreaterThan(0);
  });

  test('an account shows its name and email, and deleting it needs the password; a wrong one changes nothing', async () => {
    signedIn();
    api.deleteAccount.mockRejectedValue({ response: { status: 401, data: { code: 'wrong_password' } } });
    app('/me?tab=data');
    expect(screen.getByText(USER.email)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fill({ 'Type your password to confirm': 'nope nope nope' });
    submit('Yes, delete my account');
    expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
    expect(localStorage.getItem('token')).toBe('tok-1');
  });

  test('deleting the account signs out and says so', async () => {
    signedIn();
    api.deleteAccount.mockResolvedValue({ data: { deleted: 3 } });
    app('/me?tab=data');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fill({ 'Type your password to confirm': 'correct horse battery' });
    submit('Yes, delete my account');
    expect(await screen.findByText('Your account and its data were deleted.')).toBeInTheDocument();
    expect(api.deleteAccount).toHaveBeenCalledWith('correct horse battery');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('guest records still in this browser can be added from here too', async () => {
    signedIn();
    api.getGuestData.mockResolvedValue({ data: { predictions: 2, fields: 0 } });
    app('/me?tab=data');
    expect(await screen.findByText(/checkups 2, saved fields 0/)).toBeInTheDocument();
  });
});

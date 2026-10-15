import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase';

// Admins who log in on the study website arrive here as  <cms url>#handoff=<token>
// (POST /api/auth/cms-handoff). The token signs them in, so they don't log in twice.
export async function consumeHandoff(): Promise<void> {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('handoff');
  if (!token) return;
  // Take the token out of the address bar and browser history before using it
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    await signInWithCustomToken(auth, token);
  } catch (err) {
    // Expired or invalid: the normal login screen is shown instead
    console.warn('CMS sign-in handoff failed', err);
  }
}
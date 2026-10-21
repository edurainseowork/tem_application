import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase';

// Admins and mentors who log in on the study website arrive here as  <cms url>#handoff=<token>
// (POST /api/auth/cms-handoff). The token signs them in, so they don't log in twice.
// If the study website could not create the token it sends  #handoff_error=<reason>  instead.

/** Why the automatic sign-in didn't work (shown above the CMS login form), or '' */
export let handoffError = '';

export async function consumeHandoff(): Promise<void> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('handoff');
  const sentError = params.get('handoff_error');
  if (!token && !sentError) return;
  // Take the token out of the address bar and browser history before using it
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  if (sentError) {
    handoffError = `Automatic sign-in from the study website failed: ${sentError}`;
    console.error('[cms-handoff]', handoffError);
    return;
  }
  try {
    await signInWithCustomToken(auth, token!);
  } catch (err: any) {
    // auth/invalid-custom-token or auth/custom-token-mismatch = the backend's
    // firebase-service-account.json is from a different Firebase project than this CMS
    handoffError = `Automatic sign-in failed (${err?.code || err?.message || 'unknown error'}). Please log in.`;
    console.error('[cms-handoff]', err);
  }
}

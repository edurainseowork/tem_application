import { Router, Request, Response } from 'express';
import axios from 'axios';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

export const authRouter = Router();
const MSG91_AUTH_KEY = '575019AGrL1JB46ab9222dP1';

// Initialize Firebase Admin (Only once)
if (!getApps().length) {
  const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
  });
}
// Backend is fully stateless for AWS Lambda. 
// We will send reqId to the frontend and expect it back during verification.

authRouter.post('/verify-otp-and-signup', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, password, phone, accessToken } = req.body;
    if (!phone || !accessToken || !email || !password || !name) {
      return res.status(400).json({ error: 'All fields (name, email, password, phone, accessToken) are required' });
    }

    // Verify via MSG91 verifyAccessToken API
    try {
      const verifyResponse = await axios.post(
        'https://control.msg91.com/api/v5/widget/verifyAccessToken',
        {
          authkey: MSG91_AUTH_KEY,
          "access-token": accessToken
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (verifyResponse.data.type === 'error') {
        return res.status(400).json({ error: verifyResponse.data.message || 'Invalid Access Token' });
      }
    } catch (msg91Error: any) {
      console.error('MSG91 Verify Error:', msg91Error?.response?.data || msg91Error.message);
      return res.status(400).json({ error: 'Failed to verify token with MSG91' });
    }

    // Create user in Firebase with Email, Password, and Phone Number
    const phoneWithCode = phone.startsWith('+') ? phone : `+91${phone}`;
    try {
      await getAuth().createUser({
        email: email.trim(),
        password: password,
        phoneNumber: phoneWithCode,
        displayName: name.trim()
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to create user in Firebase' });
    }

    res.json({ success: true, message: 'User created successfully' });
  } catch (error: any) {
    console.error('Error verifying OTP and signing up:', error.message);
    res.status(500).json({ error: 'Failed to sign up' });
  }
});

authRouter.post('/get-email-by-phone', async (req: Request, res: Response): Promise<any> => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const phoneWithCode = `+91${phone}`;
    const userRecord = await getAuth().getUserByPhoneNumber(phoneWithCode);
    
    if (userRecord.email) {
      res.json({ success: true, email: userRecord.email });
    } else {
      res.status(404).json({ error: 'No email associated with this phone number' });
    }
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      res.status(404).json({ error: 'No account found with this phone number' });
    } else {
      console.error('Error fetching user by phone:', error.message);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
});

authRouter.post('/send-password-reset', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Fetch user name from Firebase
    let userName = "Student";
    try {
      const userRecord = await getAuth().getUserByEmail(email);
      if (userRecord.displayName) {
        userName = userRecord.displayName;
      }
    } catch (e) {
      console.error('User not found by email for name resolution:', e);
    }

    // Generate Firebase Password Reset Link
    const actionCodeSettings = { url: 'https://edurain-pvt.web.app/login' };
    const link = await getAuth().generatePasswordResetLink(email, actionCodeSettings);

    // Send `link` to user via MSG91 Email API
    const emailPayload = {
      from: { email: "support@edurain.in", name: "Edurain" },
      domain: "edurain.in",
      template_id: "password_3",
      recipients: [
        {
          to: [{ email: email, name: userName }],
          variables: {
            "reset_link": link,
            "user_name": userName
          }
        }
      ]
    };

    await axios.post('https://control.msg91.com/api/v5/email/send', emailPayload, {
      headers: {
        'authkey': MSG91_AUTH_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    res.json({ success: true, message: 'Password reset link sent to email' });
  } catch (error: any) {
    console.error('Error sending reset email:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to send reset link via email' });
  }
});

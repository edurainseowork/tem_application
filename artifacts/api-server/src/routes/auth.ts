import { Router } from 'express';
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

// Temporary in-memory OTP store (To be moved to Postgres in production)
const otpStore = new Map<string, { otp: string, expiresAt: number }>();

authRouter.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    // Generate 6 digit random OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save to store with 5 mins expiry
    otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    // Send via MSG91 Flow (SMS) API since the template is an SMS template
    const MSG91_TEMPLATE_ID = '6ab9308a73311e86f902caf2';
    const response = await axios.post(
      'https://control.msg91.com/api/v5/flow/',
      {
        template_id: MSG91_TEMPLATE_ID,
        short_url: "0",
        recipients: [
          {
            mobiles: `91${phone}`,
            var: otp // Maps to ##var## in the template
          }
        ]
      },
      {
        headers: {
          authkey: MSG91_AUTH_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('MSG91 Response:', response.data);
    console.log('Generated OTP:', otp); // Also log the OTP for manual testing

    res.json({ success: true, message: 'OTP sent successfully via MSG91 Flow API' });
  } catch (error: any) {
    console.error('Error sending OTP:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

authRouter.post('/verify-otp-and-signup', async (req, res) => {
  try {
    const { name, email, password, phone, otp } = req.body;
    if (!phone || !otp || !email || !password || !name) {
      return res.status(400).json({ error: 'All fields (name, email, password, phone, otp) are required' });
    }

    const storedData = otpStore.get(phone);
    if (!storedData) return res.status(400).json({ error: 'No OTP requested for this number' });
    if (Date.now() > storedData.expiresAt) return res.status(400).json({ error: 'OTP expired' });
    if (storedData.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    // OTP Verified! Clear it
    otpStore.delete(phone);

    // Create user in Firebase with Email, Password, and Phone Number
    const phoneWithCode = `+91${phone}`;
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

authRouter.post('/get-email-by-phone', async (req, res) => {
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

authRouter.post('/send-password-reset', async (req, res) => {
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
      template_id: "reset_password_94",
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

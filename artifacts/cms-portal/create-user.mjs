import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBLw5eneJGCi4-YshAf5wgBA-yDT8o70Mc",
  authDomain: "edurain-pvt.firebaseapp.com",
  projectId: "edurain-pvt",
  storageBucket: "edurain-pvt.firebasestorage.app",
  messagingSenderId: "5660601224",
  appId: "1:5660601224:web:e12194bc33e38cd1e8e83d",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = 'abhinavpvt1906@gmail.com';
const password = 'Aryan1400@';

createUserWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    console.log('Successfully created user:', userCredential.user.email);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error creating user:', error.code);
    if (error.code === 'auth/email-already-in-use') {
      console.log('User already exists. Trying to login with Aryan1400@...');
      signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            console.log('Login successful! Password is correct.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Login failed! The password must be something else.', err.code);
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
  });

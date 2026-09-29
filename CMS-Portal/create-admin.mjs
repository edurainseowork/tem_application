import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

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

createUserWithEmailAndPassword(auth, 'ac964592@gmail.com', 'Aryan1400@')
  .then((userCredential) => {
    console.log('Successfully created admin user:', userCredential.user.email);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error creating user:', error);
    process.exit(1);
  });

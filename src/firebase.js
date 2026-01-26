import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBEzwcdUjI0rx8ZeBLNFSBAbwZzzYLCeIY",
  authDomain: "calculadora-ee028.firebaseapp.com",
  projectId: "calculadora-ee028",
  storageBucket: "calculadora-ee028.firebasestorage.app",
  messagingSenderId: "129033173942",
  appId: "1:129033173942:web:6b9b8c7b05e6abb21c9f17",
  measurementId: "G-J1E1N2RN6G"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore
export const db = getFirestore(app);
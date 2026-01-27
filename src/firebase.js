import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Configuración de Firebase usando variables de entorno
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBEzwcdUjI0rx8ZeBLNFSBAbwZzzYLCeIY",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "calculadora-ee028.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "calculadora-ee028",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "calculadora-ee028.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "129033173942",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:129033173942:web:6b9b8c7b05e6abb21c9f17",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-J1E1N2RN6G"
};

console.log('🔥 Firebase Config:', {
  apiKey: firebaseConfig.apiKey ? '✅ Configurado' : '❌ No configurado',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  environment: process.env.NODE_ENV
});

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Obtener servicios
export const db = getFirestore(app);
export const auth = getAuth(app);
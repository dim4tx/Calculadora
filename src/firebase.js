// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ✅ CONFIGURACIÓN COMPLETA DE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBEzwcdUjI0rx8ZeBLNFSBAbwZzzYLCeIY", // ✅
  authDomain: "calculadora-ee028.firebaseapp.com", // ✅
  projectId: "calculadora-ee028", // ✅
  storageBucket: "calculadora-ee028.firebasestorage.app", // ✅ (nota: .app no .com)
  messagingSenderId: "129033173942", // ✅
  appId: "1:129033173942:web:6b9b8c7b05e6abb21c9f17", // ✅
  measurementId: "G-J1E1N2RN6G" // ✅ (opcional para analytics)
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Obtener servicios que NECESITAMOS
export const db = getFirestore(app);  // Para base de datos
export const auth = getAuth(app);     // Para autenticación

// NO necesitamos analytics por ahora, pero puedes agregarlo si quieres:
// import { getAnalytics } from "firebase/analytics";
// const analytics = getAnalytics(app);


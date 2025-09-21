// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyANYyawpIiUXc9bU_1Smk1i6742k6QCCUY",
  authDomain: "tarih-d90c1.firebaseapp.com",
  projectId: "tarih-d90c1",
  storageBucket: "tarih-d90c1.appspot.com",
  messagingSenderId: "768076901218",
  appId: "1:768076901218:web:0f8304ebfdc6b814149a3b",
  measurementId: "G-N17XV4R8G2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };

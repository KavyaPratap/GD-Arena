import { initializeApp, getApps, getApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyCWWpQWdB6O4cIXsvsAtHPUVtWXbjgyYSg",
  authDomain: "gdarena-2251a.firebaseapp.com",
  projectId: "gdarena-2251a",
  storageBucket: "gdarena-2251a.firebasestorage.app",
  messagingSenderId: "203742904530",
  appId: "1:203742904530:web:2a8edc3cf53a9392466d0b",
  measurementId: "G-1EFWB2PKF1",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

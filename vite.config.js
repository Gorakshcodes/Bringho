import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The App component expects three canvas globals:
//   __firebase_config     - JSON string of the Firebase web config
//   __app_id              - namespace used in the Firestore path
//   __initial_auth_token  - optional custom auth token (blank => anonymous)
// We replace them at build time from VITE_* env vars so App.jsx stays untouched.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };

  return {
    plugins: [react()],
    define: {
      __firebase_config: JSON.stringify(JSON.stringify(firebaseConfig)),
      __app_id: JSON.stringify(env.VITE_APP_ID || 'bingo-multiplayer-app'),
      __initial_auth_token: JSON.stringify(env.VITE_INITIAL_AUTH_TOKEN || '')
    }
  };
});

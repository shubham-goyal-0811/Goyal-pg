import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_BASE_URL']

export default defineConfig(({ command, mode }) => {
  // Loads .env.<mode> then .env, merged over process.env (which is what CI and
  // Vercel/Netlify inject). Empty prefix so we can read them for validation
  // here; only VITE_-prefixed vars ever reach the bundle.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }

  // Fail the BUILD rather than shipping a bundle that throws in the user's
  // browser. VITE_ vars are inlined at build time, so a missing one can't be
  // corrected on the host afterwards — it needs a rebuild either way.
  if (command === 'build') {
    const missing = REQUIRED_ENV.filter((key) => !env[key])
    if (missing.length) {
      throw new Error(
        `[env] Cannot build for mode "${mode}" — missing ${missing.join(', ')}.\n` +
        `      Set them in .env.${mode}, .env, or the host's build environment.`
      )
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: {
          enabled: true
        },
        manifest: {
          name: 'Goyal PG',
          short_name: 'Goyal PG',
          // NOT '/' — that's the public marketing page now, so installing from
          // it would pin the brochure as the app. /login sends staff to /admin
          // and residents to /me via HomeRedirect.
          start_url: '/login',
          scope: '/',
          theme_color: '#B5495B',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
  }
})

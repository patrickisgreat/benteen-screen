// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxtjs/supabase'],

  // Client-rendered SPA. Nitro still serves /api/* routes (e.g. the TMDB proxy
  // and account deletion) as serverless functions when deployed.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Benteen Screen On The Green',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Movie-night voting. It Really Whips the Movie\'s Ass.' }
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
    }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Server-only — never shipped to the browser. Nitro overrides this from
    // NUXT_TMDB_API_KEY at runtime.
    tmdbApiKey: ''
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // @nuxtjs/supabase reads SUPABASE_URL / SUPABASE_KEY (and NUXT_SUPABASE_SECRET_KEY
  // for server-side admin actions) from the environment. The global auth
  // middleware redirects unauthenticated users to /login for every route except
  // those excluded below; the login + callback routes are handled by the module.
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // /request-access is shown to signed-out, non-invited users; /reset-password
      // handles the recovery link. The invite-only gate lives in RLS +
      // middleware/invited.global.ts.
      exclude: ['/', '/about', '/request-access', '/reset-password']
    }
  }
})

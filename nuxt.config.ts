// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],

  // Client-rendered SPA: Firebase auth is client-only. Nitro still serves /api/*
  // routes (e.g. the TMDB proxy) as serverless functions when deployed.
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
    tmdbApiKey: '',
    public: {
      // Firebase web config is public by design. Nitro injects these from the
      // NUXT_PUBLIC_FIREBASE_* environment variables into the served HTML at
      // request time — so they must be set in the deploy environment (Vercel),
      // not just locally. Defaults are intentionally empty.
      firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        databaseURL: ''
      }
    }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})

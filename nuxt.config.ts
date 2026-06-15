// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],

  devtools: { enabled: true },

  // Client-rendered SPA: Firebase auth is client-only. Nitro still serves /api/*
  // routes (e.g. the TMDB proxy) as serverless functions when deployed.
  ssr: false,

  css: ['~/assets/css/main.css'],

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

  runtimeConfig: {
    // Server-only — never shipped to the browser. Override via NUXT_TMDB_API_KEY.
    tmdbApiKey: '',
    public: {
      // Firebase web config is public by design. Override via NUXT_PUBLIC_FIREBASE_*.
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

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
    // Server-only — never shipped to the browser. Nitro overrides these from
    // the matching NUXT_* env vars at runtime (Product Invariant 2).
    tmdbApiKey: '',
    resendApiKey: '',
    // Verified Resend sender for e-vites / event blasts. Override per env.
    resendFrom: 'Benteen Screen On The Green <movienight@benteenscreenonthegreen.com>',
    // Signing secret for Resend (Svix) webhooks → /api/webhooks/resend.
    resendWebhookSecret: '',
    // Shared secret guarding the reminder cron route. Vercel Cron sends it as
    // `Authorization: Bearer <CRON_SECRET>`; mapped from the unprefixed env var.
    cronSecret: process.env.CRON_SECRET || '',
    // Absolute site URL used in email links; falls back to the request origin.
    siteUrl: ''
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
      // Public routes: landing/about, the invite-only request page, the password
      // recovery page, and /rsvp (guests RSVP from an e-vite without an account).
      // The invite-only gate lives in RLS + middleware/invited.global.ts.
      exclude: ['/', '/about', '/request-access', '/reset-password', '/rsvp']
    }
  }
})

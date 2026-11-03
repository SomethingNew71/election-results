import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    // Runs the app inside a Durable Object as well; see server/utils/snapshot.ts.
    preset: 'cloudflare_durable',
    cloudflare: {
      deployConfig: false,
      nodeCompat: true,
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Election Night Results',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Live, nonpartisan US election results with county maps and transparent vote-count inferences. Data from civicAPI.',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
        },
      ],
    },
  },
})

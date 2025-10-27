import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
        base: process.env.GITHUB_PAGES ? '/Random-Groups/'  : '/',
        plugins: [
                sveltekit(),
                SvelteKitPWA({
                        registerType: 'autoUpdate',
                        manifest: {
                                name: 'Random Groups Planner',
                                short_name: 'Groups',
                                start_url: import.meta.env.BASE_URL,
                                scope: import.meta.env.BASE_URL,
                                display: 'standalone',
                                background_color: '#0f172a',
                                theme_color: '#2563eb',
                                lang: 'de',
                                icons: [
                                        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                                        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
                                ]
                        },
                        workbox: {
                                globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}']
                        },
                        devOptions: {
                                enabled: true
                        }
                })
        ]
});

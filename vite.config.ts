import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import checker from 'vite-plugin-checker'

const errorForwarderPlugin = (): Plugin => ({
  name: 'error-forwarder',
  configureServer(server) {
    server.ws.on('client-error-log', (data) => {
      console.error('\x1b[31m%s\x1b[0m', '[Browser Error]: ' + data.message)
      if (data.stack) {console.error('\x1b[31m%s\x1b[0m', data.stack)}
    })
  },
  transformIndexHtml(html) {
    return html.replace(
      '</head>',
      `<script type="module">
        // Forward client errors to Vite terminal
        if (import.meta.hot) {
          window.addEventListener('error', (e) => {
             import.meta.hot.send('client-error-log', { message: e.message, stack: e.error?.stack });
          });
          window.addEventListener('unhandledrejection', (e) => {
             import.meta.hot.send('client-error-log', { message: e.reason?.message || 'Unhandled Rejection', stack: e.reason?.stack });
          });
          const origError = console.error;
          console.error = function(...args) {
            origError.apply(console, args);
            import.meta.hot.send('client-error-log', { message: args.join(' ') });
          };
        }
      </script></head>`
    )
  }
})

const hotUpdateLoggerPlugin = (): Plugin => ({
  name: 'hot-update-logger',
  handleHotUpdate(ctx) {
    const relativePath = path.relative(process.cwd(), ctx.file)
    const affectedModules = ctx.modules.map((mod) => mod.url).filter(Boolean)
    const updateKind = affectedModules.length > 0
      ? `HMR -> ${affectedModules.join(', ')}`
      : 'Full reload'

    console.log(`[Vite Watch] ${updateKind}: ${relativePath}`)
  }
})

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [
    react(),
    tailwindcss(),
    errorForwarderPlugin(),
    hotUpdateLoggerPlugin(),
    checker({
      typescript: true,
      eslint: {
        useFlatConfig: true,
        lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
      },
      overlay: false,
    })
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/.idea/**',
        '**/.vscode/**',
        '**/.agent/**',
        '**/.agents/**',
        '**/.history/**',
        '**/core/**',
        '**/docs/**',
        '**/src-tauri/**',
        '**/*.md',
        '**/*.tmp',
        '**/*~',
        '**/package.json',
        '**/package-lock.json',
        '**/metadata.json',
        '**/updates.md',
      ]
    }
  }
})

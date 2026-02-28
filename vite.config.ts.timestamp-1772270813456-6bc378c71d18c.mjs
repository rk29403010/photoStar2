// vite.config.ts
import { defineConfig } from "file:///C:/Users/robin/Projects/photoStar2/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/robin/Projects/photoStar2/node_modules/@vitejs/plugin-react/dist/index.mjs";
import tailwindcss from "file:///C:/Users/robin/Projects/photoStar2/node_modules/@tailwindcss/vite/dist/index.mjs";
import checker from "file:///C:/Users/robin/Projects/photoStar2/node_modules/vite-plugin-checker/dist/main.js";
var errorForwarderPlugin = () => ({
  name: "error-forwarder",
  configureServer(server) {
    server.ws.on("client-error-log", (data) => {
      console.error("\\x1b[31m%s\\x1b[0m", "[Browser Error]: " + data.message);
      if (data.stack) console.error("\\x1b[31m%s\\x1b[0m", data.stack);
    });
  },
  transformIndexHtml(html) {
    return html.replace(
      "</head>",
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
    );
  }
});
var vite_config_default = defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    errorForwarderPlugin(),
    checker({
      typescript: true,
      eslint: {
        useFlatConfig: true,
        lintCommand: 'eslint "./src/**/*.{ts,tsx}"'
      },
      overlay: false
    })
  ],
  server: {
    open: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxyb2JpblxcXFxQcm9qZWN0c1xcXFxwaG90b1N0YXIyXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxyb2JpblxcXFxQcm9qZWN0c1xcXFxwaG90b1N0YXIyXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9yb2Jpbi9Qcm9qZWN0cy9waG90b1N0YXIyL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFBsdWdpbiB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnXG5cbmltcG9ydCBjaGVja2VyIGZyb20gJ3ZpdGUtcGx1Z2luLWNoZWNrZXInXG5cbmNvbnN0IGVycm9yRm9yd2FyZGVyUGx1Z2luID0gKCk6IFBsdWdpbiA9PiAoe1xuICBuYW1lOiAnZXJyb3ItZm9yd2FyZGVyJyxcbiAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgIHNlcnZlci53cy5vbignY2xpZW50LWVycm9yLWxvZycsIChkYXRhKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKCdcXFxceDFiWzMxbSVzXFxcXHgxYlswbScsICdbQnJvd3NlciBFcnJvcl06ICcgKyBkYXRhLm1lc3NhZ2UpO1xuICAgICAgaWYgKGRhdGEuc3RhY2spIGNvbnNvbGUuZXJyb3IoJ1xcXFx4MWJbMzFtJXNcXFxceDFiWzBtJywgZGF0YS5zdGFjayk7XG4gICAgfSk7XG4gIH0sXG4gIHRyYW5zZm9ybUluZGV4SHRtbChodG1sKSB7XG4gICAgcmV0dXJuIGh0bWwucmVwbGFjZShcbiAgICAgICc8L2hlYWQ+JyxcbiAgICAgIGA8c2NyaXB0IHR5cGU9XCJtb2R1bGVcIj5cbiAgICAgICAgLy8gRm9yd2FyZCBjbGllbnQgZXJyb3JzIHRvIFZpdGUgdGVybWluYWxcbiAgICAgICAgaWYgKGltcG9ydC5tZXRhLmhvdCkge1xuICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIChlKSA9PiB7XG4gICAgICAgICAgICAgaW1wb3J0Lm1ldGEuaG90LnNlbmQoJ2NsaWVudC1lcnJvci1sb2cnLCB7IG1lc3NhZ2U6IGUubWVzc2FnZSwgc3RhY2s6IGUuZXJyb3I/LnN0YWNrIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd1bmhhbmRsZWRyZWplY3Rpb24nLCAoZSkgPT4ge1xuICAgICAgICAgICAgIGltcG9ydC5tZXRhLmhvdC5zZW5kKCdjbGllbnQtZXJyb3ItbG9nJywgeyBtZXNzYWdlOiBlLnJlYXNvbj8ubWVzc2FnZSB8fCAnVW5oYW5kbGVkIFJlamVjdGlvbicsIHN0YWNrOiBlLnJlYXNvbj8uc3RhY2sgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY29uc3Qgb3JpZ0Vycm9yID0gY29uc29sZS5lcnJvcjtcbiAgICAgICAgICBjb25zb2xlLmVycm9yID0gZnVuY3Rpb24oLi4uYXJncykge1xuICAgICAgICAgICAgb3JpZ0Vycm9yLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuICAgICAgICAgICAgaW1wb3J0Lm1ldGEuaG90LnNlbmQoJ2NsaWVudC1lcnJvci1sb2cnLCB7IG1lc3NhZ2U6IGFyZ3Muam9pbignICcpIH0pO1xuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIDwvc2NyaXB0PjwvaGVhZD5gXG4gICAgKTtcbiAgfVxufSk7XG5cbi8vIGh0dHBzOi8vdml0ZS5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgdGFpbHdpbmRjc3MoKSxcbiAgICBlcnJvckZvcndhcmRlclBsdWdpbigpLFxuICAgIGNoZWNrZXIoe1xuICAgICAgdHlwZXNjcmlwdDogdHJ1ZSxcbiAgICAgIGVzbGludDoge1xuICAgICAgICB1c2VGbGF0Q29uZmlnOiB0cnVlLFxuICAgICAgICBsaW50Q29tbWFuZDogJ2VzbGludCBcIi4vc3JjLyoqLyoue3RzLHRzeH1cIicsXG4gICAgICB9LFxuICAgICAgb3ZlcmxheTogZmFsc2UsXG4gICAgfSlcbiAgXSxcbiAgc2VydmVyOiB7XG4gICAgb3BlbjogdHJ1ZVxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrUyxTQUFTLG9CQUFpQztBQUM1VSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFFeEIsT0FBTyxhQUFhO0FBRXBCLElBQU0sdUJBQXVCLE9BQWU7QUFBQSxFQUMxQyxNQUFNO0FBQUEsRUFDTixnQkFBZ0IsUUFBUTtBQUN0QixXQUFPLEdBQUcsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTO0FBQ3pDLGNBQVEsTUFBTSx1QkFBdUIsc0JBQXNCLEtBQUssT0FBTztBQUN2RSxVQUFJLEtBQUssTUFBTyxTQUFRLE1BQU0sdUJBQXVCLEtBQUssS0FBSztBQUFBLElBQ2pFLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxtQkFBbUIsTUFBTTtBQUN2QixXQUFPLEtBQUs7QUFBQSxNQUNWO0FBQUEsTUFDQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBZ0JGO0FBQUEsRUFDRjtBQUNGO0FBR0EsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLElBQ1oscUJBQXFCO0FBQUEsSUFDckIsUUFBUTtBQUFBLE1BQ04sWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLFFBQ04sZUFBZTtBQUFBLFFBQ2YsYUFBYTtBQUFBLE1BQ2Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==

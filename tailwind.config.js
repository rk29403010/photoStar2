/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'surface-primary': 'var(--surface-primary)',
                'content-primary': 'var(--content-primary)',
                'surface-secondary': 'var(--surface-secondary)',
                'content-secondary': 'var(--content-secondary)',
                'link': 'var(--link)',
                'link-hover': 'var(--link-hover)',
            },
        },
    },
    plugins: [],
}

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV) {
  console.clear()
}

createRoot(document.getElementById('root')!).render(
  <App />,
)

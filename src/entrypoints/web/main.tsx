import { createRoot } from 'react-dom/client'
import '../../ui/index.css'
import App from '../../ui/App.tsx'

if (import.meta.env.DEV) {
  console.clear()
}

createRoot(document.getElementById('root')!).render(
  <App />,
)

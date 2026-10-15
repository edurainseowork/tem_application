import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './pages/App.tsx'
import { consumeHandoff } from './handoff'

// Finish a sign-in handed over from the study website first, so the login screen never flashes
consumeHandoff().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
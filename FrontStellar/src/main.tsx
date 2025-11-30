import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WalletProvider } from './contexts/WalletContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Buffer } from 'buffer'

if (typeof (globalThis as { global?: typeof globalThis }).global === 'undefined') {
  ;(globalThis as { global?: typeof globalThis }).global = globalThis
}
if (typeof (globalThis as { Buffer?: typeof Buffer }).Buffer === 'undefined') {
  ;(globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WalletProvider>
        <App />
      </WalletProvider>
    </ErrorBoundary>
  </StrictMode>,
)

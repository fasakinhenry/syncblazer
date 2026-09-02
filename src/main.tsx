import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { capturePendingRoomJoinFromUrl } from '@/lib/pendingRoomJoin.ts'
import { initGoogleAnalytics } from '@/lib/ga.ts'

capturePendingRoomJoinFromUrl()
initGoogleAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyLocaltunnelBypass } from './utils/localtunnel'
import { applyAppearance } from './utils/appearance'
import { setupGlobalAxiosAuth } from './utils/apiClient'

applyLocaltunnelBypass()
applyAppearance()
setupGlobalAxiosAuth()

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />,
)

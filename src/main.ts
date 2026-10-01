import { createVaporApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

// Whole app runs in Vapor mode (no virtual DOM). If a VDOM-only component is
// ever needed, switch to createApp(App).use(vaporInteropPlugin) instead.
createVaporApp(App).use(createPinia()).mount('#app')

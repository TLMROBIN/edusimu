import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import axios from 'axios'
import App from './App.vue'
import router from './router'
import './assets/style.css'
import { useUserStore } from './stores/user'

axios.defaults.baseURL = import.meta.env.VITE_API_BASE || ''

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)

const userStore = useUserStore()
userStore.initAuth()

app.mount('#app')

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useUserStore = defineStore('user', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || null)
  
  const isLoggedIn = computed(() => !!token.value)
  
  const login = async (username, password) => {
    try {
      const formData = new FormData()
      formData.append('username', username)
      formData.append('password', password)
      
      const response = await axios.post('/api/auth/login', formData)
      token.value = response.data.access_token
      localStorage.setItem('token', response.data.access_token)
      localStorage.removeItem('edusimu_sso')
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
      
      await fetchUser()
      return true
    } catch (error) {
      console.error('登录失败:', error)
      return false
    }
  }
  
  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/me')
      user.value = response.data
    } catch (error) {
      console.error('获取用户信息失败:', error)
      logout()
    }
  }
  
  const logout = async () => {
    try {
      await axios.post('/api/auth/logout')
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      user.value = null
      token.value = null
      localStorage.removeItem('token')
      delete axios.defaults.headers.common['Authorization']
      // SSO（统一认证）登录的用户联动登出 Keycloak；本地密码登录维持原行为
      if (localStorage.getItem('edusimu_sso')) {
        localStorage.removeItem('edusimu_sso')
        window.location.href = 'http://192.168.1.206/auth/realms/school-platform/protocol/openid-connect/logout?client_id=edusimu&post_logout_redirect_uri=http%3A%2F%2F192.168.1.206%2Fedusimu%2F'
      }
    }
  }
  
  const initAuth = () => {
    if (token.value) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
      return fetchUser()
    }
    return Promise.resolve()
  }
  
  return {
    user,
    token,
    isLoggedIn,
    login,
    fetchUser,
    logout,
    initAuth
  }
})

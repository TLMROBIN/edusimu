import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/animations/:id',
    name: 'AnimationPlayer',
    component: () => import('../views/AnimationPlayer.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../views/Profile.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: () => import('../views/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['teacher', 'admin'] }
  },
  {
    path: '/admin/animations',
    name: 'AnimationManage',
    component: () => import('../views/AnimationManage.vue'),
    meta: { requiresAuth: true, requiresRole: ['teacher', 'admin'] }
  },
  {
    path: '/admin/geogebra',
    name: 'GeoGebraCreator',
    component: () => import('../views/GeoGebraCreator.vue'),
    meta: { requiresAuth: true, requiresRole: ['teacher', 'admin'] }
  },
  {
    path: '/admin/users',
    name: 'UserManage',
    component: () => import('../views/UserManage.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin'] }
  },
  {
    path: '/admin/textbooks',
    name: 'TextbookManage',
    component: () => import('../views/TextbookManage.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin'] }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()

  if (userStore.token && !userStore.user) {
    await userStore.initAuth()
  }
  
  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next('/login')
  } else if (to.meta.requiresRole && !to.meta.requiresRole.includes(userStore.user?.role)) {
    next('/home')
  } else {
    next()
  }
})

export default router

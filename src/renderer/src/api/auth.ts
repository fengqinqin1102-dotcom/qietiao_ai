/**
 * 认证状态管理
 * 用于在 token 失效时通知应用跳转到登录页面
 */

type AuthStateChangeCallback = (isLoggedIn: boolean) => void

let authStateChangeCallbacks: AuthStateChangeCallback[] = []

/**
 * 注册认证状态变化回调
 */
export function onAuthStateChange(callback: AuthStateChangeCallback): () => void {
  authStateChangeCallbacks.push(callback)
  // 返回取消注册的函数
  return () => {
    authStateChangeCallbacks = authStateChangeCallbacks.filter(cb => cb !== callback)
  }
}

/**
 * 通知所有监听者认证状态已变化
 */
export function notifyAuthStateChange(isLoggedIn: boolean): void {
  authStateChangeCallbacks.forEach(callback => {
    try {
      callback(isLoggedIn)
    } catch (error) {
      console.error('Auth state change callback error:', error)
    }
  })
}

import { getStoredToken, clearStoredToken } from './token'
import { notifyAuthStateChange } from './auth'

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

/**
 * API 响应格式
 */
interface ApiResponse<T = any> {
  code: number
  message?: string
  data?: T
}

/**
 * 请求配置
 */
interface RequestConfig extends RequestInit {
  skipAuth?: boolean // 是否跳过认证（用于登录等接口）
  skipRefresh?: boolean // 是否跳过自动刷新 token
}

/**
 * 处理 token 失效
 */
function handleTokenExpired(): void {
  clearStoredToken()
  notifyAuthStateChange(false)
}

/**
 * API 客户端
 */
class ApiClient {
  /**
   * 发起请求
   */
  async request<T = any>(
    url: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const { skipAuth = false, skipRefresh = false, headers = {}, ...restConfig } = config

    // 构建请求头
    const requestHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      ...headers,
    }

    // 添加 token（如果需要认证）
    if (!skipAuth) {
      const token = getStoredToken()
      if (token) {
        requestHeaders['Authorization'] = token
      }
    }

    // 构建完整 URL
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`

    try {
      // 发起请求
      let response = await fetch(fullUrl, {
        ...restConfig,
        headers: requestHeaders,
      })

      // 处理 token 失效（401 或 403）
      if (!skipAuth && (response.status === 401 || response.status === 403)) {
        handleTokenExpired()
        throw new Error('Token 已失效，请重新登录')
      }
      
      // 解析响应
      const data: ApiResponse<T> = await response.json()

      // 检查业务错误码（0 或 1000 表示成功，根据后端实际返回调整）
      if (data.code !== undefined && data.code !== 0 && data.code !== 1000) {
        // 如果是 token 相关错误，也跳转到登录页
        if (data.code === 401 || data.code === 403) {
          handleTokenExpired()
        }
        throw new Error(data.message || '请求失败')
      }

      return data
    } catch (error: any) {
      // 如果是网络错误，直接抛出
      if (error.message && !error.message.includes('Token')) {
        throw error
      }
      // Token 相关错误已经处理，直接抛出
      throw error
    }
  }

  /**
   * GET 请求
   */
  async get<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' })
  }

  /**
   * POST 请求
   */
  async post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  /**
   * PUT 请求
   */
  async put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(url, { ...config, method: 'DELETE' })
  }
}

// 导出单例
export const apiClient = new ApiClient()

// 导出类型
export type { ApiResponse, RequestConfig }

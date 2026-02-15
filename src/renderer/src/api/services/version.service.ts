import { apiClient, ApiResponse } from '../client'

/**
 * 检查更新响应
 */
interface CheckUpdateResponse {
  hasUpdate: boolean
  version?: string
  downloadUrl?: string
  forceUpdate?: boolean
  description?: string
  updateTime?: string
  message?: string
}

/**
 * 版本服务
 */
export class VersionService {
  /**
   * 检查更新
   */
  async checkUpdate(): Promise<ApiResponse<CheckUpdateResponse>> {
    return apiClient.get<CheckUpdateResponse>('/api/version/checkUpdate')
  }
}

// 导出单例
export const versionService = new VersionService()

import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
import { exec } from 'child_process'
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  unlinkSync,
} from 'fs'
import * as https from 'https'
import * as http from 'http'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'

// 主窗口引用（用于发送更新事件）
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    frame: false, // 无边框模式
    titleBarStyle: 'hidden', // 隐藏标题栏
    autoHideMenuBar: true,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: true // 允许在打包后使用开发者工具
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.video.tools')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    
    // 确保在打包后也能使用 F12 打开开发者工具
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12') {
        if (window.webContents.isDevToolsOpened()) {
          window.webContents.closeDevTools()
        } else {
          window.webContents.openDevTools()
        }
      }
    })
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 配置自动更新
  autoUpdater.autoDownload = false // 不自动下载，等待用户确认
  autoUpdater.autoInstallOnAppQuit = true // 应用退出时自动安装

  // 自动更新事件监听
  autoUpdater.on('checking-for-update', () => {
    console.log('正在检查更新...')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-checking')
    }
  })

  autoUpdater.on('update-available', (info) => {
    console.log('发现新版本:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    console.log('当前已是最新版本')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('error', (error) => {
    console.error('更新检查失败:', error)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', { message: error.message })
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent)
    console.log(`下载进度: ${percent}%`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent,
        transferred: progressObj.transferred,
        total: progressObj.total
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    }
  })

  // 自动更新IPC处理
  ipcMain.handle('update-check', async (_, updateServerUrl?: string) => {
    try {
      if (updateServerUrl) {
        // 如果提供了更新服务器URL，设置它
        autoUpdater.setFeedURL({ provider: 'generic', url: updateServerUrl })
      }
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error: any) {
      console.error('检查更新失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error: any) {
      console.error('下载更新失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-install', async () => {
    try {
      // 退出应用并安装更新
      autoUpdater.quitAndInstall(false, true)
      return { success: true }
    } catch (error: any) {
      console.error('安装更新失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 手动下载并安装更新（当downloadUrl是安装包时）
  // forceUpdate 参数保留用于未来可能的强制更新逻辑
  ipcMain.handle('update-download-and-install', async (_, downloadUrl: string, version: string, description: string, _forceUpdate: boolean) => {
    try {
      if (mainWindow) {
        mainWindow.webContents.send('update-download-start', { version, description })
      }

      // 下载安装包
      const userDataDir = app.getPath('userData')
      const updateDir = join(userDataDir, 'updates')
      if (!existsSync(updateDir)) {
        mkdirSync(updateDir, { recursive: true })
      }

      const fileName = downloadUrl.split('/').pop() || `update-${version}.exe`
      const filePath = join(updateDir, fileName)

      return new Promise((resolve, reject) => {
        const file = createWriteStream(filePath)
        const protocol = downloadUrl.startsWith('https') ? https : http

        protocol.get(downloadUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`下载失败: HTTP ${response.statusCode}`))
            return
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10)
          let downloadedSize = 0

          response.on('data', (chunk) => {
            downloadedSize += chunk.length
            const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-download-progress', {
                percent,
                transferred: downloadedSize,
                total: totalSize
              })
            }
          })

          response.pipe(file)

          file.on('finish', () => {
            file.close()
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-downloaded', {
                version,
                filePath
              })
            }
            resolve({ success: true, filePath, version })
          })

          file.on('error', (err) => {
            unlinkSync(filePath)
            reject(err)
          })
        }).on('error', (err) => {
          reject(err)
        })
      })
    } catch (error: any) {
      console.error('下载更新失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-install-manual', async (_, filePath: string) => {
    try {
      // 执行安装包
      spawn(filePath, [], { detached: true, stdio: 'ignore' })
      // 退出应用
      app.quit()
      return { success: true }
    } catch (error: any) {
      console.error('安装更新失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 窗口控制功能
  ipcMain.handle('window-minimize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.minimize()
  })

  ipcMain.handle('window-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.handle('window-close', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.close()
  })

  ipcMain.handle('window-reload', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.webContents.reload()
  })

  ipcMain.handle('window-is-maximized', () => {
    const window = BrowserWindow.getFocusedWindow()
    return window ? window.isMaximized() : false
  })

  // 文件选择功能
  ipcMain.handle('select-file', async (_, options) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      title: options.title || '选择文件',
      filters: options.filters || [
        { name: '视频文件', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('select-directory', async (_, options) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      title: options.title || '选择文件夹',
      properties: ['openDirectory']
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // FFmpeg执行功能
  let ffmpegProcess: any = null

  ipcMain.handle('execute-ffmpeg', async (_, command: string, options: { 
    inputA: string
    inputB: string
    output: string
  }) => {
    try {
      // 构建完整的FFmpeg命令
      // 开发环境：process.cwd()/ffmpeg/bin/ffmpeg.exe
      // 打包环境：process.resourcesPath/app.asar.unpacked/ffmpeg/bin/ffmpeg.exe
      const ffmpegPath = app.isPackaged 
        ? join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'bin', 'ffmpeg.exe')
        : join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe')
      
      // 使用更安全的方式构建命令参数
      const args: string[] = []
      
      // 解析原始命令，正确处理引号和空格
      const commandParts = parseCommand(command)
      
      for (const part of commandParts) {
        console.log('part:', part)
        if (part === '{inputA}') {
          args.push(`"${options.inputA}"`)
        } else if (part === '{inputB}') {
          args.push(`"${options.inputB}"`)
        } else if (part === '{output}') {
          args.push(`"${options.output}"`)
        } else if (part !== 'ffmpeg') {
          args.push(part)
        }
      }
      
      console.log('FFmpeg exec:', ffmpegPath, args.join(' '))
      
      // 启动FFmpeg进程
      ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true // 使用shell来正确处理引号和复杂参数
      })

      // 设置监听器
      setupFFmpegListeners()

      return { success: true, processId: ffmpegProcess.pid }
    } catch (error) {
      console.error('FFmpeg failed:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 解析命令字符串，正确处理引号和空格
  function parseCommand(command: string): string[] {
    const args: string[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i]
      
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true
        quoteChar = char
        current += char
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false
        quoteChar = ''
        current += char
      } else if (char === ' ' && !inQuotes) {
        // 只有在不在引号内时才按空格分割
        if (current.trim()) {
          args.push(current.trim())
          current = ''
        }
      } else {
        current += char
      }
    }
    
    if (current.trim()) {
      args.push(current.trim())
    }
    
    return args
  }

  // 存储FFmpeg输出和状态
  let ffmpegLogs: string[] = []
  let ffmpegProgress = 0
  let ffmpegIsRunning = false
  let videoDuration = 0

  // 监听FFmpeg进程输出
  ipcMain.handle('get-ffmpeg-output', () => {
    return new Promise((resolve) => {
      if (!ffmpegProcess) {
        resolve({ logs: ffmpegLogs, progress: ffmpegProgress, isRunning: ffmpegIsRunning })
        return
      }

      // 立即返回当前状态
      resolve({ logs: [...ffmpegLogs], progress: ffmpegProgress, isRunning: ffmpegIsRunning })
    })
  })

  // 设置FFmpeg进程监听器
  const setupFFmpegListeners = () => {
    if (!ffmpegProcess) return

    ffmpegIsRunning = true
    ffmpegLogs = []
    ffmpegProgress = 0

    // 监听标准输出
    ffmpegProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      ffmpegLogs.push(output)
      console.log('FFmpeg stdout:', output)
    })

    // 监听错误输出（FFmpeg的进度信息通常在这里）
    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      ffmpegLogs.push(output)
      console.log('FFmpeg stderr:', output)
      
      // 解析视频时长
      const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
      if (durationMatch && videoDuration === 0) {
        const hours = parseInt(durationMatch[1])
        const minutes = parseInt(durationMatch[2])
        const seconds = parseFloat(durationMatch[3])
        videoDuration = hours * 3600 + minutes * 60 + seconds
        ffmpegLogs.push(`检测到视频时长: ${hours}:${minutes}:${seconds.toFixed(2)}`)
      }
      
      // 解析进度信息
      const progressMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (progressMatch && videoDuration > 0) {
        const hours = parseInt(progressMatch[1])
        const minutes = parseInt(progressMatch[2])
        const seconds = parseFloat(progressMatch[3])
        const currentSeconds = hours * 3600 + minutes * 60 + seconds
        
        ffmpegProgress = Math.min(Math.floor((currentSeconds / videoDuration) * 100), 100)
        ffmpegLogs.push(`处理进度: ${ffmpegProgress}%`)
      }
    })

    // 监听进程结束
    ffmpegProcess.on('close', (code: number) => {
      ffmpegIsRunning = false
      ffmpegLogs.push(`进程结束，退出码: ${code}`)
      if (code === 0) {
        ffmpegLogs.push('处理成功！')
        ffmpegProgress = 100
      } else {
        ffmpegLogs.push('处理失败！')
      }
    })

    // 监听进程错误
    ffmpegProcess.on('error', (error: Error) => {
      ffmpegIsRunning = false
      ffmpegLogs.push(`FFmpeg进程错误: ${error.message}`)
    })
  }

  // 停止FFmpeg进程
  ipcMain.handle('stop-ffmpeg', async () => {
    if (ffmpegProcess) {
      try {
        const pid = ffmpegProcess.pid
        console.log(`stop PID: ${pid}`)
        console.log(`process.platform: ${process.platform}`)
        
        // 直接强制终止进程
        if (process.platform === 'win32') {
          // Windows系统使用taskkill命令
          exec(`taskkill /F /T /PID ${pid}`, (error) => {
            if (error) {
              console.log('taskkill failed:', error.message)
            } else {
              console.log('FFmpeg stopped')
            }
          })
        } else {
          // Unix系统使用kill命令
          exec(`kill -9 ${pid}`, (error) => {
            if (error) {
              console.log('kill -9 failed:', error.message)
            } else {
              console.log('FFmpeg stopped')
            }
          })
        }
        
        ffmpegProcess = null
        ffmpegIsRunning = false
        ffmpegLogs.push('用户手动停止处理')
        return { success: true }
      } catch (error) {
        console.error('Failed to stop FFmpeg process:', error)
        ffmpegProcess = null
        ffmpegIsRunning = false
        ffmpegLogs.push('停止进程时出错')
        return { success: false, message: '停止进程时出错' }
      }
    }
    return { success: false, message: '没有正在运行的FFmpeg进程' }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

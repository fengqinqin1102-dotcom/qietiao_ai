import React, { useState, useEffect, useRef, ReactNode } from 'react'
import './CustomScrollbar.css'

interface CustomScrollbarProps {
  children: ReactNode
  className?: string
  scrollContentClassName?: string
  onScroll?: (scrollTop: number) => void
}

const CustomScrollbar: React.FC<CustomScrollbarProps> = ({
  children,
  className = '',
  scrollContentClassName = '',
  onScroll
}) => {
  // 滚动条相关状态和引用
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const scrollThumbRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragStartScrollTop, setDragStartScrollTop] = useState(0)
  const [justFinishedDragging, setJustFinishedDragging] = useState(false)

  // 更新滚动条滑块位置和大小
  const updateScrollbar = () => {
    const scrollContent = scrollContentRef.current
    const scrollThumb = scrollThumbRef.current
    const scrollTrack = scrollTrackRef.current

    if (!scrollContent || !scrollThumb || !scrollTrack) return

    const { scrollTop, scrollHeight, clientHeight } = scrollContent
    const trackHeight = scrollTrack.clientHeight

    // 计算滑块高度（按比例）
    const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * trackHeight)
    scrollThumb.style.height = `${thumbHeight}px`

    // 计算滑块位置
    const maxScrollTop = scrollHeight - clientHeight
    const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * (trackHeight - thumbHeight) : 0
    scrollThumb.style.top = `${thumbTop}px`

    // 显示或隐藏滚动条
    const shouldShow = scrollHeight > clientHeight
    scrollTrack.style.opacity = shouldShow ? '1' : '0'

    // 触发外部滚动回调
    if (onScroll) {
      onScroll(scrollTop)
    }
  }

  // 处理滑块拖拽开始
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStartY(e.clientY)
    setDragStartScrollTop(scrollContentRef.current?.scrollTop || 0)
  }

  // 处理滑块拖拽移动
  const handleThumbMouseMove = (e: MouseEvent) => {
    if (!isDragging || !scrollContentRef.current || !scrollTrackRef.current) return

    const scrollContent = scrollContentRef.current
    const scrollTrack = scrollTrackRef.current
    const deltaY = e.clientY - dragStartY
    const trackHeight = scrollTrack.clientHeight
    const thumbHeight = scrollThumbRef.current?.clientHeight || 20
    const maxScrollTop = scrollContent.scrollHeight - scrollContent.clientHeight

    const scrollDelta = (deltaY / (trackHeight - thumbHeight)) * maxScrollTop
    const newScrollTop = Math.max(0, Math.min(maxScrollTop, dragStartScrollTop + scrollDelta))
    
    scrollContent.scrollTop = newScrollTop
  }

  // 处理滑块拖拽结束
  const handleThumbMouseUp = () => {
    setIsDragging(false)
    setJustFinishedDragging(true)
    // 使用 setTimeout 来重置状态，确保在下一个事件循环中重置
    setTimeout(() => {
      setJustFinishedDragging(false)
    }, 0)
  }

  // 处理轨道点击
  const handleTrackClick = (e: React.MouseEvent) => {
    // 如果刚刚完成拖拽，则忽略点击事件
    if (justFinishedDragging) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    if (!scrollContentRef.current || !scrollTrackRef.current || !scrollThumbRef.current) return

    const scrollContent = scrollContentRef.current
    const scrollTrack = scrollTrackRef.current
    const scrollThumb = scrollThumbRef.current
    const rect = scrollTrack.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const trackHeight = scrollTrack.clientHeight
    const thumbHeight = scrollThumb.clientHeight
    const maxScrollTop = scrollContent.scrollHeight - scrollContent.clientHeight

    const newScrollTop = (clickY / (trackHeight - thumbHeight)) * maxScrollTop
    scrollContent.scrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop))
  }

  // 初始化滚动条和基础事件监听
  useEffect(() => {
    const scrollContent = scrollContentRef.current
    if (!scrollContent) return

    // 添加滚动事件监听
    scrollContent.addEventListener('scroll', updateScrollbar)
    
    // 监听窗口大小变化
    const handleResize = () => updateScrollbar()
    window.addEventListener('resize', handleResize)

    // 初始更新
    updateScrollbar()

    return () => {
      scrollContent.removeEventListener('scroll', updateScrollbar)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // 单独管理拖拽相关的全局事件监听
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseMove = (e: MouseEvent) => handleThumbMouseMove(e)
    const handleGlobalMouseUp = () => handleThumbMouseUp()

    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, dragStartY, dragStartScrollTop])

  return (
    <div className={`custom-scrollbar-container ${className}`}>
      <div 
        ref={scrollContentRef}
        className={`scroll-content ${scrollContentClassName}`}
      >
        {children}
      </div>
      
      {/* 自定义滚动条 */}
      <div 
        ref={scrollTrackRef}
        className="custom-scrollbar-track"
        onClick={handleTrackClick}
      >
        <div 
          ref={scrollThumbRef}
          className="custom-scrollbar-thumb"
          onMouseDown={handleThumbMouseDown}
        />
      </div>
    </div>
  )
}

export default CustomScrollbar

import React, { useRef, useState } from 'react'
import { captureScreenshot, shareScreenshot, captureElementAsDataURL } from '../utils/screenshot'

interface ScreenshotDemoProps {
  title?: string
  children: React.ReactNode
}

export const ScreenshotDemo: React.FC<ScreenshotDemoProps> = ({ 
  title = "Screenshot Demo", 
  children 
}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const contentRef = useRef<HTMLDivElement>(null)

  const handleDownload = async () => {
    if (!contentRef.current) return
    
    try {
      setIsProcessing(true)
      setStatus('Capturing screenshot...')
      
      await captureScreenshot(contentRef.current, {
        filename: `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`,
        backgroundColor: '#0f172a',
        scale: 2,
        quality: 0.95
      })
      
      setStatus('Screenshot saved successfully!')
      setTimeout(() => setStatus(''), 3000)
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setTimeout(() => setStatus(''), 5000)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleShare = async () => {
    if (!contentRef.current) return
    
    try {
      setIsProcessing(true)
      setStatus('Preparing to share...')
      
      await shareScreenshot(contentRef.current, {
        filename: `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`,
        backgroundColor: '#0f172a',
        scale: 2,
        quality: 0.95
      })
      
      setStatus('Share completed!')
      setTimeout(() => setStatus(''), 3000)
    } catch (error) {
      setStatus(`Share failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setTimeout(() => setStatus(''), 5000)
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePreview = async () => {
    if (!contentRef.current) return
    
    try {
      setIsProcessing(true)
      setStatus('Generating preview...')
      
      const dataURL = await captureElementAsDataURL(contentRef.current, {
        backgroundColor: '#0f172a',
        scale: 1,
        quality: 0.8
      })
      
      setPreviewUrl(dataURL)
      setStatus('Preview generated!')
      setTimeout(() => setStatus(''), 3000)
    } catch (error) {
      setStatus(`Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setTimeout(() => setStatus(''), 5000)
    } finally {
      setIsProcessing(false)
    }
  }

  const clearPreview = () => {
    setPreviewUrl('')
    setStatus('')
  }

  const supportsShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="space-y-4">
      {/* Control Panel */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Screenshot Controls</h3>
        
        <div className="flex flex-wrap gap-3 mb-3">
          <button
            onClick={handleDownload}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isProcessing ? 'Processing...' : '📸 Download Screenshot'}
          </button>
          
          {supportsShare && (
            <button
              onClick={handleShare}
              disabled={isProcessing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isProcessing ? 'Processing...' : '📤 Share'}
            </button>
          )}
          
          <button
            onClick={handlePreview}
            disabled={isProcessing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isProcessing ? 'Processing...' : '👁️ Preview'}
          </button>
          
          {previewUrl && (
            <button
              onClick={clearPreview}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
            >
              Clear Preview
            </button>
          )}
        </div>
        
        {status && (
          <div className={`text-sm p-2 rounded-lg ${
            status.includes('Error') || status.includes('failed') 
              ? 'bg-red-500/20 text-red-200 border border-red-500/30' 
              : 'bg-green-500/20 text-green-200 border border-green-500/30'
          }`}>
            {status}
          </div>
        )}
      </div>

      {/* Screenshot Preview */}
      {previewUrl && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h4 className="text-md font-semibold text-white mb-3">Screenshot Preview</h4>
          <img 
            src={previewUrl} 
            alt="Screenshot preview" 
            className="max-w-full h-auto rounded-lg border border-white/20"
          />
        </div>
      )}

      {/* Content to Screenshot */}
      <div 
        ref={contentRef}
        className="rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export default ScreenshotDemo
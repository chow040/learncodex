import html2canvas from 'html2canvas'

export interface ScreenshotOptions {
  filename?: string
  quality?: number
  backgroundColor?: string
  scale?: number
  useCORS?: boolean
}

export const captureScreenshot = async (
  element: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<void> => {
  const {
    filename = `trade-idea-${new Date().toISOString().split('T')[0]}.png`,
    quality = 1.0,
    backgroundColor = '#0f172a', // Dark background matching your theme
    scale = 2,
    useCORS = true
  } = options

  try {
    const canvas = await html2canvas(element, {
      backgroundColor,
      scale,
      useCORS,
      allowTaint: false,
      foreignObjectRendering: true,
      logging: false,
      onclone: (clonedDoc) => {
        // Ensure all images are loaded in the cloned document
        const images = clonedDoc.querySelectorAll('img')
        images.forEach(img => {
          if (img.crossOrigin !== 'anonymous') {
            img.crossOrigin = 'anonymous'
          }
        })
      }
    })

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create screenshot blob')
      }

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      
      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 'image/png', quality)

  } catch (error) {
    console.error('Screenshot capture failed:', error)
    throw new Error('Failed to capture screenshot. Please try again.')
  }
}

export const captureElementAsDataURL = async (
  element: HTMLElement,
  options: Omit<ScreenshotOptions, 'filename'> = {}
): Promise<string> => {
  const {
    backgroundColor = '#0f172a',
    scale = 2,
    useCORS = true
  } = options

  const canvas = await html2canvas(element, {
    backgroundColor,
    scale,
    useCORS,
    allowTaint: false,
    foreignObjectRendering: true,
    logging: false
  })

  return canvas.toDataURL('image/png')
}

export const shareScreenshot = async (
  element: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<void> => {
  if (!navigator.share) {
    throw new Error('Web Share API not supported')
  }

  try {
    const dataURL = await captureElementAsDataURL(element, options)
    
    // Convert data URL to blob
    const response = await fetch(dataURL)
    const blob = await response.blob()
    const file = new File([blob], options.filename || 'trade-idea.png', { type: 'image/png' })

    await navigator.share({
      title: 'Trade Idea Screenshot',
      text: 'Check out this trade idea analysis',
      files: [file]
    })
  } catch (error) {
    console.error('Screenshot sharing failed:', error)
    throw error
  }
}
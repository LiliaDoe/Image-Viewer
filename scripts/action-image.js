;(async function () {
  'use strict'

  if (typeof ImageViewerUtils !== 'object') {
    await chrome.runtime.sendMessage('load_utility')
  }

  const options = window.ImageViewerOption
  options.closeButton = true
  options.referrerPolicy = !!document.querySelector('img[referrerPolicy="no-referrer"]')
  options.cors = !!document.querySelector('img[crossorigin="anonymous"]')

  const nodeInfo = await chrome.runtime.sendMessage('get_info')
  const [srcUrl, nodeSize] = nodeInfo === null ? [] : nodeInfo
  const dom = document.querySelector('.ImageViewerLastDom')

  if (nodeSize > 0) {
    options.minWidth = Math.min(nodeSize, options.minWidth)
    options.minHeight = Math.min(nodeSize, options.minHeight)
  }

  if (dom) {
    const [divWidth, divHeight] = ImageViewerUtils.getWrapperSize(dom) || []
    if (divWidth) {
      options.minWidth = Math.min(divWidth, options.minWidth)
      options.minHeight = Math.min(divHeight, options.minHeight)
    }
  }

  await ImageViewerUtils.simpleUnlazyImage()

  const uniqueImageUrls = ImageViewerUtils.getImageList(options)
  if (!!document.querySelector('iframe')) {
    const minSize = Math.min(options.minWidth, options.minHeight)
    const iframeImage = await chrome.runtime.sendMessage({msg: 'extract_frames', minSize: minSize})
    const uniqueIframeImage = []
    outer: for (const img of iframeImage) {
      for (const unique of uniqueIframeImage) {
        if (img[0] === unique[0]) continue outer
      }
      uniqueIframeImage.push(img)
    }
    uniqueImageUrls.push(...uniqueIframeImage)
  }

  const orderedImageUrls = ImageViewerUtils.sortImageDataList(uniqueImageUrls)

  if (dom) {
    const currentUrl = ImageViewerUtils.getDomUrl(dom)
    const index = orderedImageUrls.indexOf(currentUrl)
    index !== -1 ? (options.index = index) : null
  } else if (srcUrl) {
    if (!srcUrl.startsWith('data')) {
      const index = orderedImageUrls.indexOf(srcUrl)
      index !== -1 ? (options.index = index) : null
    } else {
      for (const data of orderedImageUrls) {
        if (typeof data === 'string') continue
        if (srcUrl === data[0]) {
          options.index = orderedImageUrls.indexOf(data)
          break
        }
      }
    }
    if (!options.index) {
      orderedImageUrls.unshift(srcUrl)
      console.log('Unshift Image to list')
    }
  }

  for (const data of orderedImageUrls) {
    if (data[0].startsWith('data')) {
      data[0] = ImageViewerUtils.dataURLToObjectURL(data[0])
    }
  }

  if (typeof imageViewer !== 'function') {
    await chrome.runtime.sendMessage('load_script')
  }
  imageViewer(orderedImageUrls, options)
})()

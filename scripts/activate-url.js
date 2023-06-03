;(function () {
  'use strict'

  function checkIframeUrl(url) {
    return new Promise(async resolve => {
      setTimeout(() => resolve(false), 5000)
      try {
        const res = await fetch(url)
        if (res.ok) {
          const options = res.headers.get('X-Frame-Options')
          if (!options) {
            resolve(true)
          } else if (options === 'DENY') {
            resolve(false)
          } else if (options === 'SAMEORIGIN') {
            const target = new URL(res.url).origin
            const origin = new URL(sender.tab.url).origin
            resolve(target === origin)
          }
        }
      } catch (error) {}
      resolve(false)
    })
  }
  function isNonTrivialUrl(iframe) {
    const src = iframe.src
    if (src === '' || src === 'about:blank') return false
    if (src.startsWith('javascript')) {
      iframe.classList.add('updateByTest')
      iframe.src = 'about:blank'
      return false
    }
    return true
  }
  async function removeFailedIframe() {
    const iframeList = document.querySelectorAll('iframe:not(.loadedWorker)')
    const testList = []
    for (const iframe of iframeList) {
      iframe.classList.add('loadedWorker')
      if (isNonTrivialUrl(iframe)) {
        testList.push(iframe.src)
      }
    }
    const BackgroundResult = chrome.runtime.sendMessage({msg: 'check_iframes', data: testList})
    const localResult = Promise.all(testList.map(checkIframeUrl))
    const asyncList = await Promise.all([BackgroundResult, localResult])
    const result = []
    for (let i = 0; i < testList.length; i++) {
      result.push(asyncList[0][i] || asyncList[1][i])
    }
    for (let i = 0; i < testList.length; i++) {
      if (result[i] === false) {
        const src = testList[i]
        const iframe = document.querySelector(`iframe[src="${src}"]`)
        if (iframe) {
          iframe.classList.add('updateByTest')
          iframe.src = 'about:blank'
        }
      }
    }
  }

  async function init() {
    if (document.body.children.length === 1 && document.body.children[0].tagName === 'IMG') {
      const image = document.body.children[0]

      await chrome.runtime.sendMessage('get_options')
      const options = window.ImageViewerOption
      options.closeButton = false
      options.minWidth = 0
      options.minHeight = 0

      const getRawUrl = src => {
        const argsRegex = /(.*?(?:png|jpeg|jpg|gif|bmp|tiff|webp)).*/i
        const argsMatch = !src.startsWith('data') && src.match(argsRegex)
        if (argsMatch) {
          const rawUrl = argsMatch[1]
          if (rawUrl !== src) return rawUrl
        }
        try {
          const url = new URL(src)
          const noSearch = url.origin + url.pathname
          if (noSearch !== src) return noSearch
        } catch (error) {}
        return src
      }

      const rawUrl = getRawUrl(image.src)
      if (rawUrl !== image.src) {
        const currSize = image.naturalWidth
        const rawSize = await new Promise(resolve => {
          const img = new Image()
          img.onload = () => resolve(img.naturalWidth)
          img.onerror = () => resolve(0)
          img.src = rawUrl
        })

        if (rawSize > currSize) {
          await chrome.runtime.sendMessage('load_script')
          image.style.display = 'none'
          imageViewer([rawUrl], options)
          return
        }
      }

      await chrome.runtime.sendMessage('load_script')
      image.style.display = 'none'
      imageViewer([image.src], options)
      return
    }

    chrome.runtime.sendMessage('load_main_worker')

    // chrome.scripting.executeScript never return on invalid iframe
    const observer = new MutationObserver(async mutationList => {
      let found = false
      for (const mutation of mutationList) {
        const target = mutation.target
        if (target.tagName === 'IFRAME') {
          if (target.classList.contains('updateByTest')) {
            target.classList.remove('updateByTest')
            continue
          }
          found = true
          target.classList.remove('loadedWorker')
        }
      }
      if (!found || !document.querySelector('iframe:not(.loadedWorker)')) return
      await removeFailedIframe()
      chrome.runtime.sendMessage('load_worker')
    })
    observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']})

    await removeFailedIframe()
    console.log('Init content script.')
    chrome.runtime.sendMessage('load_worker')

    // for some rare case
    setTimeout(async () => {
      await removeFailedIframe()
      chrome.runtime.sendMessage('load_worker')
    }, 3000)
  }

  if (document.visibilityState === 'visible') {
    init()
  } else {
    console.log('Waiting user to view the page.')
    const handleEvent = () => {
      document.removeEventListener('visibilitychange', handleEvent)
      window.removeEventListener('focus', handleEvent)
      init()
    }
    document.addEventListener('visibilitychange', handleEvent)
    window.addEventListener('focus', handleEvent)
  }
})()

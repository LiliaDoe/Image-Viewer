;(function () {
  'use strict'

  function getImageSize(src) {
    return new Promise((resolve, reject) => {
      let img = new Image()
      img.onload = () => resolve(img.naturalWidth)
      img.onerror = reject
      img.src = src
    })
  }

  async function simpleUnlazyImage() {
    function hash(input) {
      var hash = 0
      if (input.length === 0) return hash
      for (let i = 0; i < input.length; i++) {
        const chr = input.charCodeAt(i)
        hash = hash * 31 + chr
        hash |= 0
      }
      return hash
    }
    const imgList = document.querySelectorAll('img')
    const listSize = imgList.length
    const currHash = hash(window.location.href + String(listSize))
    const unlazyClass = [...document.documentElement.classList].find(x => x.startsWith('unlazy-hash-'))
    if (currHash === parseInt(unlazyClass?.substring(12))) return
    document.documentElement.classList.remove(unlazyClass)
    document.documentElement.classList.add(`unlazy-hash-${currHash}`)

    var lazyName = ''
    var mult = false
    const urlReg = /^(?:https?:\/)?\/.+/
    const multReg = /(?:https?:\/)?\/\S+\.[a-zA-Z]{3,4}/g
    top: for (let i = 0; i < listSize; i++) {
      sub: for (const attr of imgList[i].attributes) {
        if (attr.name === 'src' || !urlReg.test(attr.value)) continue sub
        lazyName = attr.name

        const match = [...attr.value.matchAll(multReg)]
        if (match.length === 1) break top
        const first = match[0][0]
        const last = match[match.length - 1][0]
        const [firstSize, LastSize] = await Promise.all([getImageSize(first), getImageSize(last)])
        mult = LastSize > firstSize
        break top
      }
    }
    if (!lazyName) {
      console.log('No lazy src attribute found')
      return
    }
    console.log(`Unlazy img with ${lazyName} attr`)
    const lazyImage = document.querySelectorAll(`img[${lazyName}]`)
    const getLazyURL = mult ? match => match.slice(-1)[0][0] : match => match[0][0]
    const protocol = window.location.protocol
    for (const img of lazyImage) {
      const attr = img.getAttribute(lazyName)
      if (!attr) continue
      const newURL = getLazyURL([...attr.matchAll(multReg)]).replace(/https?:/, protocol)
      img.src = newURL
      img.srcset = newURL
    }
    for (const img of imgList) img.loading = 'eager'
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  function getImageList(options) {
    var imageUrls = []
    for (const img of document.querySelectorAll('img[src]')) {
      if ((img.clientWidth >= options.minWidth && img.clientHeight >= options.minHeight) || !img.complete) {
        imageUrls.push(img.currentSrc)
      }
    }

    for (const node of document.querySelectorAll('*')) {
      if (node.clientWidth < options.minWidth || node.clientWidth < options.minHeight) break
      const bg = window.getComputedStyle(node).backgroundImage
      if (bg?.indexOf('url') === 0 && bg.indexOf('.svg') === -1) {
        imageUrls.push(bg.substring(4, bg.length - 1).replace(/['"]/g, ''))
      }
    }

    for (const video of document.querySelectorAll('video[poster]')) {
      if (video.clientWidth >= options.minWidth && video.clientHeight >= options.minHeight) {
        imageUrls.push(video.poster)
      }
    }

    return [...new Set(imageUrls)]
  }

  chrome.runtime.sendMessage('get_options', async res => {
    if (!res) return
    var {options} = res
    options.closeButton = true

    chrome.runtime.sendMessage('get_args', async args => {
      const [srcUrl] = args
      const type = [...document.getElementsByTagName('img')].filter(img => img.currentSrc === srcUrl)[0]
      if (type) {
        const minSize = Math.min(type.clientWidth, type.clientHeight, type.naturalWidth, type.naturalHeight)
        options.minWidth = Math.min(minSize, options.minWidth)
        options.minHeight = Math.min(minSize, options.minHeight)
      } else {
        options.sizeCheck = true
        console.log(`Image node of ${srcUrl} not found`)
      }

      await simpleUnlazyImage()

      var uniqueImageUrls = getImageList(options)
      if (uniqueImageUrls.indexOf(type?.currentSrc) !== -1) {
        options.index = uniqueImageUrls.indexOf(type.currentSrc)
      } else if (uniqueImageUrls.indexOf(srcUrl) !== -1) {
        options.index = uniqueImageUrls.indexOf(srcUrl)
      } else {
        uniqueImageUrls.unshift(srcUrl)
        console.log('Image unshift to list')
      }

      console.log(`${uniqueImageUrls.length} images pass filter`)

      typeof imageViewer === 'function'
        ? imageViewer(uniqueImageUrls, options)
        : chrome.runtime.sendMessage('load_script', res => {
            imageViewer(uniqueImageUrls, options)
          })
    })
  })
})()
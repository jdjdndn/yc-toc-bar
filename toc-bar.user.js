// ==UserScript==
// @name       Toc Bar二改版, 自动生成文章大纲。
// @author            wcbblll
// @namespace         https://github.com/hikerpig
// @license           MIT
// @description       A floating table of content widget
// @description:zh-CN 自动生成文章大纲目录，在页面右侧展示一个浮动的组件。覆盖常用在线阅读资讯站（技术向）。github/medium/MDN/掘金/简书等
// @version           0.1
// @match            *://*/*
// @exclude           *://www.kuaishou.com/*
// @exclude           *://dazhuan.site/*
// @run-at            document-end
// @grant             GM_getResourceText
// @grant             GM_addStyle
// @grant             GM_setValue
// @grant             GM_getValue
// @require           https://cdnjs.cloudflare.com/ajax/libs/tocbot/4.18.2/tocbot.min.js
// @icon              https://raw.githubusercontent.com/hikerpig/toc-bar-userscript/master/toc-logo.svg
// ==/UserScript==

(function () {
  const headingSelector = 'h1, h2, h3, h4, h5'
  function createHtml(policyStr, html) {
    try {
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        var trustedTypesPolicy = window.trustedTypes.createPolicy(policyStr, {
          createHTML: (string, sink) => string
        });
        return trustedTypesPolicy.createHTML(html)
      }
    } catch (error) {
      return html
    }
  }
  function guessThemeColor() {
    const meta = document.head.querySelector('meta[name="theme-color"]')
    if (meta) {
      return meta.getAttribute('content')
    }
  }

  /**
   * @param {String} content
   * @return {String}
   */
  function doContentHash(content) {
    const val = content.split('').reduce((prevHash, currVal) => (((prevHash << 5) - prevHash) + currVal.charCodeAt(0)) | 0, 0);
    return val.toString(32)
  }

  const POSITION_STORAGE = {
    cache: null,
    checkCache() {
      if (!POSITION_STORAGE.cache) {
        POSITION_STORAGE.cache = GM_getValue('tocbar-positions', {})
      }
    },
    get(k) {
      k = k || location.host
      POSITION_STORAGE.checkCache()
      return POSITION_STORAGE.cache[k]
    },
    set(k, position) {
      k = k || location.host
      POSITION_STORAGE.checkCache()
      POSITION_STORAGE.cache[k] = position
      GM_setValue('tocbar-positions', POSITION_STORAGE.cache)
    },
  }

  function isEmpty(input) {
    if (input) {
      return Object.keys(input).length === 0
    }
    return true
  }

  /** 宽度，也用于计算拖动时的最小 right */
  const TOC_BAR_WIDTH = 340

  const TOC_BAR_DEFAULT_ACTIVE_COLOR = '#54BC4B';

  // ---------------- TocBar ----------------------
  const TOC_BAR_STYLE = `
.toc-bar {
  --toc-bar-active-color: ${TOC_BAR_DEFAULT_ACTIVE_COLOR};
  --toc-bar-text-color: #333;
  --toc-bar-background-color: #FEFEFE;

  position: fixed;
  z-index: 9000;
  right: 5px;
  top: 80px;
  width: ${TOC_BAR_WIDTH}px;
  font-size: 14px;
  box-sizing: border-box;
  padding: 0 10px 10px 0;
  box-shadow: 0 1px 3px #DDD;
  border-radius: 4px;
  transition: width 0.2s ease;
  color: var(--toc-bar-text-color);
  background: var(--toc-bar-background-color);

  user-select:none;
  -moz-user-select:none;
  -webkit-user-select: none;
  -ms-user-select: none;
}

.toc-bar[colorscheme="dark"] {
  --toc-bar-text-color: #fafafa;
  --toc-bar-background-color: #333;
}
.toc-bar[colorscheme="dark"] svg {
  fill: var(--toc-bar-text-color);
  stroke: var(--toc-bar-text-color);
}

.toc-bar.toc-bar--collapsed {
  width: 30px;
  height: 30px;
  padding: 0;
  overflow: hidden;
}

.toc-bar--collapsed .toc {
  display: none;
}

.toc-bar--collapsed .hidden-when-collapsed {
  display: none;
}

.toc-bar__header {
  font-weight: bold;
  padding-bottom: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
}

.toc-bar__refresh {
  position: relative;
  top: -2px;
}

.toc-bar__icon-btn {
  height: 1em;
  width: 1em;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.toc-bar__icon-btn:hover {
  opacity: 0.7;
}

.toc-bar__icon-btn svg {
  max-width: 100%;
  max-height: 100%;
  vertical-align: top;
}

.toc-bar__actions {
  align-items: center;
}
.toc-bar__actions .toc-bar__icon-btn {
  margin-left: 1em;
}

.toc-bar__scheme {
  transform: translateY(-1px) scale(1.1);
}

.toc-bar__header-left {
  align-items: center;
}

.toc-bar__toggle {
  cursor: pointer;
  padding: 8px 8px;
  box-sizing: content-box;
  transition: transform 0.2s ease;
}

.toc-bar__title {
  margin-left: 5px;
}

.toc-bar a.toc-link {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  line-height: 1.6;
}

.flex {
  display: flex;
}

/* tocbot related */
.toc-bar__toc {
  max-height: 80vh;
  overflow-y: auto;
}

.toc-list-item > a:hover {
  text-decoration: underline;
}

.toc-list {
  padding-inline-start: 0;
}

.toc-bar__toc > .toc-list {
  margin: 0;
  overflow: hidden;
  position: relative;
  padding-left: 5px;
}

.toc-bar__toc>.toc-list li {
  list-style: none;
  padding-left: 8px;
  position: static;
}

a.toc-link {
  color: currentColor;
  height: 100%;
}

.is-toc-collapsible {
  max-height: 1000px;
  overflow: hidden;
  transition: all 300ms ease-in-out;
}

.is-toc-collapsed {
  max-height: 0;
}

.is-toc-position-fixed {
  position: fixed !important;
  top: 0;
}

// .is-active-link {
//   font-weight: 700;
// }

.toc-link::before {
  background-color: var(--toc-bar-background-color);
  content: ' ';
  display: inline-block;
  height: inherit;
  left: 0;
  margin-top: -1px;
  position: absolute;
  width: 2px;
}

.is-active-link::before {
  background-color: var(--toc-bar-active-color);
}

.toc-list-item,
.toc-link {
  font-size: 1em; /* reset font size */
}


@media print {
  .toc-bar__no-print { display: none !important; }
}
/* end tocbot related */
`

  const TOCBOT_CONTAINTER_CLASS = 'toc-bar__toc'

  const DARKMODE_KEY = 'tocbar-darkmode'

  /**
   * @typedef {Object} TocBarOptions
   * @property {String} [siteName]
   * @property {Number} [initialTop]
   */

  /**
   * @class
   * @param {TocBarOptions} options
   */
  function TocBar(options = {}) {
    this.options = options

    // inject style
    GM_addStyle(TOC_BAR_STYLE)
    this.element = document.createElement('div')
    this.element.id = 'toc-bar'
    this.element.classList.add('toc-bar', 'toc-bar__no-print')
    document.body.appendChild(this.element)

    /** @type {Boolean} */
    this.visible = true

    this.initHeader()

    // create a container tocbot
    const tocElement = document.createElement('div')
    this.tocElement = tocElement
    tocElement.classList.add(TOCBOT_CONTAINTER_CLASS)
    this.element.appendChild(tocElement)

    POSITION_STORAGE.checkCache()
    const cachedPosition = POSITION_STORAGE.get(options.siteName)
    if (!isEmpty(cachedPosition)) {
      this.element.style.top = `${Math.max(0, cachedPosition.top)}px`
      this.element.style.right = `${cachedPosition.right}px`
    } else if (options.hasOwnProperty('initialTop')) {
      this.element.style.top = `${options.initialTop}px`
    }

    if (GM_getValue('tocbar-hidden', false)) {
      this.toggle(false)
    }

    const isDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    /** @type {Boolean} */
    this.isDarkMode = isDark

    if (GM_getValue(DARKMODE_KEY, false)) {
      this.toggleScheme(true)
    }
  }

  const REFRESH_ICON = `<svg t="1593614403764" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5002" width="200" height="200"><path d="M918 702.8 918 702.8c45.6-98.8 52-206 26-303.6-30-112.4-104-212.8-211.6-273.6L780 23.2l-270.8 70.8 121.2 252.4 50-107.6c72.8 44.4 122.8 114.4 144 192.8 18.8 70.8 14.4 147.6-18.8 219.6-42 91.2-120.8 153.6-210.8 177.6-13.2 3.6-26.4 6-39.6 8l56 115.6c5.2-1.2 10.4-2.4 16-4C750.8 915.2 860 828.8 918 702.8L918 702.8M343.2 793.2c-74-44.4-124.8-114.8-146-194-18.8-70.8-14.4-147.6 18.8-219.6 42-91.2 120.8-153.6 210.8-177.6 14.8-4 30-6.8 45.6-8.8l-55.6-116c-7.2 1.6-14.8 3.2-22 5.2-124 33.2-233.6 119.6-291.2 245.6-45.6 98.8-52 206-26 303.2l0 0.4c30.4 113.2 105.2 214 213.6 274.8l-45.2 98 270.4-72-122-252L343.2 793.2 343.2 793.2M343.2 793.2 343.2 793.2z" p-id="5003"></path></svg>`

  const TOC_ICON = `
<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
    viewBox="0 0 1024 1024" style="enable-background:new 0 0 1024 1024;" xml:space="preserve">
<g>
  <g>
    <path d="M835.2,45.9H105.2v166.8l93.2,61.5h115.8H356h30.6v-82.8H134.2v-24.9h286.2v107.6h32.2V141.6H134.2V118h672.1v23.6H486.4
      v132.5h32V166.5h287.8v24.9H553.8v82.8h114.1H693h225.6V114.5L835.2,45.9z M806.2,93.2H134.2V67.2h672.1v26.1H806.2z"/>
    <polygon points="449.3,1008.2 668,1008.2 668,268.9 553.8,268.9 553.8,925.4 518.4,925.4 518.4,268.9 486.4,268.9 486.4,925.4
      452.6,925.4 452.6,268.9 420.4,268.9 420.4,925.4 386.6,925.4 386.6,268.9 356,268.9 356,946.7 		"/>
  </g>
</g>
</svg>
`

  const LIGHT_ICON = `
  <?xml version="1.0" encoding="iso-8859-1"?>
  <!-- Generator: Adobe Illustrator 18.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
  <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
  <svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
     viewBox="0 0 181.328 181.328" style="enable-background:new 0 0 181.328 181.328;" xml:space="preserve" style="transform: translateY(-1px);">
  <g>
    <path d="M118.473,46.308V14.833c0-4.142-3.358-7.5-7.5-7.5H70.357c-4.142,0-7.5,3.358-7.5,7.5v31.474
      C51.621,54.767,44.34,68.214,44.34,83.331c0,25.543,20.781,46.324,46.324,46.324s46.324-20.781,46.324-46.324
      C136.988,68.215,129.708,54.769,118.473,46.308z M77.857,22.333h25.615v16.489c-4.071-1.174-8.365-1.815-12.809-1.815
      c-4.443,0-8.736,0.642-12.807,1.814V22.333z M90.664,114.655c-17.273,0-31.324-14.052-31.324-31.324
      c0-17.272,14.052-31.324,31.324-31.324s31.324,14.052,31.324,31.324C121.988,100.604,107.937,114.655,90.664,114.655z"/>
    <path d="M40.595,83.331c0-4.142-3.358-7.5-7.5-7.5H7.5c-4.142,0-7.5,3.358-7.5,7.5c0,4.142,3.358,7.5,7.5,7.5h25.595
      C37.237,90.831,40.595,87.473,40.595,83.331z"/>
    <path d="M173.828,75.831h-25.595c-4.142,0-7.5,3.358-7.5,7.5c0,4.142,3.358,7.5,7.5,7.5h25.595c4.142,0,7.5-3.358,7.5-7.5
      C181.328,79.189,177.97,75.831,173.828,75.831z"/>
    <path d="M44.654,47.926c1.464,1.465,3.384,2.197,5.303,2.197c1.919,0,3.839-0.732,5.303-2.197c2.929-2.929,2.929-7.678,0-10.606
      L37.162,19.222c-2.929-2.93-7.678-2.929-10.606,0c-2.929,2.929-2.929,7.678,0,10.606L44.654,47.926z"/>
    <path d="M136.674,118.735c-2.93-2.929-7.678-2.928-10.607,0c-2.929,2.929-2.928,7.678,0,10.607l18.1,18.098
      c1.465,1.464,3.384,2.196,5.303,2.196c1.919,0,3.839-0.732,5.304-2.197c2.929-2.929,2.928-7.678,0-10.607L136.674,118.735z"/>
    <path d="M44.654,118.736l-18.099,18.098c-2.929,2.929-2.929,7.677,0,10.607c1.464,1.465,3.384,2.197,5.303,2.197
      c1.919,0,3.839-0.732,5.303-2.197l18.099-18.098c2.929-2.929,2.929-7.677,0-10.606C52.332,115.807,47.583,115.807,44.654,118.736z"
      />
    <path d="M131.371,50.123c1.919,0,3.839-0.732,5.303-2.196l18.1-18.098c2.929-2.929,2.929-7.678,0-10.607
      c-2.929-2.928-7.678-2.929-10.607-0.001l-18.1,18.098c-2.929,2.929-2.929,7.678,0,10.607
      C127.532,49.391,129.452,50.123,131.371,50.123z"/>
    <path d="M90.664,133.4c-4.142,0-7.5,3.358-7.5,7.5v25.595c0,4.142,3.358,7.5,7.5,7.5c4.142,0,7.5-3.358,7.5-7.5V140.9
      C98.164,136.758,94.806,133.4,90.664,133.4z"/>
  </g>
  </svg>
`

  TocBar.prototype = {
    /**
     * @method TocBar
     */
    initHeader() {
      const header = document.createElement('div')
      header.classList.add('toc-bar__header')
      header.innerHTML = createHtml('yc-toc-bar', `
    <div class="flex toc-bar__header-left">
      <div class="toc-bar__toggle toc-bar__icon-btn" title="Toggle TOC Bar">
        ${TOC_ICON}
      </div>
      <div class="toc-bar__title hidden-when-collapsed">TOC Bar</div>
    </div>
    <div class="toc-bar__actions flex hidden-when-collapsed">
      <div class="toc-bar__scheme toc-bar__icon-btn" title="Toggle Light/Dark Mode">
        ${LIGHT_ICON}
      </div>
      <div class="toc-bar__refresh toc-bar__icon-btn" title="Refresh TOC">
        ${REFRESH_ICON}
      </div>
    </div>
    `)
      const toggleElement = header.querySelector('.toc-bar__toggle')
      toggleElement.addEventListener('click', () => {
        this.toggle()
        GM_setValue('tocbar-hidden', !this.visible)
      })
      this.logoSvg = toggleElement.querySelector('svg')

      const refreshElement = header.querySelector('.toc-bar__refresh')
      refreshElement.addEventListener('click', () => {
        try {
          tocbot.refresh()
        } catch (error) {
          console.warn('error in tocbot.refresh', error)
        }
      })

      const toggleSchemeElement = header.querySelector('.toc-bar__scheme')
      toggleSchemeElement.addEventListener('click', () => {
        this.toggleScheme()
      })
      // ---------------- header drag ----------------------
      const dragState = {
        startMouseX: 0,
        startMouseY: 0,
        startPositionX: 0,
        startPositionY: 0,
        startElementDisToRight: 0,
        isDragging: false,
        curRight: 0,
        curTop: 0,
      }

      const onMouseMove = (e) => {
        if (!dragState.isDragging) return
        const deltaX = e.pageX - dragState.startMouseX
        const deltaY = e.pageY - dragState.startMouseY
        // 要换算为 right 数字
        const newRight = Math.max(30 - TOC_BAR_WIDTH, dragState.startElementDisToRight - deltaX)
        const newTop = Math.max(0, dragState.startPositionY + deltaY)
        Object.assign(dragState, {
          curTop: newTop,
          curRight: newRight,
        })
        // console.table({ newRight, newTop})
        this.element.style.right = `${newRight}px`
        this.element.style.top = `${newTop}px`
      }

      const onMouseUp = () => {
        Object.assign(dragState, {
          isDragging: false,
        })
        document.body.removeEventListener('mousemove', onMouseMove)
        document.body.removeEventListener('mouseup', onMouseUp)

        POSITION_STORAGE.set(this.options.siteName, {
          top: dragState.curTop,
          right: dragState.curRight,
        })
      }

      header.addEventListener('mousedown', (e) => {
        if (e.target === toggleElement) return
        const bbox = this.element.getBoundingClientRect()
        Object.assign(dragState, {
          isDragging: true,
          startMouseX: e.pageX,
          startMouseY: e.pageY,
          startPositionX: bbox.x,
          startPositionY: bbox.y,
          startElementDisToRight: document.body.clientWidth - bbox.right,
        })
        document.body.addEventListener('mousemove', onMouseMove)
        document.body.addEventListener('mouseup', onMouseUp)
      })
      // ----------------end header drag -------------------

      this.element.appendChild(header)
    },
    /**
     * @method TocBar
     * @param {SiteSetting} options
     */
    initTocbot(options) {
      const me = this

      /**
       * records for existing ids to prevent id conflict (when there are headings of same content)
       * @type {Object} {[key: string]: number}
       **/
      this._tocContentCountCache = {}

      const tocbotOptions = Object.assign(
        {},
        {
          tocSelector: `.${TOCBOT_CONTAINTER_CLASS}`,
          scrollSmoothOffset: options.scrollSmoothOffset || 0,
          isCollapsedClass: 'is-toc-collapsed',
          collapsibleClass: 'is-toc-collapsible',
          positionFixedClass: 'is-toc-position-fixed',
          headingObjectCallback(obj, ele) {
            // if there is no id on the header element, add one that derived from hash of header title
            // remove ¶ and # notation in headers text
            obj.textContent = obj.textContent.replace(/¶|#/g, '');
            if (!ele.id) {
              let newId
              if (options.findHeaderId) {
                newId = options.findHeaderId(ele)
              }
              if (!newId) {
                newId = me.generateHeaderId(obj, ele)
                ele.setAttribute('id', newId)
              }
              if (newId) obj.id = newId
            }
            return obj
          },
          headingSelector,
          collapseDepth: 4,
        },
        options
      )
      // console.log('tocbotOptions', tocbotOptions);
      try {
        tocbot.init(tocbotOptions)
        if (options.onInit) {
          options.onInit(this)
        }
      } catch (error) {
        console.warn('error in tocbot.init', error)
      }
    },
    generateHeaderId(obj, ele) {
      const hash = doContentHash(obj.textContent)
      let count = 1
      let resultHash = hash
      if (this._tocContentCountCache[hash]) {
        count = this._tocContentCountCache[hash] + 1
        resultHash = doContentHash(`${hash}-${count}`)
      }
      this._tocContentCountCache[hash] = count
      return `tocbar-${resultHash}`
    },
    /**
     * @method TocBar
     */
    toggle(shouldShow = !this.visible) {
      const HIDDEN_CLASS = 'toc-bar--collapsed'
      const LOGO_HIDDEN_CLASS = 'toc-logo--collapsed'
      if (shouldShow) {
        this.element.classList.remove(HIDDEN_CLASS)
        this.logoSvg && this.logoSvg.classList.remove(LOGO_HIDDEN_CLASS)
      } else {
        this.element.classList.add(HIDDEN_CLASS)
        this.logoSvg && this.logoSvg.classList.add(LOGO_HIDDEN_CLASS)

        const right = parseInt(this.element.style.right)
        if (right && right < 0) {
          this.element.style.right = "0px"
          const cachedPosition = POSITION_STORAGE.cache
          if (!isEmpty(cachedPosition)) {
            POSITION_STORAGE.set(null, { ...cachedPosition, right: 0 })
          }
        }
      }
      this.visible = shouldShow
    },
    /**
     * Toggle light/dark scheme
     * @method TocBar
     */
    toggleScheme(isDark) {
      const isDarkMode = typeof isDark === 'undefined' ? !this.isDarkMode : isDark
      this.element.setAttribute('colorscheme', isDarkMode ? 'dark' : 'light')
      console.log('[toc-bar] toggle scheme', isDarkMode)
      this.isDarkMode = isDarkMode

      GM_setValue(DARKMODE_KEY, isDarkMode)
      this.refreshStyle()
    },
    refreshStyle() {
      const themeColor = guessThemeColor()
      if (themeColor && !this.isDarkMode) {
        this.element.style.setProperty('--toc-bar-active-color', themeColor);
      } else if (this.isDarkMode) {
        this.element.style.setProperty('--toc-bar-active-color', TOC_BAR_DEFAULT_ACTIVE_COLOR);
      }
    },
    getEleDisplay() {
      return this.element.style.display
    },
    setEleDisplay(display) {
      this.element.style.display = display
    }
  }
  // ----------------end TocBar -------------------

  const history = window.history;

  // 保存原始的 pushState 方法
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState

  // 重写 pushState 方法来触发自定义事件
  history.pushState = function (e) {
    const result = originalPushState.apply(this, arguments);
    window.dispatchEvent(new Event('pushstate'))
    window.dispatchEvent(new Event('urlchange'));
    return result;
  };
  history.replaceState = function replaceState(...args) {
    const newReplaceState = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('replacestate'));
    window.dispatchEvent(new Event('urlchange'));
    return newReplaceState;
  };

  function urlChange() {
    try {
      tocbot && tocbot.refresh()
    } catch (error) {
      console.warn('error in tocbot.refresh', error)
    }
  }
  // 为自定义的 'urlchange' 事件添加监听器
  window.addEventListener('popstate', urlChange);
  window.addEventListener('urlchange', urlChange);

  function main() {
    let options, tocBar
    loopFunc(() => {
      const hasTitle = hasEle(headingSelector)
      console.log(hasTitle);
      if (!options) {
        const selector = getEleId(getMainBox(document.body))
        if (selector) {
          options = { contentSelector: selector }
        }
        console.log(options);
        if (options && !tocBar) {
          tocBar = new TocBar(options)
          tocBar.initTocbot(options)
          tocBar.refreshStyle()
        }
      }
      const groupList = generateList(hasTitle)
      // 有h1等标题元素或者有相似元素就显示，反之隐藏
      if (!hasTitle && !groupList.length) {
        if (tocBar && tocBar.eleDisplay !== 'none') tocBar.setEleDisplay('none')
      } else {
        if (tocBar && tocBar.eleDisplay !== 'block') tocBar.setEleDisplay('block')
      }
    })
  }

  urlChange()
  main()


  // 给一个元素，遍历所有属性，通过querySelectorAll获取元素,判断是否唯一，找到唯一的元素并返回属性名

  function getEleId(ele) {
    if (!ele) return null
    if (ele.id) return '#' + ele.id
    const tagName = ele.nodeName.toLowerCase()
    if (ele.className) return tagName + '.' + ele.className.split(' ').join('.')
    const attrs = ele.attributes
    for (const attr of attrs) {
      const { name, value = '' } = attr
      if (name === 'class') continue
      let selector = `${tagName}[${name}="${value}"]`
      const elements = document.querySelectorAll(selector)
      if (elements.length === 1) {
        return selector
      }
    }
    return null
  }

  // 根据元素是否在可见区，面积不为0，判断元素是否存在

  function getMainBoxByElement(element) {
    if (!element) return null
    const elementRect = element.getBoundingClientRect()
    if (elementRect.width === 0 || elementRect.height === 0) return null
    // 根据元素的属性，非display:none为存在
    if (element.style.display !== 'none') return element
    // getComputedStyle(divElement).display不为none为存在
    if (getComputedStyle(element).display !== 'none') return element
    return null
  }

  // 给出一组元素，根据面积找个最大的元素

  function getMainBoxByElements(elements) {
    if (!elements) return null
    const parent = elements[0].parentNode
    let mainBox
    let maxArea = 0
    const eleLen = elements.length
    for (let i = 0; i < eleLen; i++) {
      const element = elements[i]
      if (!getMainBoxByElement(element)) continue
      const elementRect = element.getBoundingClientRect()
      const area = elementRect.width * elementRect.height
      if (area > maxArea) {
        maxArea = area
        mainBox = element
      }
    }
    // 比较父元素与父元素下最大子元素的面积,小于30%,则认为父元素为mainBox
    const parentRect = parent.getBoundingClientRect()
    const parentArea = parentRect.width * parentRect.height
    if (maxArea / parentArea < 0.3) return parent
    return mainBox
  }

  /**
   * 获取页面上的主要元素
   */

  function getMainBox(box) {
    const mainBox = getMainBoxByElements([...box.children])
    if (!mainBox || mainBox.children.length === 0) return box
    const childMainBox = getMainBoxByElements([...mainBox.children])
    // 如果childMainBox === mainBox,可能子元素面积小于父元素面积的30%,则返回mainBox
    if (!childMainBox || childMainBox === mainBox) return mainBox
    // console.log('父子元素', mainBox, childMainBox);
    const mainBoxRect = mainBox.getBoundingClientRect()
    const childMainBoxRect = childMainBox.getBoundingClientRect()
    // 父子长宽一样,继续往下遍历
    if (mainBoxRect.width === childMainBoxRect.width && mainBoxRect.height === childMainBoxRect.height) {
      return getMainBox(mainBox)
    }
    // 父顶天立地，且小于屏幕宽度30以内，继续往下遍历
    if (mainBoxRect.x === 0 && mainBoxRect.left === 0 || window.innerWidth - mainBoxRect.width < 30) {
      return getMainBox(mainBox)
    }
    // 子元素宽度小于父元素宽度的30%不算
    if (childMainBoxRect.width / mainBoxRect.width < 0.3) return mainBox
    return childMainBox
  }

  // 给一个选择器字符串，通过,分割,数组里的每个元素都找不到元素时，返回true,否则返回false

  function hasEle(input) {
    try {
      input = input.split(',')
    } catch (error) { }
    if (typeof input === 'string') {
      input = [input]
    }
    const len = input.reduce((prev, curr) => {
      const elements = document.querySelectorAll(curr)
      prev += elements.length
      return prev
    }, 0)
    if (len <= 0) return false
    return true
  }

  // 找到面积大小一致的列表
  function getListGroup(node, groups = []) {
    function getGroup(node, groups) {
      if (!node) return
      if (node.shadowRoot) {
        const shadowRoot = node.shadowRoot
        const shadowChildLen = shadowRoot.childNodes.length
        for (let i = 0; i < shadowChildLen; i++) {
          getGroup(shadowRoot.childNodes[i], groups)
        }
      }
      if (!node.children || !node.children.length) return
      if (node.children.length < 2) {
        getGroup(node.children[0], groups)
        return groups
      }

      // 判断元素是否在可视区且可显示
      function isElementInViewportAndVisible(element) {
        const rect = element.getBoundingClientRect();
        const isVisible = (rect.top >= 0 || rect.left >= 0 || rect.right < window.innerWidth || rect.bottom <= window.innerHeight);
        const isToSmallNeed = (rect.width >= 100 && rect.height >= 20)
        return isToSmallNeed && isVisible && (window.getComputedStyle(element).display !== 'none');
      }
      const children = [...node.children]
      // 相同面积的元素列表sameList，不相同面积的元素列表noSameList
      const sameList = [], noSameList = []
      // 处理所有子元素,不显示或者面积为0不处理，面积大小相同的元素不处理，面积不同的元素如果遍历时查到相同的就从noSameList删除
      const noEmptyList = children.filter((element, i) => {
        if (!isElementInViewportAndVisible(element)) {
          return false
        }
        const eleRect = element.getBoundingClientRect()
        const eleArea = eleRect.width * eleRect.height
        const sameListFind = sameList.find((item) => item.area === eleArea)
        if (sameListFind) return true
        const noSameListFind = noSameList.findIndex((item) => item.area === eleArea)
        if (noSameListFind > -1) {
          noSameList.splice(noSameListFind, 1)
          sameList.push({ area: eleArea, i, cName: element.className })
          return true
        }
        // 元素里没有文字，不算
        if (!element.innerText) return false
        noSameList.push({
          area: eleArea,
          i,
          ele: element
        })
        return true
      })
      // 如果同层相同面积元素个数少于5个，会放入该数组，继续找该元素下子元素相同面积节点
      let lessList = []
      // 再次遍历能显示元素的相同面积的子节点添加到groups
      sameList.forEach(({ area, cName }) => {
        const list = []
        const noEmptyLen = noEmptyList.length
        for (let i = 0; i < noEmptyLen; i++) {
          const element = noEmptyList[i];
          const eleRect = element.getBoundingClientRect()
          const eleArea = eleRect.width * eleRect.height
          if (eleArea === area) {
            list.push(element)
            continue
          }

          const regex = new RegExp(element.className.split(" ").join("|"));
          for (const className of cName.split(" ")) {
            // 从未添加过并且类名相似再添加进list中
            if (regex.test(className) && !list.find(item => item === element)) {
              list.push(element)
            }
          }
        }
        // 如果相同面积的节点数量小于5，添加到noSameList，继续往下找
        if (list.length < 5) {
          lessList = lessList.concat(list)
        } else {
          groups.push(list)
        }
      })
      // 没有相同面积的元素递归处理子节点
      const noSameLen = noSameList.length
      for (let index = 0; index < noSameLen; index++) {
        const i = noSameList[index].i
        getGroup(children[i], groups)
      }
      lessList.forEach(item => {
        getGroup(item, groups)
      })
      return groups
    }
    const groupList = getGroup(node, groups)
    // 找出所有集合中含有公共父元素的集合合并，并删除已合并集合
    function mergeAndRemoveCommonParentElementGroups(elementGroups) {
      const mergedGroups = {};
      elementGroups.forEach(group => {
        const parent = group[0].parentNode;
        if (mergedGroups[parent]) {
          mergedGroups[parent] = mergedGroups[parent].concat(group);
        } else {
          mergedGroups[parent] = group;
        }
      });

      for (const parent in mergedGroups) {
        elementGroups = elementGroups.filter(group => group[0].parentNode !== parent);
      }
      return Object.values(mergedGroups);
    }
    return mergeAndRemoveCommonParentElementGroups(groupList)
  }

  // 生成uuid
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function $(className, parentDom = document) {
    try {
      className = className.trim().split(' ').join('.')
      return parentDom.querySelector('.' + className)
    } catch (error) {
      return null
    }
  }
  function $$(className, parentDom = document.body) {
    if (!parentDom) parentDom = document.body
    try {
      className = className.trim().split(' ').join('.')
      return parentDom.querySelectorAll('.' + className)
    } catch (error) {
      return null
    }
  }

  // 一组元素中，根据面积从大到小排列，并选取元素中有innerText的元素
  function getListByArea(elements) {
    return elements.sort((a, b) => {
      const aRect = a.getBoundingClientRect()
      const bRect = b.getBoundingClientRect()
      return bRect.width * bRect.height - aRect.width * aRect.height
    }).filter(it => it.innerText && it.innerText.trim() !== '')
  }

  function removeElementsByClass(className) {
    const elements = document.getElementsByClassName(className);
    while (elements.length > 0) {
      elements[0].remove()
    }
  }

  const OL_CLASS = 'yc-toc-bar-list'
  function generateList(hasTitle) {
    const groupList = getListGroup(getMainBox(document.body)) || []
    console.log('groupList', groupList);
    if (hasTitle) return []
    // 先将所有生成的ol元素删除
    removeElementsByClass(OL_CLASS)
    const fragment = document.createDocumentFragment();
    groupList.forEach(nodes => {
      const ol = document.createElement('ol')
      ol.classList.add('toc-list')
      ol.classList.add(OL_CLASS)
      if (nodes.length > 0 && nodes.every(node => node.nodeName !== 'A')) {
        nodes.forEach(node => {
          const id = uuid()
          const domA = node.querySelector('a')
          if (!domA) return
          if (!domA.id) domA.id = id
          const li = document.createElement('li')
          const a = document.createElement('a')
          a.textContent = domA.textContent
          a.href = '#' + (domA && domA.id || id)
          a.classList.add('toc-link')
          li.classList.add('toc-list-item')
          li.appendChild(a)
          ol.appendChild(li)
        })
        fragment.appendChild(ol)
      }
    })
    try {
      $('toc-bar__toc').appendChild(fragment)
    } catch (error) {
      console.log('appendChild错误', error);
      const tocDom = document.createElement('div')
      tocDom.id = 'toc-bar'
      tocDom.className = 'toc-bar toc-bar__no-print'
      tocDom.appendChild(fragment)
      document.body.appendChild(tocDom)
    }
    return groupList
  }

  function loopFunc(fn) {
    function callback(mutationsList, observer) {
      if (lastExecutionTime + delay < Date.now()) {
        fn(mutationsList, observer)
        lastExecutionTime = Date.now();
      }
    }

    let observer = new MutationObserver(callback);

    let delay = 500; // 间隔时间，单位毫秒
    let lastExecutionTime = 0;

    observer.observe(document.body, { childList: true, attributes: true });
  }
})()

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  BackHandler,
  Platform,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated,
  Linking,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TARGET_URL = 'https://app.talentrayz.com/en/login';

const MOBILE_USER_AGENT = Platform.select({
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  default: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
});

// High-end Universal Monkey-Patch script to catch programmatic downloads and force responsive layouts
const WEBVIEW_INJECTED_JS = `
  (function() {
    // Dynamic polling to mock getDisplayMedia as soon as navigator.mediaDevices becomes available
    const mockDisplayMedia = () => {
      if (navigator.mediaDevices) {
        if (!navigator.mediaDevices.getDisplayMedia) {
          navigator.mediaDevices.getDisplayMedia = async function(constraints) {
            console.log("Mocking getDisplayMedia for mobile WebView proctoring");
            try {
              return await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (err) {
              const canvas = document.createElement('canvas');
              canvas.width = 640;
              canvas.height = 480;
              const ctx = canvas.getContext('2d');
              
              ctx.fillStyle = '#0F172A';
              ctx.fillRect(0, 0, 640, 480);
              ctx.fillStyle = '#FFFFFF';
              ctx.font = '24px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('Mobile Screen Stream', 320, 240);
              
              setInterval(() => {
                ctx.fillStyle = '#0F172A';
                ctx.fillRect(0, 0, 640, 480);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText('Mobile Screen Share (Active)', 320, 220);
              }, 1000);

              return canvas.captureStream(5);
            }
          };
          console.log("getDisplayMedia successfully mocked");
          return true;
        }
      }
      return false;
    };

    let mockAttempts = 0;
    const mockInterval = setInterval(() => {
      const success = mockDisplayMedia();
      mockAttempts++;
      if (success || mockAttempts > 100) {
        clearInterval(mockInterval);
      }
    }, 50);

    // Hook dynamically created anchor click events
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      const href = this.href;
      const download = this.getAttribute('download') || this.download;
      
      if (download || href.startsWith('blob:') || href.startsWith('data:') || href.includes('download') || href.includes('template')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DOWNLOAD_INTERCEPTED',
          url: href,
          filename: download || 'template.csv'
        }));
        return;
      }
      originalClick.apply(this, arguments);
    };

    // Hook window.open for download queries
    const originalOpen = window.open;
    window.open = function(url, target, features) {
      if (url && (url.includes('download') || url.includes('template') || url.endsWith('.csv') || url.endsWith('.pdf'))) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DOWNLOAD_INTERCEPTED',
          url: url,
          filename: 'template.csv'
        }));
        return null;
      }
      return originalOpen.apply(this, arguments);
    };

    // Self-healing HTML5 / course-player fullscreen support
    (function enableMobileVideoFullscreen() {
      if (window.__trVideoFullscreenEnabled) return;
      window.__trVideoFullscreenEnabled = true;

      const findNearestVideo = (root) => {
        if (!root) return null;
        if (root.tagName === 'VIDEO') return root;
        const local = root.querySelector && root.querySelector('video');
        if (local) return local;
        let current = root.parentElement;
        for (let depth = 0; depth < 12 && current && current !== document.body; depth++) {
          const video = current.querySelector && current.querySelector('video');
          if (video) return video;
          current = current.parentElement;
        }
        return null;
      };

      const enterVideoFullscreen = (target) => {
        const video = findNearestVideo(target);
        if (!video) return false;
        try {
          if (typeof video.webkitEnterFullscreen === 'function') {
            video.webkitEnterFullscreen();
            return true;
          }
          if (typeof video.requestFullscreen === 'function') {
            video.requestFullscreen();
            return true;
          }
          if (typeof video.webkitRequestFullscreen === 'function') {
            video.webkitRequestFullscreen();
            return true;
          }
        } catch (err) {
          console.log('TR fullscreen:', err && err.message);
        }
        return false;
      };

      const patchFullscreenMethod = (proto, methodName) => {
        if (!proto || !proto[methodName] || proto[methodName].__trWrapped) return;
        const original = proto[methodName];
        proto[methodName] = function patchedFullscreen() {
          if (enterVideoFullscreen(this)) return Promise.resolve();
          return original.apply(this, arguments);
        };
        proto[methodName].__trWrapped = true;
      };

      patchFullscreenMethod(Element.prototype, 'requestFullscreen');
      patchFullscreenMethod(Element.prototype, 'webkitRequestFullscreen');
      if (typeof HTMLElement !== 'undefined') {
        patchFullscreenMethod(HTMLElement.prototype, 'webkitRequestFullScreen');
      }

      const healVideoElements = () => {
        document.querySelectorAll('video').forEach((video) => {
          video.playsInline = false;
          video.setAttribute('playsinline', 'false');
          video.setAttribute('webkit-playsinline', 'false');
          video.setAttribute('x5-playsinline', 'false');
          video.setAttribute('x5-video-player-type', 'h5');
          video.setAttribute('x5-video-player-fullscreen', 'true');
        });

        document.querySelectorAll('iframe').forEach((iframe) => {
          iframe.setAttribute('allowfullscreen', 'true');
          iframe.setAttribute('webkitallowfullscreen', 'true');
          iframe.setAttribute('mozallowfullscreen', 'true');
          const allow = iframe.getAttribute('allow') || '';
          if (allow.indexOf('fullscreen') === -1) {
            iframe.setAttribute('allow', (allow ? allow + '; ' : '') + 'fullscreen');
          }
        });
      };

      const isPlayerControlBar = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const isFlex = style.display === 'flex' || style.display === 'inline-flex';
        if (!isFlex) return false;
        return el.querySelectorAll('button, [role="button"]').length >= 3;
      };

      const isLikelyFullscreenControl = (btn, bar) => {
        const btnRect = btn.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        if (!btnRect.width || !barRect.width) return false;
        const svg = btn.querySelector('svg');
        const onRightSide = btnRect.left >= barRect.left + barRect.width * 0.5;
        return onRightSide && !!svg && btnRect.width <= 56 && btnRect.height <= 56;
      };

      document.addEventListener('click', (event) => {
        const btn = event.target.closest && event.target.closest('button, [role="button"]');
        if (!btn) return;
        const bar = btn.parentElement;
        if (!isPlayerControlBar(bar) || !isLikelyFullscreenControl(btn, bar)) return;
        enterVideoFullscreen(bar);
      }, true);

      healVideoElements();
      setInterval(healVideoElements, 500);
    })();

    // Inject custom responsive styling globally
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = \`
      /* General global overrides for any modal overlays/dialogs */
      [role="dialog"], 
      [aria-modal="true"], 
      [class*="modal"], 
      [class*="Modal"], 
      [class*="dialog"], 
      [class*="Dialog"] {
        max-width: 92vw !important;
        width: 92vw !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }

      /* Prevent child elements inside modals/dialogs from overflowing horizontally */
      [role="dialog"] *, 
      [aria-modal="true"] *, 
      [class*="modal"] *, 
      [class*="Modal"] *, 
      [class*="dialog"] *, 
      [class*="Dialog"] * {
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }

      /* Custom scrollbar style for filter/action bar */
      .custom-scroll-bar {
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 transparent;
      }
      .custom-scroll-bar::-webkit-scrollbar {
        height: 3px !important;
      }
      .custom-scroll-bar::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .custom-scroll-bar::-webkit-scrollbar-thumb {
        background: #cbd5e1 !important;
        border-radius: 9999px !important;
      }
    \`;
    (document.head || document.body || document.documentElement).appendChild(style);

    // Mobile header popover layout (accessibility panel) — structural detection only
    const MOBILE_POPOVER_MARGIN = 12;
    const MOBILE_POPOVER_MARKER = 'data-tr-mobile-popover';

    const getPositionedOverlayRoot = (el) => {
      let root = null;
      let current = el;
      while (current && current !== document.body) {
        const pos = window.getComputedStyle(current).position;
        if (pos === 'fixed' || pos === 'absolute') {
          root = current;
        }
        current = current.parentElement;
      }
      return root;
    };

    const hasFloatingSurface = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 60) return false;
      const bg = style.backgroundColor;
      const hasOpaqueBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
      if (!hasOpaqueBg) return false;
      const hasRadius = parseFloat(style.borderRadius) >= 4;
      const hasShadow = style.boxShadow && style.boxShadow !== 'none';
      return hasRadius || hasShadow;
    };

    const isNavigationDrawer = (el, viewportWidth) => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      if (rect.height >= viewportHeight * 0.48) return true;
      if (rect.width >= viewportWidth * 0.9 && rect.height >= viewportHeight * 0.42) return true;
      if (el.querySelectorAll('a[href], [role="menuitem"], [role="link"]').length >= 4) return true;
      return false;
    };

    const isNotificationStyleList = (el) => {
      const listRows = el.querySelectorAll('li, [role="listitem"]').length;
      if (listRows >= 3) return true;
      const links = el.querySelectorAll('a[href]').length;
      const buttons = el.querySelectorAll('button, [role="button"]').length;
      return listRows >= 2 && links >= 2 && buttons <= 2;
    };

    const isVisibleElement = (el) => {
      if (!el || el.nodeType !== 1) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const isHealStyleIntact = (el, viewportWidth) => {
      const rect = el.getBoundingClientRect();
      const sideMargin = MOBILE_POPOVER_MARGIN;
      const fitsLeft = rect.left >= sideMargin - 4;
      const fitsRight = rect.right <= viewportWidth - sideMargin + 4;
      const fitsWidth = rect.width <= viewportWidth - (sideMargin * 2) + 4;
      return fitsLeft && fitsRight && fitsWidth;
    };

    const isCompactHeaderControlPanel = (el, viewportWidth) => {
      if (!isVisibleElement(el)) return false;

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const sideMargin = MOBILE_POPOVER_MARGIN;

      if (rect.width < 100 || rect.height < 80) return false;
      if (rect.height >= viewportHeight * 0.46) return false;
      if (rect.top < 0 || rect.top > viewportHeight * 0.38) return false;
      if (isNavigationDrawer(el, viewportWidth)) return false;

      const centerX = rect.left + rect.width / 2;
      const viewportCenter = viewportWidth / 2;
      const isCentered = Math.abs(centerX - viewportCenter) <= 22;
      const fitsViewport = rect.left >= sideMargin - 2 && rect.right <= viewportWidth - sideMargin + 2;
      if (isCentered && fitsViewport) return false;

      const clipsViewport = rect.left < sideMargin ||
        rect.right > viewportWidth - sideMargin ||
        rect.width > viewportWidth - (sideMargin * 2);
      if (!clipsViewport) return false;
      if (isNotificationStyleList(el)) return false;

      const interactiveCount = el.querySelectorAll(
        'button, [role="button"], input[type="radio"], input[type="checkbox"], select'
      ).length;
      return interactiveCount >= 2;
    };

    const resolveAccessibilityPopoverTarget = (node, viewportWidth) => {
      let visualPanel = null;
      let current = node;
      while (current && current !== document.body) {
        if (hasFloatingSurface(current) && isCompactHeaderControlPanel(current, viewportWidth)) {
          visualPanel = current;
        }
        current = current.parentElement;
      }
      if (visualPanel) return visualPanel;

      const positionedRoot = getPositionedOverlayRoot(node);
      if (positionedRoot && isCompactHeaderControlPanel(positionedRoot, viewportWidth)) {
        return positionedRoot;
      }

      return null;
    };

    const wasWronglyHealed = (el, viewportWidth) => {
      if (!isVisibleElement(el)) return true;
      return isNavigationDrawer(el, viewportWidth);
    };

    const clearMobileHeaderPopoverLayout = (el) => {
      el.removeAttribute(MOBILE_POPOVER_MARKER);
      [
        'position', 'top', 'left', 'right', 'bottom', 'inset',
        'margin-left', 'margin-right', 'transform', 'translate',
        'width', 'max-width', 'min-width', 'box-sizing', 'overflow-x', 'overflow-y',
      ].forEach((prop) => {
        el.style.removeProperty(prop);
      });
      el.querySelectorAll('*').forEach((child) => {
        if (child.nodeType !== 1) return;
        ['max-width', 'min-width', 'box-sizing', 'width'].forEach((prop) => {
          child.style.removeProperty(prop);
        });
      });
    };

    const constrainPopoverDescendants = (root) => {
      root.querySelectorAll('*').forEach((child) => {
        if (child.nodeType !== 1) return;
        const tag = child.tagName.toLowerCase();
        if (tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'g') return;
        child.style.setProperty('max-width', '100%', 'important');
        child.style.setProperty('min-width', '0', 'important');
        child.style.setProperty('box-sizing', 'border-box', 'important');
      });
    };

    const neutralizePopoverWrapper = (panel, topPx) => {
      const wrapper = getPositionedOverlayRoot(panel);
      if (!wrapper || wrapper === panel) return;

      const sideMargin = MOBILE_POPOVER_MARGIN;
      wrapper.style.setProperty('position', 'fixed', 'important');
      wrapper.style.setProperty('top', topPx + 'px', 'important');
      wrapper.style.setProperty('left', sideMargin + 'px', 'important');
      wrapper.style.setProperty('right', sideMargin + 'px', 'important');
      wrapper.style.setProperty('bottom', 'auto', 'important');
      wrapper.style.setProperty('transform', 'none', 'important');
      wrapper.style.setProperty('translate', 'none', 'important');
      wrapper.style.setProperty('width', 'auto', 'important');
      wrapper.style.setProperty('min-width', '0', 'important');
      wrapper.style.setProperty('max-width', 'none', 'important');
      wrapper.style.setProperty('height', 'auto', 'important');
      wrapper.style.setProperty('overflow', 'visible', 'important');
    };

    const applyMobileHeaderPopoverLayout = (el, viewportWidth) => {
      const sideMargin = MOBILE_POPOVER_MARGIN;
      const panelWidth = viewportWidth - (sideMargin * 2);
      const topPx = Math.max(0, el.getBoundingClientRect().top);

      neutralizePopoverWrapper(el, topPx);

      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('top', topPx + 'px', 'important');
      el.style.setProperty('left', sideMargin + 'px', 'important');
      el.style.setProperty('right', 'auto', 'important');
      el.style.setProperty('bottom', 'auto', 'important');
      el.style.setProperty('margin', '0', 'important');
      el.style.setProperty('transform', 'none', 'important');
      el.style.setProperty('translate', 'none', 'important');
      el.style.setProperty('width', panelWidth + 'px', 'important');
      el.style.setProperty('max-width', panelWidth + 'px', 'important');
      el.style.setProperty('min-width', '0', 'important');
      el.style.setProperty('box-sizing', 'border-box', 'important');
      el.style.setProperty('overflow-x', 'hidden', 'important');
      el.style.setProperty('overflow-y', 'auto', 'important');
      el.setAttribute(MOBILE_POPOVER_MARKER, 'healed');

      constrainPopoverDescendants(el);
    };

    const healMobileHeaderPopovers = (viewportWidth) => {
      document.querySelectorAll('[' + MOBILE_POPOVER_MARKER + '="healed"]').forEach((el) => {
        if (wasWronglyHealed(el, viewportWidth)) {
          clearMobileHeaderPopoverLayout(el);
          return;
        }
        if (!isHealStyleIntact(el, viewportWidth)) {
          applyMobileHeaderPopoverLayout(el, viewportWidth);
        } else {
          neutralizePopoverWrapper(el, Math.max(0, el.getBoundingClientRect().top));
          constrainPopoverDescendants(el);
        }
      });

      const pendingRoots = new Set();
      document.querySelectorAll('body *').forEach((node) => {
        if (node.getAttribute(MOBILE_POPOVER_MARKER) === 'healed') {
          return;
        }
        const target = resolveAccessibilityPopoverTarget(node, viewportWidth);
        if (target) {
          pendingRoots.add(target);
        }
      });

      pendingRoots.forEach((root) => {
        if (root.getAttribute(MOBILE_POPOVER_MARKER) === 'healed') {
          return;
        }
        applyMobileHeaderPopoverLayout(root, viewportWidth);
      });
    };

    // Mobile calendar grid layout — structural detection only
    const CALENDAR_GRID_MARKER = 'data-tr-mobile-calendar';

    const isStackedVertically = (children) => {
      if (!children || children.length < 5) return false;
      let stacked = 0;
      const limit = Math.min(children.length, 10);
      for (let i = 1; i < limit; i++) {
        const prev = children[i - 1].getBoundingClientRect();
        const curr = children[i].getBoundingClientRect();
        if (curr.top >= prev.bottom - 6) stacked++;
      }
      return stacked >= 4;
    };

    const isShortCalendarCell = (el) => {
      const text = (el.textContent || '').trim();
      return text.length > 0 && text.length <= 3;
    };

    const isCalendarGridContainer = (el) => {
      const count = el.children.length;
      return count === 7 || (count >= 28 && count <= 42);
    };

    const isInsideCalendarWidget = (el) => {
      let root = el;
      for (let depth = 0; depth < 10 && root && root !== document.body; depth++) {
        let hasWeekRow = false;
        let hasDateGrid = false;
        let navButtons = 0;

        root.querySelectorAll('div').forEach((div) => {
          const childCount = div.children.length;
          if (childCount === 7) hasWeekRow = true;
          if (childCount >= 28 && childCount <= 42) hasDateGrid = true;
        });
        navButtons = root.querySelectorAll('button, [role="button"]').length;

        const rect = root.getBoundingClientRect();
        if (
          hasWeekRow &&
          hasDateGrid &&
          navButtons >= 2 &&
          rect.width > 180 &&
          rect.height > 180 &&
          rect.height < window.innerHeight * 0.85
        ) {
          return true;
        }
        root = root.parentElement;
      }
      return false;
    };

    const isCalendarGridHealIntact = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'grid') return false;
      const cols = (style.gridTemplateColumns || '').trim();
      if (!cols || cols === 'none') return false;
      const colParts = cols.split(/\s+/).filter((part) => part && part !== 'none');
      if (colParts.length >= 7) return true;
      return cols.indexOf('repeat(7') !== -1;
    };

    const applyCalendarGridLayout = (el) => {
      el.style.setProperty('display', 'grid', 'important');
      el.style.setProperty('grid-template-columns', 'repeat(7, minmax(0, 1fr))', 'important');
      el.style.setProperty('grid-auto-flow', 'row', 'important');
      el.style.setProperty('grid-auto-rows', 'auto', 'important');
      el.style.setProperty('gap', '2px', 'important');
      el.style.setProperty('width', '100%', 'important');
      el.style.setProperty('max-width', '100%', 'important');
      el.style.setProperty('min-width', '0', 'important');
      el.style.setProperty('box-sizing', 'border-box', 'important');
      el.setAttribute(CALENDAR_GRID_MARKER, 'healed-grid');

      Array.from(el.children).forEach((child) => {
        if (child.nodeType !== 1) return;
        child.style.setProperty('display', 'flex', 'important');
        child.style.setProperty('align-items', 'center', 'important');
        child.style.setProperty('justify-content', 'center', 'important');
        child.style.setProperty('min-width', '0', 'important');
        child.style.setProperty('width', 'auto', 'important');
        child.style.setProperty('max-width', '100%', 'important');
        child.style.setProperty('box-sizing', 'border-box', 'important');
        child.style.setProperty('text-align', 'center', 'important');
      });
    };

    const clearCalendarGridLayout = (el) => {
      el.removeAttribute(CALENDAR_GRID_MARKER);
      [
        'display', 'grid-template-columns', 'grid-auto-flow', 'grid-auto-rows',
        'gap', 'width', 'max-width', 'min-width', 'box-sizing',
      ].forEach((prop) => {
        el.style.removeProperty(prop);
      });
      Array.from(el.children).forEach((child) => {
        if (child.nodeType !== 1) return;
        [
          'display', 'align-items', 'justify-content', 'min-width',
          'width', 'max-width', 'box-sizing', 'text-align',
        ].forEach((prop) => {
          child.style.removeProperty(prop);
        });
      });
    };

    const needsCalendarGridHeal = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (!isCalendarGridContainer(el)) return false;
      if (!isInsideCalendarWidget(el)) return false;

      const children = Array.from(el.children);
      const shortCells = children.filter(isShortCalendarCell).length;
      if (shortCells < Math.min(children.length, 7)) return false;

      return isStackedVertically(children) || !isCalendarGridHealIntact(el);
    };

    const healMobileCalendars = () => {
      document.querySelectorAll('[' + CALENDAR_GRID_MARKER + '="healed-grid"]').forEach((el) => {
        if (!isInsideCalendarWidget(el) || !isCalendarGridContainer(el)) {
          clearCalendarGridLayout(el);
          return;
        }
        if (!isCalendarGridHealIntact(el)) {
          applyCalendarGridLayout(el);
        }
      });

      const pendingGrids = new Set();
      document.querySelectorAll('div').forEach((node) => {
        if (node.getAttribute(CALENDAR_GRID_MARKER) === 'healed-grid') return;
        if (needsCalendarGridHeal(node)) {
          pendingGrids.add(node);
        }
      });

      pendingGrids.forEach((grid) => {
        applyCalendarGridLayout(grid);
      });
    };

    // Dynamic self-healing layout adjustment for filter bars
    setInterval(() => {
      const width = window.innerWidth;
      if (!width) return;

      // Run first so other layout rules do not fight the mobile popover/calendar fixes
      healMobileHeaderPopovers(width);
      healMobileCalendars();

      const filterElements = [];
      const findFilterText = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.nodeValue.trim().toLowerCase();
          if (text === "monthly" || text === "department") {
            filterElements.push(node.parentElement);
          }
        } else {
          for (let i = 0; i < node.childNodes.length; i++) {
            findFilterText(node.childNodes[i]);
          }
        }
      };

      if (document.body) {
        findFilterText(document.body);
      }

      filterElements.forEach(el => {
        let current = el;
        let depth = 0;
        
        // Helper to reduce padding and size of buttons (Monthly / Department)
        const makeButtonCompact = (btn) => {
          if (!btn) return;
          btn.style.setProperty('padding', '4px 8px', 'important');
          btn.style.setProperty('padding-left', '8px', 'important');
          btn.style.setProperty('padding-right', '8px', 'important');
          btn.style.setProperty('padding-top', '4px', 'important');
          btn.style.setProperty('padding-bottom', '4px', 'important');
          btn.style.setProperty('height', '32px', 'important');
          btn.style.setProperty('min-height', '32px', 'important');
          btn.style.setProperty('font-size', '12px', 'important');
          btn.style.setProperty('display', 'inline-flex', 'important');
          btn.style.setProperty('align-items', 'center', 'important');
          btn.style.setProperty('justify-content', 'center', 'important');
          btn.style.setProperty('gap', '4px', 'important');
          
          const children = btn.getElementsByTagName('*');
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.style.setProperty('font-size', '12px', 'important');
            if (child.tagName === 'svg' || child.tagName === 'SVG') {
              child.style.setProperty('width', '12px', 'important');
              child.style.setProperty('height', '12px', 'important');
            }
          }
        };

        while (current && current !== document.body && depth < 5) {
          const style = window.getComputedStyle(current);
          const isFlex = style.display === 'flex' || style.display === 'inline-flex';
          const isRow = style.flexDirection === 'row' || style.flexDirection === 'row-reverse';
          
          if (isFlex && isRow && current.children.length > 1 && current.tagName !== 'BUTTON' && current.tagName !== 'A') {
            // Found the filter container (holds the dropdowns). Let's climb one level up to the Parent wrapper
            
            // Find and compact the Monthly / Department button inside this container
            let btn = el;
            while (btn && btn.tagName !== 'BUTTON' && btn.tagName !== 'A' && btn.getAttribute('role') !== 'button' && btn !== current && btn.parentElement) {
              btn = btn.parentElement;
            }
            if (btn && btn !== current) {
              makeButtonCompact(btn);
            }

            const parent = current.parentElement;
            if (parent) {
              const parentStyle = window.getComputedStyle(parent);
              const isParentFlex = parentStyle.display === 'flex' || parentStyle.display === 'inline-flex';
              
              if (isParentFlex) {
                // Style parent wrapper (the white rounded bar) to scroll horizontally
                parent.style.setProperty('overflow-x', 'auto', 'important');
                parent.style.setProperty('overflow-y', 'hidden', 'important');
                parent.style.setProperty('flex-wrap', 'nowrap', 'important');
                parent.style.setProperty('max-width', '100%', 'important');
                parent.style.setProperty('width', '100%', 'important');
                parent.style.setProperty('gap', '6px', 'important');
                parent.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
                
                // Add the class for custom thin scrollbar styling
                if (!parent.classList.contains('custom-scroll-bar')) {
                  parent.classList.add('custom-scroll-bar');
                }
                
                // Prevent all child items from wrapping or shrinking
                for (let i = 0; i < parent.children.length; i++) {
                  const child = parent.children[i];
                  child.style.setProperty('flex-shrink', '0', 'important');
                  
                  const childStyle = window.getComputedStyle(child);
                  if (childStyle.display === 'flex' || childStyle.display === 'inline-flex') {
                    child.style.setProperty('flex-wrap', 'nowrap', 'important');
                    child.style.setProperty('gap', '6px', 'important');
                    for (let j = 0; j < child.children.length; j++) {
                      child.children[j].style.setProperty('flex-shrink', '0', 'important');
                    }
                  }
                  
                  // Reduce margins on vertical dividers to fit more content
                  if (child.offsetWidth <= 5 || child.tagName === 'SPAN' || childStyle.width === '1px') {
                    child.style.setProperty('margin-left', '4px', 'important');
                    child.style.setProperty('margin-right', '4px', 'important');
                  }
                }
                
                // Find and style the actions container (holding the 4 buttons)
                let actionsContainer = null;
                for (let i = 0; i < parent.children.length; i++) {
                  const child = parent.children[i];
                  if (child === current) continue;
                  
                  const buttons = child.querySelectorAll('button, a, [role="button"], svg');
                  if (buttons.length > 0) {
                    actionsContainer = child;
                  }
                }
                
                if (actionsContainer) {
                  actionsContainer.style.setProperty('display', 'flex', 'important');
                  actionsContainer.style.setProperty('flex-direction', 'row', 'important');
                  actionsContainer.style.setProperty('flex-wrap', 'nowrap', 'important');
                  actionsContainer.style.setProperty('gap', '6px', 'important');
                  actionsContainer.style.setProperty('align-items', 'center', 'important');
                  actionsContainer.style.setProperty('flex-shrink', '0', 'important');
                  
                  const actionBtns = actionsContainer.querySelectorAll('button, a, [role="button"]');
                  actionBtns.forEach(abtn => {
                    abtn.style.setProperty('flex-shrink', '0', 'important');
                    abtn.style.setProperty('display', 'inline-flex', 'important');
                    abtn.style.setProperty('align-items', 'center', 'important');
                    abtn.style.setProperty('justify-content', 'center', 'important');
                    
                    // Hide any text nodes inside the button by setting its font-size to 0
                    // This prevents text overflow while preserving child container SVGs
                    abtn.style.setProperty('font-size', '0px', 'important');
                    abtn.style.setProperty('line-height', '0px', 'important');
                    
                    // Style nested children text sizes to 0 to be safe
                    const abtnChildren = abtn.querySelectorAll('*');
                    abtnChildren.forEach(child => {
                      if (child.tagName.toLowerCase() !== 'svg' && child.tagName.toLowerCase() !== 'path' && child.tagName.toLowerCase() !== 'circle') {
                        child.style.setProperty('font-size', '0px', 'important');
                        child.style.setProperty('line-height', '0px', 'important');
                      }
                    });
                  });
                }
              }
            }
            break;
          }
          current = current.parentElement;
          depth++;
        }
      });

      // B. Force dialog contents, overlays, and all overflowing containers to fit viewport
      const allNodes = document.querySelectorAll('body *');
      allNodes.forEach(node => {
        // Skip healed header popovers and calendar grids
        if (node.getAttribute(MOBILE_POPOVER_MARKER) === 'healed' || node.closest('[' + MOBILE_POPOVER_MARKER + '="healed"]')) {
          return;
        }
        if (node.getAttribute(CALENDAR_GRID_MARKER) === 'healed-grid' || node.closest('[' + CALENDAR_GRID_MARKER + '="healed-grid"]')) {
          return;
        }

        // Skip elements that are inside horizontal scrolling containers
        if (node.closest('.custom-scroll-bar') || node.closest('[style*="overflow-x: auto"]')) {
          return;
        }
        
        // Skip SVG and layout nodes
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'path' || tagName === 'circle' || tagName === 'svg' || tagName === 'g' || tagName === 'use' || tagName === 'rect') {
          return;
        }
        
        const style = window.getComputedStyle(node);
        const nodeWidth = node.offsetWidth;
        
        // If the element exceeds the viewport width, force it to fit
        if (nodeWidth > width) {
          // If it is a modal/dialog container (with high z-index and fixed/absolute layout), give it 92vw width
          const position = style.position;
          const zIndex = parseInt(style.zIndex) || 0;
          const isModal = (position === 'fixed' || position === 'absolute') && zIndex >= 10;
          
          node.style.setProperty('max-width', isModal ? '92vw' : '100%', 'important');
          node.style.setProperty('width', '100%', 'important');
          node.style.setProperty('min-width', '0px', 'important');
          node.style.setProperty('box-sizing', 'border-box', 'important');
        }
        
        // Also check if any element has a computed min-width greater than the viewport
        const minWidthVal = parseInt(style.minWidth) || 0;
        if (minWidthVal > width) {
          node.style.setProperty('min-width', '0px', 'important');
          node.style.setProperty('max-width', '100%', 'important');
          node.style.setProperty('width', '100%', 'important');
          node.style.setProperty('box-sizing', 'border-box', 'important');
        }
      });
    }, 500);
  })();
  true;
`;

export default function App() {
  const webViewRef = useRef(null);

  // States
  const [isConnected, setIsConnected] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(TARGET_URL);

  // Animated values for premium micro-animations
  const offlineFadeAnim = useRef(new Animated.Value(0)).current;
  const progressFadeAnim = useRef(new Animated.Value(0)).current;

  // Track network state changes in real time
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isNetConnected = state.isConnected !== false;
      setIsConnected(isNetConnected);
      
      // If internet is lost, show the premium offline screen
      if (!isNetConnected) {
        setIsOfflineMode(true);
      } else {
        setIsOfflineMode(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Request native Android permissions on startup (required for WebView WebRTC)
  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
          
          const cameraGranted = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
          const micGranted = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
          
          if (!cameraGranted || !micGranted) {
            Alert.alert(
              'Permissions Required',
              'This application requires camera and microphone access to complete proctored assessments.',
              [{ text: 'OK' }]
            );
          }
        } catch (err) {
          console.warn('Failed to request runtime permissions:', err);
        }
      }
    };
    requestPermissions();
  }, []);

  // Animate the offline screen appearance
  useEffect(() => {
    Animated.timing(offlineFadeAnim, {
      toValue: isOfflineMode ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [isOfflineMode]);

  // Handle Android hardware back button inside the WebView
  useEffect(() => {
    const handleBackPress = () => {
      if (webViewRef.current && canGoBack) {
        webViewRef.current.goBack();
        return true; // Stop default OS back action (exiting app)
      }
      return false; // Allow default OS action (exiting app)
    };

    let subscription;
    if (Platform.OS === 'android') {
      subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    }

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [canGoBack]);

  // Handle Web Page progress bar animations
  useEffect(() => {
    Animated.timing(progressFadeAnim, {
      toValue: isProgressVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isProgressVisible]);

  // WebView navigation state updates
  const handleNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);
  }, []);

  // WebView loading progress updates
  const handleLoadProgress = useCallback(({ nativeEvent }) => {
    setProgress(nativeEvent.progress);
  }, []);

  const handleLoadStart = useCallback(() => {
    setIsProgressVisible(true);
    setProgress(0);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setIsProgressVisible(false);
    setIsLoading(false);
  }, []);

  // Triggered on connection error, SSL failure, DNS issues
  const handleWebViewError = useCallback((syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView failed to load page: ', nativeEvent.description);
    setIsOfflineMode(true);
    setIsLoading(false);
  }, []);

  // Intercept file downloads and hand them off to the native system browser
  const handleShouldStartLoadWithRequest = useCallback((request) => {
    const { url } = request;
    
    // Intercept custom URL schemes (tel:, mailto:, sms:, whatsapp:, etc.)
    const isHttpOrHttps = url.startsWith('http://') || url.startsWith('https://');
    if (!isHttpOrHttps) {
      Linking.canOpenURL(url)
        .then((supported) => {
          if (supported) {
            Linking.openURL(url);
          } else {
            console.warn('No native handler found for URL scheme:', url);
          }
        })
        .catch((err) => console.error('Error opening custom scheme:', err));
      return false; // Block internal loading in WebView
    }

    const isDownload = 
      url.toLowerCase().endsWith('.csv') ||
      url.toLowerCase().endsWith('.pdf') ||
      url.toLowerCase().endsWith('.xlsx') ||
      url.toLowerCase().endsWith('.xls') ||
      url.toLowerCase().endsWith('.zip') ||
      url.includes('download') ||
      url.includes('template');

    if (isDownload && webViewRef.current) {
      // Direct clicks: Hand them over to the same downloader
      handleDownloadTrigger(url, url.split('/').pop().split('?')[0] || 'template.csv');
      return false; // Block internal WebView rendering
    }

    // Intercept external domain links
    const isAllowedDomain = 
      url.includes('talentrayz.com') ||
      url.includes('accounts.google.com') ||
      url.includes('facebook.com') ||
      url.includes('microsoftonline.com') ||
      url.includes('apple.id') ||
      url.includes('localhost'); // For local testing

    if (!isAllowedDomain) {
      Linking.openURL(url).catch((err) =>
        console.warn('Failed to open external URL in browser:', err)
      );
      return false; // Block internal loading in WebView
    }
    
    return true; // Allow normal page navigation
  }, []);

  // Universal helper to trigger and bundle downloads from the WebView session
  const handleDownloadTrigger = useCallback((url, filename) => {
    if (!webViewRef.current) return;

    if (url.startsWith('data:')) {
      handleDataUrlDownload(url, filename);
    } else {
      const downloadJS = `
        (async () => {
          try {
            const response = await fetch('${url}');
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result.split(',')[1];
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'DOWNLOAD_FILE_SUCCESS',
                base64: base64data,
                filename: '${filename}'
              }));
            };
            reader.readAsDataURL(blob);
          } catch (error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'DOWNLOAD_FILE_ERROR',
              error: error.message
            }));
          }
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(downloadJS);
    }
  }, []);

  // Write base64 or raw data from data: URLs natively
  const handleDataUrlDownload = useCallback(async (dataUrl, filename) => {
    try {
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      if (dataUrl.includes('base64,')) {
        const base64 = dataUrl.split('base64,')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        const rawText = decodeURIComponent(dataUrl.split(',')[1]);
        await FileSystem.writeAsStringAsync(fileUri, rawText, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      await Sharing.shareAsync(fileUri, {
        dialogTitle: `Download ${filename}`,
      });
    } catch (error) {
      console.warn('Data URL download error:', error);
    }
  }, []);

  // Handle messages posted from the WebView (e.g. downloaded files)
  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'DOWNLOAD_INTERCEPTED') {
        const { url, filename } = data;
        handleDownloadTrigger(url, filename);
      } else if (data.type === 'DOWNLOAD_FILE_SUCCESS') {
        const { base64, filename } = data;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await Sharing.shareAsync(fileUri, {
          dialogTitle: `Download ${filename}`,
        });
      } else if (data.type === 'DOWNLOAD_FILE_ERROR') {
        console.warn('WebView file download error:', data.error);
        Alert.alert('Download Failed', 'We were unable to download this file template.');
      }
    } catch (e) {
      // Ignore normal web messages
    }
  }, []);

  // Check network manually and refresh the page when user clicks "Try Again"
  const handleRetry = async () => {
    setIsLoading(true);
    const netState = await NetInfo.fetch();
    const isNowConnected = netState.isConnected !== false;

    setIsConnected(isNowConnected);

    if (isNowConnected) {
      setIsOfflineMode(false);
      if (webViewRefRef.current) {
        // If webview is on a broken page or failed, reload it
        webViewRef.current.reload();
      }
    } else {
      setIsLoading(false);
      // Brief wiggle or animation can go here to show retry was hit
      Animated.sequence([
        Animated.timing(offlineFadeAnim, { toValue: 0.8, duration: 80, useNativeDriver: true }),
        Animated.timing(offlineFadeAnim, { toValue: 1.0, duration: 80, useNativeDriver: true }),
      ]).start();
    }
  };

  // Handle WebView permission delegation safely (supports direct requests and event wrappers)
  const handlePermissionRequest = useCallback(async (request) => {
    const req = request.nativeEvent ? request.nativeEvent : request;
    if (req && typeof req.grant === 'function') {
      if (Platform.OS === 'android') {
        try {
          const hasCamera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
          const hasMic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          
          if (!hasCamera || !hasMic) {
            console.log('WebView requesting permissions, but app lacks them dynamically. Prompting user...');
            const granted = await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.CAMERA,
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            ]);
            const cameraGranted = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
            const micGranted = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
            
            if (!cameraGranted || !micGranted) {
              console.warn('User denied native permissions on WebRequest');
              req.deny();
              return;
            }
          }
        } catch (err) {
          console.warn('Failed to dynamically check/request permissions:', err);
        }
      }
      
      const resources = req.resources && req.resources.length > 0
        ? req.resources
        : ['android.webkit.resource.VIDEO_CAPTURE', 'android.webkit.resource.AUDIO_CAPTURE'];
        
      console.log('WebView granting permissions for:', resources);
      req.grant(resources);
    } else {
      console.warn('onPermissionRequest: request.grant is not a function');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={true} />

      {/* Main WebView Port */}
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: TARGET_URL }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          allowsBackForwardNavigationGestures={true}
          scalesPageToFit={false}
          userAgent={MOBILE_USER_AGENT}
          textZoom={100}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsPictureInPictureMediaPlayback={true}
          onPermissionRequest={handlePermissionRequest}
          mediaCapturePermissionGrantType="grant"
          mixedContentMode="always"
          cacheEnabled={true}
          originWhitelist={['*']}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadProgress={handleLoadProgress}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleWebViewError}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onMessage={handleMessage}
          onConsoleMessage={(event) => {
            console.log('WEBVIEW_CONSOLE:', event.nativeEvent.message);
          }}
          injectedJavaScript={WEBVIEW_INJECTED_JS}
          injectedJavaScriptBeforeContentLoaded={WEBVIEW_INJECTED_JS}
          onFileDownload={({ nativeEvent: { downloadUrl } }) => {
            if (downloadUrl) {
              Linking.openURL(downloadUrl).catch((err) =>
                console.warn('Failed to open file download:', err)
              );
            }
          }}
          renderLoading={() => (
            // Built-in loading view
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text style={styles.loadingText}>Connecting to LearnHub...</Text>
            </View>
          )}
        />

        {/* Sleek Progress Bar at top of screen (similar to mobile Chrome/Safari) */}
        {isProgressVisible && (
          <Animated.View 
            style={[
              styles.progressBarContainer, 
              { opacity: progressFadeAnim }
            ]}
          >
            <View 
              style={[
                styles.progressBarFill, 
                { width: `${progress * 100}%` }
              ]} 
            />
          </Animated.View>
        )}

        {/* Custom Overlay Spinner for route changes or background loads */}
        {isLoading && !isOfflineMode && !isProgressVisible && (
          <View style={styles.overlayLoader}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        )}

        {/* Premium Offline / Error Screen Overlay */}
        {isOfflineMode && (
          <Animated.View 
            style={[
              styles.offlineOverlay, 
              { opacity: offlineFadeAnim }
            ]}
            pointerEvents={isOfflineMode ? 'auto' : 'none'}
          >
            <View style={styles.offlineCard}>
              <View style={styles.offlineIconContainer}>
                <View style={styles.offlineIconRing1}>
                  <View style={styles.offlineIconRing2}>
                    {/* Visual custom-crafted Wi-Fi disconnected icon */}
                    <Text style={styles.wifiIcon}>📶</Text>
                    <View style={styles.crossLine} />
                  </View>
                </View>
              </View>

              <Text style={styles.offlineTitle}>No Connection</Text>
              <Text style={styles.offlineDesc}>
                Your device is currently offline. Please check your Wi-Fi or cellular network and try again.
              </Text>

              <View style={styles.tipsContainer}>
                <Text style={styles.tipItem}>• Check if Wi-Fi or Mobile Data is on</Text>
                <Text style={styles.tipItem}>• Verify airplane mode is disabled</Text>
              </View>

              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={handleRetry}
                activeOpacity={0.8}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.copyrightText}>© 2026 TalentRayz Demo App</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // Sleek progress bar
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#E2E8F0',
    zIndex: 9999,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5', // Premium Indigo
  },
  // Initial loading spinner
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  // Overlay loader for subtle actions
  overlayLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
  },
  // Premium offline screen
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F1F5F9', // Sleek light gray
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    paddingHorizontal: 24,
  },
  offlineCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 8, // Native Android shadow
  },
  offlineIconContainer: {
    marginBottom: 20,
  },
  offlineIconRing1: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FEE2E2', // Crimson-light
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineIconRing2: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FCA5A5', // Red-lighter
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wifiIcon: {
    fontSize: 28,
  },
  crossLine: {
    position: 'absolute',
    width: 46,
    height: 4,
    backgroundColor: '#EF4444', // Danger red line
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }],
  },
  offlineTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A', // Dark Slate
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  offlineDesc: {
    fontSize: 14,
    color: '#64748B', // Muted Gray text
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  tipsContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  tipItem: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 6,
  },
  retryButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#4F46E5', // Premium Indigo Action Button
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  copyrightText: {
    position: 'absolute',
    bottom: 24,
    fontSize: 11,
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
});

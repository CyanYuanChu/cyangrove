(function initYouTubeSpeed(global) {
  const C = global.AITabGrouper;
  if (!C || typeof document === "undefined") return;

  const TOAST_ID = "ai-tab-grouper-youtube-speed-toast";
  let activeVideo = null;
  let videoHandlers = null;
  let preferredRate = null;
  let syncTimer = null;
  let toastTimer = null;

  function isEditableTarget(target) {
    let element = target;
    if (element && element.nodeType !== 1) element = element.parentElement;
    return Boolean(element && element.closest && element.closest(
      "input, textarea, select, [contenteditable=\"true\"], [role=\"textbox\"]"
    ));
  }

  function isVisibleVideo(video) {
    if (!video || !video.isConnected) return false;
    const rect = video.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = global.getComputedStyle(video);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function videoArea(video) {
    const rect = video.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function findActiveVideo() {
    const mainVideo = document.querySelector("#movie_player video.html5-main-video, video.html5-main-video");
    if (isVisibleVideo(mainVideo)) return mainVideo;

    const visibleVideos = [...document.querySelectorAll("video")]
      .filter(isVisibleVideo)
      .sort((left, right) => videoArea(right) - videoArea(left));
    if (visibleVideos.length) return visibleVideos[0];

    return document.querySelector("video");
  }

  function setVideoRate(video, rate) {
    if (!video) return false;
    const next = C.clampPlaybackRate(rate);
    try {
      if (Math.abs(Number(video.playbackRate) - next) > 0.001) video.playbackRate = next;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function applyPreferredRate(video) {
    if (preferredRate === null) return;
    setVideoRate(video, preferredRate);
  }

  function bindVideo(video) {
    if (activeVideo === video) return;

    if (activeVideo && videoHandlers) {
      activeVideo.removeEventListener("loadedmetadata", videoHandlers.onReady);
      activeVideo.removeEventListener("durationchange", videoHandlers.onReady);
      activeVideo.removeEventListener("canplay", videoHandlers.onReady);
    }

    activeVideo = video || null;
    videoHandlers = null;
    if (!activeVideo) return;

    const onReady = () => applyPreferredRate(activeVideo);
    videoHandlers = { onReady };
    activeVideo.addEventListener("loadedmetadata", onReady);
    activeVideo.addEventListener("durationchange", onReady);
    activeVideo.addEventListener("canplay", onReady);
    applyPreferredRate(activeVideo);
  }

  function syncVideo() {
    syncTimer = null;
    bindVideo(findActiveVideo());
  }

  function scheduleSync() {
    if (syncTimer !== null) return;
    syncTimer = global.setTimeout(syncVideo, 80);
  }

  function getToast() {
    let toast = document.getElementById(TOAST_ID);
    if (toast) return toast;
    if (!document.documentElement) return null;

    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.style.cssText = [
      "position: fixed",
      "top: 72px",
      "left: 50%",
      "z-index: 2147483647",
      "padding: 9px 14px",
      "border: 1px solid rgba(255,255,255,.18)",
      "border-radius: 8px",
      "color: #fff",
      "background: rgba(24,24,24,.88)",
      "box-shadow: 0 4px 18px rgba(0,0,0,.28)",
      "font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, sans-serif",
      "letter-spacing: .01em",
      "opacity: 0",
      "pointer-events: none",
      "transform: translate(-50%, -6px)",
      "transition: opacity .15s ease, transform .15s ease"
    ].join(";");
    document.documentElement.appendChild(toast);
    return toast;
  }

  function showToast(rate) {
    const toast = getToast();
    if (!toast) return;
    toast.textContent = `YouTube 倍速 ${C.playbackRateLabel(rate)}`;
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, 0)";
    if (toastTimer !== null) global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, -6px)";
      toastTimer = null;
    }, 1000);
  }

  function shortcutDirection(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
    // Use the unshifted physical Equal key for acceleration. The shortcut is
    // intentionally "=" rather than "+", so Shift+= is not required.
    const keyCode = Number(event.keyCode || event.which);
    if (!event.shiftKey && (event.key === "=" || event.code === "Equal" || event.code === "NumpadEqual" || keyCode === 187)) return 1;
    if (!event.shiftKey && (event.key === "-" || event.code === "NumpadSubtract" || event.code === "Minus" || keyCode === 189 || keyCode === 109)) return -1;
    return null;
  }

  function onKeyDown(event) {
    const direction = shortcutDirection(event);
    if (direction === null || isEditableTarget(event.target)) return;

    const video = findActiveVideo();
    if (!video) return;

    const current = Number(video.playbackRate) > 0 ? video.playbackRate : (preferredRate || C.YOUTUBE_SPEED.normal);
    const next = C.adjustPlaybackRate(current, direction);
    preferredRate = C.clampPlaybackRate(next);
    bindVideo(video);
    setVideoRate(video, preferredRate);
    event.preventDefault();
    event.stopPropagation();
    showToast(preferredRate);
  }

  function start() {
    document.addEventListener("keydown", onKeyDown, true);

    if (document.documentElement && global.MutationObserver) {
      const observer = new MutationObserver(scheduleSync);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    ["yt-navigate-finish", "yt-page-data-updated", "spfdone"].forEach((eventName) => {
      document.addEventListener(eventName, scheduleSync, true);
    });
    scheduleSync();
  }

  start();
})(globalThis);

(function () {
  const originalLoadImageFiles = loadImageFiles;
  const originalRenderImages = renderImages;
  const originalClearImages = clearImages;
  const originalUploadImagesAndGenerate = uploadImagesAndGenerate;
  const configBeforeVideoUploads = config;
  const maxVideoSize = 90 * 1024 * 1024;
  let videoAssets = [];

  function isVideoMode() {
    return $("useDigitalHuman")?.checked !== true &&
      $("useCommonModel")?.checked === true &&
      normalizeMediaType($("commonMediaType")?.value) === "2";
  }

  function isVideoFile(file) {
    return file?.type === "video/mp4" || /\.mp4$/i.test(file?.name || "");
  }

  function mediaNumber(name) {
    const match = String(name || "").match(/(?:^|\\)(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  function installMediaModeControl() {
    const panel = $("imagePanel");
    if (!panel || $("mediaModeControl")) return;
    const control = document.createElement("div");
    control.id = "mediaModeControl";
    control.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px";
    control.innerHTML = '<span class="hint" style="font-weight:700;color:var(--text)">上传素材</span><div style="display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden"><button type="button" id="imageMediaModeBtn" style="border:0;padding:7px 14px;cursor:pointer;font:inherit">图片</button><button type="button" id="videoMediaModeBtn" style="border:0;border-left:1px solid var(--line);padding:7px 14px;cursor:pointer;font:inherit">视频</button></div>';
    panel.querySelector(".body").prepend(control);

    $("imageMediaModeBtn").onclick = () => setMediaMode("1");
    $("videoMediaModeBtn").onclick = () => setMediaMode("2");
  }

  function setMediaMode(mediaType) {
    if ($("useDigitalHuman")?.checked) {
      $("useDigitalHuman").checked = false;
      $("useDigitalHuman").dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (mediaType === "2" && !$("useCommonModel")?.checked) {
      $("useCommonModel").checked = true;
      $("useCommonModel").dispatchEvent(new Event("change", { bubbles: true }));
    }
    if ($("commonMediaType")) {
      $("commonMediaType").value = mediaType;
      $("commonMediaType").dispatchEvent(new Event("change", { bubbles: true }));
    }
    render();
  }

  function syncMediaModeControl() {
    const imageButton = $("imageMediaModeBtn");
    const videoButton = $("videoMediaModeBtn");
    if (!imageButton || !videoButton) return;
    const videoMode = isVideoMode();
    const activeStyle = "background:var(--p);color:#fff;font-weight:700";
    const inactiveStyle = "background:#fff;color:var(--text);font-weight:600";
    imageButton.style.cssText += ";" + (videoMode ? inactiveStyle : activeStyle);
    videoButton.style.cssText += ";" + (videoMode ? activeStyle : inactiveStyle);
    imageButton.setAttribute("aria-pressed", String(!videoMode));
    videoButton.setAttribute("aria-pressed", String(videoMode));
  }

  function setPanelText() {
    const videoMode = isVideoMode();
    const panel = $("imagePanel");
    const input = $("imageInput");
    if (!panel || !input) return;

    panel.querySelector(".head h2").textContent = videoMode ? "\u89c6\u9891\u5305\uff08\u53ef\u9009\uff09" : "\u56fe\u7247\u5305\uff08\u53ef\u9009\uff09";
    $("imageDrop").querySelector("b").textContent = videoMode ? "\u70b9\u51fb\u6216\u62d6\u5165 MP4 \u89c6\u9891" : "\u70b9\u51fb\u6216\u62d6\u5165 ZIP / \u591a\u5f20\u56fe\u7247";
    $("imageDrop").querySelector(".hint").textContent = videoMode
      ? "\u89c6\u9891\u6309 1.mp4\u30012.mp4\u30013.mp4... \u547d\u540d\u3002\u5de5\u5177\u4f1a\u81ea\u52a8\u63d0\u53d6\u9996\u5e27\uff0c\u5e76\u5206\u522b\u5199\u5165 img \u4e0e imgFirstFrame\u3002"
      : "\u56fe\u7247\u6309 1.webp\u30012.png\u30013.jpg... \u547d\u540d\uff0c\u5c06\u6309\u6570\u5b57\u4e0e\u63d0\u793a\u8bcd\u987a\u5e8f\u5339\u914d\u3002";
    input.accept = videoMode ? "video/mp4,.mp4" : "image/png,image/jpeg,image/webp,.zip,application/zip";
    $("uploadGenerateBtn").textContent = videoMode ? "\u4e0a\u4f20\u89c6\u9891\u5e76\u751f\u6210\u914d\u7f6e" : "\u4e0a\u4f20\u56fe\u7247\u5e76\u751f\u6210\u5e26\u56fe\u914d\u7f6e";
    syncMediaModeControl();
  }

  function waitForEvent(element, successEvent, failureEvent) {
    return new Promise((resolve, reject) => {
      const done = () => {
        element.removeEventListener(successEvent, done);
        element.removeEventListener(failureEvent, failed);
        resolve();
      };
      const failed = () => {
        element.removeEventListener(successEvent, done);
        element.removeEventListener(failureEvent, failed);
        reject(new Error("\u89c6\u9891\u65e0\u6cd5\u89e3\u7801\uff0c\u8bf7\u4f7f\u7528 H.264 \u7f16\u7801\u7684 MP4\u3002"));
      };
      element.addEventListener(successEvent, done, { once: true });
      element.addEventListener(failureEvent, failed, { once: true });
    });
  }

  async function createFirstFrame(videoFile) {
    const objectUrl = URL.createObjectURL(videoFile);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;
    try {
      await waitForEvent(video, "loadeddata", "error");
      if (!video.videoWidth || !video.videoHeight) throw new Error("\u89c6\u9891\u6ca1\u6709\u53ef\u7528\u7684\u9996\u5e27\u3002");
      if (Number.isFinite(video.duration) && video.duration > 0.15) {
        video.currentTime = Math.min(0.12, video.duration / 2);
        await waitForEvent(video, "seeked", "error");
      }
      const longestSide = 1600;
      const scale = Math.min(1, longestSide / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("\u89c6\u9891\u9996\u5e27\u751f\u6210\u5931\u8d25\u3002");
      const baseName = videoFile.name.replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}-first-frame.jpg`, { type: "image/jpeg" });
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    }
  }

  function releaseVideoAssets() {
    videoAssets.forEach(asset => asset.preview && URL.revokeObjectURL(asset.preview));
    videoAssets = [];
  }

  async function loadVideoFiles(files) {
    const selected = files.filter(isVideoFile);
    if (!selected.length) {
      status("imageStatus", "\u8bf7\u9009\u62e9 MP4 \u89c6\u9891\u6587\u4ef6\u3002", "err");
      return;
    }
    const oversized = selected.find(file => file.size > maxVideoSize);
    if (oversized) {
      status("imageStatus", `\u300c${oversized.name}\u300d\u8d85\u8fc7 90 MB\uff0c\u8bf7\u5148\u538b\u7f29\u540e\u518d\u4e0a\u4f20\u3002`, "err");
      return;
    }
    releaseVideoAssets();
    const ordered = [...selected].sort((left, right) => mediaNumber(left.name) - mediaNumber(right.name) || left.name.localeCompare(right.name, undefined, { numeric: true }));
    videoAssets = ordered.map((file, index) => ({
      file,
      name: file.name,
      kind: "video",
      number: mediaNumber(file.name),
      preview: URL.createObjectURL(file),
      firstFrameFile: null,
      url: "",
      firstFrameUrl: "",
      status: "preparing",
      error: "",
      index
    }));
    renderImages();
    try {
      await Promise.all(videoAssets.map(async asset => {
        asset.firstFrameFile = await createFirstFrame(asset.file);
        asset.status = "ready";
      }));
      renderImages();
      const promptCount = allItems().length;
      const duplicateNumbers = videoAssets.filter((asset, index) => index && asset.number === videoAssets[index - 1].number).map(asset => asset.name);
      const message = `\u5df2\u8bfb\u53d6 ${videoAssets.length} \u4e2a\u89c6\u9891\uff0c\u5df2\u81ea\u52a8\u751f\u6210\u9996\u5e27\u3002\u5f53\u524d ${promptCount} \u6761\u63d0\u793a\u8bcd\u3002` + (duplicateNumbers.length ? ` \u91cd\u590d\u7f16\u53f7\uff1a${duplicateNumbers.join(", ")}` : "");
      status("imageStatus", message, videoAssets.length === promptCount && !duplicateNumbers.length ? "ok" : "err");
    } catch (error) {
      releaseVideoAssets();
      renderImages();
      status("imageStatus", error.message || "\u89c6\u9891\u9996\u5e27\u751f\u6210\u5931\u8d25\u3002", "err");
    }
  }

  function renderVideos() {
    if (!$("imageGrid")) return;
    $("imageCount").textContent = `${videoAssets.length} \u4e2a`;
    const items = allItems();
    $("imageGrid").innerHTML = videoAssets.map((asset, index) => {
      const state = asset.status === "uploading" ? "\u4e0a\u4f20\u4e2d..." : asset.status === "done" ? "\u89c6\u9891\u4e0e\u9996\u5e27\u5df2\u4e0a\u4f20" : asset.status === "preparing" ? "\u6b63\u5728\u751f\u6210\u9996\u5e27..." : asset.status === "error" ? esc(asset.error) : "\u7b49\u5f85\u4e0a\u4f20";
      const color = asset.status === "done" ? "var(--ok)" : asset.status === "error" ? "var(--bad)" : "var(--muted)";
      return `<div style="border:1px solid var(--line);border-radius:10px;padding:8px;background:#fff"><video src="${asset.preview}" muted preload="metadata" controls style="width:100%;height:110px;object-fit:contain;background:#f5f6f8;border-radius:7px"></video><div style="font-weight:700;margin-top:5px">#${index + 1} ${esc(asset.name)}</div><div class="hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(items[index]?.title || "\u672a\u5339\u914d\u63d0\u793a\u8bcd")}</div><div style="color:${color};font-size:11px;margin-top:4px">${state}</div></div>`;
    }).join("");
  }

  renderImages = function () {
    if (isVideoMode()) return renderVideos();
    return originalRenderImages();
  };

  loadImageFiles = async function (files) {
    if (isVideoMode()) return loadVideoFiles(files);
    return originalLoadImageFiles(files);
  };

  clearImages = function () {
    if (!isVideoMode()) return originalClearImages();
    releaseVideoAssets();
    allItems().forEach(item => {
      item.img = "";
      delete item.imgFirstFrame;
    });
    renderImages();
    $("imageStatus").className = "status";
  };

  async function uploadVideoAsset(asset) {
    asset.status = "uploading";
    renderImages();
    const videoUrl = await uploadAsset(asset);
    const firstFrameAsset = {
      file: asset.firstFrameFile,
      name: asset.firstFrameFile.name,
      kind: "video-first-frame",
      status: "uploading",
      preview: ""
    };
    const firstFrameUrl = await uploadAsset(firstFrameAsset);
    asset.url = videoUrl;
    asset.firstFrameUrl = firstFrameUrl;
    asset.status = "done";
    renderImages();
  }

  async function uploadVideosAndGenerate() {
    const items = allItems().slice();
    if (!items.length) {
      status("imageStatus", "\u8bf7\u5148\u70b9\u51fb\u300c\u667a\u80fd\u8bc6\u522b\u6587\u6863\u300d\uff0c\u786e\u8ba4\u8bc6\u522b\u7ed3\u679c\u4e0d\u662f 0 \u6761\u3002", "err");
      return;
    }
    if (!videoAssets.length) {
      status("imageStatus", "\u8bf7\u5148\u9009\u62e9 MP4 \u89c6\u9891\u3002", "err");
      return;
    }
    if (videoAssets.length !== items.length) {
      status("imageStatus", `\u89c6\u9891 ${videoAssets.length} \u4e2a\uff0c\u63d0\u793a\u8bcd ${items.length} \u6761\uff0c\u6570\u91cf\u5fc5\u987b\u4e00\u81f4\u3002`, "err");
      return;
    }
    if (videoAssets.some(asset => !asset.firstFrameFile)) {
      status("imageStatus", "\u6709\u89c6\u9891\u672a\u80fd\u751f\u6210\u9996\u5e27\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u89c6\u9891\u3002", "err");
      return;
    }
    if (!await helperReady()) {
      status("imageStatus", "\u672a\u8fde\u63a5\u5230\u4e91\u7aef\u4e0a\u4f20\u670d\u52a1\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002", "err");
      return;
    }
    const button = $("uploadGenerateBtn");
    const originalLabel = button.textContent;
    button.disabled = true;
    let done = videoAssets.filter(asset => asset.url && asset.firstFrameUrl).length;
    setUploadProgress(done, videoAssets.length);
    status("imageStatus", `\u6b63\u5728\u4e0a\u4f20 ${videoAssets.length} \u4e2a\u89c6\u9891\u53ca\u5bf9\u5e94\u9996\u5e27...`, "ok");
    try {
      for (let index = 0; index < videoAssets.length; index++) {
        const asset = videoAssets[index];
        if (!asset.url || !asset.firstFrameUrl) await uploadVideoAsset(asset);
        items[index].img = asset.url;
        items[index].imgFirstFrame = asset.firstFrameUrl;
        done++;
        setUploadProgress(done, videoAssets.length);
      }
      generate();
      status("imageStatus", `\u5df2\u5b8c\u6210\uff1a${videoAssets.length} \u4e2a\u89c6\u9891\u53ca\u9996\u5e27\u5df2\u5199\u5165\u914d\u7f6e\u3002`, "ok");
      $("output").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      const current = videoAssets.find(asset => asset.status === "uploading");
      if (current) {
        current.status = "error";
        current.error = error.message || "Upload failed";
      }
      renderImages();
      status("imageStatus", `\u89c6\u9891\u4e0a\u4f20\u4e2d\u65ad\uff1a${error.message || "Upload failed"}`, "err");
    } finally {
      button.disabled = false;
      setTimeout(() => { button.textContent = originalLabel; }, 1800);
    }
  }

  uploadImagesAndGenerate = function () {
    return isVideoMode() ? uploadVideosAndGenerate() : originalUploadImagesAndGenerate();
  };

  config = function () {
    const output = configBeforeVideoUploads();
    if (!isVideoMode()) {
      output.forEach(component => component.content.forEach(entry => delete entry.imgFirstFrame));
      return output;
    }
    let index = 0;
    output.forEach(component => component.content.forEach(entry => {
      const asset = videoAssets[index++];
      entry.img = asset?.url || "";
      entry.imgFirstFrame = asset?.firstFrameUrl || "";
    }));
    return output;
  };

  const originalRender = render;
  render = function () {
    originalRender();
    setPanelText();
    renderImages();
  };

  let previousVideoMode = isVideoMode();

  document.addEventListener("change", event => {
    if (["useCommonModel", "commonMediaType", "useDigitalHuman"].includes(event.target?.id)) {
      const videoMode = isVideoMode();
      if (previousVideoMode && !videoMode) {
        releaseVideoAssets();
        $("imageInput").value = "";
      }
      previousVideoMode = videoMode;
      setPanelText();
      renderImages();
    }
  });
  $("uploadGenerateBtn").onclick = uploadImagesAndGenerate;
  installMediaModeControl();
  setPanelText();
  renderImages();
})();

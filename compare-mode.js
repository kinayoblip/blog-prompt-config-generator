(function () {
  function normalizeCompareMode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return /vertical|portrait|竖|直|縱/.test(normalized) ? "vertical" : "horizontal";
  }

  function isCompareEnabled(entry) {
    return entry?.isCompare === true || entry?.isCompare === "true";
  }

  function ensureCompareFields(entry) {
    entry.isCompare = isCompareEnabled(entry);
    entry.compareMode = normalizeCompareMode(entry.compareMode);
    entry.compareImg = String(entry.compareImg || "");
    return entry;
  }

  const itemBeforeCompare = item;
  item = function () {
    return ensureCompareFields(itemBeforeCompare());
  };

  const parseJsonBeforeCompare = parseJson;
  parseJson = function (text) {
    const parsed = parseJsonBeforeCompare(text);
    if (!parsed) return parsed;
    try {
      const data = JSON.parse(text);
      const sourceGroups = Array.isArray(data) ? data : data.groups;
      const sourceItems = sourceGroups.flatMap(group => group.content || group.items || []);
      let sourceIndex = 0;
      parsed.forEach(group => group.items.forEach(entry => {
        const source = sourceItems[sourceIndex++] || {};
        entry.isCompare = source.isCompare === true || source.isCompare === "true";
        entry.compareMode = normalizeCompareMode(source.compareMode);
        entry.compareImg = String(source.compareImg || "");
      }));
    } catch {}
    return parsed;
  };

  function compareMarker(line) {
    const matched = String(line || "").match(/^\s*(?:对比|對比|compare|ab)\s*(?:[:：]\s*)?(.*?)\s*$/i);
    return matched ? normalizeCompareMode(matched[1]) : "";
  }

  function stripCompareMarkers(text) {
    const lines = normalizeLines(text);
    const hasLabeledTitles = lines.some(line => labelLine(line)?.key === "title");
    const settings = new Map();
    const retained = [];
    let titleIndex = -1;
    let blockIndex = 0;
    let hasBlockContent = false;

    lines.forEach(line => {
      const mode = compareMarker(line);
      if (mode) {
        settings.set(hasLabeledTitles ? Math.max(titleIndex, 0) : blockIndex, mode);
        return;
      }
      retained.push(line);
      if (!line.trim()) {
        if (hasBlockContent) {
          blockIndex++;
          hasBlockContent = false;
        }
        return;
      }
      hasBlockContent = true;
      if (labelLine(line)?.key === "title") titleIndex++;
    });
    return { text: retained.join("\n"), settings };
  }

  function applyGlobalCompareDefault() {
    if (!$("useCompareForAll")?.checked) return;
    const compareMode = normalizeCompareMode($("defaultCompareMode")?.value);
    allItems().forEach(entry => {
      entry.isCompare = true;
      entry.compareMode = compareMode;
      entry.compareImg = String(entry.compareImg || "");
    });
  }

  const parseDocumentBeforeCompare = parseDocument;
  parseDocument = function () {
    const source = $("source");
    const originalText = source.value;
    const prepared = stripCompareMarkers(originalText);
    source.value = prepared.text;
    try {
      parseDocumentBeforeCompare();
    } finally {
      source.value = originalText;
    }
    if (prepared.settings.size) {
      allItems().forEach((entry, index) => {
        const mode = prepared.settings.get(index);
        if (!mode) return;
        entry.isCompare = true;
        entry.compareMode = mode;
        entry.compareImg = "";
      });
    }
    applyGlobalCompareDefault();
    render();
  };
  $("parseBtn").onclick = parseDocument;

  function addCompareControls() {
    groups.forEach((group, groupIndex) => group.items.forEach((entry, itemIndex) => {
      ensureCompareFields(entry);
      const selector = '[data-deli="' + groupIndex + "," + itemIndex + '"]';
      const itemNode = document.querySelector(selector)?.closest(".item");
      const fields = itemNode?.querySelector(".fields");
      if (!fields || fields.querySelector(".compare-controls")) return;

      const control = document.createElement("div");
      control.className = "span2 compare-controls";
      control.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:3px";
      control.innerHTML =
        '<label style="display:flex;align-items:center;gap:7px;font-weight:700;cursor:pointer">' +
          '<input type="checkbox" data-compare-toggle="' + groupIndex + "," + itemIndex + '"' + (entry.isCompare ? " checked" : "") + ">" +
          " 对比</label>" +
        '<label style="display:flex;align-items:center;gap:7px;color:var(--muted)">布局' +
          '<select class="field" data-compare-mode="' + groupIndex + "," + itemIndex + '" style="width:112px;padding:7px"' + (entry.isCompare ? "" : " disabled") + ">" +
            '<option value="horizontal"' + (entry.compareMode === "horizontal" ? " selected" : "") + ">横图</option>" +
            '<option value="vertical"' + (entry.compareMode === "vertical" ? " selected" : "") + ">竖图</option>" +
          "</select></label>" +
        '<span class="hint" style="color:var(--muted)">启用后，该条目按顺序使用两张图片。</span>';
      fields.appendChild(control);

      const toggle = control.querySelector("[data-compare-toggle]");
      const mode = control.querySelector("[data-compare-mode]");
      toggle.onchange = () => {
        entry.isCompare = toggle.checked;
        mode.disabled = !toggle.checked;
        updateCompareImageHint();
      };
      mode.onchange = () => {
        entry.compareMode = normalizeCompareMode(mode.value);
      };
    }));
  }

  function imagePlan() {
    let imageIndex = 0;
    const entries = allItems().map((entry, entryIndex) => {
      ensureCompareFields(entry);
      const result = {
        entry,
        entryIndex,
        primaryIndex: imageIndex,
        compareIndex: entry.isCompare ? imageIndex + 1 : -1
      };
      imageIndex += entry.isCompare ? 2 : 1;
      return result;
    });
    return { entries, total: imageIndex };
  }

  function updateCompareImageHint() {
    const hint = $("imageDrop")?.querySelector(".hint");
    if (!hint) return;
    const plan = imagePlan();
    const compared = plan.entries.filter(entry => entry.entry.isCompare).length;
    hint.textContent = compared
      ? "图片按 1.webp、2.png、3.jpg... 命名。已启用 " + compared + " 条对比，共需 " + plan.total + " 张；每条对比依次使用两张图片。"
      : "图片按 1.webp、2.png、3.jpg... 命名，将按数字与提示词顺序匹配。";
  }

  const renderBeforeCompare = render;
  render = function () {
    renderBeforeCompare();
    addCompareControls();
    updateCompareImageHint();
  };

  const validateBeforeCompare = validate;
  validate = function (show = true) {
    const errors = validateBeforeCompare(false);
    const allowEmptyImage = $("allowEmptyImage")?.checked !== false;
    if (!allowEmptyImage) {
      groups.forEach((group, groupIndex) => group.items.forEach((entry, itemIndex) => {
        if (isCompareEnabled(entry) && !String(entry.compareImg || "").trim()) {
          errors.push("第 " + (groupIndex + 1) + " 组第 " + (itemIndex + 1) + " 条缺少对比图片 URL");
        }
      }));
    }
    if (show && errors.length) {
      status("generateStatus", errors.slice(0, 6).join("；") + (errors.length > 6 ? "；共 " + errors.length + " 处" : ""), "err");
    }
    return errors;
  };

  const configBeforeCompare = config;
  config = function () {
    const output = configBeforeCompare();
    const sourceItems = allItems();
    let sourceIndex = 0;
    output.forEach(component => component.content.forEach(entry => {
      const source = ensureCompareFields(sourceItems[sourceIndex++] || {});
      entry.isCompare = source.isCompare;
      if (!source.isCompare) {
        delete entry.compareMode;
        delete entry.compareImg;
        return;
      }
      entry.compareMode = source.compareMode;
      entry.compareImg = source.compareImg;
      entry.imgFirstFrame = source.imgFirstFrame || "";
    }));
    return output;
  };

  uploadImagesAndGenerate = async function () {
    const targetItems = allItems().slice();
    const plan = imagePlan();
    const total = plan.total;
    if (!targetItems.length) {
      status("imageStatus", "请先点击“智能识别文档”，确认识别结果不是 0 条。", "err");
      return;
    }
    if (!imageAssets.length) {
      status("imageStatus", "请先选择 ZIP 或图片。", "err");
      return;
    }
    if (imageAssets.length !== total) {
      status("imageStatus", "当前需要 " + total + " 张图片，已选择 " + imageAssets.length + " 张。普通条目需 1 张，对比条目需连续 2 张。", "err");
      return;
    }
    if (!await helperReady()) {
      status("imageStatus", "未检测到图片上传服务。请使用 BAT 启动本地工具。", "err");
      return;
    }

    const button = $("uploadGenerateBtn");
    const originalText = button.textContent;
    let done = imageAssets.filter(asset => asset.url).length;
    let failed = null;
    let nextIndex = 0;
    button.disabled = true;
    setUploadProgress(done, total);
    status("imageStatus", "正在上传并确认 " + total + " 张图片，完成后才会生成配置。", "ok");

    async function worker() {
      while (!failed) {
        const assetIndex = nextIndex++;
        if (assetIndex >= total) return;
        const asset = imageAssets[assetIndex];
        if (asset.url) continue;
        try {
          await uploadAsset(asset);
          done++;
          setUploadProgress(done, total);
          renderImages();
        } catch (error) {
          asset.status = "error";
          asset.error = error.message;
          failed = new Error("#" + (assetIndex + 1) + " " + asset.name + ": " + error.message);
          renderImages();
          return;
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(3, total) }, worker));
      if (failed) throw failed;
      plan.entries.forEach(entryPlan => {
        entryPlan.entry.img = imageAssets[entryPlan.primaryIndex].url;
        entryPlan.entry.compareImg = entryPlan.compareIndex < 0
          ? ""
          : imageAssets[entryPlan.compareIndex].url;
      });
      render();
      generate();
      status("imageStatus", "已完成：" + total + " 张图片已写入配置。", "ok");
      $("output").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      status("imageStatus", "上传中断：" + error.message, "err");
    } finally {
      button.disabled = false;
      setTimeout(() => { button.textContent = originalText; }, 1800);
    }
  };
  $("uploadGenerateBtn").onclick = uploadImagesAndGenerate;

  const fieldHint = $("fieldHint");
  if (fieldHint) {
    const globalCompareControl = document.createElement("div");
    globalCompareControl.id = "globalCompareControl";
    globalCompareControl.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#fbfcfe";
    globalCompareControl.innerHTML =
      '<label style="display:flex;align-items:center;gap:7px;font-weight:700;cursor:pointer">' +
        '<input type="checkbox" id="useCompareForAll"> 全部提示词使用对比' +
      "</label>" +
      '<label style="display:flex;align-items:center;gap:7px;color:var(--muted)">默认布局' +
        '<select class="field" id="defaultCompareMode" style="width:112px;padding:7px" disabled>' +
          '<option value="horizontal">横图</option>' +
          '<option value="vertical">竖图</option>' +
        "</select>" +
      "</label>";
    fieldHint.insertAdjacentElement("afterend", globalCompareControl);

    const globalToggle = $("useCompareForAll");
    const globalMode = $("defaultCompareMode");
    globalToggle.onchange = () => {
      globalMode.disabled = !globalToggle.checked;
      if (!globalToggle.checked || !allItems().length) return;
      applyGlobalCompareDefault();
      render();
    };
    globalMode.onchange = () => {
      if (!globalToggle.checked || !allItems().length) return;
      applyGlobalCompareDefault();
      render();
    };

    const compareHint = document.createElement("div");
    compareHint.style.cssText = "margin-top:6px;color:#514dbb;font-weight:700";
    compareHint.textContent = "全部都是对比时，勾选上方“全部提示词使用对比”；部分对比时，请在下方识别结果中逐条勾选“对比”。";
    fieldHint.appendChild(compareHint);
  }

  render();
})();

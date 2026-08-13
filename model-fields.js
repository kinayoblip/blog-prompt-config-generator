function normalizeMediaType(value) {
  value = String(value || "").trim().toLowerCase();
  if (value === "image" || value === "1") return "1";
  if (value === "video" || value === "2") return "2";
  return "";
}

function installDigitalHumanSwitch() {
  const options = document.querySelector(".options");
  if (!options || $("digitalHumanGlobalPanel")) return;
  const panel = document.createElement("div");
  panel.id = "digitalHumanGlobalPanel";
  panel.className = "option span2";
  panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><div><label class="label" style="margin:0">数字人组件</label><div class="hint" style="margin-top:4px">开启后，普通模型设置会切换为数字人默认设置。</div></div><label style="display:inline-flex;align-items:center;cursor:pointer"><input id="useDigitalHuman" type="checkbox" style="position:absolute;opacity:0;width:1px;height:1px"><span id="digitalHumanTrack" style="width:48px;height:28px;border-radius:999px;background:#cbd2df;padding:3px;box-sizing:border-box;transition:.2s"><span id="digitalHumanKnob" style="display:block;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #718096;transition:.2s"></span></span></label></div>';
  options.appendChild(panel);
  const sync = () => {
    const enabled = $("useDigitalHuman").checked;
    $("digitalHumanTrack").style.background = enabled ? "#2f80ed" : "#cbd2df";
    $("digitalHumanKnob").style.transform = enabled ? "translateX(20px)" : "translateX(0)";
  };
  $("useDigitalHuman").addEventListener("change", () => {
    if ($("useDigitalHuman").checked && $("componentMode")) $("componentMode").value = "groups";
    sync();
    syncSettingsPanels();
    render();
  });
  sync();
}

function installSettingsPanel() {
  const options = document.querySelector(".options");
  if (!options || $("commonSettingsPanel")) return;
  const panel = document.createElement("div");
  panel.id = "commonSettingsPanel";
  panel.className = "option span2";
  panel.innerHTML = '<div id="normalModelSettings"><label style="display:flex;align-items:center;gap:8px;font-weight:700"><input type="checkbox" id="useCommonModel"> 为普通提示词添加统一模型信息</label><div id="commonModelFields" style="display:grid;grid-template-columns:1fr 1fr 180px;gap:10px;margin-top:10px"><div><label class="label">模型 ID</label><input id="commonModelId" class="field" placeholder="例如 d7h08hte878c738qgpdg"></div><div><label class="label">模型版本号</label><input id="commonModelVersion" class="field" placeholder="请输入模型版本号"></div><div><label class="label">生成类型</label><select id="commonMediaType" class="field"><option value="1">图片 image（type: 1）</option><option value="2">视频 video（type: 2）</option></select></div></div><div id="imageCountField" style="margin-top:10px;max-width:calc((100% - 20px) / 3)"><label class="label">默认生成张数（仅图片）</label><select id="commonDefaultCount" class="field"><option value="1">1 张</option><option value="2">2 张</option><option value="3">3 张</option><option value="4">4 张</option></select></div><div class="hint" style="margin-top:6px">图片会加入 defaultCount；视频没有张数字段。</div></div><div id="digitalHumanSettings" style="display:none"><label class="label">数字人默认设置</label><div style="display:grid;grid-template-columns:220px 1fr;gap:10px;margin-top:10px"><div><label class="label">包含提示词</label><select id="commonIncludePrompt" class="field"><option value="false">否</option><option value="true">是</option></select></div><div><label class="label">按钮文案</label><input id="commonBtnText" class="field" placeholder="例如 今すぐ作る"></div></div><div class="hint" style="margin-top:6px">这里填写的内容会自动应用到全部数字人提示词。</div></div>';
  options.appendChild(panel);
  const syncNormalModelFields = () => {
    const enabled = $("useCommonModel").checked;
    const isImage = normalizeMediaType($("commonMediaType").value) === "1";
    $("commonModelFields").style.opacity = enabled ? "1" : ".55";
    $("commonModelFields").querySelectorAll("input,select").forEach(element => { element.disabled = !enabled; });
    $("imageCountField").style.display = enabled && isImage ? "block" : "none";
    $("commonDefaultCount").disabled = !enabled || !isImage;
  };
  $("useCommonModel").addEventListener("change", syncNormalModelFields);
  $("commonMediaType").addEventListener("change", syncNormalModelFields);
  panel.syncNormalModelFields = syncNormalModelFields;
  syncNormalModelFields();
}

function syncSettingsPanels() {
  const digitalHuman = $("useDigitalHuman")?.checked;
  if (!$("commonSettingsPanel")) return;
  $("normalModelSettings").style.display = digitalHuman ? "none" : "block";
  $("digitalHumanSettings").style.display = digitalHuman ? "block" : "none";
  if (!digitalHuman) $("commonSettingsPanel").syncNormalModelFields?.();
}

installDigitalHumanSwitch();
installSettingsPanel();
syncSettingsPanels();

const parseDocumentBeforeDigitalHuman = parseDocument;
parseDocument = function () {
  parseDocumentBeforeDigitalHuman();
  if ($("useDigitalHuman")?.checked && groups.length && $("componentMode")) $("componentMode").value = "groups";
};
$("parseBtn").onclick = parseDocument;

const validateBeforeDigitalHuman = validate;
validate = function (show = true) {
  const errors = validateBeforeDigitalHuman(false);
  if (!$("useDigitalHuman")?.checked && $("useCommonModel")?.checked) {
    if (!$("commonModelId").value.trim()) errors.push("请填写公共模型 ID");
    if (!$("commonModelVersion").value.trim()) errors.push("请填写公共模型版本号");
    const mediaType = normalizeMediaType($("commonMediaType").value);
    if (!mediaType) errors.push("请选择图片 type 1 或视频 type 2");
    if (mediaType === "1" && !["1", "2", "3", "4"].includes($("commonDefaultCount").value)) errors.push("请选择图片默认生成张数（1–4）");
  }
  if (show && errors.length) status("generateStatus", errors.slice(0, 6).join("；") + (errors.length > 6 ? `；共 ${errors.length} 处` : ""), "err");
  return errors;
};

const configBeforeDigitalHuman = config;
config = function () {
  const rawData = configBeforeDigitalHuman();
  const digitalHuman = $("useDigitalHuman")?.checked === true;
  const useCommonModel = $("useCommonModel")?.checked === true;
  const modelId = $("commonModelId")?.value.trim() || "";
  const modelVersion = $("commonModelVersion")?.value.trim() || "";
  const mediaType = normalizeMediaType($("commonMediaType")?.value);
  const defaultCount = Number($("commonDefaultCount")?.value || 1);
  const includePrompt = $("commonIncludePrompt")?.value === "true";
  const btnText = $("commonBtnText")?.value.trim() || "";

  return rawData.map(component => ({
    sort: component.sort,
    title: "",
    desc: "",
    platform: "ALL",
    type: component.type,
    expand: true,
    content: component.content.map(entry => {
      const output = { ...entry };
      if (digitalHuman) {
        output.modelId = "";
        output.modelVersion = "";
        output.type = "";
        output.defaultCount = 1;
        output.btnText = btnText;
        output.isIncludePrompt = includePrompt;
      } else {
        output.btnText = "";
        output.isIncludePrompt = false;
        if (useCommonModel) {
          output.modelId = modelId;
          output.modelVersion = modelVersion;
          output.type = mediaType;
          if (mediaType === "1") output.defaultCount = defaultCount;
          else delete output.defaultCount;
        }
      }
      return output;
    }),
    component_id: component.component_id,
    is_tab: digitalHuman,
    loading: false
  }));
};

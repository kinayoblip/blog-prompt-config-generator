function installHtmlPromptImporter() {
  const source = $("source");
  if (!source || $("htmlPromptImportPanel")) return;

  const panel = document.createElement("div");
  panel.id = "htmlPromptImportPanel";
  panel.style.cssText = "margin:12px 0;padding:14px;border:2px dashed var(--line);border-radius:10px;background:#fbfcfe;transition:.15s";
  panel.innerHTML = '<div id="htmlPromptDrop" style="cursor:pointer;text-align:center;padding:8px"><b>拖入 HTML 文档，自动提取 H3 分组和提示词</b><div class="hint" style="margin-top:4px">也可以把 HTML 文件拖到页面任意位置；识别 h3 分类、h4 标题、pre 提示词和图片 alt。</div><input id="htmlPromptInput" type="file" accept=".html,.htm,text/html" style="display:none"></div><div id="htmlPromptStatus" class="status"></div>';
  source.insertAdjacentElement("beforebegin", panel);

  const drop = $("htmlPromptDrop");
  const input = $("htmlPromptInput");
  const handleFiles = files => {
    const file = files[0];
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      status("htmlPromptStatus", "请选择 HTML 文件。", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => importHtmlPromptDocument(String(reader.result || ""), file.name);
    reader.onerror = () => status("htmlPromptStatus", "HTML 文件读取失败。", "err");
    reader.readAsText(file, "UTF-8");
  };
  drop.onclick = () => input.click();
  input.onchange = () => handleFiles([...input.files]);
  source.addEventListener("input", () => {
    const statusNode = $("htmlPromptStatus");
    if (statusNode) {
      statusNode.textContent = "";
      statusNode.className = "status";
    }
  });
  const setDragState = active => {
    panel.style.borderColor = active ? "var(--p)" : "var(--line)";
    panel.style.background = active ? "#f0efff" : "#fbfcfe";
  };
  const isFileDrag = event => [...(event.dataTransfer?.types || [])].includes("Files");
  const hasHtmlFile = event => [...(event.dataTransfer?.files || [])].some(file => /\.html?$/i.test(file.name) || file.type === "text/html");
  const isImageDrop = target => target instanceof Element && target.closest("#imageDrop");
  document.addEventListener("dragover", event => {
    if (!isFileDrag(event) || isImageDrop(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragState(hasHtmlFile(event));
  }, true);
  document.addEventListener("dragleave", event => {
    if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) setDragState(false);
  }, true);
  document.addEventListener("drop", event => {
    if (!isFileDrag(event) || isImageDrop(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragState(false);
    handleFiles([...(event.dataTransfer?.files || [])]);
  }, true);
  drop.ondragover = event => { if(!isFileDrag(event)) return; event.preventDefault(); event.stopPropagation(); setDragState(true); };
  drop.ondragleave = event => { event.preventDefault(); setDragState(false); };
  drop.ondrop = event => { if(!isFileDrag(event)) return; event.preventDefault(); event.stopPropagation(); setDragState(false); handleFiles([...event.dataTransfer.files]); };
}

function htmlText(element) {
  return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

const htmlFieldAliases = {
  title: ["标题", "提示词标题", "提示词小标题", "小标题", "title", "prompt title", "prompt subtitle", "subtitle", "título", "subtítulo", "titre", "sous-titre", "titulo", "subtitulo", "заголовок", "подзаголовок", "タイトル", "小見出し", "題名", "제목", "소제목"],
  prompt: ["提示词", "提示词内容", "提示词正文", "prompt", "prompt text", "prompt content", "prompt description", "instrucción", "instrucciones", "texte du prompt", "contenu du prompt", "texto do prompt", "conteúdo do prompt", "промпт", "текст промпта", "запрос", "プロンプト", "プロンプト文", "プロンプト内容", "指示文", "프롬프트", "프롬프트 내용"],
  alt: ["图片alt", "图片 alt", "图片alt标签", "图片 alt 标签", "alt", "alt标签", "alt 标签", "alt text", "alt label", "image alt", "image alt text", "texto alternativo", "etiqueta alt", "texto alt", "texte alternatif", "texte alt", "texto alternativo da imagem", "texto alt da imagem", "альтернативный текст", "alt-текст", "画像alt", "画像のalt", "画像altタグ", "代替テキスト", "대체 텍스트", "이미지 alt", "alt 태그"]
};

function normalizeHtmlLabel(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[：:：\-_]/g, " ").replace(/\s+/g, " ").trim();
}

function htmlFieldKey(value) {
  const raw = String(value || "").trim();
  const label = normalizeHtmlLabel(raw);
  const hasLabelSeparator = /[:：\-]/.test(raw);
  for (const [key, aliases] of Object.entries(htmlFieldAliases)) {
    if (aliases.some(alias => label === normalizeHtmlLabel(alias) || (hasLabelSeparator && label.startsWith(`${normalizeHtmlLabel(alias)} `)))) return key;
  }
  return "";
}

function htmlFieldValue(labelNode) {
  const parent = labelNode.parentElement;
  const sibling = labelNode.nextElementSibling;
  if (sibling && !htmlFieldKey(sibling.textContent)) return String(sibling.textContent || "").trim();
  if (parent) {
    const values = [...parent.children].filter(child => child !== labelNode && !htmlFieldKey(child.textContent));
    if (values.length) return values.map(child => child.textContent || "").join("\n").trim();
  }
  return "";
}

function extractLabeledHtmlGroups(documentData) {
  const labelNodes = [...documentData.querySelectorAll("*")].filter(node => htmlFieldKey(node.textContent) && node.children.length === 0);
  const rows = [];
  const used = new Set();
  labelNodes.forEach(labelNode => {
    let container = labelNode.parentElement;
    for (let depth = 0; container && depth < 6; depth++, container = container.parentElement) {
      const labels = [...container.querySelectorAll("*")].filter(node => node.children.length === 0 && htmlFieldKey(node.textContent));
      const keys = new Set(labels.map(node => htmlFieldKey(node.textContent)));
      if (!keys.has("title") || !keys.has("prompt") || !keys.has("alt")) continue;
      const fields = { title: "", prompt: "", alt: "" };
      labels.forEach(node => { const key = htmlFieldKey(node.textContent); if (!fields[key]) fields[key] = htmlFieldValue(node); });
      if (!fields.title || !fields.prompt || !fields.alt || used.has(container)) break;
      used.add(container);
      rows.push({ container, fields });
      break;
    }
  });
  if (!rows.length) return [];
  const groups = [];
  rows.forEach(row => {
    let heading = "未分类提示词";
    let ancestor = row.container.parentElement;
    while (ancestor) {
      const headingNode = [...ancestor.children].reverse().find(node => /^H[2-3]$/i.test(node.tagName) && htmlText(node));
      if (headingNode) { heading = htmlText(headingNode); break; }
      ancestor = ancestor.parentElement;
    }
    let group = groups.find(groupData => groupData.heading === heading);
    if (!group) { group = { heading, items: [] }; groups.push(group); }
    group.items.push({ title: row.fields.title, prompt: row.fields.prompt, alt: row.fields.alt });
  });
  return groups;
}

function extractHtmlPromptGroups(html) {
  const documentData = new DOMParser().parseFromString(html, "text/html");
  const cards = [...documentData.querySelectorAll(".prompt-card")];
  if (!cards.length) return extractLabeledHtmlGroups(documentData);
  const groupsByHeading = [];
  let currentGroup = null;
  const orderedNodes = [...documentData.querySelectorAll("h2,h3,.prompt-card")];
  orderedNodes.forEach(element => {
    if (element.matches("h2,h3") && !element.closest(".prompt-card")) {
      currentGroup = { heading: htmlText(element), cards: [] };
      groupsByHeading.push(currentGroup);
      return;
    }
    if (!element.matches(".prompt-card")) return;
    if (!currentGroup) {
      currentGroup = { heading: "未分类提示词", cards: [] };
      groupsByHeading.push(currentGroup);
    }
    currentGroup.cards.push(element);
  });
  const structuredGroups = groupsByHeading.filter(groupData => groupData.cards.length).map(groupData => ({
    heading: groupData.heading,
    items: groupData.cards.map(card => {
      const titleNode = card.querySelector("h4,h3");
      const title = htmlText(titleNode);
      const promptNode = card.querySelector("pre") || [...card.children].find(node => node.matches("p"));
      const prompt = String(promptNode?.textContent || "").trim();
      const altNode = promptNode?.nextElementSibling?.matches("p") ? promptNode.nextElementSibling : null;
      const alt = htmlText(altNode) || title;
      return { title, prompt, alt };
    }).filter(itemData => itemData.title && itemData.prompt)
  })).filter(groupData => groupData.items.length);
  if (structuredGroups.reduce((total, groupData) => total + groupData.items.length, 0)) return structuredGroups;
  return extractLoosePromptGroups(documentData);
}

function extractLoosePromptGroups(documentData) {
  const groups = [];
  let currentHeading = "未分类提示词";
  [...documentData.querySelectorAll("h2,h3")].forEach(node => {
    if (node.matches("h2") || !node.closest(".prompt-card")) {
      if (node.matches("h2")) currentHeading = htmlText(node);
      return;
    }
    const title = htmlText(node);
    if (!/^\s*\d+[.、)]\s*/.test(title)) return;
    const card = node.closest(".prompt-card");
    let promptNode = node.nextElementSibling || card?.nextElementSibling;
    while (promptNode && !["P", "PRE"].includes(promptNode.tagName)) promptNode = promptNode.nextElementSibling;
    const prompt = String(promptNode?.textContent || "").trim();
    if (!prompt) return;
    let group = groups.find(groupData => groupData.heading === currentHeading);
    if (!group) { group = { heading: currentHeading, items: [] }; groups.push(group); }
    group.items.push({ title, prompt, alt: title.replace(/^\s*\d+[.、)]\s*/, "").trim() });
  });
  return groups.filter(groupData => groupData.items.length);
}

function importHtmlPromptDocument(html, fileName) {
  const extractedGroups = extractHtmlPromptGroups(html);
  if (!extractedGroups.length) {
    status("htmlPromptStatus", "没有找到提示词卡片（需要 h3 分类、h4 标题、pre 提示词）。", "err");
    return;
  }
  const lines = [];
  extractedGroups.forEach((groupData, groupIndex) => {
    lines.push(String(groupIndex + 1));
    groupData.items.forEach(itemData => {
      lines.push(itemData.title, itemData.prompt, itemData.alt, "");
    });
  });
  source.value = lines.join("\n").trim();
  if ($("componentMode")) $("componentMode").value = "groups";
  parseDocument();
  status("htmlPromptStatus", `已从 ${fileName} 识别 ${extractedGroups.length} 个 H3 分组、${extractedGroups.reduce((total, groupData) => total + groupData.items.length, 0)} 条提示词，并已自动选择按数字分组。`, "ok");
}

installHtmlPromptImporter();

// Use Unicode escapes so multilingual field labels remain stable after editing or publishing.
const stableHtmlFieldLabels = {
  title: ["\u6807\u9898", "\u63d0\u793a\u8bcd\u6807\u9898", "\u63d0\u793a\u8bcd\u5c0f\u6807\u9898", "\u5c0f\u6807\u9898", "title", "prompt title", "prompt subtitle", "subtitle", "t\u00edtulo", "subt\u00edtulo", "titre", "sous titre", "titulo", "subtitulo", "\u30bf\u30a4\u30c8\u30eb", "\u5c0f\u898b\u51fa\u3057", "\uc81c\ubaa9", "\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435"],
  prompt: ["\u63d0\u793a\u8bcd", "\u63d0\u793a\u8bcd\u5185\u5bb9", "\u63d0\u793a\u8bcd\u6b63\u6587", "\u63d0\u793a\u8a5e", "\u63d0\u793a\u8a5e\u5185\u5bb9", "\u63d0\u793a\u8a5e\u6b63\u6587", "prompt", "prompt text", "prompt content", "prompt description", "instrucci\u00f3n", "instrucciones", "texte du prompt", "contenu du prompt", "texto do prompt", "conte\u00fado do prompt", "\u30d7\u30ed\u30f3\u30d7\u30c8", "\u30d7\u30ed\u30f3\u30d7\u30c8\u6587", "\u30d7\u30ed\u30f3\u30d7\u30c8\u5185\u5bb9", "\ud504\ub86c\ud504\ud2b8", "\uc9c0\uc2dc\ubb38", "\u043f\u0440\u043e\u043c\u043f\u0442"],
  alt: ["\u56fe\u7247alt", "\u56fe\u7247 alt", "\u56fe\u7247alt\u6807\u7b7e", "\u56fe\u7247 alt \u6807\u7b7e", "alt", "alt\u6807\u7b7e", "alt \u6807\u7b7e", "alt text", "alt label", "image alt", "image alt text", "texto alternativo", "etiqueta alt", "texto alt", "texte alternatif", "texte alt", "texto alternativo da imagem", "texto alt da imagem", "\u753b\u50cfalt", "\u753b\u50cf alt", "\u753b\u50cfalt\u30bf\u30b0", "\u4ee3\u66ff\u30c6\u30ad\u30b9\u30c8", "\uc774\ubbf8\uc9c0 alt", "\ub300\uccb4 \ud14d\uc2a4\ud2b8", "\u0430\u043b\u044c\u0442\u0435\u0440\u043d\u0430\u0442\u0438\u0432\u043d\u044b\u0439 \u0442\u0435\u043a\u0441\u0442", "alt \u0442\u0435\u043a\u0441\u0442"]
};

const normalizeStableHtmlLabel = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s:\uFF1A_-]+/g, "");
htmlFieldKey = function (value) {
  const raw = String(value || "").trim();
  const normalized = normalizeStableHtmlLabel(raw);
  const hasSeparator = /[:\uFF1A-]/.test(raw);
  for (const [key, labels] of Object.entries(stableHtmlFieldLabels)) {
    if (labels.some(label => {
      const expected = normalizeStableHtmlLabel(label);
      return normalized === expected || (hasSeparator && normalized.startsWith(expected));
    })) return key;
  }
  return "";
};

function extractEntryLabeledPromptGroups(documentData) {
  const groups = [];
  let currentGroup = null;
  const startGroup = heading => {
    currentGroup = { heading: htmlText(heading), items: [] };
    groups.push(currentGroup);
  };
  [...documentData.querySelectorAll("h2,.entry")].forEach(node => {
    if (node.matches("h2")) {
      startGroup(node);
      return;
    }
    const labels = [...node.querySelectorAll("*")].filter(child => child.children.length === 0 && htmlFieldKey(child.textContent));
    const fields = { title: "", prompt: "", alt: "" };
    labels.forEach(label => {
      const key = htmlFieldKey(label.textContent);
      if (key && !fields[key]) fields[key] = htmlFieldValue(label);
    });
    if (!fields.title || !fields.prompt) return;
    if (!currentGroup) startGroup("未分类提示词");
    currentGroup.items.push({ title: fields.title, prompt: fields.prompt, alt: fields.alt || fields.title });
  });
  return groups.filter(groupData => groupData.items.length);
}

const extractHtmlPromptGroupsBeforeEntryLabels = extractHtmlPromptGroups;
extractHtmlPromptGroups = function (html) {
  const documentData = new DOMParser().parseFromString(html, "text/html");
  const entryGroups = extractEntryLabeledPromptGroups(documentData);
  return entryGroups.length ? entryGroups : extractHtmlPromptGroupsBeforeEntryLabels(html);
};

const parseDocumentBeforeManualNumberCleanup = parseDocument;
parseDocument = function () {
  const sourceText = $("source")?.value || "";
  const mode = $("componentMode")?.value;
  if (mode !== "groups") {
    const cleaned = sourceText.replace(/^\s*\d+\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
    if (cleaned !== sourceText.trim()) $("source").value = cleaned;
  }
  parseDocumentBeforeManualNumberCleanup();
};
$("parseBtn").onclick = parseDocument;

const parseDocumentBeforeStatusSummary = parseDocument;
parseDocument = function () {
  parseDocumentBeforeStatusSummary();
  if (!groups.length) return;
  const itemCount = allItems().length;
  const mode = $("componentMode")?.value || "merge";
  const componentCount = mode === "split" ? itemCount : mode === "groups" ? groups.length : (itemCount ? 1 : 0);
  const issues = validate(false);
  status("parseStatus", `已识别 ${componentCount} 个分组、${itemCount} 条提示词。${issues.length ? `有 ${issues.length} 处需检查。` : ""}`, issues.length ? "err" : "ok");
};
$("parseBtn").onclick = parseDocument;

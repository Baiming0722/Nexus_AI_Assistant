// chat_core.js - Core behavior for the real-time chat page.
// The script intentionally uses vanilla JavaScript so the chat screen stays
// lightweight and can run without a frontend build step.

const socket = io();

let user = null;
let loadingBubble = null;
let statusAlertTimer = null;
let dragCounter = 0;
let pendingAttachments = [];
let currentHistoryFile = null;

const ACCEPTED_TEXT_EXTS = ['txt', 'json', 'md'];
const ACCEPTED_IMAGE_EXTS = ['jpg', 'jpeg', 'png'];
const ACCEPTED_PDF_EXTS = ['pdf'];
const MOBILE_BREAKPOINT = 861;

const dom = {
  messages: document.getElementById('messages'),
  messagesViewport: document.getElementById('messagesViewport'),
  input: document.getElementById('input'),
  form: document.getElementById('form'),
  submitBtn: document.getElementById('submitBtn'),
  username: document.getElementById('username'),
  sidebar: document.getElementById('sidebar'),
  toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  newChatBtn: document.getElementById('newChatBtn'),
  deleteChatBtn: document.getElementById('deleteChatBtn'),
  modelSelect: document.getElementById('modelSelect'),
  refreshHistoryBtn: document.getElementById('refreshHistoryBtn'),
  historyList: document.getElementById('historyList'),
  statusAlert: document.getElementById('statusAlert'),
  statusAlertText: document.getElementById('statusAlertText'),
  toolStatusBar: document.getElementById('toolStatusBar'),
  toolStatusText: document.getElementById('toolStatusText'),
  attachBtn: document.getElementById('attachBtn'),
  fileInput: document.getElementById('fileInput'),
  attachmentList: document.getElementById('attachmentList'),
  dropOverlay: document.getElementById('dropOverlay'),
  connectionStatus: document.getElementById('connectionStatus'),
};

/**
 * Create an element with optional classes, attributes, and text.
 * This small helper keeps DOM construction readable without using innerHTML.
 */
function createElement(tagName, options = {}) {
  const el = document.createElement(tagName);

  if (options.className) el.className = options.className;
  if (options.text !== undefined) el.textContent = options.text;

  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) el.setAttribute(key, String(value));
    });
  }

  return el;
}

/**
 * Escape text before placing it in a fallback HTML fragment.
 * The normal plain-text path uses text nodes, but markdown fallback needs HTML.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Convert markdown to sanitized HTML.
 * If markdown or DOMPurify is unavailable, the function gracefully falls back
 * to escaped text with line breaks instead of injecting unsanitized markup.
 */
function parseMarkdownSafe(text) {
  const source = String(text ?? '');

  try {
    if (typeof marked === 'undefined') {
      return `<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
    }

    const rawHtml = typeof marked.parse === 'function'
      ? marked.parse(source, { breaks: true })
      : marked(source, { breaks: true });

    return typeof DOMPurify !== 'undefined'
      ? DOMPurify.sanitize(rawHtml)
      : `<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
  } catch (err) {
    console.error('Markdown parse error:', err);
    return `<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
  }
}

/**
 * Render plain text with preserved line breaks using text nodes.
 * Avoiding innerHTML here keeps outgoing messages safe by default.
 */
function appendTextWithBreaks(container, text) {
  String(text ?? '').split('\n').forEach((line, index) => {
    if (index > 0) container.appendChild(document.createElement('br'));
    container.appendChild(document.createTextNode(line));
  });
}

function scrollMessagesToBottom(behavior = 'smooth') {
  if (!dom.messagesViewport) return;
  dom.messagesViewport.scrollTo({
    top: dom.messagesViewport.scrollHeight,
    behavior,
  });
}

function formatMessageTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function setConnectionState(state, label) {
  if (!dom.connectionStatus) return;

  dom.connectionStatus.textContent = label;
  dom.connectionStatus.classList.toggle('is-online', state === 'online');
  dom.connectionStatus.classList.toggle('is-offline', state === 'offline');
}

function setDivider(text) {
  if (!dom.messages) return;
  dom.messages.replaceChildren(createElement('li', {
    className: 'message-divider',
    text,
  }));
}

function isMobileViewport() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Toggle the mobile sidebar and keep ARIA attributes synchronized.
 * Desktop keeps the sidebar visible through CSS and ignores the open state.
 */
function setSidebarOpen(isOpen) {
  if (!dom.sidebar || !dom.sidebarOverlay) return;

  dom.sidebar.classList.toggle('is-open', isOpen);
  dom.sidebarOverlay.classList.toggle('is-visible', isOpen);
  dom.sidebarOverlay.setAttribute('aria-hidden', String(!isOpen));
  dom.toggleSidebarBtn?.setAttribute('aria-expanded', String(isOpen));
}

function closeSidebarOnMobile() {
  if (isMobileViewport()) setSidebarOpen(false);
}

function showStatusAlert(text) {
  if (!dom.statusAlert || !dom.statusAlertText) return;

  window.clearTimeout(statusAlertTimer);
  dom.statusAlertText.textContent = text;
  dom.statusAlert.classList.add('is-visible');

  statusAlertTimer = window.setTimeout(() => {
    dom.statusAlert?.classList.remove('is-visible');
  }, 3000);
}

function setComposerBusy(isBusy) {
  dom.form?.setAttribute('aria-busy', String(isBusy));
  if (dom.submitBtn) dom.submitBtn.disabled = isBusy;
  if (dom.attachBtn) dom.attachBtn.disabled = isBusy;
}

function resizeInput() {
  if (!dom.input) return;

  dom.input.style.height = 'auto';
  dom.input.style.height = `${Math.min(dom.input.scrollHeight, 200)}px`;
  dom.input.style.overflowY = dom.input.scrollHeight > 200 ? 'auto' : 'hidden';
}

/**
 * Build the loading bubble shown while waiting for an assistant response.
 * The bubble is also reused by tool-status events to display live progress.
 */
function createLoadingIndicator() {
  if (!dom.messages) return null;

  const item = createElement('li', {
    className: 'message message--incoming',
    attrs: { 'aria-live': 'polite' },
  });
  const bubble = createElement('div', {
    className: 'message__bubble loading-bubble',
    attrs: { 'aria-label': '系統正在回覆' },
  });

  for (let i = 0; i < 3; i += 1) {
    bubble.appendChild(createElement('span', {
      className: 'loading-dot',
      attrs: { 'aria-hidden': 'true' },
    }));
  }

  item.appendChild(bubble);
  dom.messages.appendChild(item);
  scrollMessagesToBottom();
  return item;
}

/**
 * Add one message to the conversation.
 * Incoming assistant messages can render markdown; outgoing messages remain
 * plain text because they are user-generated and should not execute markup.
 */
function addMessage(sender, text, type, isMarkdown = false) {
  if (!dom.messages) return;

  const safeType = type === 'outgoing' ? 'outgoing' : 'incoming';
  const item = createElement('li', {
    className: `message message--${safeType}`,
  });
  const bubble = createElement('article', {
    className: `message__bubble ${safeType === 'incoming' ? 'prose dark:prose-invert' : ''}`,
  });
  const senderEl = createElement('div', {
    className: 'message__sender',
    text: sender,
  });
  const timeEl = createElement('time', {
    className: 'message__time',
    text: formatMessageTime(),
    attrs: { datetime: new Date().toISOString() },
  });
  const metaEl = createElement('div', {
    className: 'message__meta',
  });
  const textEl = createElement('div', {
    className: 'message__content',
  });

  if (isMarkdown && safeType === 'incoming') {
    textEl.innerHTML = parseMarkdownSafe(text);

    if (typeof hljs !== 'undefined') {
      try {
        textEl.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
      } catch (err) {
        console.error('Highlighting error:', err);
      }
    }
  } else {
    appendTextWithBreaks(textEl, text);
  }

  metaEl.append(senderEl, timeEl);
  bubble.append(metaEl, textEl);
  item.appendChild(bubble);
  dom.messages.appendChild(item);
  scrollMessagesToBottom();
}

function clearLoadingState() {
  if (loadingBubble?.parentNode) loadingBubble.parentNode.removeChild(loadingBubble);
  loadingBubble = null;
  hideToolStatus();
}

function updateToolStatus(message) {
  if (dom.toolStatusBar && dom.toolStatusText) {
    dom.toolStatusText.textContent = message || '正在處理...';
    dom.toolStatusBar.classList.add('is-visible');
  }

  if (!loadingBubble) return;

  let statusLabel = loadingBubble.querySelector('.tool-status-label');
  if (!statusLabel) {
    statusLabel = createElement('span', { className: 'tool-status-label' });
    loadingBubble.querySelector('.message__bubble')?.appendChild(statusLabel);
  }

  statusLabel.textContent = message || '正在處理...';
}

function hideToolStatus() {
  dom.toolStatusBar?.classList.remove('is-visible');
}

function getAttachmentType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ACCEPTED_IMAGE_EXTS.includes(ext)) return 'image';
  if (ACCEPTED_PDF_EXTS.includes(ext)) return 'pdf';
  if (ACCEPTED_TEXT_EXTS.includes(ext)) return 'text';
  return null;
}

function getAttachmentKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function attachmentIconSvg(type) {
  const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"';

  if (type === 'image') {
    return `<svg ${common}><path d="M5 5h14v14H5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m7.5 16 3.2-3.2 2.2 2.2 1.4-1.4L17 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/></svg>`;
  }

  if (type === 'pdf') {
    return `<svg ${common}><path d="M7 3h7l4 4v14H7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v5h5M9 16h6M9 12h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  return `<svg ${common}><path d="M7 3h10v18H7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function getAttachmentTypeLabel(type) {
  if (type === 'image') return 'IMG';
  if (type === 'pdf') return 'PDF';
  return 'TXT';
}

/**
 * Add user-selected files to the outgoing queue.
 * Files are de-duplicated by name, size, and last-modified timestamp so users
 * can reopen the picker without accidentally sending the same file twice.
 */
function addFilesToQueue(files) {
  files.forEach((file) => {
    const type = getAttachmentType(file.name);

    if (!type) {
      showStatusAlert(`不支援的附件類型：${file.name}`);
      return;
    }

    const key = getAttachmentKey(file);
    if (pendingAttachments.some((attachment) => attachment.key === key)) return;

    pendingAttachments.push({
      key,
      file,
      type,
      name: file.name,
    });
  });

  renderAttachmentList();
}

function renderAttachmentList() {
  if (!dom.attachmentList) return;

  dom.attachmentList.replaceChildren();
  dom.attachmentList.classList.toggle('is-visible', pendingAttachments.length > 0);

  pendingAttachments.forEach((attachment, index) => {
    const chip = createElement('div', {
      className: 'attachment-chip',
      attrs: { title: attachment.name },
    });
    const icon = createElement('span', { attrs: { 'aria-hidden': 'true' } });
    const name = createElement('span', {
      className: 'attachment-chip__name',
      text: attachment.name,
    });
    const typeLabel = createElement('span', {
      className: 'attachment-chip__type',
      text: getAttachmentTypeLabel(attachment.type),
    });
    const removeBtn = createElement('button', {
      className: 'attachment-chip__remove',
      attrs: {
        type: 'button',
        'aria-label': `移除附件 ${attachment.name}`,
      },
    });

    icon.innerHTML = attachmentIconSvg(attachment.type);
    removeBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    removeBtn.addEventListener('click', () => {
      pendingAttachments.splice(index, 1);
      renderAttachmentList();
    });

    chip.append(icon, typeLabel, name, removeBtn);
    dom.attachmentList.appendChild(chip);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('讀取失敗'));
    reader.readAsText(file, 'utf-8');
  });
}

function readFileAsBase64(file, forceMimeType = null) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const [header, base64] = dataUrl.split(',');
      const mimeType = forceMimeType || header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error('讀取失敗'));
    reader.readAsDataURL(file);
  });
}

/**
 * Read queued attachments into the payload shape expected by the server.
 * Text-like files become text blocks, while images and binary PDFs are base64.
 */
async function readAttachments() {
  const result = { texts: [], images: [] };

  for (const attachment of pendingAttachments) {
    try {
      if (attachment.type === 'text') {
        const content = await readFileAsText(attachment.file);
        result.texts.push({ name: attachment.name, content });
        continue;
      }

      if (attachment.type === 'image') {
        const { base64, mimeType } = await readFileAsBase64(attachment.file);
        result.images.push({ name: attachment.name, base64, mimeType });
        continue;
      }

      // PDF text extraction in browsers is limited without a dedicated parser.
      // Try UTF-8 text first; if that is not meaningful, pass the PDF as base64.
      try {
        const content = await readFileAsText(attachment.file);
        if (content && content.trim().length > 10) {
          result.texts.push({ name: attachment.name, content: `[PDF 文字內容]\n${content}` });
        } else {
          throw new Error('PDF text content is empty');
        }
      } catch {
        const { base64, mimeType } = await readFileAsBase64(attachment.file, 'application/pdf');
        result.images.push({ name: attachment.name, base64, mimeType });
      }
    } catch (err) {
      console.error(`[附件] 讀取 ${attachment.name} 失敗:`, err);
      showStatusAlert(`附件讀取失敗：${attachment.name}`);
    }
  }

  return result;
}

function buildOutgoingDisplayMessage(message) {
  if (pendingAttachments.length === 0) return message;

  const names = pendingAttachments.map((attachment) => attachment.name).join(', ');
  return `${message ? `${message}\n` : ''}附件: ${names}`;
}

function getHistoryDisplayName(fileName) {
  return String(fileName || '').replace(/\.(json|txt|md)$/i, '') || '未命名對話';
}

/**
 * 根據 indexMap 與當前使用者 ID，過濾出屬於該使用者的歷史檔案集合。
 * 前端過濾邏輯的核心：只顯示 channelId 為 "web_{userId}" 的記憶，
 * 排除 Discord 頻道記憶（channelId 不含 "web_" 前綴）和其他使用者的記憶。
 *
 * @param {string[]} files   - 所有歷史檔案名稱陣列
 * @param {Object}   indexMap - index.json 內容（channelId → fileName）
 * @returns {string[]} 過濾後屬於當前使用者的檔案名稱陣列
 */
function filterHistoryByCurrentUser(files, indexMap) {
  const userId = user?.userinfo?.id;

  // 使用者尚未登入或無法取得 ID，安全起見回傳空陣列
  if (!userId) {
    console.warn('[記憶過濾] 使用者 ID 不存在，拒絕載入任何記憶');
    return [];
  }

  const ownChannelId = `web_${userId}`;

  // 從 indexMap 中收集屬於當前使用者的所有 fileName（一個使用者可能有多個歷史檔案）
  const allowedFileNames = new Set(
    Object.entries(indexMap)
      .filter(([channelId]) => channelId === ownChannelId)
      .map(([, fileName]) => fileName)
  );

  const filtered = files.filter((fileName) => allowedFileNames.has(fileName));

  console.info(
    `[記憶過濾] 使用者 ${userId}：全部 ${files.length} 筆，屬於自己 ${filtered.length} 筆`
  );

  return filtered;
}

function renderHistoryList(files, indexMap = {}) {
  if (!dom.historyList) return;

  // 在渲染前先過濾，只顯示當前使用者自己的歷史記憶
  const ownFiles = filterHistoryByCurrentUser(files, indexMap);

  dom.historyList.replaceChildren();

  if (!Array.isArray(ownFiles) || ownFiles.length === 0) {
    dom.historyList.appendChild(createElement('li', {
      className: 'history-empty',
      text: '無對話紀錄',
    }));
    return;
  }

  [...ownFiles].sort((a, b) => b.localeCompare(a)).forEach((fileName) => {
    const item = createElement('li');
    const button = createElement('button', {
      className: 'history-item',
      attrs: {
        type: 'button',
        title: fileName,
      },
    });
    const name = createElement('span', {
      className: 'history-item__name',
      text: getHistoryDisplayName(fileName),
    });
    const meta = createElement('span', {
      className: 'history-item__meta',
      text: '已保存的對話',
    });

    if (fileName === currentHistoryFile) {
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'true');
    }

    button.addEventListener('click', () => {
      currentHistoryFile = fileName;
      socket.emit('load_history', fileName);
      setDivider('載入紀錄中...');
      renderHistoryList(files, indexMap);
      closeSidebarOnMobile();
    });

    button.append(name, meta);
    item.appendChild(button);
    dom.historyList.appendChild(item);
  });
}

function renderHistoryData(historyArr) {
  setDivider('歷史紀錄');

  if (!Array.isArray(historyArr)) return;

  historyArr.forEach((message) => {
    if (message.role === 'user') {
      let content = message.content;

      if (Array.isArray(message.content)) {
        const textObj = message.content.find((item) => item.type === 'text');
        content = textObj ? textObj.text : '【多媒體檔案】';
      }

      let displayContent = content;
      if (typeof content === 'string' && content.includes('] 說：\n')) {
        displayContent = content.split('] 說：\n').slice(1).join('] 說：\n');
      }

      addMessage(message.name || message.originalName || 'User', displayContent, 'outgoing', false);
      return;
    }

    if (message.role === 'assistant') {
      addMessage('系統', message.content, 'incoming', true);
    }
  });
}

function initializeInputInteractions() {
  dom.input?.addEventListener('input', resizeInput);

  dom.input?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;

    if (event.ctrlKey || event.shiftKey) {
      window.requestAnimationFrame(resizeInput);
      return;
    }

    event.preventDefault();
    if (dom.input.value.trim() || pendingAttachments.length > 0) {
      dom.form?.requestSubmit();
    }
  });

  resizeInput();
}

function initializeSidebarInteractions() {
  dom.toggleSidebarBtn?.addEventListener('click', () => {
    const isOpen = !dom.sidebar?.classList.contains('is-open');
    setSidebarOpen(isOpen);
  });
  dom.closeSidebarBtn?.addEventListener('click', () => setSidebarOpen(false));
  dom.sidebarOverlay?.addEventListener('click', () => setSidebarOpen(false));

  window.addEventListener('resize', () => {
    if (!isMobileViewport()) setSidebarOpen(false);
  });
}

function initializeToolbarActions() {
  dom.newChatBtn?.addEventListener('click', () => {
    currentHistoryFile = null;
    socket.emit('new_chat');
    setDivider('開始新聊天');
    closeSidebarOnMobile();
  });

  dom.deleteChatBtn?.addEventListener('click', () => {
    if (!window.confirm('確定要刪除當前對話紀錄嗎？')) return;

    socket.emit('delete_history');
    currentHistoryFile = null;
    setDivider('紀錄已刪除');
    closeSidebarOnMobile();
  });

  dom.refreshHistoryBtn?.addEventListener('click', () => {
    socket.emit('get_history_list');
  });

  dom.modelSelect?.addEventListener('change', (event) => {
    if (event.target.value) socket.emit('set_model', event.target.value);
  });
}

function initializeAttachmentInteractions() {
  dom.attachBtn?.addEventListener('click', () => dom.fileInput?.click());

  dom.fileInput?.addEventListener('change', (event) => {
    addFilesToQueue([...event.target.files]);
    event.target.value = '';
  });

  document.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;

    dragCounter += 1;
    dom.dropOverlay?.classList.add('is-visible');
    dom.dropOverlay?.setAttribute('aria-hidden', 'false');
  });

  document.addEventListener('dragleave', () => {
    dragCounter -= 1;
    if (dragCounter > 0) return;

    dragCounter = 0;
    dom.dropOverlay?.classList.remove('is-visible');
    dom.dropOverlay?.setAttribute('aria-hidden', 'true');
  });

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    event.preventDefault();
    dragCounter = 0;
    dom.dropOverlay?.classList.remove('is-visible');
    dom.dropOverlay?.setAttribute('aria-hidden', 'true');

    const droppedFiles = [...(event.dataTransfer?.files || [])];
    if (droppedFiles.length > 0) addFilesToQueue(droppedFiles);
  });
}

function initializeFormSubmission() {
  dom.form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const message = dom.input?.value.trim() || '';
    if (!message && pendingAttachments.length === 0) return;

    const uid = user?.userinfo?.id || null;
    const globalName = user?.userinfo?.global_name || 'User';
    const displayMessage = buildOutgoingDisplayMessage(message || '（附件）');

    setComposerBusy(true);

    try {
      const attachmentData = pendingAttachments.length > 0 ? await readAttachments() : null;

      socket.emit('chat', message, globalName, uid, attachmentData);
      addMessage(globalName, displayMessage, 'outgoing', false);
      loadingBubble = createLoadingIndicator();

      pendingAttachments = [];
      renderAttachmentList();

      if (dom.input) {
        dom.input.value = '';
        resizeInput();
        dom.input.focus();
      }
    } finally {
      setComposerBusy(false);
    }
  });
}

function initializeSocketEvents() {
  setConnectionState('checking', '連線檢查中');
  socket.emit('get_models');
  socket.emit('get_history_list');

  socket.on('connect', () => {
    setConnectionState('online', '服務已連線');
    socket.emit('get_models');
    socket.emit('get_history_list');
  });

  socket.on('disconnect', () => {
    setConnectionState('offline', '連線中斷');
  });

  socket.io?.on?.('reconnect_attempt', () => {
    setConnectionState('checking', '重新連線中');
  });

  socket.on('userinfo', (u) => {
    user = u;

    if (!u) {
      window.location.href = '/login';
      return;
    }

    if (dom.username) {
      dom.username.textContent = `用戶: ${u.userinfo.global_name}`;
      dom.username.title = u.userinfo.global_name;
    }
  });

  socket.on('reload', () => {
    window.location.href = '/login';
  });

  socket.on('rechat', (message) => {
    clearLoadingState();
    addMessage('系統', message, 'incoming', true);
  });

  socket.on('chat_status', (message) => {
    showStatusAlert(message);
  });

  socket.on('tool_status', ({ message }) => {
    updateToolStatus(message);
  });

  socket.on('models_info', (data) => {
    if (!dom.modelSelect || !data?.list) return;

    dom.modelSelect.replaceChildren();
    data.list.forEach((modelName) => {
      const option = createElement('option', {
        text: modelName,
        attrs: { value: modelName },
      });
      option.selected = modelName === data.current;
      dom.modelSelect.appendChild(option);
    });
  });

  // 後端現在傳遞 { files, indexMap }，前端解構後執行使用者 ID 驗證與過濾
  socket.on('history_list', ({ files = [], indexMap = {} } = {}) => {
    renderHistoryList(files, indexMap);
  });
  socket.on('history_data', renderHistoryData);
}

function initializeChatPage() {
  initializeInputInteractions();
  initializeSidebarInteractions();
  initializeToolbarActions();
  initializeAttachmentInteractions();
  initializeFormSubmission();
  initializeSocketEvents();
}

initializeChatPage();

  // chat_core.js - Core functionality for chat page
  var socket = io();
var user;
var msgs = document.getElementById('messages');
let loadingBubble = null;

// Safe marked text parser with breaks
function parseMarkdownSafe(text) {
  try {
    if (typeof marked !== 'undefined') {
      if (typeof marked.parse === 'function') {
        return marked.parse(text, { breaks: true });
      }
      return marked(text, { breaks: true });
    }
    return "<p>" + text + "</p>";
  } catch (e) {
    console.error("Markdown parse error:", e);
    return "<p>" + text + "</p>";
  }
}


document.getElementById('form').addEventListener('submit', function (event) {
  event.preventDefault();
  var inputEl = document.getElementById('input');
  var msg = inputEl.value.trim();
  if (msg) {
    // 將使用者 ID 一併傳送（供後端識別，連同 global_name）
    var uid = user && user.userinfo ? user.userinfo.id : null;
    var globalName = user && user.userinfo ? user.userinfo.global_name : 'User';
    socket.emit('chat', msg, globalName, uid);
    addMessage(globalName, msg, 'outgoing', false);
    
    // Show 'Thinking...' indicator while waiting for LLM
    loadingBubble = createLoadingIndicator();
    inputEl.value = '';
    inputEl.style.height = '52px';
  }
});

socket.on('userinfo', (u, userp) => {
  user = u;
  document.getElementById('username').textContent = "用戶: " + u.userinfo.global_name;
  if (!u)
    window.location.href = "/login";
});

socket.on('reload', () => {
  window.location.href = "/login";
});

socket.on('rechat', (msg) => {
  // Remove loading bubble if it exists
  if (loadingBubble && loadingBubble.parentNode) {
    loadingBubble.parentNode.removeChild(loadingBubble);
    loadingBubble = null;
  }
  addMessage('系統', msg, 'incoming', true);
});

function createLoadingIndicator() {
  const item = document.createElement('li');
  item.className = 'message flex justify-start';
  
  const bubble = document.createElement('div');
  bubble.className = 'max-w-[80%] bg-gray-100 dark:bg-darkInput rounded-2xl rounded-tl-sm px-5 py-3 shadow-sm flex items-center space-x-2';
  
  // Create 3 dots animation
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce';
    dot.style.animationDelay = `${i * 0.15}s`;
    bubble.appendChild(dot);
  }
  
  item.appendChild(bubble);
  msgs.appendChild(item);
  window.scrollTo(0, document.body.scrollHeight);
  
  return item;
}

function addMessage(sender, text, type, isMarkdown = false) {
  const item = document.createElement('li');
  item.className = 'message flex ' + (type === 'outgoing' ? 'justify-end' : 'justify-start');
  
  const bubble = document.createElement('div');
  // Enhance styling for bubbles
  if (type === 'outgoing') {
    bubble.className = 'max-w-[80%] bg-gradient-to-r from-primary to-primaryDark text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-md';
  } else {
    bubble.className = 'max-w-[90%] md:max-w-[80%] bg-white dark:bg-darkInput border border-gray-100 dark:border-gray-800 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm prose prose-sm md:prose-base dark:prose-invert';
  }
  
  const senderEl = document.createElement('div');
  senderEl.className = 'font-bold text-xs uppercase tracking-wider mb-1 opacity-80 ' + (type === 'outgoing' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400');
  senderEl.textContent = sender;
  bubble.appendChild(senderEl);
  
  const textEl = document.createElement('div');
  textEl.className = 'message-content';
  
  if (isMarkdown && type === 'incoming') {
    // Parse markdown and sanitize HTML safely
    const rawHtml = parseMarkdownSafe(text);
    const cleanHtml = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
    textEl.innerHTML = cleanHtml;
    
    // Apply highlight.js safely after DOM insertion
    if (typeof hljs !== 'undefined') {
      try {
        textEl.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      } catch (err) {
        console.error("Highlighting error:", err);
      }
    }
  } else {
    // Plain text for outgoing or non-markdown messages
    textEl.textContent = text;
    textEl.innerHTML = textEl.innerHTML.replace(/\n/g, '<br>');
  }
  
  bubble.appendChild(textEl);
  item.appendChild(bubble);
  msgs.appendChild(item);
  
  // Scroll to bottom softly
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth'
  });
}
// ======= UI Interactions & Socket Logic =======

// Textarea auto-resize and Enter to submit, Ctrl+Enter / Shift+Enter to attach new line
const inputEl = document.getElementById('input');
if (inputEl) {
  inputEl.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if(this.value === '') {
      this.style.height = '52px';
    }
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.shiftKey) {
        // Allow newline, textarea will handle it and trigger input event for auto-resize
      } else {
        e.preventDefault(); // Prevent adding newline natively
        if (this.value.trim()) {
          document.getElementById('form').dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    }
  });
}

// Sidebar logic
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function toggleSidebar() {
  if(sidebar) sidebar.classList.toggle('-translate-x-full');
  if(sidebarOverlay) sidebarOverlay.classList.toggle('hidden');
}

toggleSidebarBtn?.addEventListener('click', toggleSidebar);
closeSidebarBtn?.addEventListener('click', toggleSidebar);
sidebarOverlay?.addEventListener('click', toggleSidebar);

// History and Model Actions
const newChatBtn = document.getElementById('newChatBtn');
const deleteChatBtn = document.getElementById('deleteChatBtn');
const modelSelect = document.getElementById('modelSelect');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const historyList = document.getElementById('historyList');
const statusAlert = document.getElementById('statusAlert');
const statusAlertText = document.getElementById('statusAlertText');

function showStatusAlert(text) {
  if (!statusAlert) return;
  statusAlertText.textContent = text;
  statusAlert.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
  statusAlert.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    statusAlert.classList.remove('opacity-100', 'translate-y-0');
    statusAlert.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
  }, 3000);
}

// Emits
newChatBtn?.addEventListener('click', () => {
  socket.emit('new_chat');
  msgs.innerHTML = '<li class="text-center text-xs text-gray-500 dark:text-gray-400 py-2">— 開始新聊天 —</li>';
  if(window.innerWidth < 768) toggleSidebar();
});

deleteChatBtn?.addEventListener('click', () => {
  if (confirm('確定要刪除當前對話紀錄嗎？')) {
    socket.emit('delete_history');
    msgs.innerHTML = '<li class="text-center text-xs text-gray-500 dark:text-gray-400 py-2">— 紀錄已刪除 —</li>';
    if(window.innerWidth < 768) toggleSidebar();
  }
});

refreshHistoryBtn?.addEventListener('click', () => {
  socket.emit('get_history_list');
});

modelSelect?.addEventListener('change', (e) => {
  if (e.target.value) {
    socket.emit('set_model', e.target.value);
  }
});

// Sockets hooks for sidebar
socket.emit('get_models');
socket.emit('get_history_list');

socket.on('connect', () => {
  socket.emit('get_models');
  socket.emit('get_history_list');
});

socket.on('chat_status', (msg) => {
  showStatusAlert(msg);
});

socket.on('models_info', (data) => {
  if (!modelSelect || !data || !data.list) return;
  modelSelect.innerHTML = '';
  data.list.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === data.current) opt.selected = true;
    modelSelect.appendChild(opt);
  });
});

socket.on('history_list', (files) => {
  if (!historyList) return;
  historyList.innerHTML = '';
  if (!files || files.length === 0) {
    historyList.innerHTML = '<li class="text-gray-400 italic px-2">無對話紀錄</li>';
    return;
  }
  // Sort descending typically
  files.sort((a,b) => b.localeCompare(a)).forEach(f => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'w-full text-left truncate px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-darkInput transition-colors text-xs opacity-90';
    btn.textContent = f;
    btn.title = f;
    btn.onclick = () => {
      socket.emit('load_history', f);
      msgs.innerHTML = '<li class="text-center text-xs text-gray-500 dark:text-gray-400 py-2">— 載入紀錄中... —</li>';
      if(window.innerWidth < 768) toggleSidebar();
    };
    li.appendChild(btn);
    historyList.appendChild(li);
  });
});

socket.on('history_data', (historyArr) => {
  msgs.innerHTML = '<li class="text-center text-xs text-gray-500 dark:text-gray-400 py-2">— 歷史紀錄 —</li>';
  if (Array.isArray(historyArr)) {
    historyArr.forEach(m => {
      if (m.role === 'user') {
        let content = m.content;
        if (Array.isArray(m.content)) {
          let textObj = m.content.find(i => i.type === 'text');
          content = textObj ? textObj.text : '【多媒體檔案】';
        }
        // Extract out original message without "[Username] 說：" if present
        let displayContent = content;
        if(typeof content === 'string' && content.includes('] 說：\n')) {
          displayContent = content.split('] 說：\n').slice(1).join('] 說：\n');
        }
        addMessage(m.name || m.originalName || 'User', displayContent, 'outgoing', false);
      } else if (m.role === 'assistant') {
        addMessage('系統', m.content, 'incoming', true);
      }
    });
  }
});
// ══════════════════════════════════════════════════════════════
// Aetheris v2.1 - The Living Dashboard
// Zero globals, event delegation, XSS-safe, performance-optimized
// Uses chrome.storage.local for reliable persistence
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Constants ──
  const CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73 for pomodoro ring
  const WORK_DURATION = 25 * 60;
  const BREAK_DURATION = 5 * 60;


  const QUOTES = [
    '"The secret of getting ahead is getting started." - Mark Twain',
    '"Focus on being productive instead of busy." - Tim Ferriss',
    '"It is not enough to be busy; so are the ants." - Henry David Thoreau',
    '"The way to get started is to quit talking and begin doing." - Walt Disney',
    '"Do what you can, with what you have, where you are." - Theodore Roosevelt',
    '"Simplicity is the ultimate sophistication." - Leonardo da Vinci',
    '"Your time is limited, don\'t waste it living someone else\'s life." - Steve Jobs',
    '"The best time to plant a tree was 20 years ago. The second best time is now."',
    '"Don\'t watch the clock; do what it does. Keep going." - Sam Levenson',
    '"You don\'t have to be great to start, but you have to start to be great." - Zig Ziglar',
    '"Action is the foundational key to all success." - Pablo Picasso',
    '"Start where you are. Use what you have. Do what you can." - Arthur Ashe',
    '"The only way to do great work is to love what you do." - Steve Jobs',
    '"Believe you can and you\'re halfway there." - Theodore Roosevelt',
    '"Small daily improvements over time lead to stunning results." - Robin Sharma',
    '"A journey of a thousand miles begins with a single step." - Lao Tzu',
    '"What we fear doing most is usually what we most need to do." - Tim Ferriss',
    '"Discipline is choosing between what you want now and what you want most."',
    '"Success is not final, failure is not fatal: it is the courage to continue that counts." - Winston Churchill',
    '"The only limit to our realization of tomorrow is our doubts of today." - Franklin D. Roosevelt'
  ];

  const DEFAULT_SETTINGS = {
    timeFormat: '12h',
    showSeconds: false,
    showParticles: true,
    accentColor: '#8b5cf6',
    theme: 'light',
    userName: '',
    showShortcuts: true,
    positions: {
      speedDial: { left: '40px', bottom: '40px', right: 'auto', top: 'auto' },
      todoList:  { right: '40px', bottom: '40px', left: 'auto', top: 'auto' }
    }
  };

  // ── State ──
  const state = {
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    todos: [],
    notes: '',
    pomodoro: { sessionsCompleted: 0, isRunning: false, timeRemaining: WORK_DURATION, mode: 'work', endTime: null }
  };

  // ── Utilities ──
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ── Storage Abstraction (chrome.storage.local with localStorage fallback) ──
  var storage = {
    get: function (keys, callback) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, callback);
      } else {
        // Fallback for development/testing outside Chrome extension context
        var result = {};
        keys.forEach(function (key) {
          try {
            var val = localStorage.getItem(key);
            if (val !== null) result[key] = JSON.parse(val);
          } catch (e) { /* silent */ }
        });
        callback(result);
      }
    },
    set: function (data) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(data);
      } else {
        Object.keys(data).forEach(function (key) {
          try { localStorage.setItem(key, JSON.stringify(data[key])); } catch (e) { /* silent */ }
        });
      }
    }
  };

  // ── State Persistence ──
  function loadState(callback) {
    storage.get(['aetheris_settings', 'aetheris_todos', 'aetheris_notes', 'aetheris_pomodoro', 'aetheris_onboarded'], function (data) {
      try {
        if (data.aetheris_settings) {
          state.settings = { ...state.settings, ...data.aetheris_settings };
        }

        if (data.aetheris_todos) {
          state.todos = data.aetheris_todos;
        }

        if (data.aetheris_notes) {
          state.notes = data.aetheris_notes;
        }

        if (data.aetheris_pomodoro) {
          var saved = data.aetheris_pomodoro;
          state.pomodoro.sessionsCompleted = saved.sessionsCompleted || 0;
          state.pomodoro.mode = saved.mode || 'work';

          if (saved.endTime && saved.isRunning) {
            var remaining = Math.ceil((saved.endTime - Date.now()) / 1000);
            if (remaining > 0) {
              state.pomodoro.endTime = saved.endTime;
              state.pomodoro.timeRemaining = remaining;
              state.pomodoro.isRunning = true;
            } else {
              if (saved.mode === 'work') {
                state.pomodoro.sessionsCompleted = (saved.sessionsCompleted || 0) + 1;
                state.pomodoro.mode = 'break';
                state.pomodoro.timeRemaining = BREAK_DURATION;
              } else {
                state.pomodoro.mode = 'work';
                state.pomodoro.timeRemaining = WORK_DURATION;
              }
              state.pomodoro.isRunning = false;
              state.pomodoro.endTime = null;
            }
          } else {
            state.pomodoro.timeRemaining = saved.timeRemaining || WORK_DURATION;
            state.pomodoro.isRunning = false;
            state.pomodoro.endTime = null;
          }
        }
      } catch (e) {
        console.error('Aetheris: Error loading state', e);
      }

      callback(!!data.aetheris_onboarded);
    });
  }

  function saveSettings() {
    storage.set({ aetheris_settings: state.settings });
  }

  function saveTodos() {
    storage.set({ aetheris_todos: state.todos });
  }

  var saveNotes = debounce(function () {
    storage.set({ aetheris_notes: state.notes });
  }, 500);

  function savePomodoro() {
    storage.set({
      aetheris_pomodoro: {
        sessionsCompleted: state.pomodoro.sessionsCompleted,
        timeRemaining: state.pomodoro.timeRemaining,
        mode: state.pomodoro.mode,
        endTime: state.pomodoro.endTime,
        isRunning: state.pomodoro.isRunning
      }
    });
  }

  // ── Initialization (async) ──
  document.addEventListener('DOMContentLoaded', function () {
    loadState(function (hasOnboarded) {
      applyTheme();
      initClock();
      initSearch();
      initSpeedDial();
      initTodoList();
      initPomodoro();
      initNotes();
      initFocusMode();
      initSettings();
      initDragAndDrop();
      initKeyboardShortcuts();
      initParticles();
      initVisibility();

      if (!hasOnboarded) {
        showOnboarding();
      }
    });
  });

  // ── Onboarding ──
  function showOnboarding() {
    var overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    var dismissBtn = document.getElementById('onboardingDismiss');
    dismissBtn.addEventListener('click', function () {
      overlay.classList.add('hidden');
      storage.set({ aetheris_onboarded: true });
    });
  }

  // ── Tab Visibility ──
  let particleAnimId = null;
  let isTabVisible = true;

  function initVisibility() {
    document.addEventListener('visibilitychange', function () {
      isTabVisible = !document.hidden;
      if (isTabVisible && state.settings.showParticles) {
        startParticleLoop();
      }
    });
  }

  // ── Clock & Date ──
  let clockInterval = null;

  function initClock() {
    if (clockInterval) clearInterval(clockInterval);

    const clockEl = document.getElementById('clock');
    const greetingEl = document.getElementById('greeting');
    const dateEl = document.getElementById('dateDisplay');

    function update() {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const second = now.getSeconds();

      // Greeting
      let greeting = 'Good Evening';
      if (hour < 12) greeting = 'Good Morning';
      else if (hour < 18) greeting = 'Good Afternoon';

      if (state.settings.userName) {
        greeting += ', ' + escapeHTML(state.settings.userName);
      }
      greetingEl.textContent = greeting;

      // Time
      let displayHour = hour;
      let suffix = '';
      if (state.settings.timeFormat === '12h') {
        suffix = hour >= 12 ? ' PM' : ' AM';
        displayHour = hour % 12 || 12;
      }
      const mm = String(minute).padStart(2, '0');
      let timeStr = displayHour + ':' + mm;
      if (state.settings.showSeconds) {
        timeStr += ':' + String(second).padStart(2, '0');
      }
      timeStr += suffix;
      clockEl.textContent = timeStr;

      // Date
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
      dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
    }

    update();
    clockInterval = setInterval(update, 1000);
  }

  // ── Search (Chrome Web Store Compliant) ──
  function initSearch() {
    const input = document.getElementById('searchInput');
    input.placeholder = 'Search the web...';

    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) {
          // Use the official Chrome Search API
          if (typeof chrome !== 'undefined' && chrome.search) {
            chrome.search.query({ text: query, disposition: 'CURRENT_TAB' });
          } else {
            // Fallback for local testing in a normal browser tab
            window.location.href = 'https://www.google.com/search?q=' + encodeURIComponent(query);
          }
        }
      }
    });
  }

  function updateSearchPlaceholder() {
    // Left intentionally blank - we no longer update this based on settings
    const input = document.getElementById('searchInput');
    input.placeholder = 'Search the web...';
  }

  // ── Speed Dial ──
  function initSpeedDial() {
    var container = document.getElementById('speedDialGrid');

    if (typeof chrome !== 'undefined' && chrome.topSites) {
      chrome.topSites.get(function (sites) {
        renderSpeedDial(sites.slice(0, 8));
      });
    } else {
      var fallbackSites = [
        { title: 'Google', url: 'https://google.com' },
        { title: 'YouTube', url: 'https://youtube.com' },
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'Gmail', url: 'https://gmail.com' },
        { title: 'Reddit', url: 'https://reddit.com' },
        { title: 'Twitter', url: 'https://x.com' },
        { title: 'Stack Overflow', url: 'https://stackoverflow.com' },
        { title: 'Wikipedia', url: 'https://wikipedia.org' }
      ];
      renderSpeedDial(fallbackSites);
    }

    function renderSpeedDial(sites) {
      container.innerHTML = '';
      sites.forEach(function (site) {
        var el = document.createElement('a');
        el.className = 'speed-dial-item';
        el.href = site.url;
        el.draggable = false;

        var iconUrl = 'https://www.google.com/s2/favicons?sz=64&domain_url=' + encodeURIComponent(site.url);

        var iconDiv = document.createElement('div');
        iconDiv.className = 'speed-dial-icon';

        var img = document.createElement('img');
        img.src = iconUrl;
        img.alt = escapeHTML(site.title);
        img.onerror = function () {
          img.style.display = 'none';
          fallbackSpan.style.display = 'block';
        };

        var fallbackSpan = document.createElement('span');
        fallbackSpan.style.display = 'none';
        fallbackSpan.textContent = site.title.charAt(0).toUpperCase();

        iconDiv.appendChild(img);
        iconDiv.appendChild(fallbackSpan);

        var titleDiv = document.createElement('div');
        titleDiv.className = 'speed-dial-title';
        titleDiv.textContent = site.title;

        el.appendChild(iconDiv);
        el.appendChild(titleDiv);
        container.appendChild(el);
      });
    }
  }

  // ── Todo List (Event Delegation, XSS-safe) ──
  function initTodoList() {
    var list = document.getElementById('todoItems');
    var input = document.getElementById('newTodoInput');
    var toggleBtn = document.getElementById('toggleTodo');
    var container = document.getElementById('todoList');
    var clearBtn = document.getElementById('clearCompleted');

    // Toggle collapse
    toggleBtn.addEventListener('click', function () {
      container.classList.toggle('collapsed');
    });

    // Clear completed
    clearBtn.addEventListener('click', function () {
      state.todos = state.todos.filter(function (t) { return !t.completed; });
      saveTodos();
      renderTodos();
    });

    // Add todo
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        var text = input.value.trim();
        if (text) {
          state.todos.push({ id: Date.now(), text: text, completed: false });
          saveTodos();
          renderTodos();
          input.value = '';
        }
      }
    });

    // Event delegation for todo actions
    list.addEventListener('click', function (e) {
      var item = e.target.closest('.todo-item');
      if (!item) return;
      var id = Number(item.dataset.id);

      if (e.target.closest('.todo-delete')) {
        state.todos = state.todos.filter(function (t) { return t.id !== id; });
        saveTodos();
        renderTodos();
      } else if (e.target.closest('.todo-text')) {
        var todo = state.todos.find(function (t) { return t.id === id; });
        if (todo) {
          todo.completed = !todo.completed;
          saveTodos();
          renderTodos();
        }
      }
    });

    // Drag and drop for reordering
    var dragSrcItem = null;

    list.addEventListener('dragstart', function (e) {
      var item = e.target.closest('.todo-item');
      if (!item) return;
      dragSrcItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragover', function (e) {
      e.preventDefault();
    });

    list.addEventListener('drop', function (e) {
      var target = e.target.closest('.todo-item');
      if (!target || !dragSrcItem || target === dragSrcItem) return;

      var allItems = Array.from(list.querySelectorAll('.todo-item'));
      var srcIdx = allItems.indexOf(dragSrcItem);
      var tgtIdx = allItems.indexOf(target);

      if (srcIdx < tgtIdx) {
        list.insertBefore(dragSrcItem, target.nextSibling);
      } else {
        list.insertBefore(dragSrcItem, target);
      }

      var moved = state.todos.splice(srcIdx, 1)[0];
      state.todos.splice(tgtIdx, 0, moved);
      saveTodos();
    });

    list.addEventListener('dragend', function (e) {
      var item = e.target.closest('.todo-item');
      if (item) item.classList.remove('dragging');
      dragSrcItem = null;
    });

    renderTodos();

    function renderTodos() {
      list.innerHTML = '';
      var activeCount = state.todos.filter(function (t) { return !t.completed; }).length;
      document.getElementById('todoTitle').textContent = 'Tasks' + (state.todos.length > 0 ? ' (' + activeCount + ')' : '');

      state.todos.forEach(function (todo) {
        var li = document.createElement('li');
        li.className = 'todo-item' + (todo.completed ? ' completed' : '');
        li.draggable = true;
        li.dataset.id = todo.id;

        var textSpan = document.createElement('span');
        textSpan.className = 'todo-text';
        textSpan.textContent = todo.text; // Safe: textContent escapes HTML

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'todo-delete';
        deleteBtn.textContent = '\u00D7';
        deleteBtn.setAttribute('aria-label', 'Delete task');

        li.appendChild(textSpan);
        li.appendChild(deleteBtn);
        list.appendChild(li);
      });
    }
  }

  // ── Pomodoro Timer ──
  function initPomodoro() {
    var timeEl = document.getElementById('pomodoroTime');
    var statusEl = document.getElementById('pomodoroStatus');
    var progressEl = document.getElementById('pomodoroProgress');
    var sessionsEl = document.getElementById('pomodoroSessions');
    var startBtn = document.getElementById('pomodoroStart');
    var pauseBtn = document.getElementById('pomodoroPause');
    var resetBtn = document.getElementById('pomodoroReset');
    var toggleBtn = document.getElementById('togglePomodoro');
    var container = document.getElementById('pomodoroWidget');
    var pomodoroInterval = null;

    // Collapse toggle
    toggleBtn.addEventListener('click', function () {
      container.classList.toggle('collapsed');
    });

    // Set initial progress ring
    progressEl.style.strokeDasharray = CIRCUMFERENCE;
    updateDisplay();

    // Auto-resume if timer was running when page loaded
    if (state.pomodoro.isRunning && state.pomodoro.endTime) {
      startBtn.classList.add('hidden');
      pauseBtn.classList.remove('hidden');
      tick();
    }

    startBtn.addEventListener('click', function () {
      if (!state.pomodoro.isRunning) {
        state.pomodoro.isRunning = true;
        state.pomodoro.endTime = Date.now() + state.pomodoro.timeRemaining * 1000;
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        savePomodoro();
        tick();
      }
    });

    pauseBtn.addEventListener('click', function () {
      state.pomodoro.isRunning = false;
      var remaining = Math.ceil((state.pomodoro.endTime - Date.now()) / 1000);
      state.pomodoro.timeRemaining = Math.max(remaining, 0);
      state.pomodoro.endTime = null;
      pauseBtn.classList.add('hidden');
      startBtn.classList.remove('hidden');
      if (pomodoroInterval) { clearInterval(pomodoroInterval); pomodoroInterval = null; }
      updateDisplay();
      savePomodoro();
    });

    resetBtn.addEventListener('click', function () {
      state.pomodoro.isRunning = false;
      state.pomodoro.endTime = null;
      state.pomodoro.timeRemaining = state.pomodoro.mode === 'work' ? WORK_DURATION : BREAK_DURATION;
      pauseBtn.classList.add('hidden');
      startBtn.classList.remove('hidden');
      if (pomodoroInterval) { clearInterval(pomodoroInterval); pomodoroInterval = null; }
      updateDisplay();
      savePomodoro();
    });

    function tick() {
      if (pomodoroInterval) clearInterval(pomodoroInterval);
      pomodoroInterval = setInterval(function () {
        if (!state.pomodoro.isRunning) return;

        var remaining = Math.ceil((state.pomodoro.endTime - Date.now()) / 1000);
        state.pomodoro.timeRemaining = Math.max(remaining, 0);

        if (state.pomodoro.timeRemaining <= 0) {
          clearInterval(pomodoroInterval);
          pomodoroInterval = null;

          var notifTitle, notifBody;

          if (state.pomodoro.mode === 'work') {
            state.pomodoro.sessionsCompleted++;
            state.pomodoro.mode = 'break';
            state.pomodoro.timeRemaining = BREAK_DURATION;
            statusEl.textContent = 'Break time!';
            notifTitle = 'Focus Session Complete!';
            notifBody = 'Great work! Time for a ' + (BREAK_DURATION / 60) + '-minute break. Sessions: ' + state.pomodoro.sessionsCompleted;
          } else {
            state.pomodoro.mode = 'work';
            state.pomodoro.timeRemaining = WORK_DURATION;
            statusEl.textContent = 'Ready to focus';
            notifTitle = 'Break Over!';
            notifBody = 'Ready to start another ' + (WORK_DURATION / 60) + '-minute focus session?';
          }

          state.pomodoro.isRunning = false;
          state.pomodoro.endTime = null;
          pauseBtn.classList.add('hidden');
          startBtn.classList.remove('hidden');
          savePomodoro();

          // Send notification
          sendNotification(notifTitle, notifBody);
        }

        updateDisplay();
      }, 1000);
    }

    function updateDisplay() {
      var t = state.pomodoro.timeRemaining;
      var mins = Math.floor(t / 60);
      var secs = t % 60;
      timeEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

      var total = state.pomodoro.mode === 'work' ? WORK_DURATION : BREAK_DURATION;
      var progress = t / total;
      var offset = CIRCUMFERENCE * (1 - progress);
      progressEl.style.strokeDashoffset = offset;

      sessionsEl.textContent = state.pomodoro.sessionsCompleted;

      if (state.pomodoro.isRunning) {
        statusEl.textContent = state.pomodoro.mode === 'work' ? 'Focus time...' : 'Break time!';
      } else if (t === total) {
        statusEl.textContent = state.pomodoro.mode === 'work' ? 'Ready to focus' : 'Ready for break';
      }
    }
  }

  // ── Notifications ──
  function sendNotification(title, body) {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: title,
        message: body,
        priority: 2
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(function (perm) {
        if (perm === 'granted') new Notification(title, { body: body });
      });
    }
  }

  // ── Quick Notes ──
  function initNotes() {
    var textarea = document.getElementById('notesInput');
    var countEl = document.getElementById('notesCount');
    var toggleBtn = document.getElementById('toggleNotes');
    var container = document.getElementById('notesWidget');

    textarea.value = state.notes;
    countEl.textContent = state.notes.length;

    toggleBtn.addEventListener('click', function () {
      container.classList.toggle('collapsed');
    });

    textarea.addEventListener('input', function () {
      state.notes = textarea.value;
      countEl.textContent = state.notes.length;
      saveNotes();
    });
  }

  // ── Focus Mode ──
  function initFocusMode() {
    var overlay = document.getElementById('focusOverlay');
    var quoteEl = document.getElementById('focusQuote');
    var focusBtn = document.getElementById('focusBtn');
    var exitBtn = document.getElementById('exitFocus');

    function toggle() {
      var isActive = document.body.classList.contains('focus-active');
      if (isActive) {
        document.body.classList.remove('focus-active');
        overlay.classList.add('hidden');
      } else {
        quoteEl.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        document.body.classList.add('focus-active');
        overlay.classList.remove('hidden');
      }
    }

    focusBtn.addEventListener('click', toggle);
    exitBtn.addEventListener('click', toggle);

    // Expose for keyboard shortcut
    initFocusMode.toggle = toggle;
  }

  // ── Settings ──
  function initSettings() {
    var btn = document.getElementById('settingsBtn');
    var modal = document.getElementById('settingsModal');
    var close = document.getElementById('closeSettings');

    // Open/close
    btn.addEventListener('click', function () { modal.classList.remove('hidden'); });
    close.addEventListener('click', function () { modal.classList.add('hidden'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });

    // Theme
    var themeToggle = document.getElementById('toggleTheme');
    themeToggle.checked = state.settings.theme === 'dark';
    themeToggle.addEventListener('change', function (e) {
      state.settings.theme = e.target.checked ? 'dark' : 'light';
      saveSettings();
      applyTheme();
    });

    // Time Format
    var timeBtn = document.getElementById('toggleTimeFormat');
    timeBtn.textContent = state.settings.timeFormat;
    timeBtn.addEventListener('click', function () {
      state.settings.timeFormat = state.settings.timeFormat === '12h' ? '24h' : '12h';
      timeBtn.textContent = state.settings.timeFormat;
      saveSettings();
      initClock();
    });

    // Show Seconds
    var secondsToggle = document.getElementById('toggleSeconds');
    secondsToggle.checked = state.settings.showSeconds;
    secondsToggle.addEventListener('change', function (e) {
      state.settings.showSeconds = e.target.checked;
      saveSettings();
      initClock();
    });

    // Particles
    var particleToggle = document.getElementById('toggleParticles');
    particleToggle.checked = state.settings.showParticles;
    particleToggle.addEventListener('change', function (e) {
      state.settings.showParticles = e.target.checked;
      saveSettings();
      var canvas = document.getElementById('particleCanvas');
      if (state.settings.showParticles) {
        canvas.style.display = 'block';
        initParticles();
      } else {
        canvas.style.display = 'none';
        if (particleAnimId) { cancelAnimationFrame(particleAnimId); particleAnimId = null; }
      }
    });

    // Accent Colors
    var colorBtns = document.querySelectorAll('.color-btn');
    colorBtns.forEach(function (cbtn) {
      if (cbtn.dataset.color === state.settings.accentColor) cbtn.classList.add('active');
      cbtn.addEventListener('click', function () {
        colorBtns.forEach(function (b) { b.classList.remove('active'); });
        cbtn.classList.add('active');
        state.settings.accentColor = cbtn.dataset.color;
        saveSettings();
        applyTheme();
      });
    });

    // User Name
    var nameInput = document.getElementById('userName');
    nameInput.value = state.settings.userName;
    nameInput.addEventListener('input', debounce(function () {
      state.settings.userName = nameInput.value.trim();
      saveSettings();
      initClock();
    }, 300));

    // Keyboard Shortcuts toggle
    var shortcutsToggle = document.getElementById('toggleShortcuts');
    shortcutsToggle.checked = state.settings.showShortcuts !== false;
    shortcutsToggle.addEventListener('change', function (e) {
      state.settings.showShortcuts = e.target.checked;
      saveSettings();
      document.getElementById('shortcutsBar').classList.toggle('hidden', !e.target.checked);
    });

    // Apply shortcuts visibility
    if (state.settings.showShortcuts === false) {
      document.getElementById('shortcutsBar').classList.add('hidden');
    }

    // Reset Widget Positions
    document.getElementById('resetPositions').addEventListener('click', function () {
      state.settings.positions = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.positions));
      saveSettings();
      // Remove inline styles and let CSS defaults take over
      document.querySelectorAll('.widget-container').forEach(function (w) {
        w.style.left = '';
        w.style.top = '';
        w.style.bottom = '';
        w.style.right = '';
      });
    });

    // Export Data
    document.getElementById('exportData').addEventListener('click', function () {
      var exportObj = {
        version: '2.1',
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        todos: state.todos,
        notes: state.notes,
        pomodoro: {
          sessionsCompleted: state.pomodoro.sessionsCompleted,
          mode: state.pomodoro.mode
        }
      };
      var blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'aetheris-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import Data
    document.getElementById('importData').addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            if (!data.version) {
              alert('Invalid backup file.');
              return;
            }
            if (confirm('This will replace all your current data. Continue?')) {
              if (data.settings) state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
              if (data.todos) state.todos = data.todos;
              if (data.notes !== undefined) state.notes = data.notes;
              if (data.pomodoro) {
                state.pomodoro.sessionsCompleted = data.pomodoro.sessionsCompleted || 0;
                state.pomodoro.mode = data.pomodoro.mode || 'work';
              }
              saveSettings();
              saveTodos();
              storage.set({ aetheris_notes: state.notes });
              savePomodoro();
              location.reload();
            }
          } catch (err) {
            alert('Failed to read backup file. Make sure it is a valid Aetheris backup.');
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });

    // Reset Defaults
    document.getElementById('resetDefaults').addEventListener('click', function () {
      if (confirm('Reset all settings to defaults? Your tasks and notes will be kept.')) {
        state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        saveSettings();
        location.reload();
      }
    });
  }

  // ── Theme Application ──
  function applyTheme() {
    document.documentElement.style.setProperty('--accent', state.settings.accentColor);
    if (state.settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  // ── Keyboard Shortcuts ──
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Escape: close modals / exit focus
      if (e.key === 'Escape') {
        var modal = document.getElementById('settingsModal');
        if (!modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
          return;
        }
        var onboarding = document.getElementById('onboardingOverlay');
        if (onboarding && !onboarding.classList.contains('hidden')) {
          onboarding.classList.add('hidden');
          storage.set({ aetheris_onboarded: true });
          return;
        }
        if (document.body.classList.contains('focus-active')) {
          initFocusMode.toggle();
          return;
        }
      }

      // Alt-based shortcuts
      if (e.altKey) {
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          document.getElementById('searchInput').focus();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          initFocusMode.toggle();
        } else if (e.key === ',') {
          e.preventDefault();
          document.getElementById('settingsModal').classList.remove('hidden');
        }
      }
    });
  }

  // ── Drag & Drop (Widgets) ──
  function initDragAndDrop() {
    var dragSrcEl = null;
    var isDraggingWidget = false;

    var widgets = document.querySelectorAll('.widget-container');

    widgets.forEach(function (widget) {
      var header = widget.querySelector('.widget-header');

      header.addEventListener('mousedown', function () { widget.draggable = true; });
      header.addEventListener('mouseup', function () { widget.draggable = false; });

      widget.addEventListener('dragstart', function (e) {
        isDraggingWidget = true;
        dragSrcEl = widget;
        e.dataTransfer.effectAllowed = 'move';
        var rect = widget.getBoundingClientRect();
        e.dataTransfer.setData('text/plain', JSON.stringify({
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top
        }));
        setTimeout(function () { widget.style.opacity = '0.4'; }, 0);
      });

      widget.addEventListener('dragend', function () {
        widget.draggable = false;
        widget.style.opacity = '1';
        widget.style.transform = '';

        // Save position for any widget
        if (widget.id) {
          if (!state.settings.positions) state.settings.positions = {};
          state.settings.positions[widget.id] = {
            left: widget.style.left, top: widget.style.top, bottom: 'auto', right: 'auto'
          };
        }
        saveSettings();
        dragSrcEl = null;
        isDraggingWidget = false;
      });
    });

    document.body.addEventListener('dragover', function (e) {
      if (isDraggingWidget) { e.preventDefault(); }
    });

    document.body.addEventListener('drop', function (e) {
      if (isDraggingWidget && dragSrcEl) {
        e.preventDefault();
        try {
          var offset = JSON.parse(e.dataTransfer.getData('text/plain'));
          var newLeft = e.clientX - offset.offsetX;
          var newTop = e.clientY - offset.offsetY;

          // Boundary clamping — keep at least 40px visible on each edge
          var rect = dragSrcEl.getBoundingClientRect();
          var maxLeft = window.innerWidth - 40;
          var maxTop = window.innerHeight - 40;
          newLeft = Math.max(-rect.width + 40, Math.min(newLeft, maxLeft));
          newTop = Math.max(0, Math.min(newTop, maxTop));

          dragSrcEl.style.left = newLeft + 'px';
          dragSrcEl.style.top = newTop + 'px';
          dragSrcEl.style.bottom = 'auto';
          dragSrcEl.style.right = 'auto';
        } catch (err) { /* ignore parse errors */ }
      }
    });

    // Restore positions for all widgets
    widgets.forEach(function (widget) {
      if (widget.id && state.settings.positions && state.settings.positions[widget.id]) {
        Object.assign(widget.style, state.settings.positions[widget.id]);
      }
    });
  }

  // ── Particle System (Optimized) ──
  var particles = [];
  var particleCanvas, particleCtx;

  function initParticles() {
    particleCanvas = document.getElementById('particleCanvas');

    // Check prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      particleCanvas.style.display = 'none';
      return;
    }

    if (!state.settings.showParticles) {
      particleCanvas.style.display = 'none';
      return;
    }

    particleCtx = particleCanvas.getContext('2d');
    particles = [];

    function resize() {
      particleCanvas.width = window.innerWidth;
      particleCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // Create 35 particles (down from 50 for performance)
    for (var i = 0; i < 35; i++) {
      particles.push({
        x: Math.random() * particleCanvas.width,
        y: Math.random() * particleCanvas.height,
        size: Math.random() * 2,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 - 0.25
      });
    }

    startParticleLoop();
  }

  function startParticleLoop() {
    if (particleAnimId) cancelAnimationFrame(particleAnimId);

    function animate() {
      if (!isTabVisible || !state.settings.showParticles) return;

      var w = particleCanvas.width;
      var h = particleCanvas.height;
      particleCtx.clearRect(0, 0, w, h);

      // Update & draw particles
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x > w) p.x = 0;
        if (p.x < 0) p.x = w;
        if (p.y > h) p.y = 0;
        if (p.y < 0) p.y = h;

        particleCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        particleCtx.fill();
      }

      // Draw connection lines (optimized: squared distance, no sqrt)
      particleCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      particleCtx.lineWidth = 0.5;
      particleCtx.beginPath();
      var threshold = 10000; // 100^2

      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x;
          var dy = particles[i].y - particles[j].y;
          var distSq = dx * dx + dy * dy;
          if (distSq < threshold) {
            particleCtx.moveTo(particles[i].x, particles[i].y);
            particleCtx.lineTo(particles[j].x, particles[j].y);
          }
        }
      }
      particleCtx.stroke();

      particleAnimId = requestAnimationFrame(animate);
    }

    particleAnimId = requestAnimationFrame(animate);
  }

})();

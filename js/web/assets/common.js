// common.js - Shared JavaScript functionality for all pages

// Tailwind configuration
tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: '#5D5CDE',
          primaryDark: '#4a49b5',
          lightBg: '#FFFFFF',
          darkBg: '#181818',
          darkInput: '#2a2a2a',
          darkText: '#e0e0e0',
        },
        animation: {
          'message-appear': 'message-appear 0.3s ease-out forwards',
        },
        keyframes: {
          'message-appear': {
            '0%': { opacity: '0', transform: 'translateY(10px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
          }
        }
      }
    },
    darkMode: 'class'
  };
  
  // Dark mode functionality
  function initDarkMode() {
    const darkBtn = document.getElementById('darkModeToggle');
    
    // Check if dark mode was previously set in localStorage
    if (localStorage.getItem('darkMode') === 'enabled') {
      document.documentElement.classList.add('dark');
      updateDarkIcon(true);
    } else {
      document.documentElement.classList.remove('dark');
      updateDarkIcon(false);
    }
    
    // Add event listener to dark mode toggle button
    if (darkBtn) {
      darkBtn.addEventListener('click', toggleDarkMode);
    }
  }
  
  function toggleDarkMode() {
    const isDark = document.documentElement.classList.contains('dark');
    
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'disabled');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'enabled');
    }
    
    updateDarkIcon(!isDark);
  }
  
  function updateDarkIcon(isDark) {
    const darkBtn = document.getElementById('darkModeToggle');
    if (darkBtn) {
      darkBtn.innerHTML = isDark 
        ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>';
    }
  }
  
  // Mobile menu functionality
  function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('menu');
    
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', () => {
        menu.classList.toggle('hidden');
      });
    }
  }
  
  // Initialize functionality when DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    initDarkMode();
    initMobileMenu();
  });
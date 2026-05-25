(function() {
    function detectDevTools() {
        const threshold = 160;
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            showWarning();
        }
    }

    function showWarning() {
        console.log('%c警告：請不要嘗試查看或修改此頁面的源代碼。這可能會導致安全問題或違反使用條款。', 'color: red; font-size: 20px; font-weight: bold;');
    }

    window.addEventListener('resize', detectDevTools);

    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74))) {
            e.preventDefault();
            showWarning();
        }
    });

    detectDevTools();

    console.log('%c注意：這是一個安全警告！', 'color: red; font-size: 24px; font-weight: bold;');
    console.log('%c使用此控制台可能會使您面臨安全風險。', 'color: red; font-size: 18px;');
    console.log('%c除非您確切知道自己在做什麼，否則請立即關閉此窗口。', 'color: red; font-size: 18px;');
})();
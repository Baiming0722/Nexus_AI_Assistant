// index.js - Vue state and interaction logic for the project homepage.
// The homepage keeps behavior intentionally small: authentication state,
// responsive navigation, avatar fallback, and live socket connection status.

const { createApp, computed, onMounted, onUnmounted, ref } = Vue;

const app = createApp({
    setup() {
        const socket = io();
        const isLoggedIn = ref(false);
        const isConnected = ref(socket.connected);
        const userInfo = ref(null);
        const mobileMenuOpen = ref(false);
        const avatarLoadFailed = ref(false);

        const displayName = computed(() => {
            const info = userInfo.value?.userinfo;
            return info?.global_name || info?.username || '使用者';
        });

        const userInitial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U');

        const userId = computed(() => userInfo.value?.userinfo?.id || '');

        const avatarUrl = computed(() => {
            const info = userInfo.value?.userinfo;
            if (!info?.avatar || !info?.id) return null;
            return `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}.png`;
        });

        const welcomeText = computed(() => {
            if (isLoggedIn.value) return `歡迎回來，${displayName.value}`;
            return isConnected.value ? '服務已連線，登入後可使用個人化功能' : '正在連線服務';
        });

        function toggleMobileMenu() {
            mobileMenuOpen.value = !mobileMenuOpen.value;
        }

        function closeMobileMenu() {
            mobileMenuOpen.value = false;
        }

        function logout() {
            window.location.href = '/logout';
        }

        function handleAvatarError() {
            avatarLoadFailed.value = true;
        }

        function handleUserInfo(userPayload) {
            if (!userPayload?.userinfo) return;

            userInfo.value = userPayload;
            isLoggedIn.value = true;
            avatarLoadFailed.value = false;
        }

        function handleLoggedOut() {
            userInfo.value = null;
            isLoggedIn.value = false;
            avatarLoadFailed.value = false;
        }

        function handleConnect() {
            isConnected.value = true;
        }

        function handleDisconnect() {
            isConnected.value = false;
        }

        function closeMenuOnLargeViewport() {
            if (window.innerWidth > 900) closeMobileMenu();
        }

        onMounted(() => {
            socket.on('connect', handleConnect);
            socket.on('disconnect', handleDisconnect);
            socket.on('userinfo', handleUserInfo);
            socket.on('reload', handleLoggedOut);

            window.addEventListener('resize', closeMenuOnLargeViewport);
        });

        onUnmounted(() => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('userinfo', handleUserInfo);
            socket.off('reload', handleLoggedOut);

            window.removeEventListener('resize', closeMenuOnLargeViewport);
        });

        return {
            avatarLoadFailed,
            avatarUrl,
            closeMobileMenu,
            displayName,
            handleAvatarError,
            isConnected,
            isLoggedIn,
            mobileMenuOpen,
            toggleMobileMenu,
            userInfo,
            userInitial,
            userId,
            logout,
            welcomeText,
        };
    },
});

app.mount('#app');

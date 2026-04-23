const { createApp, ref, onMounted } = Vue;

const app = createApp({
    setup() {
        const socket = io();
        const isLoggedIn = ref(false);
        const userInfo = ref(null);
        const mobileMenuOpen = ref(false);

        onMounted(() => {
            // Listen for userinfo emitted by backend upon connection if authenticated
            socket.on('userinfo', (u, userp) => {
                if (u && u.userinfo) {
                    isLoggedIn.value = true;
                    userInfo.value = u;
                }
            });

            // Listen for reload/unauthorized event
            socket.on('reload', () => {
                isLoggedIn.value = false;
                userInfo.value = null;
            });
        });

        const toggleMobileMenu = () => {
            mobileMenuOpen.value = !mobileMenuOpen.value;
        };

        const getAvatarUrl = () => {
            if (userInfo.value && userInfo.value.userinfo && userInfo.value.userinfo.avatar) {
                return `https://cdn.discordapp.com/avatars/${userInfo.value.userinfo.id}/${userInfo.value.userinfo.avatar}.png`;
            }
            return null;
        };

        return {
            isLoggedIn,
            userInfo,
            mobileMenuOpen,
            toggleMobileMenu,
            getAvatarUrl
        };
    }
});

app.mount('#app');

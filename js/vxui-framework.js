(function (window, document) {
    'use strict';

    function isFunction(value) {
        return typeof value === 'function';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    class VXUIFramework {
        constructor(options) {
            const config = options || {};

            this.options = config;
            this.rootSelector = config.root || '#vx-app';
            this.viewSelector = config.viewContainer || '#vx-view';
            this.sidebarNavSelector = config.sidebarNav || '#vx-sidebar-nav';
            this.sidebarStaticNavSelector = config.sidebarStaticNav || '#vx-sidebar-static-list';
            this.mobileNavSelector = config.mobileNav || '#vx-mobile-bar';
            this.titleSelector = config.titleElement || '#vx-current-title';
            this.breadcrumbSelector = config.breadcrumbElement || '#vx-breadcrumb';
            this.authLabelSelector = config.authLabelElement || '#vx-auth-pill';
            this.layoutSelector = config.layout || '#vx-layout';
            this.sidebarSelector = config.sidebar || '#vx-sidebar';
            this.overlaySelector = config.sidebarOverlay || '[data-vx-sidebar-overlay]';
            this.languageDropdownSelector = config.languageDropdown || '#vx-lang-dropdown';
            this.languageLabelSelector = config.languageLabel || '#vx-lang-label';
            this.communityLinkSelector = config.communityLink || '#vx-community-link';
            this.defaultView = config.defaultView || 'overview';
            this.unauthorizedView = config.unauthorizedView || this.defaultView;
            this.routingMode = config.routingMode || 'hash';
            this.storageKeyPrefix = config.storageKeyPrefix || 'vxui-framework';

            this.views = new Map();
            this.navigation = [];
            this.currentView = null;
            this.currentState = {};
            this.themeMode = 'system';
            this.sidebarOpen = false;
            this.sidebarCollapsed = false;
            this.sidebarOverlayMode = false;
            this.currentLanguage = '';
            this.modalStack = [];
            this.modalHooks = new Map();
            this.toastCount = 0;
            this._savedScrollY = 0;
            this._skipNextHashChange = false;
            this.initialized = false;

            this.elements = {};
            this.mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
            this.authProvider = isFunction(config.authProvider)
                ? config.authProvider
                : function () {
                    return { loggedIn: false, user: null, owner: false };
                };
            this.languageResolver = isFunction(config.languageResolver)
                ? config.languageResolver
                : function () {
                    const storedLang = window.localStorage.getItem('app_lang');
                    const browserLang = window.navigator && (window.navigator.language || window.navigator.userLanguage)
                        ? (window.navigator.language || window.navigator.userLanguage)
                        : '';
                    return storedLang || browserLang || 'en';
                };
            this.onLanguageChange = isFunction(config.onLanguageChange) ? config.onLanguageChange : null;
            this.communityVisibleResolver = isFunction(config.communityVisibleResolver)
                ? config.communityVisibleResolver
                : function (lang) {
                    const normalized = String(lang || '').toLowerCase();
                    return normalized === 'cn' || normalized === 'hk' || normalized.indexOf('zh') === 0;
                };
            this.languageOptions = Array.isArray(config.languageOptions) ? config.languageOptions.slice() : null;
        }

        _storageKey(name) {
            return this.storageKeyPrefix + ':' + name;
        }

        _dispatch(name, detail) {
            if (!this.elements.root) {
                return;
            }

            this.elements.root.dispatchEvent(new CustomEvent('vxui:' + name, {
                detail: detail || {},
                bubbles: true
            }));
        }

        _findElements() {
            this.elements.root = document.querySelector(this.rootSelector);
            this.elements.view = document.querySelector(this.viewSelector);
            this.elements.sidebarNav = document.querySelector(this.sidebarNavSelector);
            this.elements.sidebarStaticNav = document.querySelector(this.sidebarStaticNavSelector) || this.elements.sidebarNav;
            this.elements.mobileNav = document.querySelector(this.mobileNavSelector);
            this.elements.title = document.querySelector(this.titleSelector);
            this.elements.breadcrumb = document.querySelector(this.breadcrumbSelector);
            this.elements.authLabel = document.querySelector(this.authLabelSelector);
            this.elements.layout = document.querySelector(this.layoutSelector);
            this.elements.sidebar = document.querySelector(this.sidebarSelector);
            this.elements.overlay = document.querySelector(this.overlaySelector);
            this.elements.langDropdown = document.querySelector(this.languageDropdownSelector);
            this.elements.langLabel = document.querySelector(this.languageLabelSelector);
            this.elements.communityLink = document.querySelector(this.communityLinkSelector);

            if (!this.elements.layout && this.elements.root) {
                this.elements.layout = this.elements.root.querySelector('.vx-layout, .vx-shell');
            }

            if (!this.elements.root || !this.elements.view || !this.elements.sidebarStaticNav) {
                throw new Error('VXUIFramework mount elements not found');
            }

            this._ensureToastRoot();
            this._ensureModalRoot();
        }

        _ensureToastRoot() {
            let toastRoot = document.getElementById('vx-toast-root');
            if (!toastRoot) {
                toastRoot = document.createElement('div');
                toastRoot.id = 'vx-toast-root';
                toastRoot.className = 'vx-toast-root';
                document.body.appendChild(toastRoot);
            }
            this.elements.toastRoot = toastRoot;
        }

        _ensureModalRoot() {
            let modalRoot = document.getElementById('vx-modal-root');
            if (!modalRoot) {
                modalRoot = document.createElement('div');
                modalRoot.id = 'vx-modal-root';
                modalRoot.className = 'vx-modal-root';
                document.body.appendChild(modalRoot);
            }
            this.elements.modalRoot = modalRoot;
        }

        _normalizeLanguage(lang) {
            const normalized = String(lang || '')
                .trim()
                .toLowerCase();

            if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-sg') {
                return 'cn';
            }

            if (normalized === 'zh-hk' || normalized === 'zh-tw' || normalized === 'zh-mo') {
                return 'hk';
            }

            return normalized;
        }

        _resolveLanguage() {
            let next = 'en';
            try {
                next = this.languageResolver() || 'en';
            } catch (error) {
                next = 'en';
            }
            return this._normalizeLanguage(next) || 'en';
        }

        _getLanguageLabel(lang) {
            const normalized = this._normalizeLanguage(lang);

            if (this.languageOptions) {
                const option = this.languageOptions.find((item) => this._normalizeLanguage(item.value || item.lang) === normalized);
                if (option) {
                    return option.label || option.name || normalized.toUpperCase();
                }
            }

            if (this.elements.langDropdown) {
                const option = this.elements.langDropdown.querySelector('[data-action="vx-lang-set"][data-lang="' + normalized + '"]');
                if (option) {
                    return option.textContent || normalized.toUpperCase();
                }
            }

            return normalized.toUpperCase();
        }

        _syncLanguageUI() {
            const lang = this._resolveLanguage();
            this.currentLanguage = lang;

            if (this.elements.langLabel) {
                this.elements.langLabel.textContent = this._getLanguageLabel(lang);
            }

            if (this.elements.langDropdown) {
                this.elements.langDropdown.querySelectorAll('[data-action="vx-lang-set"]').forEach((node) => {
                    const itemLang = this._normalizeLanguage(node.getAttribute('data-lang'));
                    node.classList.toggle('active', itemLang === lang);
                });
            }

            this.updateCommunityLinkVisibility();
        }

        setLanguage(lang) {
            const nextLang = this._normalizeLanguage(lang);
            if (!nextLang) {
                return this.currentLanguage;
            }

            this.currentLanguage = nextLang;
            window.localStorage.setItem('app_lang', nextLang);

            if (this.elements.langLabel) {
                this.elements.langLabel.textContent = this._getLanguageLabel(nextLang);
            }

            if (this.elements.langDropdown) {
                this.elements.langDropdown.classList.remove('open');
                this.elements.langDropdown.querySelectorAll('[data-action="vx-lang-set"]').forEach((node) => {
                    const itemLang = this._normalizeLanguage(node.getAttribute('data-lang'));
                    node.classList.toggle('active', itemLang === nextLang);
                });
            }

            this.updateCommunityLinkVisibility();

            if (this.onLanguageChange) {
                this.onLanguageChange(nextLang, this);
            }

            this._dispatch('languagechange', { lang: nextLang });
            return nextLang;
        }

        updateCommunityLinkVisibility() {
            if (!this.elements.communityLink) {
                return;
            }

            const lang = this.currentLanguage || this._resolveLanguage();
            const visible = !!this.communityVisibleResolver(lang);
            this.elements.communityLink.style.display = visible ? '' : 'none';
        }

        registerView(name, config) {
            if (!name || !config) {
                throw new Error('VXUIFramework.registerView requires name and config');
            }

            this.views.set(name, Object.assign({ name: name }, config));
            return this;
        }

        registerViews(views) {
            Object.keys(views || {}).forEach((name) => {
                this.registerView(name, views[name]);
            });
            return this;
        }

        setNavigation(items) {
            this.navigation = Array.isArray(items) ? items.slice() : [];
            this.renderNavigation();
            return this;
        }

        getRootElement() {
            return this.elements.root || document.querySelector(this.rootSelector);
        }

        setAuthProvider(provider) {
            if (isFunction(provider)) {
                this.authProvider = provider;
                this.refreshAuth();
            }
            return this;
        }

        getAuthState() {
            let state = {};

            try {
                state = this.authProvider() || {};
            } catch (error) {
                state = {};
            }

            const user = state.user || null;

            return {
                loggedIn: !!state.loggedIn,
                owner: !!(state.owner || (user && (user.owner || user.isOwner))),
                user: user
            };
        }

        async init() {
            this._findElements();
            this._bindGlobalEvents();

            this.themeMode = this._readStoredTheme();
            this.applyTheme();

            this.renderNavigation();
            this.refreshAuth();
            this.applySidebarResponsiveMode();
            this._syncLanguageUI();

            const initialView = this._getRouteView();
            await this.navigate(initialView, {}, { syncRoute: false });

            this._dispatch('ready', {
                view: this.currentView,
                theme: this.getThemeMode()
            });

            this.initialized = true;

            return this;
        }

        _bindGlobalEvents() {
            if (this.mediaQuery) {
                const onThemeChange = () => {
                    if (this.themeMode === 'system') {
                        this.applyTheme();
                    }
                };

                if (isFunction(this.mediaQuery.addEventListener)) {
                    this.mediaQuery.addEventListener('change', onThemeChange);
                } else if (isFunction(this.mediaQuery.addListener)) {
                    this.mediaQuery.addListener(onThemeChange);
                }
            }

            window.addEventListener('resize', () => {
                this.applySidebarResponsiveMode();
            });

            window.addEventListener('orientationchange', () => {
                window.setTimeout(() => {
                    this.applySidebarResponsiveMode();
                }, 50);
            });

            window.addEventListener('hashchange', () => {
                if (this._skipNextHashChange) {
                    this._skipNextHashChange = false;
                    return;
                }

                this.navigate(this._getRouteView(), {}, { syncRoute: false });
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.closeTopModal();
                    if (this.isSidebarOverlayMode()) {
                        this.closeSidebar();
                    }
                }
            });

            document.addEventListener('click', (event) => {
                const languageToggle = event.target.closest('[data-action="vx-lang-toggle"]');
                if (languageToggle && this.elements.langDropdown) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.elements.langDropdown.classList.toggle('open');
                    return;
                }

                const languageItem = event.target.closest('[data-action="vx-lang-set"]');
                if (languageItem) {
                    event.preventDefault();
                    const lang = languageItem.getAttribute('data-lang');
                    this.setLanguage(lang);
                    return;
                }

                if (this.elements.langDropdown && this.elements.langDropdown.classList.contains('open')) {
                    if (!this.elements.langDropdown.contains(event.target)) {
                        this.elements.langDropdown.classList.remove('open');
                    }
                }

                const routeTrigger = event.target.closest('[data-vx-route]');
                if (routeTrigger) {
                    event.preventDefault();
                    const route = routeTrigger.getAttribute('data-vx-route');
                    this.navigate(route);
                    return;
                }

                const sidebarToggle = event.target.closest('[data-vx-sidebar-toggle]');
                if (sidebarToggle) {
                    event.preventDefault();
                    this.toggleSidebar();
                    return;
                }

                const sidebarClose = event.target.closest('[data-vx-sidebar-close]');
                if (sidebarClose || (this.elements.overlay && event.target === this.elements.overlay)) {
                    event.preventDefault();
                    this.closeSidebar();
                    return;
                }

                if (this.sidebarOpen && this.isSidebarOverlayMode()) {
                    const clickedSidebar = this.elements.sidebar && this.elements.sidebar.contains(event.target);
                    const clickedToggle = event.target.closest('[data-vx-sidebar-toggle]');
                    if (!clickedSidebar && !clickedToggle) {
                        this.closeSidebar();
                    }
                }
            });
        }

        _getRouteView() {
            if (this.routingMode !== 'hash') {
                return this.defaultView;
            }

            const hash = window.location.hash || '';
            const match = hash.match(/^#\/?([^?]+)/);
            if (!match || !match[1]) {
                return this.defaultView;
            }

            return match[1];
        }

        async navigate(name, state, options) {
            const target = this.views.get(name) ? name : this.defaultView;
            const navigationOptions = options || {};

            if (this.routingMode === 'hash' && navigationOptions.syncRoute !== false) {
                const nextHash = '#/' + target;
                if (window.location.hash !== nextHash) {
                    this._skipNextHashChange = true;
                    if (navigationOptions.replace === true) {
                        window.history.replaceState({}, '', nextHash);
                    } else {
                        window.location.hash = nextHash;
                    }
                }
            }

            return this.renderView(target, state || {});
        }

        async renderView(name, state) {
            const view = this.views.get(name);
            if (!view) {
                return false;
            }

            const auth = this.getAuthState();
            if (view.requiresAuth && !auth.loggedIn) {
                this.toastWarning('Please sign in to view this page.');
                if (name !== this.unauthorizedView) {
                    return this.navigate(this.unauthorizedView, {}, { replace: true });
                }
                return false;
            }

            if (view.loggedOutOnly && auth.loggedIn) {
                if (name !== this.defaultView) {
                    return this.navigate(this.defaultView, {}, { replace: true });
                }
                return false;
            }

            this.currentView = name;
            this.currentState = state || {};

            let content = '';
            if (isFunction(view.render)) {
                content = await view.render({ framework: this, state: this.currentState, auth: auth, view: view });
            } else {
                content = view.template || '';
            }

            if (typeof content === 'string') {
                this.elements.view.innerHTML = content;
            } else if (content instanceof window.Node) {
                this.elements.view.replaceChildren(content);
            } else {
                this.elements.view.innerHTML = '';
            }

            this._updateShell(view);
            this.refreshAuth(this.elements.view);

            if (isFunction(view.afterRender)) {
                view.afterRender({ framework: this, state: this.currentState, auth: auth, view: view });
            }

            this.closeSidebar();

            this._dispatch('viewchange', {
                view: name,
                state: this.currentState
            });

            return true;
        }

        _updateShell(view) {
            if (this.elements.title) {
                this.elements.title.textContent = view.title || view.name || '';
            }

            if (this.elements.breadcrumb) {
                this.elements.breadcrumb.innerHTML = [
                    '<span class="vx-breadcrumb-item">VXUI</span>',
                    '<span class="vx-breadcrumb-separator">/</span>',
                    '<span class="vx-breadcrumb-item is-current">' + escapeHtml(view.title || view.name || '') + '</span>'
                ].join('');
            }

            this._markActiveNavigation();
        }

        _markActiveNavigation() {
            document.querySelectorAll('[data-vx-route]').forEach((element) => {
                const active = element.getAttribute('data-vx-route') === this.currentView;
                element.classList.toggle('active', active);
                element.classList.toggle('is-active', active);
            });
        }

        renderNavigation() {
            if (!this.elements.sidebarStaticNav) {
                return;
            }

            const auth = this.getAuthState();
            const sidebarHtml = [];
            const mobileHtml = [];

            this.navigation.forEach((item) => {
                const view = this.views.get(item.view);
                if (!view) {
                    return;
                }

                if (item.showWhenLoggedIn && !auth.loggedIn) {
                    return;
                }

                if (item.showWhenLoggedOut && auth.loggedIn) {
                    return;
                }

                const title = item.label || view.title || item.view;
                const icon = item.icon ? '<iconpark-icon name="' + escapeHtml(item.icon) + '"></iconpark-icon>' : '';
                const authAttr = item.auth ? ' data-auth="' + escapeHtml(item.auth) + '"' : '';
                const ownerAttr = item.ownerOnly ? ' data-owner="true"' : '';

                sidebarHtml.push(
                    '<button class="vx-nav-item" type="button" data-vx-route="' + escapeHtml(item.view) + '"' + authAttr + ownerAttr + '>' +
                        icon +
                        '<span class="vx-nav-item-text">' + escapeHtml(title) + '</span>' +
                    '</button>'
                );

                if (item.mobile !== false) {
                    mobileHtml.push(
                        '<button class="vx-mobile-btn" type="button" data-vx-route="' + escapeHtml(item.view) + '"' + authAttr + ownerAttr + '>' +
                            icon +
                            '<span>' + escapeHtml(title) + '</span>' +
                        '</button>'
                    );
                }
            });

            this.elements.sidebarStaticNav.innerHTML = sidebarHtml.join('');

            if (this.elements.mobileNav) {
                this.elements.mobileNav.innerHTML = mobileHtml.join('');
            }

            this._markActiveNavigation();
            this.refreshAuth();
        }

        refreshAuth(scope) {
            const root = scope || document;
            const auth = this.getAuthState();

            root.querySelectorAll('[data-auth="logged-in"]').forEach((node) => {
                node.style.display = auth.loggedIn ? '' : 'none';
            });

            root.querySelectorAll('[data-auth="logged-out"]').forEach((node) => {
                node.style.display = auth.loggedIn ? 'none' : '';
            });

            root.querySelectorAll('[data-owner="true"]').forEach((node) => {
                node.style.display = auth.owner ? '' : 'none';
            });

            if (this.elements.authLabel) {
                const label = auth.loggedIn
                    ? 'Signed in as ' + (auth.user && auth.user.name ? auth.user.name : 'Owner')
                    : 'Guest mode';
                this.elements.authLabel.textContent = label;
                this.elements.authLabel.classList.toggle('is-guest', !auth.loggedIn);
            }

            if (this.elements.layout) {
                this.elements.layout.classList.toggle('vx-logged-in', auth.loggedIn);
                this.elements.layout.classList.toggle('vx-logged-out', !auth.loggedIn);
            }

            this.updateCommunityLinkVisibility();
            this._dispatch('authchange', auth);
        }

        isSidebarOverlayMode() {
            const width = window.innerWidth;
            if (width <= 768) {
                return true;
            }

            const isPortrait = (window.matchMedia && window.matchMedia('(orientation: portrait)').matches)
                || (window.innerHeight > window.innerWidth);

            return isPortrait && width <= 1024;
        }

        applySidebarResponsiveMode() {
            const nextMode = this.isSidebarOverlayMode();
            const prevMode = this.sidebarOverlayMode;

            this.sidebarOverlayMode = nextMode;

            if (nextMode !== prevMode) {
                this.closeSidebar();
            }

            if (nextMode && this.sidebarCollapsed && this.elements.layout) {
                this.sidebarCollapsed = false;
                this.elements.layout.classList.remove('sidebar-collapsed');
            }
        }

        openSidebar() {
            if (!this.isSidebarOverlayMode()) {
                this.sidebarCollapsed = false;
                if (this.elements.layout) {
                    this.elements.layout.classList.remove('sidebar-collapsed');
                }
                return;
            }

            this.sidebarOpen = true;
            if (this.elements.layout) {
                this.elements.layout.classList.add('sidebar-open');
            }
            this._savedScrollY = window.scrollY || window.pageYOffset || 0;
            document.body.style.top = '-' + this._savedScrollY + 'px';
            document.body.classList.add('vx-sidebar-open');
            document.body.classList.add('vx-sidebar-lock');
        }

        closeSidebar() {
            if (!this.isSidebarOverlayMode() && !this.sidebarOpen) {
                return;
            }

            this.sidebarOpen = false;
            if (this.elements.layout) {
                this.elements.layout.classList.remove('sidebar-open');
            }
            document.body.classList.remove('vx-sidebar-open');
            document.body.classList.remove('vx-sidebar-lock');
            document.body.style.top = '';
            window.scrollTo(0, this._savedScrollY || 0);
        }

        toggleSidebar() {
            if (this.isSidebarOverlayMode()) {
                if (this.sidebarOpen) {
                    this.closeSidebar();
                } else {
                    this.openSidebar();
                }
            } else {
                this.sidebarCollapsed = !this.sidebarCollapsed;
                if (this.elements.layout) {
                    this.elements.layout.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
                }
            }
        }

        _readStoredTheme() {
            return window.localStorage.getItem(this._storageKey('theme')) || this.options.initialTheme || 'system';
        }

        getThemeMode() {
            return this.themeMode;
        }

        getEffectiveTheme() {
            if (this.themeMode === 'system') {
                return this.mediaQuery && this.mediaQuery.matches ? 'dark' : 'light';
            }

            return this.themeMode;
        }

        setTheme(mode) {
            const nextMode = (mode || 'system').toLowerCase();
            if (['light', 'dark', 'system'].indexOf(nextMode) === -1) {
                return this.getThemeMode();
            }

            this.themeMode = nextMode;
            window.localStorage.setItem(this._storageKey('theme'), nextMode);
            this.applyTheme();
            return this.themeMode;
        }

        cycleTheme() {
            const order = ['system', 'light', 'dark'];
            const index = order.indexOf(this.themeMode);
            return this.setTheme(order[(index + 1) % order.length]);
        }

        applyTheme() {
            const root = document.documentElement;
            root.classList.remove('vx-light', 'vx-dark');
            root.classList.add(this.getEffectiveTheme() === 'dark' ? 'vx-dark' : 'vx-light');

            this._dispatch('themechange', {
                mode: this.themeMode,
                effective: this.getEffectiveTheme()
            });
        }

        toast(message, type, duration) {
            const tone = type || 'info';
            const timeout = duration == null ? 3200 : duration;
            const toast = document.createElement('div');
            const toastId = 'vx-toast-' + (++this.toastCount);
            const iconMap = {
                info: 'circle-info',
                success: 'circle-check',
                warning: 'circle-exclamation',
                error: 'circle-xmark'
            };

            toast.className = 'vx-toast vx-toast-' + tone;
            toast.dataset.toastId = toastId;
            toast.innerHTML = [
                '<div class="vx-toast-icon-wrap"><iconpark-icon class="vx-toast-icon" name="' + (iconMap[tone] || iconMap.info) + '"></iconpark-icon></div>',
                '<div class="vx-toast-message">' + escapeHtml(message) + '</div>',
                '<button class="vx-toast-close" type="button" aria-label="close"><iconpark-icon name="circle-xmark"></iconpark-icon></button>'
            ].join('');

            const closeToast = () => {
                toast.classList.remove('is-visible');
                window.setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 180);
            };

            toast.querySelector('.vx-toast-close').addEventListener('click', closeToast);

            this.elements.toastRoot.appendChild(toast);
            window.requestAnimationFrame(() => {
                toast.classList.add('is-visible');
            });

            if (timeout > 0) {
                window.setTimeout(closeToast, timeout);
            }

            return toastId;
        }

        toastSuccess(message, duration) {
            return this.toast(message, 'success', duration);
        }

        toastWarning(message, duration) {
            return this.toast(message, 'warning', duration);
        }

        toastError(message, duration) {
            return this.toast(message, 'error', duration);
        }

        toastInfo(message, duration) {
            return this.toast(message, 'info', duration);
        }

        _modalSizeClass(size) {
            if (size === 'sm') return 'vx-modal-sm';
            if (size === 'lg') return 'vx-modal-lg';
            if (size === 'xl') return 'vx-modal-xl';
            if (size === 'fullscreen') return 'vx-modal-fullscreen';
            return '';
        }

        openModal(config) {
            const options = config || {};
            const modalId = 'vx-modal-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
            const modal = document.createElement('div');
            const actions = Array.isArray(options.actions) ? options.actions : [];
            const sizeClass = this._modalSizeClass(options.size || 'md');

            modal.className = 'vx-modal';
            modal.id = modalId;
            modal.innerHTML = [
                '<div class="vx-modal-backdrop" data-vx-modal-close></div>',
                '<div class="vx-modal-panel ' + sizeClass + '" role="dialog" aria-modal="true" aria-labelledby="' + modalId + '-title">',
                    '<div class="vx-modal-header">',
                        '<div>',
                            '<div class="vx-eyebrow">' + escapeHtml(options.eyebrow || '') + '</div>',
                            '<h3 class="vx-modal-title" id="' + modalId + '-title">' + escapeHtml(options.title || '') + '</h3>',
                        '</div>',
                        '<button class="vx-icon-button" type="button" data-vx-modal-close aria-label="close"><iconpark-icon name="circle-xmark"></iconpark-icon></button>',
                    '</div>',
                    '<div class="vx-modal-body"></div>',
                    '<div class="vx-modal-footer"></div>',
                '</div>'
            ].join('');

            const body = modal.querySelector('.vx-modal-body');
            const footer = modal.querySelector('.vx-modal-footer');

            if (typeof options.content === 'string') {
                body.innerHTML = options.content;
            } else if (options.content instanceof window.Node) {
                body.replaceChildren(options.content);
            }

            actions.forEach((action, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'vx-btn ' + (action.className || 'vx-btn-secondary');
                button.textContent = action.label || ('Action ' + (index + 1));
                button.addEventListener('click', () => {
                    if (isFunction(action.onClick)) {
                        action.onClick({ framework: this, modalId: modalId });
                    }
                    if (action.closeOnClick !== false) {
                        this.closeModal(modalId, 'action');
                    }
                });
                footer.appendChild(button);
            });

            if (!actions.length) {
                footer.remove();
            }

            modal.querySelectorAll('[data-vx-modal-close]').forEach((node) => {
                node.addEventListener('click', () => {
                    this.closeModal(modalId, 'dismiss');
                });
            });

            this.elements.modalRoot.appendChild(modal);
            this.refreshAuth(modal);

            window.requestAnimationFrame(() => {
                modal.classList.add('is-open');
            });

            document.body.classList.add('vx-modal-lock');
            this.modalStack.push(modalId);
            this.modalHooks.set(modalId, {
                onClose: isFunction(options.onClose) ? options.onClose : null,
                closed: false
            });

            return modalId;
        }

        closeModal(modalId, reason) {
            const modal = document.getElementById(modalId);
            if (!modal) {
                return;
            }

            const hook = this.modalHooks.get(modalId);
            if (hook && !hook.closed) {
                hook.closed = true;
                if (isFunction(hook.onClose)) {
                    hook.onClose({
                        framework: this,
                        modalId: modalId,
                        reason: reason || 'dismiss'
                    });
                }
                this.modalHooks.delete(modalId);
            }

            modal.classList.remove('is-open');
            this.modalStack = this.modalStack.filter((id) => id !== modalId);

            window.setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 180);

            if (!this.modalStack.length) {
                document.body.classList.remove('vx-modal-lock');
            }
        }

        closeTopModal() {
            if (!this.modalStack.length) {
                return;
            }

            this.closeModal(this.modalStack[this.modalStack.length - 1], 'escape');
        }

        alert(options) {
            const config = options || {};
            return this.openModal({
                title: config.title || 'Notice',
                content: '<div class="vx-dialog-copy">' + escapeHtml(config.message || '') + '</div>',
                size: config.size || 'sm',
                actions: [{
                    label: config.confirmText || 'OK',
                    className: config.confirmClass || 'vx-btn-primary',
                    onClick: config.onConfirm
                }]
            });
        }

        confirm(options) {
            const config = options || {};
            return new Promise((resolve) => {
                let settled = false;

                this.openModal({
                    title: config.title || 'Confirm',
                    content: '<div class="vx-dialog-copy">' + escapeHtml(config.message || '') + '</div>',
                    size: config.size || 'sm',
                    onClose: (context) => {
                        if (context && context.reason === 'action') {
                            return;
                        }
                        if (settled) {
                            return;
                        }
                        settled = true;
                        resolve(false);
                    },
                    actions: [{
                        label: config.cancelText || 'Cancel',
                        className: 'vx-btn-secondary',
                        onClick: () => {
                            settled = true;
                            resolve(false);
                            if (isFunction(config.onCancel)) {
                                config.onCancel();
                            }
                        }
                    }, {
                        label: config.confirmText || 'Confirm',
                        className: config.confirmClass || 'vx-btn-primary',
                        onClick: () => {
                            settled = true;
                            resolve(true);
                            if (isFunction(config.onConfirm)) {
                                config.onConfirm();
                            }
                        }
                    }]
                });
            });
        }

        prompt(options) {
            const config = options || {};
            return new Promise((resolve) => {
                let settled = false;
                const wrapper = document.createElement('div');
                wrapper.innerHTML = [
                    '<div class="vx-dialog-copy">' + escapeHtml(config.message || '') + '</div>',
                    '<div class="vx-form-group">',
                        '<input class="vx-input" type="text" id="vx-prompt-input" value="' + escapeHtml(config.defaultValue || '') + '" placeholder="' + escapeHtml(config.placeholder || '') + '">',
                    '</div>'
                ].join('');

                this.openModal({
                    title: config.title || 'Input',
                    content: wrapper,
                    size: config.size || 'sm',
                    onClose: (context) => {
                        if (context && context.reason === 'action') {
                            return;
                        }
                        if (settled) {
                            return;
                        }
                        settled = true;
                        resolve(null);
                    },
                    actions: [{
                        label: config.cancelText || 'Cancel',
                        className: 'vx-btn-secondary',
                        onClick: () => {
                            settled = true;
                            resolve(null);
                            if (isFunction(config.onCancel)) {
                                config.onCancel();
                            }
                        }
                    }, {
                        label: config.confirmText || 'Confirm',
                        className: config.confirmClass || 'vx-btn-primary',
                        onClick: () => {
                            const input = document.getElementById('vx-prompt-input');
                            const value = input ? input.value : '';
                            settled = true;
                            resolve(value);
                            if (isFunction(config.onConfirm)) {
                                config.onConfirm(value);
                            }
                        }
                    }]
                });
            });
        }
    }

    window.VXUIFramework = VXUIFramework;
})(window, document);

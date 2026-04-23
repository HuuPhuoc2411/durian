// Normalize static-hosted index path so Expo Router resolves the root route.
if (typeof window !== "undefined") {
	const path = window.location.pathname;
	const isIndexPath = /\/index\.html?$/i.test(path);
	if (isIndexPath) {
		const normalizedPath = path.replace(/\/index\.html?$/i, "/");
		const nextUrl = `${normalizedPath}${window.location.search}${window.location.hash}`;
		window.history.replaceState(null, "", nextUrl);
	}
}

globalThis.__EXPO_ROUTER_HYDRATE__ = true;